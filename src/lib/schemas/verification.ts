import { z } from "zod";
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

export const billVerificationSchema = z
  .object({
    outcome: verificationOutcomeSchema,
    /**
     * Patient-safe message. Must never include amounts or other protected
     * financial values — generic wording only (e.g. "Amounts do not match
     * hospital records" rather than quoting figures).
     */
    safeMessage: z.string().trim().min(1).max(1000),
    /**
     * For "amounts_differ": the KEYS of the fields that differed.
     * Empty array for all other outcomes.
     */
    discrepancyFieldKeys: z.array(financialFieldKeySchema).default([]),
  })
  .strict();
export type BillVerification = z.infer<typeof billVerificationSchema>;
