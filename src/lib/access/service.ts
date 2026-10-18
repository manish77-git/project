/**
 * Access-code policy: challenges, attempts, lockout and throttling.
 *
 * The rules here are what stop a short code from being guessed:
 *
 *   - A challenge is bound to one bill number server-side, so the client
 *     cannot aim it at a different record later.
 *   - Three wrong answers lock that challenge.
 *   - A challenge expires five minutes after creation and can never be reused
 *     once answered, expired or locked.
 *   - Throttling is keyed by BILL and by CLIENT, and is stored OUTSIDE the
 *     challenge. That is the important one: if the failure counter lived on the
 *     challenge, an attacker could simply request a fresh challenge after every
 *     three guesses and never face a limit. Because the counter outlives
 *     challenges, a new challenge inherits the exhausted budget for the
 *     cooldown window.
 *
 * Every timestamp is passed in rather than read from the clock, so expiry and
 * lockout can be tested at their exact boundaries.
 */
import { randomUUID } from "node:crypto";
import { normalizeBillNumberForLookup } from "@/lib/records/mock-records";
import type { AccessChallenge, AccessGrant } from "@/lib/schemas";
import { createDigestCodeVerifier, type CodeVerifier } from "./code-verifier";
import {
  CHALLENGE_TTL_MINUTES,
  MAX_CHALLENGE_ATTEMPTS,
  MINUTE_MS,
  THROTTLE_WINDOW_MINUTES,
} from "./policy";
import type { AccessStore, ChallengeRecord } from "./store";
import { createInMemoryThrottle, type ThrottleStrategy } from "./throttle";
import { issueAccessToken, type AccessTokenPayload } from "./token";

// The policy numbers live in policy.ts so the throttle can read them without
// importing this module; they are re-exported here for callers and tests.
export { CHALLENGE_TTL_MINUTES, MAX_CHALLENGE_ATTEMPTS, THROTTLE_WINDOW_MINUTES };

/**
 * How the two ports are supplied.
 *
 * Both are optional with a no-database default, so a demo needs no wiring while
 * a deployment with `DATABASE_URL` set swaps in the database code store and the
 * storage-managed throttle (see dependencies.ts) — and still gets exactly one
 * attempt authority, because the defaults are then not used.
 */
export interface ChallengeOverrides {
  codeVerifier?: CodeVerifier;
  throttle?: ThrottleStrategy;
}

export type ChallengeCreationResult =
  | { kind: "challenge"; challenge: AccessChallenge }
  | { kind: "throttled"; retryAfterSeconds: number };

export type ChallengeRejectionReason =
  | "unknown_challenge"
  | "expired"
  | "locked"
  | "already_answered"
  | "invalid_code"
  | "throttled";

export type ChallengeVerificationResult =
  | { kind: "granted"; grant: AccessGrant }
  | { kind: "rejected"; reason: ChallengeRejectionReason; retryAfterSeconds?: number };

/**
 * A locked answer, carrying a wait only when one is actually known.
 *
 * With a database the store reports its own remaining lockout; without one the
 * in-memory throttle does. Quoting a made-up window when neither can say would
 * send a patient away for a wait nobody imposed.
 */
function locked(wait: number | null): ChallengeVerificationResult {
  return wait === null
    ? { kind: "rejected", reason: "locked" }
    : { kind: "rejected", reason: "locked", retryAfterSeconds: wait };
}

/**
 * Mints a challenge for a bill number.
 *
 * A challenge is issued for unknown bill numbers exactly as for known ones, and
 * the response says nothing about whether a record exists — otherwise this
 * endpoint would answer "does this bill exist?" for free.
 */
