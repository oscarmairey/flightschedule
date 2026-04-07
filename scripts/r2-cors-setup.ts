// CAVOK — apply CORS policy to the cavok-flight-photos R2 bucket.
//
// Why: photo upload from /flights/new uses presigned PUT URLs, so the
// browser uploads directly browser → R2 (cross-origin). R2 buckets
// have NO CORS policy by default, so the preflight (OPTIONS) fails
// and the upload errors out with a generic "NetworkError when
// attempting to fetch resource".
//
// IMPORTANT: R2's S3-compatible API does NOT support PutBucketCors
// (returns AccessDenied with the per-bucket access keys). CORS must
// be set via the Cloudflare REST API using the account-scoped API
// token (CLOUDFLARE_API_TOKEN). Hence the fetch() call below.
//
// Run:  corepack pnpm tsx scripts/r2-cors-setup.ts
// Idempotent — PUT replaces the existing rules.

import "dotenv/config";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const BUCKET = process.env.R2_BUCKET_NAME;

if (!ACCOUNT_ID || !API_TOKEN || !BUCKET) {
  console.error(
    "Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / R2_BUCKET_NAME in .env",
  );
  process.exit(1);
}

const ALLOWED_ORIGINS = [
  "https://cavok.oscarmairey.com",
  "http://localhost:6000",
  "http://localhost:3000",
];

const corsPolicy = {
  rules: [
    {
      allowed: {
        origins: ALLOWED_ORIGINS,
        methods: ["GET", "PUT", "HEAD"],
        headers: ["*"],
      },
      exposeHeaders: ["ETag"],
      maxAgeSeconds: 3600,
    },
  ],
};

async function main() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/cors`;
  console.log(`CAVOK — applying CORS to R2 bucket "${BUCKET}"`);
  console.log("Allowed origins:");
  ALLOWED_ORIGINS.forEach((o) => console.log(`  - ${o}`));
  console.log("");

  const putRes = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corsPolicy),
  });

  const putBody = await putRes.text();
  if (!putRes.ok) {
    console.error(`PUT failed (${putRes.status}):`);
    console.error(putBody);
    process.exit(1);
  }

  console.log("✓ CORS policy applied.");
  console.log(putBody);

  // Read it back so the operator sees what's live.
  const getRes = await fetch(url, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  const getBody = await getRes.text();
  if (!getRes.ok) {
    console.error(`GET failed (${getRes.status}): ${getBody}`);
    return;
  }
  console.log("\nCurrent CORS rules on the bucket:");
  console.log(getBody);
}

main().catch((err) => {
  console.error("R2 CORS setup failed:", err);
  process.exit(1);
});
