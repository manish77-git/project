import { handleIdentifyRequest } from "@/lib/identification/handler";
import { createTesseractOcrEngine } from "@/lib/identification/tesseract-engine";

/**
 * POST /api/bills/identify
 *
 * Reads a hospital name and bill number off an uploaded bill image, or accepts
 * a hand-typed bill number. It is an *identification* endpoint: it reports what
 * the document appears to say and nothing else — no amounts, no insurance
 * details, no verification outcome, and no statement about whether the bill is
 * genuine.
 *
 * This file is only wiring: the contract lives in
 * `src/lib/identification/handler.ts`, and the reading logic in
 * `src/lib/identification/service.ts`.
 *
 * This route needs the Node.js runtime (the OCR engine spawns a worker thread),
 * which is Next's default for route handlers. The `runtime` segment config is
 * deliberately NOT set: `next.config.ts` enables `cacheComponents`, and Next 16
 * rejects an explicit `runtime` export alongside it.
 *
 * Uploads are read into memory for the duration of the request and are never
 * written to disk or persisted anywhere.
 */
export async function POST(request: Request): Promise<Response> {
  return handleIdentifyRequest(request, { engine: createTesseractOcrEngine() });
}
