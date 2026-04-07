// CAVOK — R2 presign endpoint for flight photo uploads.
//
// LOAD-BEARING (rule #6):
//   - Server is the SOLE source of object keys (`makePhotoKey`)
//   - Key includes the authenticated user id, so flight submit can
//     reject smuggled keys from another pilot's namespace
//   - PUT is signed with Content-Type and Content-Length baked in,
//     preventing 500 MB uploads or wrong-mime-type bypasses
//   - 15 min expiry (rule #6)
//   - Rate-limited per user

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  makePhotoKey,
  presignPutUrl,
  PHOTO_LIMITS,
  type AllowedPhotoMimeType,
} from "@/lib/r2";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const PresignBodySchema = z.object({
  contentType: z.enum(PHOTO_LIMITS.ALLOWED_MIME_TYPES),
  contentLength: z
    .number()
    .int()
    .min(1)
    .max(PHOTO_LIMITS.MAX_BYTES_PER_PHOTO),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Per-user (not per-IP) rate limit — pilots may share an IP at the
  // airfield Wi-Fi but should each get their own quota.
  const rl = rateLimit(`presign:${session.user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }
  // Also a coarse IP-based limit as a defense in depth.
  const ipRl = rateLimit(`presign:ip:${getClientIp(request)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!ipRl.ok) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }

  const parsed = PresignBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const key = makePhotoKey(session.user.id);
  const { url, expiresIn } = await presignPutUrl(
    key,
    parsed.data.contentType as AllowedPhotoMimeType,
    parsed.data.contentLength,
  );

  return NextResponse.json({ key, url, method: "PUT", expiresIn });
}
