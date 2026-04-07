// FlySchedule — Cloudflare R2 client and presign helpers.
//
// ARCHITECTURAL RULE #6 (load-bearing):
//
//   The R2 bucket `cavok-flight-photos` is FULLY PRIVATE — no custom
//   domain, no public r2.dev URL. Both reads AND writes go through
//   short-lived (15 min) presigned URLs generated here. The app server
//   never transits photo bytes; the browser PUTs/GETs directly to R2
//   using the signed URL.
//
//   The server is the SOLE source of object keys. Never trust a key
//   provided by the client — always validate that the prefix matches
//   the authenticated user's id. See `makePhotoKey` and the validation
//   helper at the end of this file.

import { S3Client } from "@aws-sdk/client-s3";
import {
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_BUCKET = process.env.R2_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

if (!R2_ENDPOINT || !R2_BUCKET || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  // Don't crash at import time — module evaluation happens during build,
  // and the build environment may not have these set. Defer the check
  // until first use.
}

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error(
      "R2 client missing config: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
    );
  }
  _client = new S3Client({
    region: "auto", // R2 doesn't care, but the SDK requires a value
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    // R2 requires path-style addressing — virtual-hosted-style URLs
    // would resolve to *.r2.cloudflarestorage.com which is fine but
    // path-style is the safer default.
    forcePathStyle: true,
  });
  return _client;
}

function getBucket(): string {
  if (!R2_BUCKET) throw new Error("R2_BUCKET_NAME not set");
  return R2_BUCKET;
}

/**
 * Default presigned URL lifetime (15 minutes per PRD §7.3 / rule #6).
 */
export const PRESIGN_EXPIRES_IN_SECONDS = 15 * 60;

/**
 * Photo upload limits (rule #6 + PRD §3.3.1).
 */
export const PHOTO_LIMITS = {
  MAX_PHOTOS_PER_FLIGHT: 5,
  MAX_BYTES_PER_PHOTO: 10 * 1024 * 1024, // 10 MB
  ALLOWED_MIME_TYPES: ["image/jpeg", "image/png", "image/heic"] as const,
} as const;

export type AllowedPhotoMimeType = (typeof PHOTO_LIMITS.ALLOWED_MIME_TYPES)[number];

/**
 * Generate a fresh photo object key for a given user.
 *
 * Format: `flights/{userId}/{uuid}.jpg`
 *
 * The user-id prefix is load-bearing — on flight submit, the server
 * validates that every key starts with the authenticated user's id, so
 * pilot A cannot reference pilot B's photos. Never let the client
 * choose the key.
 */
export function makePhotoKey(userId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    throw new Error(`makePhotoKey: invalid userId ${userId}`);
  }
  return `flights/${userId}/${randomUUID()}.jpg`;
}

/**
 * Validate that a photo key belongs to the given user. Used on flight
 * submit to reject smuggled keys from another pilot's namespace.
 */
export function isPhotoKeyOwnedBy(key: string, userId: string): boolean {
  if (typeof key !== "string") return false;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return false;
  // Strict shape: flights/{userId}/{uuid}.jpg|jpeg|png|heic
  const re = new RegExp(
    `^flights/${userId}/[0-9a-f-]{36}\\.(jpg|jpeg|png|heic)$`,
    "i",
  );
  return re.test(key);
}

/**
 * Generate a presigned PUT URL the browser can use to upload one file
 * directly to R2. The Content-Type and Content-Length are baked into
 * the signature, so a malicious client can't upload a 500 MB executable.
 */
export async function presignPutUrl(
  key: string,
  contentType: AllowedPhotoMimeType,
  contentLength: number,
): Promise<{ url: string; expiresIn: number }> {
  if (contentLength <= 0 || contentLength > PHOTO_LIMITS.MAX_BYTES_PER_PHOTO) {
    throw new Error(
      `presignPutUrl: contentLength ${contentLength} out of bounds`,
    );
  }
  if (!PHOTO_LIMITS.ALLOWED_MIME_TYPES.includes(contentType)) {
    throw new Error(`presignPutUrl: contentType ${contentType} not allowed`);
  }

  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: PRESIGN_EXPIRES_IN_SECONDS,
  });

  return { url, expiresIn: PRESIGN_EXPIRES_IN_SECONDS };
}

/**
 * Generate a presigned GET URL for an object key. Used to render
 * inline thumbnails on flight history pages and the admin queue.
 *
 * IMPORTANT: callers must authorize the request before calling this.
 * Anyone holding the URL can read the bytes for 15 minutes. The
 * authorization check belongs in the page/route handler that builds
 * the props — see `/flights/page.tsx` for the canonical pattern.
 */
export async function presignGetUrl(key: string): Promise<string> {
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getSignedUrl(client, command, {
    expiresIn: PRESIGN_EXPIRES_IN_SECONDS,
  });
}

/**
 * HEAD an object to confirm it actually exists in R2. Used as a
 * defensive check on flight submit — prevents pilots from referencing
 * photo keys they never actually uploaded. Throws on 404.
 */
export async function headObject(key: string): Promise<{ contentLength: number }> {
  const client = getClient();
  const command = new HeadObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  const res = await client.send(command);
  return { contentLength: res.ContentLength ?? 0 };
}
