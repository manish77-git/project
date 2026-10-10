import { z } from "zod";
import { documentWarningsSchema } from "./common";

/**
 * Bill IDENTIFICATION result — "did we read the hospital / bill number off
 * the image?" — NOT verification.
 *
 * Identification says what the document *appears* to say. It never means the
 * values were checked against a hospital record; that is the separate
 * verification stage (see verification.ts). The two status vocabularies are
 * intentionally disjoint so the two stages can never be confused.
 *
 * The schema is strict: an identification result must never carry financial
 * amounts, insurance fields, payment details, diagnoses or any other
 * unrelated sensitive data. If the model tried to add them, parsing fails
 * instead of leaking that data downstream.
 */
export const identificationStatusSchema = z.enum([
  "identified",
  "partial",
  "unreadable_image",
  "invalid_input",
]);
export type IdentificationStatus = z.infer<typeof identificationStatusSchema>;

export const billIdentificationSchema = z
  .object({
    /** Hospital name as it appears on the bill, or null when not readable. */
    hospitalNameCandidate: z.string().trim().min(1).max(300).nullable(),
    /** Hospital identifier (e.g. registration number), or null. */
    hospitalIdentifierCandidate: z.string().trim().min(1).max(100).nullable(),
    /** Bill / invoice number as printed, or null. */
    billNumberCandidate: z.string().trim().min(1).max(100).nullable(),
    identificationStatus: identificationStatusSchema,
    warnings: documentWarningsSchema,
  })
  .strict();
export type BillIdentification = z.infer<typeof billIdentificationSchema>;
