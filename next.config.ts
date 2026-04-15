import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: `next build` emits a self-contained server at
  // `.next/standalone/` containing only the deps Next needs at runtime.
  // The Dockerfile copies that + `.next/static` + `public` into a small
  // runner image — no node_modules in the final stage.
  output: "standalone",

  // Next.js 15+ blocks cross-origin requests to dev-only resources
  // (HMR websocket, `/__nextjs_original-stack-frames`, etc.) from any
  // host not on this allowlist. The dev server is accessed from the
  // VPS public IP (http://89.167.7.195:3001), not localhost, so it
  // needs to be allowlisted or HMR silently stops working.
  //
  // Production is unaffected — this only matters for `next dev`.
  allowedDevOrigins: ["89.167.7.195"],

  async headers() {
    // These headers are production-only. In `next dev`, `upgrade-insecure-requests`
    // in the CSP and `Strict-Transport-Security` both force the browser to
    // rewrite every subresource to https:// — the dev server speaks http:// only,
    // so CSS, fonts, and next/image all 404 and the page renders as bare HTML.
    // Strict-Transport-Security also pins localhost to https in the browser's
    // HSTS cache for a year, so if you hit the dev server once with these
    // headers on, you have to clear the pin via chrome://net-internals/#hsts.
    //
    // In production (Caddy + Cloudflare), the chain is already https end-to-end
    // and these headers are load-bearing for the security posture.
    if (process.env.NODE_ENV !== "production") {
      return [];
    }

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://js.stripe.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com",
              "font-src 'self'",
              "connect-src 'self' https://api.stripe.com https://*.r2.cloudflarestorage.com",
              "frame-src https://js.stripe.com https://hooks.stripe.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
