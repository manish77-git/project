/**
 * Real OCR engine: Tesseract (WASM) running locally in Node.
 *
 * Chosen for this stage because it needs no API key, no network call at request
 * time and no GenAI provider — it just reads a PNG/JPEG/BMP in-process. The
 * engine is loaded with a dynamic `import()` so that:
 *
 *   - the default test suite never loads it (tests inject a fake engine), and
 *   - a deployment that cannot load it fails as a clean 503 instead of crashing
 *     the route module at import time.
 *
 * A worker is created per request and always terminated in `finally`. That is
 * slower than pooling a worker, but it is the version that cannot leak memory
 * or state between patients on a serverless runtime.
 */
import os from "node:os";
import path from "node:path";
import { OcrEngineError, type OcrEngine, type OcrImageInput, type OcrPageText } from "./ocr";

const DEFAULT_LANGUAGE = "eng";

export interface TesseractEngineOptions {
  /** Tesseract traineddata language code. Defaults to `eng`. */
  language?: string;
  /** Override the traineddata location (offline/Docker deployments). */
  langPath?: string;
  /** Where traineddata may be cached. Defaults to a subdirectory of the OS temp dir. */
  cachePath?: string;
}

/** Keeps downloaded traineddata out of the repository working tree. */
export function defaultOcrCachePath(): string {
  return path.join(os.tmpdir(), "patient-financial-navigator-ocr");
}

export function createTesseractOcrEngine(options: TesseractEngineOptions = {}): OcrEngine {
  const language = options.language ?? DEFAULT_LANGUAGE;

  return {
    engineId: "tesseract.js",

    async recognizeImage(image: OcrImageInput): Promise<OcrPageText> {
      let lastWorkerError: string | null = null;
      let terminate: (() => Promise<unknown>) | null = null;

      try {
        const { createWorker } = await import("tesseract.js");

        const worker = await createWorker(language, undefined, {
          cachePath: options.cachePath ?? defaultOcrCachePath(),
          ...(options.langPath ? { langPath: options.langPath } : {}),
          // Captured for the error message; never surfaced to the client.
          errorHandler: (error: unknown) => {
            lastWorkerError = error instanceof Error ? error.message : String(error);
          },
        });
        terminate = () => worker.terminate();

        const result = await worker.recognize(Buffer.from(image.bytes));

        return {
          text: typeof result.data.text === "string" ? result.data.text : "",
          meanConfidence:
            typeof result.data.confidence === "number" && Number.isFinite(result.data.confidence)
              ? result.data.confidence
              : 0,
        };
      } catch (error) {
        const detail =
          lastWorkerError ??
          (error instanceof Error ? error.message : String(error));
        throw new OcrEngineError(`OCR engine could not read the image: ${detail}`, { cause: error });
      } finally {
        if (terminate) {
          // A failed termination must not mask a successful recognition.
          await terminate().catch(() => undefined);
        }
      }
    },
  };
}
