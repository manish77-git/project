import { createTesseractOcrEngine } from "@/lib/identification/tesseract-engine";
import { handleExtractRequest } from "@/lib/document/handler";

/**
 * POST /api/bills/extract
 *
 * Reads the values printed on an uploaded bill and returns them with the exact
 * source line for each. Every value is explicitly labelled
 * "Read from the uploaded bill — not independently verified."
 *
 * This endpoint does not verify anything, does not look up a hospital record
 * and never substitutes demo data: if the image is unreadable, the response
 * says so and every field is null.
 *
 * Uploads are read into memory for one request and never written to disk.
 */
export async function POST(request: Request): Promise<Response> {
  return handleExtractRequest(request, { engine: createTesseractOcrEngine() });
}
