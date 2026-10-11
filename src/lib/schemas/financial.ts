import { z } from "zod";
import {
  currencySchema,
  documentWarningsSchema,
  monetaryAmountSchema,
  pageNumberSchema,
} from "./common";

/**
 * One financial value extracted from a hospital bill.
 *
 * The schema is deliberately split into "status" + "amountRupees":
 *   - status "found"    → amountRupees MUST be a non-null decimal string
 *   - status "missing"  → amountRupees MUST be null (NEVER "0")
 *   - status "ambiguous"→ amountRupees may be a candidate string or null
 *
 * A missing amount is unknown, not zero. The superRefine below enforces the
 * combinations so no downstream code can accidentally treat them alike.
 */
export const financialFieldStatusSchema = z.enum([
  "found",
  "ambiguous",
  "missing",
]);
export type FinancialFieldStatus = z.infer<typeof financialFieldStatusSchema>;

const financialFieldShape = {
  amountRupees: monetaryAmountSchema.nullable(),
  status: financialFieldStatusSchema,
  /** Short excerpt from the document that justifies the value, or null. */
  evidence: z.string().trim().max(500).nullable(),
  /** Source page for the value, or null when unavailable. */
  pageNumber: pageNumberSchema,
  /**
   * True ONLY after an explicit patient action in the app.
   * Defaults to false: model output can never confirm a value on its own.
   */
  confirmedByUser: z.boolean().default(false),
};

function requireAmountConsistency(
  data: { amountRupees: string | null; status: FinancialFieldStatus },
  ctx: z.RefinementCtx,
): void {
  if (data.status === "found" && data.amountRupees === null) {
    ctx.addIssue({
      code: "custom",
      path: ["amountRupees"],
      message: 'When status is "found", amountRupees must be a non-null decimal string.',
    });
  }
  if (data.status === "missing" && data.amountRupees !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["amountRupees"],
      message:
        'When status is "missing", amountRupees must be null. A missing amount is unknown, not zero — never send a number here.',
    });
  }
}

/** A single financial field as stored in a bill record. */
export const financialFieldSchema = z
  .object(financialFieldShape)
  .strict()
  .superRefine(requireAmountConsistency);
export type FinancialField = z.infer<typeof financialFieldSchema>;

/**
 * Same field, but for validating raw model/extraction output.
 *
 * confirmedByUser is a literal false here (still defaulted), so a value
 * produced by the AI pipeline can NEVER claim patient confirmation. Only a
 * request validated against financialFieldConfirmationSchema — a future
 * endpoint protected by auth — may flip it to true, after which the stored
 * record validates against financialFieldSchema again.
 */
export const financialFieldCandidateSchema = z
  .object({
    ...financialFieldShape,
    confirmedByUser: z.literal(false).default(false),
  })
  .strict()
  .superRefine(requireAmountConsistency);
export type FinancialFieldCandidate = z.infer<
  typeof financialFieldCandidateSchema
>;

/**
 * Update payload a patient can send to confirm one extracted field.
 *
 * Kept separate from financialFieldSchema on purpose: nothing produced by the
 * model pipeline can ever include confirmedByUser=true, and the only way to
 * reach true is a request validated against THIS schema, which the future
 * endpoint will protect with authentication and a same-origin check.
 */
export const financialFieldConfirmationSchema = z
  .object({
    confirmedByUser: z.literal(true),
  })
  .strict();
export type FinancialFieldConfirmation = z.infer<
  typeof financialFieldConfirmationSchema
>;

/** The five tracked financial values of a bill. */
export const financialFieldsSchema = z
  .object({
    billTotalAfterDiscounts: financialFieldSchema,
    insuranceApprovedButNotPaid: financialFieldSchema,
    insurancePaidOrCredited: financialFieldSchema,
    patientPayments: financialFieldSchema,
    printedAmountDue: financialFieldSchema,
  })
  .strict();
export type FinancialFields = z.infer<typeof financialFieldsSchema>;

/**
 * Full financial view of one processed document: the five candidate fields,
 * the supported currency (INR only) and document-level warnings.
 *
 * Uses financialFieldCandidateSchema so confirmedByUser is always false —
 * this represents AI-extracted candidate data, not patient-confirmed data.
 */
export const documentFinancialsSchema = z
  .object({
    billTotalAfterDiscounts: financialFieldCandidateSchema,
    insuranceApprovedButNotPaid: financialFieldCandidateSchema,
    insurancePaidOrCredited: financialFieldCandidateSchema,
    patientPayments: financialFieldCandidateSchema,
    printedAmountDue: financialFieldCandidateSchema,
    currency: currencySchema,
    documentWarnings: documentWarningsSchema,
  })
  .strict();
export type DocumentFinancials = z.infer<typeof documentFinancialsSchema>;


/** Keys of the five tracked fields — useful for referencing a fact by name. */
export const financialFieldKeySchema = z.enum([
  "billTotalAfterDiscounts",
  "insuranceApprovedButNotPaid",
  "insurancePaidOrCredited",
  "patientPayments",
  "printedAmountDue",
]);
export type FinancialFieldKey = z.infer<typeof financialFieldKeySchema>;
