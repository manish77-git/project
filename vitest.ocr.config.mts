import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Config for the real-OCR integration check.
 *
 * Kept separate from `vitest.config.mts` on purpose: the default suite must stay
 * hermetic and fast, while these tests load the real Tesseract engine and may
 * download traineddata (a network access). Run with `npm run test:ocr`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Loading the engine and traineddata can take a while on a cold cache.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
