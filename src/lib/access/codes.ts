/**
 * Access codes: how they are generated, normalised and hashed.
 *
 * Design notes that matter for security:
 *
 *   - Codes are generated from `crypto.randomInt`, not `Math.random`, and the
 *     alphabet omits characters patients confuse when reading a printed slip
 *     (I/O and 0/1), so a code can be typed from paper without ambiguity.
 *   - Only a DIGEST is ever stored. The digest is an HMAC-SHA256 keyed with a
 *     server secret rather than a plain hash, because a short code has little
 *     entropy: with a plain hash, anyone holding the store could brute-force
 *     every 10-character code in seconds. The secret is what stops that.
 *   - Normalisation (case, spaces, dashes) happens before hashing, so the same
 *     code typed three different ways resolves to one digest.
 */
import { createHmac, randomInt } from "node:crypto";

/** No I, O, 0 or 1 — the characters people misread on a printed code. */
export const ACCESS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 32^10 ≈ 1.1e15 combinations: far beyond guessing at any realistic rate. */
export const ACCESS_CODE_LENGTH = 10;

/** Display grouping, e.g. AB3DE-FGH7K. */
export const ACCESS_CODE_GROUP_SIZE = 5;

/**
 * Derives a purpose-specific key from one configured secret.
 *
 * One environment variable is far less likely to be misconfigured than two, and
 * deriving by purpose keeps the code-digest key and the token-signing key
 * cryptographically separate — a digest can never be mistaken for a signature.
 */
export function deriveKey(secret: string, purpose: string): Buffer {
  return createHmac("sha256", secret).update(purpose).digest();
}

export function generateAccessCode(length: number = ACCESS_CODE_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error("An access code length must be a positive integer.");
  }
  let code = "";
  for (let index = 0; index < length; index += 1) {
    // randomInt is uniform over the range, unlike a modulo of random bytes.
    code += ACCESS_CODE_ALPHABET[randomInt(ACCESS_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Reduces whatever a patient typed to the canonical form used for hashing:
 * uppercase, with spaces and dashes removed.
 */
export function normalizeAccessCode(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Canonical form for showing a code to a human: grouped and uppercase. */
export function formatAccessCode(code: string): string {
  const normalized = normalizeAccessCode(code);
  const groups: string[] = [];
  for (let index = 0; index < normalized.length; index += ACCESS_CODE_GROUP_SIZE) {
    groups.push(normalized.slice(index, index + ACCESS_CODE_GROUP_SIZE));
  }
  return groups.join("-");
}

/**
 * The stored form of a code. Deterministic for a given secret, so redemption is
 * a lookup by digest, and one-way, so the store never holds a usable code.
 */
export function digestAccessCode(code: string, secret: string): string {
  return createHmac("sha256", deriveKey(secret, "access-code-digest"))
    .update(normalizeAccessCode(code))
    .digest("hex");
}
