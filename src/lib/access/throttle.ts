/**
 * Where the "you have tried too often" rule is enforced.
 *
 * There must be exactly ONE authority for attempt state in a deployment. Two
 * counters guarding the same thing is how a system ends up telling a patient to
 * wait five minutes on one screen and fifteen on another, and how an attacker
 * ends up with the more permissive of the two:
 *
 *   - `createInMemoryThrottle` — used when no database is configured. Failure
 *     counters live in the in-memory store, keyed by BILL and by CLIENT, and
 *     deliberately OUTSIDE the challenge: if the counter lived on the challenge,
 *     an attacker could request a fresh challenge after every three guesses and
 *     never meet a limit.
 *   - `createStorageManagedThrottle` — used when a database IS configured. The
 *     `access_codes` table already carries `failed_attempts` and `locked_until`,
 *     and that lock survives a restart, so it is the stronger authority. This
 *     strategy therefore reports no wait of its own and lets the code verifier
 *     surface the real lockout.
 *
 * The per-challenge cap (three wrong answers) is NOT here: it belongs to the
 * challenge record, and it applies in both modes.
 */
import type { AccessStore, AttemptRecord } from "./store";
import { MAX_CHALLENGE_ATTEMPTS, MINUTE_MS, THROTTLE_WINDOW_MINUTES } from "./policy";

export interface ThrottleInput {
  billNumber: string;
  clientKey?: string | null;
  now: Date;
}

export interface ThrottleStrategy {
  /** Seconds to advertise before another attempt may be made, or null if none. */
  check(input: ThrottleInput): Promise<number | null>;
  /** Records a failed answer; returns the seconds to advertise if now locked. */
  registerFailure(input: ThrottleInput): Promise<number | null>;
  /** Forgets the failures for this bill and client (a correct answer clears them). */
  clear(input: { billNumber: string; clientKey?: string | null }): Promise<void>;
}

/**
 * Buckets for one attempt. The bill bucket catches an attacker who keeps trying
 * the same bill from anywhere; the client bucket catches one client working
 * through many bills. A client bucket is only used when a reliable client
 * identifier exists — inventing one would let a proxy lock out unrelated
 * patients.
 */
function throttleKeys(billNumber: string, clientKey?: string | null): string[] {
  const keys = [`bill:${billNumber}`];
  if (clientKey) keys.push(`client:${clientKey}`);
  return keys;
}

function waitSeconds(record: AttemptRecord, now: Date): number {
  const unlocksAt = record.lastFailedAt.getTime() + THROTTLE_WINDOW_MINUTES * MINUTE_MS;
  return Math.max(1, Math.ceil((unlocksAt - now.getTime()) / 1000));
}

function isThrottled(record: AttemptRecord, now: Date): boolean {
  if (record.failedAttempts < MAX_CHALLENGE_ATTEMPTS) return false;
  return now.getTime() < record.lastFailedAt.getTime() + THROTTLE_WINDOW_MINUTES * MINUTE_MS;
}

export function createInMemoryThrottle(store: AccessStore): ThrottleStrategy {
  return {
    async check(input: ThrottleInput): Promise<number | null> {
      for (const key of throttleKeys(input.billNumber, input.clientKey)) {
        const state = await store.findAttempts(key);
        if (state && isThrottled(state, input.now)) return waitSeconds(state, input.now);
      }
      return null;
    },

    async registerFailure(input: ThrottleInput): Promise<number | null> {
      let longestWait: number | null = null;
      for (const key of throttleKeys(input.billNumber, input.clientKey)) {
        const updated = await store.recordAttemptFailure(key, input.now);
        if (isThrottled(updated, input.now)) {
          const wait = waitSeconds(updated, input.now);
          longestWait = longestWait === null ? wait : Math.max(longestWait, wait);
        }
      }
      return longestWait;
    },

    async clear(input: { billNumber: string; clientKey?: string | null }): Promise<void> {
      for (const key of throttleKeys(input.billNumber, input.clientKey)) {
        await store.clearAttempts(key);
      }
    },
  };
}

/**
 * For when the code store enforces its own lockout.
 *
 * Reporting "no wait" is not the same as having no limit: the limit is the
 * storage layer's, it is durable, and the verifier reports its retry-after with
 * the exact remaining seconds.
 */
export function createStorageManagedThrottle(): ThrottleStrategy {
  return {
    async check(): Promise<number | null> {
      return null;
    },
    async registerFailure(): Promise<number | null> {
      return null;
    },
    async clear(): Promise<void> {
      // Nothing local to forget; the store resets its own counter on success.
    },
  };
}
