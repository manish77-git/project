/**
 * The access token handed out after a challenge is answered correctly.
 *
 * Format: `base64url(payload).base64url(HMAC-SHA256(payload))`, signed with a
 * key derived from the server secret. It carries only a session id, the bill it
 * is bound to, and its own lifetime — no amounts, no patient details, and no
 * access code.
 *
 * The token is *not* self-sufficient. The server also stores the session it
 * names, and every protected endpoint checks both: a valid signature alone does
 * not grant access, so a token whose session has expired or was never created
 * is refused. That is what stops a token from being replayed across restarts of
 * an in-memory deployment, and what lets an endpoint ask "what was actually
 * verified for this session?" rather than trusting the client.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { deriveKey } from "./codes";

/** Short by design: this authorises one short session, not a login. */
export const ACCESS_TOKEN_TTL_MINUTES = 15;

const accessTokenPayloadSchema = z
  .object({
    /** Session id — the server-side record this token must still match. */
    jti: z.string().min(1),
    /** billNumber this token is bound to. */
    sub: z.string().min(1),
    iat: z.iso.datetime({ offset: true }),
    exp: z.iso.datetime({ offset: true }),
  })
  .strict();

export interface AccessTokenPayload {
  sessionId: string;
  billNumber: string;
  issuedAt: Date;
  expiresAt: Date;
}

export type AccessTokenRejectionReason = "malformed" | "bad_signature" | "expired";

export type AccessTokenVerification =
  | { ok: true; payload: AccessTokenPayload }
  | { ok: false; reason: AccessTokenRejectionReason };

function tokenKey(secret: string): Buffer {
  return deriveKey(secret, "access-token");
}

function sign(input: string, secret: string): string {
  return createHmac("sha256", tokenKey(secret)).update(input).digest("base64url");
}

export function issueAccessToken(input: {
  billNumber: string;
  secret: string;
  now: Date;
  ttlMinutes?: number;
  /** Reuse an existing session id when the server already created one. */
  sessionId?: string;
}): { token: string; payload: AccessTokenPayload } {
  const ttlMinutes = input.ttlMinutes ?? ACCESS_TOKEN_TTL_MINUTES;
  const expiresAt = new Date(input.now.getTime() + ttlMinutes * 60_000);

  const payload = {
    jti: input.sessionId ?? randomUUID(),
    sub: input.billNumber,
    iat: input.now.toISOString(),
    exp: expiresAt.toISOString(),
  };

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    token: `${encoded}.${sign(encoded, input.secret)}`,
    payload: {
      sessionId: payload.jti,
      billNumber: payload.sub,
      issuedAt: input.now,
      expiresAt,
    },
  };
}

export function verifyAccessToken(input: {
  token: string;
  secret: string;
  now: Date;
}): AccessTokenVerification {
  const parts = input.token.split(".");
  if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0) {
    return { ok: false, reason: "malformed" };
  }

  const [encoded, signature] = parts as [string, string];
  const expected = sign(encoded, input.secret);
  const providedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  // Length must match before the constant-time compare, which throws otherwise.
  if (providedBuffer.length !== expectedBuffer.length) {
    return { ok: false, reason: "bad_signature" };
  }
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return { ok: false, reason: "bad_signature" };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const parsed = accessTokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return { ok: false, reason: "malformed" };
  }

  const expiresAt = new Date(parsed.data.exp);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= input.now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    payload: {
      sessionId: parsed.data.jti,
      billNumber: parsed.data.sub,
      issuedAt: new Date(parsed.data.iat),
      expiresAt,
    },
  };
}

/** Parses an `Authorization: Bearer <token>` header. Null when absent or wrong. */
export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? (match[1] as string) : null;
}
