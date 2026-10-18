import { z } from "zod";
import { monetaryAmountSchema } from "./common";
import { financialFieldKeySchema } from "./financial";

/**
 * Bill VERIFICATION outcome — "did the hospital's record match the bill?"
 *
 * Exactly four outcomes. An unreadable image is NOT one of them: that is an
 * identification result (see identification.ts).
 *
 * The schema is strict and contains NO monetary amounts. Which figures were
 * compared, and any actual values, are only disclosed later through the
 * authorized financial stage (see financial.ts). The only extra metadata
 * allowed here are the field KEYS that differed — names like
 * "printedAmountDue", never their values.
 */
export const verificationOutcomeSchema = z.enum([
  "verified",
  "amounts_differ",
  "bill_not_found",
  "hospital_not_registered",
]);
export type VerificationOutcome = z.infer<typeof verificationOutcomeSchema>;

/* ------------------------------------------------------------------ *
 * The verification REQUEST (added with the stage that implements it).
 *
 * Note what a client may and may not say. It may describe what it read off
 * the uploaded bill: a hospital name and amounts. It may NOT state an outcome,
 * a discrepancy, or any "verified" flag — those are server conclusions, and the
 * schema is strict, so sending them is a 400 rather than something to ignore.
 *
 * There is no bill number field either: the bill comes from the access session
 * the caller proved, never from the body, so a request cannot be pointed at a
 * record the caller has not been authorised to see.
 * ------------------------------------------------------------------ */
export const billVerificationCandidateSchema = z
  .object({
    fieldKey: financialFieldKeySchema,
    /** The amount read off the bill; null when it could not be read. */
    amountRupees: monetaryAmountSchema.nullable(),
  })
  .strict();
export type BillVerificationCandidate = z.infer<typeof billVerificationCandidateSchema>;

export const billVerificationRequestSchema = z
  .object({
    /** Hospital name read off the bill, when OCR managed to read it. */
    hospitalName: z.string().trim().min(2).max(300).optional(),
    /** Amounts read off the uploaded bill. Compared server-side, never trusted as a verdict. */
    financialCandidates: z.array(billVerificationCandidateSchema).max(20).optional(),
  })
  .strict();
export type BillVerificationRequest = z.infer<typeof billVerificationRequestSchema>;

export const billVerificationSchema = z
  .object({
    outcome: verificationOutcomeSchema,
    /**
     * Patient-safe message. Must never include amounts or other protected
     * financial values — generic wording only (e.g. "Amounts do not match
     * hospital records" rather than quoting figures).
     */
    message: z.string().trim().min(1).max(1000),
    /**
     * For "amounts_differ": the KEYS of the fields that differed.
     * Empty array for all other outcomes.
     */
    discrepancyKeys: z.array(financialFieldKeySchema).default([]),
  })
  .strict();
export type BillVerification = z.infer<typeof billVerificationSchema>;