export async function createAccessChallenge(
  input: {
    billNumber: string;
    store: AccessStore;
    now: Date;
    clientKey?: string | null;
  } & ChallengeOverrides,
): Promise<ChallengeCreationResult> {
  const billNumber = normalizeBillNumberForLookup(input.billNumber);
  const throttle = input.throttle ?? createInMemoryThrottle(input.store);

  const retryAfterSeconds = await throttle.check({
    billNumber,
    clientKey: input.clientKey,
    now: input.now,
  });
  if (retryAfterSeconds !== null) {
    return { kind: "throttled", retryAfterSeconds };
  }

  const expiresAt = new Date(input.now.getTime() + CHALLENGE_TTL_MINUTES * MINUTE_MS);
  const challenge: ChallengeRecord = {
    challengeId: randomUUID(),
    billNumber,
    createdAt: input.now,
    expiresAt,
    status: "pending",
    failedAttempts: 0,
    completedAt: null,
  };
  await input.store.addChallenge(challenge);

  return {
    kind: "challenge",
    challenge: {
      challengeId: challenge.challengeId,
      billNumber,
      expiresAt: expiresAt.toISOString(),
      attemptsRemaining: MAX_CHALLENGE_ATTEMPTS,
    },
  };
}

/**
 * Answers a challenge with a code.
 *
 * On success the code is spent (single-use), the challenge is closed, the
 * failure counters are cleared and a session plus signed token are issued.
 * On failure the attempt is counted against both the challenge and the throttle
 * buckets, so neither a new challenge nor a new session resets the budget.
 */
export async function answerAccessChallenge(
  input: {
    challengeId: string;
    accessCode: string;
    store: AccessStore;
    secret: string;
    now: Date;
    clientKey?: string | null;
  } & ChallengeOverrides,
): Promise<ChallengeVerificationResult> {
  const { store, now } = input;
  const throttle = input.throttle ?? createInMemoryThrottle(store);
  const codeVerifier = input.codeVerifier ?? createDigestCodeVerifier(store, input.secret);

  const challenge = await store.findChallenge(input.challengeId);
  if (!challenge) {
    return { kind: "rejected", reason: "unknown_challenge" };
  }

  const throttleInput = {
    billNumber: challenge.billNumber,
    clientKey: input.clientKey,
    now,
  };

  // The challenge's own state is reported first, because it is the more
  // specific answer: "this challenge is done" beats "your bill is cooling
  // down". The throttle is still checked below, so a caller cannot escape it by
  // holding a healthy-looking challenge — the outer budget always applies.
  if (challenge.completedAt !== null) {
    return { kind: "rejected", reason: "already_answered" };
  }
  if (challenge.status === "locked") {
    return locked(await throttle.check(throttleInput));
  }
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    // Expiry is evaluated, not stored, so a stale status can never keep a
    // challenge alive.
    return { kind: "rejected", reason: "expired" };
  }

  const retryAfterSeconds = await throttle.check(throttleInput);
  if (retryAfterSeconds !== null) {
    return { kind: "rejected", reason: "throttled", retryAfterSeconds };
  }

  // The bill the code must belong to is the challenge's, never the request's.
  const redemption = await codeVerifier.redeemCode({
    billNumber: challenge.billNumber,
    accessCode: input.accessCode,
    now,
  });

  // A store that is serving its own lockout refused before even looking at the
  // code, so this is not counted as a guess: the patient is already waiting.
  if (redemption.status === "locked") {
    return locked(redemption.retryAfterSeconds);
  }

  if (redemption.status === "invalid") {
    const wait = await throttle.registerFailure(throttleInput);
    const updated = await store.recordChallengeFailure(
      input.challengeId,
      now,
      MAX_CHALLENGE_ATTEMPTS,
    );
    return updated?.status === "locked"
      ? locked(wait)
      : { kind: "rejected", reason: "invalid_code" };
  }

  await store.completeChallenge(input.challengeId, now);
  await throttle.clear({ billNumber: challenge.billNumber, clientKey: input.clientKey });

  const { token, payload }: { token: string; payload: AccessTokenPayload } = issueAccessToken({
    billNumber: challenge.billNumber,
    secret: input.secret,
    now,
  });

  await store.addSession({
    sessionId: payload.sessionId,
    billNumber: challenge.billNumber,
    createdAt: now,
    expiresAt: payload.expiresAt,
    outcome: null,
    outcomeAt: null,
  });

  return {
    kind: "granted",
    grant: {
      accessToken: token,
      expiresAt: payload.expiresAt.toISOString(),
      billNumber: challenge.billNumber,
    },
  };
}
