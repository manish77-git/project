import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The OCR engine must be loaded from node_modules at runtime, not bundled:
  // it resolves its own worker script and WebAssembly core by path.
  serverExternalPackages: ["tesseract.js"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
