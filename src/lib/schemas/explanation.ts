import { z } from "zod";
import {
  documentWarningsSchema,
  languageCodeSchema,
  monetaryAmountSchema,
  pageNumberSchema,
} from "./common";
import { financialFieldKeySchema } from "./financial";

/**
 * Future generated explanation of a bill (plain-language summary for the
 * patient). This schema only VALIDATES an explanation object — generating it
 * with AI is a later stage and is not implemented here.
 *
 * Traceability rules enforced by the schema:
 *   - verifiedRecordReference must point at an existing verified bill record
 *     (recordId + billNumber are required); an explanation by itself never
 *     verifies anything.
 *   - every financial fact must name one of the five tracked field keys and
 *     carry the exact decimal string used, so it can be traced back to the
 *     record.
 *   - unresolved discrepancies stay visible through the warnings array,
 *     which is required even when empty.
 *   - the notice literal is enforced: an explanation without the exact
 *     "Generated from hospital-provided bill information." notice is invalid.
 */

/** Fixed notice every explanation must carry. */
export const EXPLANATION_NOTICE =
  "Generated from hospital-provided bill information." as const;

/** Reference to the verified record an explanation was generated from. */
export const verifiedRecordReferenceSchema = z
  .object({
    /** ID of the stored bill record (assigned by the future database layer). */
    recordId: z.string().trim().min(1).max(100),
    billNumber: z.string().trim().min(1).max(100),
  })
  .strict();
export type VerifiedRecordReference = z.infer<
  typeof verifiedRecordReferenceSchema
>;

/**
 * One financial value the explanation used, traceable to the verified
 * record via the field key. A fact may repeat an ambiguous or missing field
 * (with a null amount) so unresolved items stay visible in the narrative.
 */
export const financialFactSchema = z
  .object({
    fieldKey: financialFieldKeySchema,
    amountRupees: monetaryAmountSchema.nullable(),
    pageNumber: pageNumberSchema,
  })
  .strict();
export type FinancialFact = z.infer<typeof financialFactSchema>;

/** A date the explanation mentioned, traceable to a page of the document. */
export const explanationDateSchema = z
  .object({
    label: z.string().trim().min(1).max(100),
    /** ISO calendar date, e.g. "2026-10-11". */
    dateIso: z.iso.date(),
    pageNumber: pageNumberSchema,
  })
  .strict();
export type ExplanationDate = z.infer<typeof explanationDateSchema>;

export const explanationSchema = z
  .object({
    language: languageCodeSchema,
    explanationText: z.string().trim().min(1).max(10000),
    verifiedRecordReference: verifiedRecordReferenceSchema,
    financialFactsUsed: z.array(financialFactSchema).min(1),
    datesUsed: z.array(explanationDateSchema),
    warnings: documentWarningsSchema,
    /** Every explanation must carry this exact notice. */
    notice: z.literal(EXPLANATION_NOTICE),
  })
  .strict();
export type Explanation = z.infer<typeof explanationSchema>;
