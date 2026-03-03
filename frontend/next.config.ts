import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack config (Next.js 16+ default bundler)
  // WASM support is automatic in Turbopack
  turbopack: {},
};

export default nextConfig;
