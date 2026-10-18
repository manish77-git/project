/**
 * How a submitted access code is checked against the code store.
 *
 * There are two stores in this repository, and exactly one of them is in use in
 * any given deployment:
 *
 *   - `createDigestCodeVerifier` — the no-database path. Codes are stored as
 *     keyed HMAC-SHA256 digests in a seed file, are single-use, and are matched
 *     in memory. This is what runs in the tests and in a demo.
 *   - `createDatabaseCodeVerifier` — the database path, built on the existing
 *     `src/lib/db/access-codes.ts` layer unchanged: bcrypt hashes in the
 *     `access_codes` table, single-use enforced by passing `singleUse: true`,
 *     and the table's own durable lockout after five failures.
 *
 * What both implementations have in common is the contract: the bill comes from
 * the challenge (never from the request), a code for a different bill never
 * matches, and a refusal is a refusal — the caller is told nothing about why.
 *
 * Attempt accounting is deliberately NOT here. A wrong answer is counted by the
 * caller against the challenge and, where the store does not do it itself, by
 * the throttle strategy. See throttle.ts.
 */
import { digestAccessCode } from "./codes";
import type { AccessStore } from "./store";
import { redeemAccessCode } from "@/lib/db/access-codes";
import type { Queryable } from "@/lib/db/client";
import { findBillByNumber } from "@/lib/db/queries";
import { normalizeBillNumberForLookup } from "@/lib/records/mock-records";

export type CodeRedemption =
  | { status: "ok" }
  | { status: "invalid" }
  /** The store is serving a lockout; `retryAfterSeconds` is its own remaining time. */
  | { status: "locked"; retryAfterSeconds: number };

export interface CodeVerifier {
  /**
   * Checks `accessCode` for `billNumber` and, when it matches, spends it. A
   * single-use code that has already been used does not match.
   */
  redeemCode(input: {
    billNumber: string;
    accessCode: string;
    now: Date;
  }): Promise<CodeRedemption>;
}

/** The in-memory, digest-based store: no database needed. */
export function createDigestCodeVerifier(store: AccessStore, secret: string): CodeVerifier {
  return {
    async redeemCode(input): Promise<CodeRedemption> {
      const digest = digestAccessCode(input.accessCode, secret);
      const record = await store.findCodeByDigest(digest);
      if (!record) return { status: "invalid" };

      // A code is only ever good for the bill it was issued for, compared the
      // same normalised way every other bill-number match in the app works.
      if (
        normalizeBillNumberForLookup(record.billNumber) !==
        normalizeBillNumberForLookup(input.billNumber)
      ) {
        return { status: "invalid" };
      }
      if (record.expiresAt.getTime() <= input.now.getTime()) {
        return { status: "invalid" };
      }

      const consumed = await store.consumeCode(digest, input.now);
      return consumed ? { status: "ok" } : { status: "invalid" };
    },
  };
}

/**
 * The database-backed store.
 *
 * The bill number is resolved to a record first, so a code is compared against
 * the codes issued for THAT bill and a valid code for one bill can never unlock
 * another. Unknown bill numbers resolve to nothing and are refused exactly like
 * a wrong code. The `access_codes` lockout is surfaced with its real remaining
 * wait rather than a guessed window.
 */
export function createDatabaseCodeVerifier(db: Queryable): CodeVerifier {
  return {
    async redeemCode(input): Promise<CodeRedemption> {
      const bill = await findBillByNumber(db, normalizeBillNumberForLookup(input.billNumber));
      if (!bill) return { status: "invalid" };

      const result = await redeemAccessCode(db, bill.billId, input.accessCode, {
        now: input.now,
        singleUse: true,
      });

      switch (result.status) {
        case "ok":
          return { status: "ok" };
        case "locked":
          return {
            status: "locked",
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((Date.parse(result.lockedUntil) - input.now.getTime()) / 1000),
            ),
          };
        // invalid, expired, not_found and spent are one indistinguishable
        // refusal to the caller: every one of them means "that code did not
        // work", and telling them apart would only help someone guessing.
        default:
          return { status: "invalid" };
      }
    },
  };
}
