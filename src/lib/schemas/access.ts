import { z } from "zod";

/**
 * Access-code schemas — proof that a patient may see a particular bill.
 *
 * This is the *authentication* stage, which answers a different question from
 * identification ("what does this document say?") and from verification ("does
 * the hospital's record match it?"). It is deliberately a separate module so
 * that no other stage can casually depend on it, and so that "you may not see
 * this" can never be confused with "we could not read this" or "it does not
 * match".
 *
 * The flow is a two-step server-side challenge, not a single flag:
 *
 *   1. POST .../access/challenge — the server mints a short-lived challenge,
 *      bound to one bill number. The client never chooses which record the
 *      challenge is compared against.
 *   2. POST .../access/verify — the patient submits the code for THAT
 *      challenge. A wrong code spends one of three attempts; the challenge
 *      expires five minutes after it was created and can never be reused.
 *
 * Only after both steps does the server issue the signed access token that
 * verification and financial endpoints require. No client-supplied boolean is
 * ever consulted to decide whether a patient is allowed in.
 */

/**
 * Bill number as matched for access.
 *
 * Same shape identification accepts, so a number read off a bill by OCR and a
 * number typed by a patient can be compared. Matching normalises case; this
 * schema only fixes what may be submitted.
 */
export const accessBillNumberSchema = z
  .string()
  .trim()
  .min(3, "A bill number needs at least 3 characters.")
  .max(100, "A bill number cannot be longer than 100 characters.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9/\-_. ]*$/,
    "A bill number may only contain letters, digits and the separators / - _ .",
  );

/**
 * A patient-facing access code.
 *
 * Dashes are allowed because the issued code is displayed in groups
 * (`AB3DE-FGH7K`) and patients often copy it with them. Validation is on the
 * raw string; hashing normalises it first, so `ab3de-fgh7k` and `AB3DEFGH7K`
 * are the same code.
 */
export const accessCodeSchema = z
  .string()
  .trim()
  .min(6, "An access code is at least 6 characters.")
  .max(64, "An access code cannot be longer than 64 characters.")
  .regex(/^[A-Za-z0-9-]+$/, "An access code contains only letters, digits and dashes.");

/* ------------------------------------------------------------------ *
 * Step 1: ask for a challenge
 * ------------------------------------------------------------------ */

/**
 * Strict: the ONLY thing a client may say is which bill it wants to see.
 * It cannot request a particular record, an expiry, or a number of attempts.
 */
export const accessChallengeRequestSchema = z
  .object({
    billNumber: accessBillNumberSchema,
  })
  .strict();
export type AccessChallengeRequest = z.infer<typeof accessChallengeRequestSchema>;

/**
 * The challenge handed back. `challengeId` is an opaque server value; the
 * expiry is stated so the UI can count down, and `attemptsRemaining` is always
 * the full budget at creation.
 *
 * Deliberately absent: any hint about whether the bill exists. A challenge is
 * issued for unknown bill numbers in exactly the same way, so this response
 * cannot be used to discover which bills are on file.
 */
export const accessChallengeSchema = z
  .object({
    challengeId: z.string().trim().min(16).max(100),
    billNumber: z.string().trim().min(1).max(100),
    /** ISO 8601 with timezone: five minutes after creation. */
    expiresAt: z.iso.datetime({ offset: true }),
    attemptsRemaining: z.number().int().min(0).max(10),
  })
  .strict();
export type AccessChallenge = z.infer<typeof accessChallengeSchema>;

/* ------------------------------------------------------------------ *
 * Step 2: answer the challenge
 * ------------------------------------------------------------------ */

/**
 * The answer. Note what is NOT accepted: a bill number, an outcome, an
 * `isVerified` flag, or a challenge status. The bill is whatever the challenge
 * was bound to server-side, so a client cannot retarget a challenge at another
 * record, and no browser-controlled flag can influence the decision.
 */
export const accessChallengeVerificationRequestSchema = z
  .object({
    challengeId: z.string().trim().min(16).max(100),
    accessCode: accessCodeSchema,
  })
  .strict();
export type AccessChallengeVerificationRequest = z.infer<
  typeof accessChallengeVerificationRequestSchema
>;

/**
 * What a successful challenge grants.
 *
 * `accessToken` is opaque to the client: a short-lived, server-signed assertion
 * that the holder may see `billNumber`. It carries no amounts, no patient
 * details and no code, so it is safe to hold in the browser for its brief life.
 * The token alone is not enough either — the server also keeps the session it
 * refers to, and both must agree.
 */
export const accessGrantSchema = z
  .object({
    accessToken: z.string().trim().min(16).max(4096),
    /** ISO 8601 with timezone, so the client never has to guess a timezone. */
    expiresAt: z.iso.datetime({ offset: true }),
    billNumber: z.string().trim().min(1).max(100),
  })
  .strict();
export type AccessGrant = z.infer<typeof accessGrantSchema>;

/**
 * The stored access-code record (server-side only, never returned).
 *
 * `codeDigest` is a hex HMAC-SHA256 of the normalised code under a server
 * secret. The code itself is not stored anywhere: redeeming works by hashing
 * what the patient typed and looking that up.
 */
export const storedAccessCodeSchema = z
  .object({
    codeDigest: z
      .string()
      .regex(/^[0-9a-f]{64}$/, "A code digest is the hex form of a SHA-256 HMAC."),
    billNumber: z.string().trim().min(1).max(100),
    expiresAt: z.iso.datetime({ offset: true }),
    /** Set by the first successful redemption. Non-null means single-use spent. */
    consumedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type StoredAccessCodeRecord = z.infer<typeof storedAccessCodeSchema>;
