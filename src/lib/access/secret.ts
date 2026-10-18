/**
 * The server secret behind access codes.
 *
 * One secret protects two things: the digests at rest and the signature on the
 * tokens handed out. `deriveKey` splits it by purpose, so the two uses never
 * share key material.
 *
 * A secret that is missing or too short is treated as *no secret at all*: the
 * endpoint then refuses with `503` instead of issuing digests that a trivial
 * brute-force would break. Failing closed is the point — a weak secret is worse
 * than an outage, because it fails silently.
 */

export const ACCESS_SECRET_ENV_VAR = "ACCESS_SECRET";

/**
 * 32 characters is the floor, not a recommendation: the security of the stored
 * digests rests entirely on this value being unguessable.
 */
export const MIN_ACCESS_SECRET_LENGTH = 32;

export function isUsableAccessSecret(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length >= MIN_ACCESS_SECRET_LENGTH;
}

/**
 * Reads and validates the secret. Returns null when it is absent or too weak.
 *
 * Takes the environment as a plain map so tests can hand it one without
 * standing up a whole `NodeJS.ProcessEnv`.
 */
export function readAccessSecret(env: Record<string, string | undefined> = process.env): string | null {
  const value = env[ACCESS_SECRET_ENV_VAR];
  return isUsableAccessSecret(value) ? value : null;
}
