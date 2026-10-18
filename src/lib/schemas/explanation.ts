import { z } from "zod";
import {
  documentWarningsSchema,
  languageCodeSchema,
  monetaryAmountSchema,
  pageNumberSchema,
} from "./common";
import { financialFieldKeySchema } from "./financial";

/**
 * Generated explanation of a bill (plain-language summary for the patient).
 * This module validates the narrative object and the additive public response;
 * the server-side generation and validation workflow lives in
 * `src/lib/explanation/`.
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

/* ------------------------------------------------------------------ *
 * Public explanation response (additive, Stage 4)
 *
 * The original `explanationSchema` is still the final contract for the
 * narrative, facts, dates and notice. The response adds the five
 * field-by-field sections a patient reads. Each section is tied to exactly
 * one authoritative record field, and its amount is rendered server-side from
 * that field — never from model output.
 *
 * Cross-field rules make the association explicit:
 *   - exactly five sections, one per allow-listed financial field;
 *   - no duplicate keys in either sections or facts;
 *   - the section keys and fact keys must be the same set.
 * ------------------------------------------------------------------ */

export const explanationSectionStatusSchema = z.enum(["found", "missing"]);
export type ExplanationSectionStatus = z.infer<
  typeof explanationSectionStatusSchema
>;

export const explanationSectionSchema = z
  .object({
    fieldKey: financialFieldKeySchema,
    /** Server-localized heading for this field. */
    heading: z.string().trim().min(1).max(120),
    /** Validated prose from the model (or the server template). No figures. */
    explanation: z.string().trim().min(1).max(1000),
    /** Rendered from the authoritative record for THIS field. */
    amountRupees: monetaryAmountSchema.nullable(),
    status: explanationSectionStatusSchema,
  })
  .strict()
  .superRefine((section, ctx) => {
    if (section.status === "found" && section.amountRupees === null) {
      ctx.addIssue({
        code: "custom",
        path: ["amountRupees"],
        message: 'When status is "found", amountRupees must be a non-null decimal string.',
      });
    }
    if (section.status === "missing" && section.amountRupees !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["amountRupees"],
        message:
          'When status is "missing", amountRupees must be null. A missing amount is unknown, not zero.',
      });
    }
  });
export type ExplanationSection = z.infer<typeof explanationSectionSchema>;

export const explanationResponseSchema = z
  .object({
    validation: z.enum(["validated", "server_template"]),
    explanation: explanationSchema,
    sections: z.array(explanationSectionSchema).length(5),
  })
  .strict()
  .superRefine((response, ctx) => {
    const sectionKeys = response.sections.map((section) => section.fieldKey);
    if (new Set(sectionKeys).size !== sectionKeys.length) {
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: "Each financial field may appear only once.",
      });
    }

    const factKeys = response.explanation.financialFactsUsed.map(
      (fact) => fact.fieldKey,
    );
    if (new Set(factKeys).size !== factKeys.length) {
      ctx.addIssue({
        code: "custom",
        path: ["explanation", "financialFactsUsed"],
        message: "Each financial fact may appear only once.",
      });
    }

    for (const key of sectionKeys) {
      if (!factKeys.includes(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["sections"],
          message: `Section ${key} has no matching financial fact.`,
        });
      }
    }
    for (const key of factKeys) {
      if (!sectionKeys.includes(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["explanation", "financialFactsUsed"],
          message: `Fact ${key} has no matching section.`,
        });
      }
    }
  });
export type ExplanationResponse = z.infer<typeof explanationResponseSchema>;
