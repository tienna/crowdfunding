import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack (default bundler Next.js 16) - ho tro WASM natively
  turbopack: {},

  // Webpack fallback config (dung khi chay voi --webpack hoac cac env khong ho tro Turbopack)
  webpack: (config) => {
    // Bat ho tro asyncWebAssembly cho MeshJS WASM modules
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    // Node.js built-ins khong co trong browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
