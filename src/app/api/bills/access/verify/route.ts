import { getAccessDependencies } from "@/lib/access/dependencies";
import { handleChallengeVerificationRequest } from "@/lib/access/handler";

/**
 * POST /api/bills/access/verify
 *
 * Step two: answer a challenge with the access code the hospital issued. A
 * wrong answer spends one of three attempts; the challenge dies after five
 * minutes; and the attempt budget is tracked outside the challenge, so asking
 * for a new one does not reset it — in a deployment with a database the table's
 * own lockout carries that budget, and it survives a restart.
 *
 * On success the only thing returned is a short-lived signed token — never the
 * code, never a bill's contents.
 *
 * Wiring only; the contract lives in `src/lib/access/handler.ts`.
 */
export async function POST(request: Request): Promise<Response> {
  const access = getAccessDependencies();
  return handleChallengeVerificationRequest(request, {
    store: access.store,
    secret: access.secret,
    codeVerifier: access.codeVerifier ?? undefined,
    throttle: access.throttle,
  });
}
