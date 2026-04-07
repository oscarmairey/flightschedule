import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: `next build` emits a self-contained server at
  // `.next/standalone/` containing only the deps Next needs at runtime.
  // The Dockerfile copies that + `.next/static` + `public` into a small
  // runner image — no node_modules in the final stage.
  output: "standalone",
};

export default nextConfig;
