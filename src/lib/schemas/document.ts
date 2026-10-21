import { z } from "zod";
import { currencySchema, documentWarningsSchema, monetaryAmountSchema } from "./common";

/**
 * Values READ FROM AN UPLOADED BILL — not verified facts.
 *
 * This contract is deliberately separate from `billIdentificationSchema`
 * (which may carry only a hospital name and bill number) and from
 * `billVerificationSchema` (which carries a verdict and no amounts). A value in
 * this schema was read off the patient's document by OCR; nobody has compared
 * it with a hospital record. Every field carries the exact line it came from so
 * a patient (or a reviewer) can check it against the paper bill.
 *
 * A field that was not read is `null`. There is no "default", no "sample" and
 * no zero: a missing amount is unknown, and the schema cannot express an
 * invented one. An amount that appeared more than once with different values
 * is also `null` (with a warning) rather than an arbitrary pick.
 */

/** Fixed label every extraction must carry. */
export const DOCUMENT_EXTRACTION_NOTICE =
  "Read from the uploaded bill — not independently verified." as const;

/** Which line of the recognised text a value came from. */
export const documentFieldEvidenceSchema = z
  .object({
    /** 1-based line number in the normalised OCR text. */
    lineNumber: z.number().int().min(1),
    /** The line as read from the document. Never rewritten or summarised. */
    text: z.string().trim().min(1).max(500),
  })
  .strict();
export type DocumentFieldEvidence = z.infer<typeof documentFieldEvidenceSchema>;

/** A textual value read from the bill (hospital name, bill number, date). */
export const extractedTextFieldSchema = z
  .object({
    value: z.string().trim().min(1).max(300),
    evidence: documentFieldEvidenceSchema,
  })
  .strict();
export type ExtractedTextField = z.infer<typeof extractedTextFieldSchema>;

/** A monetary value read from the bill, with the line that proves it. */
export const extractedAmountFieldSchema = z
  .object({
    amountRupees: monetaryAmountSchema,
    evidence: documentFieldEvidenceSchema,
  })
  .strict();
export type ExtractedAmountField = z.infer<typeof extractedAmountFieldSchema>;

/** One itemised charge line read from the bill. */
export const extractedLineItemSchema = z
  .object({
    description: z.string().trim().min(1).max(300),
    amountRupees: monetaryAmountSchema,
    evidence: documentFieldEvidenceSchema,
  })
  .strict();
export type ExtractedLineItem = z.infer<typeof extractedLineItemSchema>;

/** A bill date is only reported when it parses to a real calendar day. */
export const extractedDateFieldSchema = z
  .object({
    /** ISO calendar date, e.g. "2026-10-01". */
    value: z.iso.date(),
    evidence: documentFieldEvidenceSchema,
  })
  .strict();
export type ExtractedDateField = z.infer<typeof extractedDateFieldSchema>;

export const documentReadStatusSchema = z.enum(["readable", "unreadable"]);
export type DocumentReadStatus = z.infer<typeof documentReadStatusSchema>;

/**
 * Everything the app knows about the uploaded document itself, before any
 * verification. `readStatus: "unreadable"` means nothing was read; every field
 * is then null and the warnings say so.
 */
export const billDocumentExtractionSchema = z
  .object({
    readStatus: documentReadStatusSchema,
    hospitalName: extractedTextFieldSchema.nullable(),
    billNumber: extractedTextFieldSchema.nullable(),
    billDate: extractedDateFieldSchema.nullable(),
    lineItems: z.array(extractedLineItemSchema).max(50),
    totalAmount: extractedAmountFieldSchema.nullable(),
    insuranceApprovedAmount: extractedAmountFieldSchema.nullable(),
    patientPayableAmount: extractedAmountFieldSchema.nullable(),
    currency: currencySchema,
    warnings: documentWarningsSchema,
    notice: z.literal(DOCUMENT_EXTRACTION_NOTICE),
  })
  .strict();
export type BillDocumentExtraction = z.infer<typeof billDocumentExtractionSchema>;
