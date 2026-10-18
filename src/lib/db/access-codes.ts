import { randomInt } from "node:crypto";
import { compare, hash } from "bcryptjs";
import type { Queryable } from "./client";

/** Wrong guesses allowed before the bill is locked. */
export const MAX_FAILED_ATTEMPTS = 5;
/** How long a bill stays locked after too many wrong guesses. */
export const LOCK_MINUTES = 15;

const BCRYPT_COST = 10;
// No 0/O or 1/I, so codes read aloud or typed on a phone are not confused.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type RedeemResult =
  | { status: "ok"; accessCodeId: string }
  | { status: "invalid"; attemptsLeft: number }
  | { status: "locked"; lockedUntil: string }
  | { status: "expired" }
  | { status: "not_found" }
  /** Only returned when the caller asked for `singleUse`. */
  | { status: "spent" };

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Create a new access code for a bill. Only the bcrypt HASH is stored; the
 * plain code is returned once, so the hospital can hand it to the patient.
 */
export async function issueAccessCode(
  db: Queryable,
  billId: string,
  options: { ttlHours?: number; now?: Date } = {},
): Promise<{ accessCodeId: string; code: string; expiresAt: string }> {
  const now = options.now ?? new Date();
  const ttlHours = options.ttlHours ?? 72;

  const pick = () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const part = () => Array.from({ length: 4 }, pick).join("");
  const code = `${part()}-${part()}`;

  const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000);
  const codeHash = await hash(code, BCRYPT_COST);

  const { rows } = await db.query(
    `insert into access_codes (bill_id, code_hash, expires_at)
     values ($1, $2, $3)
     returning id`,
    [billId, codeHash, expiresAt],
  );
  const row = rows[0];
  if (!row) throw new Error("Access code was not saved.");

  return {
    accessCodeId: String(row.id),
    code,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Check a patient's code for a bill (uses the newest code for that bill).
 *
 * - Wrong code: counts the attempt; after MAX_FAILED_ATTEMPTS the bill locks
 *   for LOCK_MINUTES. While locked, even the right code is refused.
 * - Right code: resets the counter and records the first use.
 * - API layer tip: show the SAME message for "not_found" and "invalid", so
 *   nobody can learn which bills exist. Also add a rate limit per IP.
 * - Known limit: attempts are counted read-then-write, so many simultaneous
 *   guesses could slip a few extra tries past the counter. The IP rate limit
 *   covers that.
 *
 * `singleUse: true` is what an access-code flow wants: a code that has already
 * been redeemed is refused as "spent" instead of being accepted again. The
 * default (false) keeps the original behaviour of recording first use while
 * still accepting the code, which the tests below pin down. The check is added
 * just before the comparison, so the order of every existing refusal — missing,
 * expired, locked — is unchanged.
 */
export async function redeemAccessCode(
  db: Queryable,
  billId: string,
  code: string,
  options: { now?: Date; singleUse?: boolean } = {},
): Promise<RedeemResult> {
  const now = options.now ?? new Date();

  const { rows } = await db.query(
    `select id, code_hash, expires_at, failed_attempts, locked_until, redeemed_at
       from access_codes
      where bill_id = $1
      order by created_at desc
      limit 1`,
    [billId],
  );
  const row = rows[0];
  if (!row) return { status: "not_found" };

  const id = String(row.id);

  const expiresAt = toDate(row.expires_at);
  if (!expiresAt || expiresAt <= now) return { status: "expired" };

  const lockedUntil = toDate(row.locked_until);
  if (lockedUntil && lockedUntil > now) {
    return { status: "locked", lockedUntil: lockedUntil.toISOString() };
  }

  if (options.singleUse && toDate(row.redeemed_at)) return { status: "spent" };

  const matches = await compare(code.trim().toUpperCase(), String(row.code_hash));

  if (matches) {
    await db.query(
      `update access_codes
          set failed_attempts = 0,
              locked_until = null,
              redeemed_at = coalesce(redeemed_at, $2)
        where id = $1`,
      [id, now],
    );
    return { status: "ok", accessCodeId: id };
  }

  // A lock that has already run out starts the count again from zero.
  const previous = lockedUntil ? 0 : Number(row.failed_attempts) || 0;
  const attempts = previous + 1;
  const newLock =
    attempts >= MAX_FAILED_ATTEMPTS
      ? new Date(now.getTime() + LOCK_MINUTES * 60_000)
      : null;

  await db.query(
    `update access_codes
        set failed_attempts = $2, locked_until = $3
      where id = $1`,
    [id, attempts, newLock],
  );

  if (newLock) return { status: "locked", lockedUntil: newLock.toISOString() };
  return { status: "invalid", attemptsLeft: MAX_FAILED_ATTEMPTS - attempts };
}