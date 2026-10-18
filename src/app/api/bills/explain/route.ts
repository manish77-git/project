import { getAccessDependencies } from "@/lib/access/dependencies";
import { handleExplanationRequest } from "@/lib/explanation/handler";
import { createGeminiProviderFromEnv } from "@/lib/explanation/provider";
import { getDefaultHospitalRecordRepository } from "@/lib/records/mock-records";

/**
 * POST /api/bills/explain
 *
 * Returns a validated, plain-language explanation of the bill unlocked by the
 * access session. The body contains only the language; the bill comes from the
 * server-side session.
 *
 * The provider is constructed from `GEMINI_API_KEY` and `GEMINI_MODEL`. With
 * no key this route returns `503 explanation_unavailable` — it never returns a
 * draft. With a key, the service generates structured field explanations,
 * validates them, and renders every amount from the authoritative record. If
 * the provider fails or the draft is invalid, a server template is returned
 * instead of the raw draft.
 *
 * Requires `Authorization: Bearer <accessToken>` with a verified session.
 */
export async function POST(request: Request): Promise<Response> {
  const access = getAccessDependencies();
  return handleExplanationRequest(request, {
    store: access.store,
    secret: access.secret,
    provider: createGeminiProviderFromEnv(),
    repository: getDefaultHospitalRecordRepository(),
  });
}
