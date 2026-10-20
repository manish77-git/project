/**
 * HTTP layer for access challenges.
 *
 * Two endpoints, matching the two steps a patient takes:
 *   POST /api/bills/access/challenge — ask for a challenge
 *   POST /api/bills/access/verify    — answer it with a code
 *
 * Refusals are deliberately uniform. "Code wrong", "challenge expired",
 * "challenge already answered" and "no such challenge" all produce the same 401
 * with the same wording, so the endpoint cannot be used to discover which bills
 * exist or which codes were issued. Only a spent attempt limit is distinguished
 * (429 with Retry-After), because a locked-out patient needs to know to wait
 * rather than to retype — and every challenge locks the same way, so that tells
 * an attacker nothing either.
 *
 * Nothing here reads a client-supplied flag. The request schemas are strict, so
 * an `isVerified: true` or an `outcome` in the body is a 400, not a bypass.
 */
import { NextResponse } from "next/server";
import { BODY_TOO_LARGE_MESSAGE, readJsonBody } from "@/lib/http/request-body";
import {
  accessChallengeRequestSchema,
  accessChallengeVerificationRequestSchema,
} from "@/lib/schemas";
import type { CodeVerifier } from "./code-verifier";
import {
  answerAccessChallenge,
  createAccessChallenge,
  type ChallengeRejectionReason,
} from "./service";
import type { AccessStore } from "./store";
import type { ThrottleStrategy } from "./throttle";

export const ACCESS_UNAVAILABLE_MESSAGE =
  "Access codes are not available right now. Please try again later.";
export const ACCESS_DENIED_MESSAGE =
  "That access code could not be accepted for this challenge. Please check the code and try again.";
export const ACCESS_LOCKED_MESSAGE =
  "Too many attempts. Please wait and try again, or contact the hospital.";
export const ACCESS_FAILED_MESSAGE =
  "The access check could not be completed right now. Please try again later.";

export interface AccessHandlerDependencies {
  store: AccessStore;
  /** null when the server secret is missing or too weak: access fails closed. */
  secret: string | null;
  now?: () => Date;
  /** Overridable for tests; defaults to the proxy headers. */
  clientKey?: (request: Request) => string | null;
  /**
   * Which store answers codes and which one counts attempts. Omitted in tests
   * and in the no-database demo, where the digest store plus the in-memory
   * throttle are the defaults; routes pass the pair chosen in dependencies.ts.
   */
  codeVerifier?: CodeVerifier;
  throttle?: ThrottleStrategy;
}

/**
 * A stable per-client key for throttling, or null when none can be trusted.
 *
 * Returning null is the safe answer: without a real client identity we simply
 * do not keep a client bucket, rather than lumping unrelated patients into one
 * shared bucket that any of them could exhaust.
 */
export function defaultClientKey(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp && realIp.length > 0 ? realIp : null;
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): NextResponse {
  return json({ error: { code, message } }, status, headers);
}

const STATUS_BY_REJECTION: Record<ChallengeRejectionReason, number> = {
  unknown_challenge: 401,
  expired: 401,
  already_answered: 401,
  invalid_code: 401,
  locked: 429,
  throttled: 429,
};

/**
 * Reads the JSON body under a size limit. A body that cannot be read is
 * reported as malformed, exactly as an unparseable one always was; the only
 * new outcome is an oversized body, which is refused before it is buffered.
 */
async function readChallengeBody(
  request: Request,
): Promise<
  | { ok: true; body: unknown }
  | { ok: false; reason: "invalid_json" | "unreadable" | "too_large" }
> {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return { ok: true, body: parsed.value };
}

function requireJson(request: Request): string | null {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  return contentType.includes("application/json") ? null : "application/json";
}

export async function handleChallengeRequest(
  request: Request,
  dependencies: AccessHandlerDependencies,
): Promise<NextResponse> {
  const now = (dependencies.now ?? (() => new Date()))();
  const clientKey = (dependencies.clientKey ?? defaultClientKey)(request);

  const wrongType = requireJson(request);
  if (wrongType) {
    return errorResponse(
      415,
      "unsupported_media_type",
      `Send this request as ${wrongType}.`,
    );
  }

  if (!dependencies.secret) {
    return errorResponse(503, "access_unavailable", ACCESS_UNAVAILABLE_MESSAGE);
  }

  const parsedBody = await readChallengeBody(request);
  if (!parsedBody.ok) {
    if (parsedBody.reason === "too_large") {
      return errorResponse(413, "payload_too_large", BODY_TOO_LARGE_MESSAGE);
    }
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  const parsed = accessChallengeRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "Provide the bill number you want to access, and nothing else.",
    );
  }

  try {
    const result = await createAccessChallenge({
      billNumber: parsed.data.billNumber,
      store: dependencies.store,
      now,
      clientKey,
      throttle: dependencies.throttle,
    });

    if (result.kind === "throttled") {
      return errorResponse(429, "too_many_attempts", ACCESS_LOCKED_MESSAGE, {
        "retry-after": String(result.retryAfterSeconds),
      });
    }

    return json(result.challenge, 200);
  } catch {
    return errorResponse(500, "access_failed", ACCESS_FAILED_MESSAGE);
  }
}

export async function handleChallengeVerificationRequest(
  request: Request,
  dependencies: AccessHandlerDependencies,
): Promise<NextResponse> {
  const now = (dependencies.now ?? (() => new Date()))();
  const clientKey = (dependencies.clientKey ?? defaultClientKey)(request);

  const wrongType = requireJson(request);
  if (wrongType) {
    return errorResponse(
      415,
      "unsupported_media_type",
      `Send this request as ${wrongType}.`,
    );
  }

  const secret = dependencies.secret;
  if (!secret) {
    return errorResponse(503, "access_unavailable", ACCESS_UNAVAILABLE_MESSAGE);
  }

  const parsedBody = await readChallengeBody(request);
  if (!parsedBody.ok) {
    if (parsedBody.reason === "too_large") {
      return errorResponse(413, "payload_too_large", BODY_TOO_LARGE_MESSAGE);
    }
    return errorResponse(400, "invalid_request", "The request body must be valid JSON.");
  }

  const parsed = accessChallengeVerificationRequestSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "invalid_request",
      "Provide a challenge id and an access code, and nothing else.",
    );
  }

  try {
    const result = await answerAccessChallenge({
      challengeId: parsed.data.challengeId,
      accessCode: parsed.data.accessCode,
      store: dependencies.store,
      secret,
      now,
      clientKey,
      codeVerifier: dependencies.codeVerifier,
      throttle: dependencies.throttle,
    });

    if (result.kind === "granted") {
      return json(result.grant, 200);
    }

    const status = STATUS_BY_REJECTION[result.reason];
    const headers: Record<string, string> = {};
    if (result.retryAfterSeconds !== undefined) {
      headers["retry-after"] = String(result.retryAfterSeconds);
    }
    return errorResponse(
      status,
      status === 429 ? "too_many_attempts" : "access_denied",
      status === 429 ? ACCESS_LOCKED_MESSAGE : ACCESS_DENIED_MESSAGE,
      headers,
    );
  } catch {
    return errorResponse(500, "access_failed", ACCESS_FAILED_MESSAGE);
  }
}
