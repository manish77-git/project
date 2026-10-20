/**
 * Server-side state for access and verification.
 *
 * EVERYTHING HERE IS IN MEMORY AND TEMPORARY. It is reset when the process
 * restarts, and it is NOT shared between instances: two servers behind a load
 * balancer would each keep their own challenges, attempt counts and sessions,
 * so a patient could be routed to a process that has never seen their
 * challenge, and an attempt limit would be counted once per instance.
 * That is acceptable only for a single-instance demo. Production needs a shared
 * store (a database or a cache) behind the same interface.
 *
 * The four areas of state:
 *
 *   - codes       — digests of issued codes, seeded from disk
 *   - challenges  — one short-lived challenge per access attempt
 *   - attempts    — failure counters used to throttle, keyed by bill and by
 *                   client, and deliberately NOT owned by a challenge, so
 *                   starting a fresh challenge cannot reset the budget
 *   - sessions    — what a token refers to, and what was actually verified
 *
 * The interface is split from the implementation on purpose: swapping in a
 * shared store means writing one adapter, and every policy rule above it stays
 * testable with the in-memory version.
 */
import type { VerificationOutcome } from "@/lib/schemas";
import { createCodeSeedSource, DEFAULT_ACCESS_CODES_FILE } from "./code-seed";
import { MINUTE_MS, THROTTLE_WINDOW_MINUTES } from "./policy";

/**
 * How often a write may spend time dropping dead entries.
 *
 * Sweeping on every write would make each request O(entries). Sweeping at most
 * once a minute keeps the cost amortised while still bounding how long dead
 * state can survive.
 */
const SWEEP_INTERVAL_MS = MINUTE_MS;

/** A code as stored: a digest, never the code itself. */
export interface AccessCodeRecord {
  codeDigest: string;
  billNumber: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export type ChallengeStatus = "pending" | "locked";

export interface ChallengeRecord {
  challengeId: string;
  /** The bill this challenge is bound to. Chosen by the server, never the client. */
  billNumber: string;
  createdAt: Date;
  expiresAt: Date;
  status: ChallengeStatus;
  failedAttempts: number;
  /** Set once the challenge has been answered correctly. */
  completedAt: Date | null;
}

export interface AttemptRecord {
  failedAttempts: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
}

export interface AccessSession {
  sessionId: string;
  billNumber: string;
  createdAt: Date;
  expiresAt: Date;
  /** null until verification has run for this session. */
  outcome: VerificationOutcome | null;
  outcomeAt: Date | null;
}

export interface AccessStore {
  addCode(record: AccessCodeRecord): Promise<void>;
  findCodeByDigest(codeDigest: string): Promise<AccessCodeRecord | null>;
  /** Marks a single-use code spent. True only for the first caller. */
  consumeCode(codeDigest: string, at: Date): Promise<boolean>;

  addChallenge(record: ChallengeRecord): Promise<void>;
  findChallenge(challengeId: string): Promise<ChallengeRecord | null>;
  /**
   * Counts one failed answer. The challenge locks once `maxAttempts` is
   * reached; the returned record reflects the new state.
   */
  recordChallengeFailure(
    challengeId: string,
    at: Date,
    maxAttempts: number,
  ): Promise<ChallengeRecord | null>;
  completeChallenge(challengeId: string, at: Date): Promise<void>;

  findAttempts(key: string): Promise<AttemptRecord | null>;
  recordAttemptFailure(key: string, at: Date): Promise<AttemptRecord>;
  clearAttempts(key: string): Promise<void>;

