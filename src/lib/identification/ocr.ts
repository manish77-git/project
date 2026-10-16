/**
 * OCR port for bill identification.
 *
 * The identification pipeline does not care *how* text is read off an image,
 * only that it gets text out — plus an honest signal of how confident the
 * reader was. Keeping that behind an interface means:
 *
 *   - the pipeline and its tests run without any OCR engine at all (a fake
 *     engine is injected), so the suite stays fast and hermetic;
 *   - a future engine (e.g. a managed vision model) can replace the local one
 *     without touching the extraction or HTTP layers;
 *   - an engine failure is a first-class, typed outcome that must be reported
 *     as a failure — never smoothed over into "we identified it".
 */

/** Raw text read from a document image, with the reader's own confidence. */
export interface OcrPageText {
  /** Full text, lines separated by "\n". May be empty. */
  text: string;
  /**
   * Engine-reported mean confidence, 0-100. Engines that cannot report one
   * must say so with 0 rather than guessing high — a low value makes the
   * pipeline treat the page as unreadable instead of trusting noise.
   */
  meanConfidence: number;
}

export interface OcrImageInput {
  bytes: Uint8Array;
  /** MIME type established from the file's magic bytes, not from the client. */
  mimeType: string;
}

export interface OcrEngine {
  /** Stable identifier used in server-side diagnostics only, never in a response. */
  readonly engineId: string;
  /**
   * Reads text from an image.
   *
   * MUST reject with {@link OcrEngineError} when it cannot process the image at
   * all (engine missing, failed to start, crashed). Returning empty text is a
   * legitimate result meaning "nothing legible was found"; throwing means
   * "I could not do my job", and the two are reported differently.
   */
  recognizeImage(image: OcrImageInput): Promise<OcrPageText>;
}

/** Raised when the OCR engine itself could not run, as opposed to reading nothing. */
export class OcrEngineError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OcrEngineError";
  }
}
