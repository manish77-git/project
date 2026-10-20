import { getAccessDependencies } from "@/lib/access/dependencies";
import { createQuestionProviderFromEnv } from "@/lib/questions/provider";
import { handleQuestionRequest } from "@/lib/questions/handler";
import { getDefaultHospitalRecordRepository } from "@/lib/records/mock-records";

/**
 * POST /api/bills/questions
 *
 * Answers one natural-language question about the bill unlocked by the access
 * session. The body is `{ question, language }` and nothing else: the bill, its
 * verification outcome and every figure come from the server-side session and
 * the hospital record, never from the caller.
 *
 * The provider is constructed from `GEMINI_API_KEY` and `GEMINI_MODEL`. With no
 * key this route returns `503 question_unavailable` — it never invents an
 * answer. With a key, the model classifies the question and may explain
 * terminology; the server writes every figure, every discrepancy answer and
 * every refusal, and validates model prose before it is returned.
 *
 * Requires `Authorization: Bearer <accessToken>` with a session that has been
 * verified (`POST /api/bills/verify`).
 */
export async function POST(request: Request): Promise<Response> {
  const access = getAccessDependencies();
  return handleQuestionRequest(request, {
    store: access.store,
    secret: access.secret,
    provider: createQuestionProviderFromEnv(),
    repository: getDefaultHospitalRecordRepository(),
  });
}