  addSession(session: AccessSession): Promise<void>;
  findSession(sessionId: string): Promise<AccessSession | null>;
  recordOutcome(sessionId: string, outcome: VerificationOutcome, at: Date): Promise<void>;
}

export interface InMemoryAccessStoreOptions {
  /** Loader for seeded code digests. Omit to start with no codes. */
  codeSeed?: () => Promise<readonly AccessCodeRecord[]>;
}

export function createInMemoryAccessStore(
  options: InMemoryAccessStoreOptions = {},
): AccessStore {
  const codes = new Map<string, AccessCodeRecord>();
  const challenges = new Map<string, ChallengeRecord>();
  const attempts = new Map<string, AttemptRecord>();
  const sessions = new Map<string, AccessSession>();

  let lastSweepAt: number | null = null;

  /**
   * Drops state that can no longer influence any decision.
   *
   * Without this the maps only ever grow: a challenge is created by anyone who
   * can reach the endpoint, and nothing removed an expired one. A request flood
   * with random bill numbers would then grow memory for as long as the process
   * lives. Entries are removed only once they are dead — an expired challenge,
   * an expired session, a failure counter older than the throttle window — so a
   * live flow is never disturbed.
   *
   * Both the challenge and session expiry are re-checked on read, so removing a
   * dead row here cannot make a stale credential valid; at worst an expired
   * challenge is reported as unknown rather than expired, and both refusals are
   * the same 401 to the caller.
   */
  function sweep(now: Date): void {
    const nowMs = now.getTime();
    if (lastSweepAt !== null && nowMs - lastSweepAt < SWEEP_INTERVAL_MS) return;
    lastSweepAt = nowMs;

    for (const [challengeId, challenge] of challenges) {
      if (challenge.expiresAt.getTime() <= nowMs) challenges.delete(challengeId);
    }

    for (const [sessionId, session] of sessions) {
      if (session.expiresAt.getTime() <= nowMs) sessions.delete(sessionId);
    }

    const attemptCutoff = nowMs - THROTTLE_WINDOW_MINUTES * MINUTE_MS;
    for (const [key, attempt] of attempts) {
      if (attempt.lastFailedAt.getTime() <= attemptCutoff) attempts.delete(key);
    }
  }

  /**
   * Merges seeded digests in, never overwriting live state.
   *
   * A broken seed file makes this throw: the endpoint then reports itself
   * unavailable rather than silently acting as if no codes had been issued.
   */
  async function refreshSeed(): Promise<void> {
    if (!options.codeSeed) return;
    const seeded = await options.codeSeed();
    for (const record of seeded) {
      // Never overwrite live state: a consumed code stays consumed even if the
      // file still lists it as unused.
      if (!codes.has(record.codeDigest)) {
        codes.set(record.codeDigest, { ...record });
      }
    }
  }

  return {
    async addCode(record: AccessCodeRecord): Promise<void> {
      codes.set(record.codeDigest, { ...record });
    },

    async findCodeByDigest(codeDigest: string): Promise<AccessCodeRecord | null> {
      await refreshSeed();
      const record = codes.get(codeDigest);
      return record ? { ...record } : null;
    },

    async consumeCode(codeDigest: string, at: Date): Promise<boolean> {
      await refreshSeed();
      const record = codes.get(codeDigest);
      if (!record || record.consumedAt !== null) return false;
      codes.set(codeDigest, { ...record, consumedAt: at });
      return true;
    },

    async addChallenge(record: ChallengeRecord): Promise<void> {
      sweep(record.createdAt);
      challenges.set(record.challengeId, { ...record });
    },

    async findChallenge(challengeId: string): Promise<ChallengeRecord | null> {
      const record = challenges.get(challengeId);
      return record ? { ...record } : null;
    },

    async recordChallengeFailure(
      challengeId: string,
      at: Date,
      maxAttempts: number,
    ): Promise<ChallengeRecord | null> {
      const record = challenges.get(challengeId);
      if (!record) return null;
      const failedAttempts = record.failedAttempts + 1;
      const updated: ChallengeRecord = {
        ...record,
        failedAttempts,
        status: failedAttempts >= maxAttempts ? "locked" : record.status,
      };
      challenges.set(challengeId, updated);
      return { ...updated };
    },

    async completeChallenge(challengeId: string, at: Date): Promise<void> {
      const record = challenges.get(challengeId);
      if (!record) return;
      challenges.set(challengeId, { ...record, completedAt: at });
    },

    async findAttempts(key: string): Promise<AttemptRecord | null> {
      const record = attempts.get(key);
      return record ? { ...record } : null;
    },

    async recordAttemptFailure(key: string, at: Date): Promise<AttemptRecord> {
      const existing = attempts.get(key);
      const updated: AttemptRecord = existing
        ? { ...existing, failedAttempts: existing.failedAttempts + 1, lastFailedAt: at }
        : { failedAttempts: 1, firstFailedAt: at, lastFailedAt: at };
      attempts.set(key, updated);
      return { ...updated };
    },

    async clearAttempts(key: string): Promise<void> {
      attempts.delete(key);
    },

    async addSession(session: AccessSession): Promise<void> {
      sweep(session.createdAt);
      sessions.set(session.sessionId, { ...session });
    },

    async findSession(sessionId: string): Promise<AccessSession | null> {
      const record = sessions.get(sessionId);
      return record ? { ...record } : null;
    },

    async recordOutcome(
      sessionId: string,
      outcome: VerificationOutcome,
      at: Date,
    ): Promise<void> {
      const record = sessions.get(sessionId);
      if (!record) return;
      sessions.set(sessionId, { ...record, outcome, outcomeAt: at });
    },
  };
}

let defaultStore: AccessStore | null = null;

/** The store used by the running app: in memory, seeded from the codes file. */
export function getDefaultAccessStore(): AccessStore {
  if (!defaultStore) {
    defaultStore = createInMemoryAccessStore({
      codeSeed: createCodeSeedSource(process.env.ACCESS_CODES_FILE ?? DEFAULT_ACCESS_CODES_FILE),
    });
  }
  return defaultStore;
}

/** Test helper: drop the process-wide store so each suite starts clean. */
export function resetDefaultAccessStore(): void {
  defaultStore = null;
}
