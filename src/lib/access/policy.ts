/**
 * The fixed numbers behind access-code policy.
 *
 * They live in their own module so the challenge service and the throttle can
 * read them without importing each other.
 */

/** Wrong answers allowed per challenge before it locks. */
export const MAX_CHALLENGE_ATTEMPTS = 3;

/** A challenge is answerable for five minutes. */
export const CHALLENGE_TTL_MINUTES = 5;

/** After the attempt limit, that bill (and client) waits this long. */
export const THROTTLE_WINDOW_MINUTES = 15;

export const MINUTE_MS = 60_000;
