/**
 * The authorization gate every protected endpoint calls for itself.
 *
 * Two independent things must agree:
 *
 *   1. the token's signature and expiry — proof the server issued it; and
 *   2. the server-side session it names — proof that a code was actually
 *      answered, that the session has not expired, and (for data release) what
 *      was verified during it.
 *
 * A valid signature alone is NOT enough, which is what makes this resilient to
 * the obvious attacks: a forged token fails step 1, while a token copied from
 * another session, replayed after the session expired, or presented after a
 * process restart that lost the session fails step 2.
 *
 * Each endpoint calls this itself rather than trusting an earlier check, so a
 * protected route added later cannot inherit an assumption it never made.
 */
import type { AccessSession, AccessStore } from "./store";
import { readBearerToken, verifyAccessToken, type AccessTokenPayload } from "./token";

/** One message for every refusal, so a caller learns nothing from the wording. */
export const ACCESS_REQUIRED_MESSAGE =
  "A valid access code session is required to view this bill.";

export type AuthorizationResult =
  | { ok: true; session: AccessSession; token: AccessTokenPayload }
  | { ok: false; status: 401; code: "access_denied"; message: string };

export async function authorizeSession(
  request: Request,
  dependencies: { store: AccessStore; secret: string | null; now: Date },
): Promise<AuthorizationResult> {
  const denied: AuthorizationResult = {
    ok: false,
    status: 401,
    code: "access_denied",
    message: ACCESS_REQUIRED_MESSAGE,
  };

  if (!dependencies.secret) return denied;

  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) return denied;

  const verification = verifyAccessToken({
    token,
    secret: dependencies.secret,
    now: dependencies.now,
  });
  if (!verification.ok) return denied;

  const session = await dependencies.store.findSession(verification.payload.sessionId);
  if (!session) return denied;
  if (session.expiresAt.getTime() <= dependencies.now.getTime()) return denied;

  // The token and the session must agree on the bill. A token whose session
  // covers a different bill is refused even if both are individually valid.
  if (session.billNumber !== verification.payload.billNumber) return denied;

  return { ok: true, session, token: verification.payload };
}
