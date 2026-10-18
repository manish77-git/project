import { getAccessDependencies } from "@/lib/access/dependencies";
import { handleChallengeRequest } from "@/lib/access/handler";

/**
 * POST /api/bills/access/challenge
 *
 * Step one of proving a patient may see a bill: exchange a bill number for a
 * short-lived, server-side challenge. The challenge — not the client — decides
 * which bill is being unlocked, and it says nothing about whether that bill
 * exists.
 *
 * Wiring only; the contract lives in `src/lib/access/handler.ts`. Which code
 * store and which attempt authority are in use is decided in
 * `src/lib/access/dependencies.ts` (a configured database wins).
 *
 * Needs the Node.js runtime, which is Next's default for route handlers.
 */
export async function POST(request: Request): Promise<Response> {
  const access = getAccessDependencies();
  return handleChallengeRequest(request, {
    store: access.store,
    secret: access.secret,
    codeVerifier: access.codeVerifier ?? undefined,
    throttle: access.throttle,
  });
}
