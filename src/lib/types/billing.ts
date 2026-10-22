/**
 * src/lib/types/billing.ts
 *
 * Shared types for billing analysis — frontend layer.
 * Aligned with the Zod schemas in src/lib/schemas/ but decoupled for UI use.
 *
 * The three states this file exists to keep apart:
 *
 *   source "document"  — values read from the uploaded bill by OCR. NOT checked
 *                        against any hospital record.
 *   source "verified"  — values from the hospital record for the bill that was
 *                        verified. Authoritative.
 *   source "demo"      — the explicit sample bill. Only ever produced by the
 *                        labelled demo action; never a fallback.
 */

import type { Lang } from "../i18n/translations";

export type { Lang };

// ── Individual line item on a hospital bill ──────────────────────────────────

export interface BillLineItem {
  /** Unique ID within this analysis result */
  id: string;
  /** The raw charge name as it appears on the bill (or the record heading) */
  chargeLabel: string;
  /** Amount in INR as a string; null when the amount is not known */
  amountInr: string | null;
  /** Plain-language explanation. Empty for OCR-only charges. */
  explanation: string;
  /** True when an amount is available for this item */
  confident: boolean;
}

// ── Verification state ───────────────────────────────────────────────────────

export type AnalysisSource = "verified" | "document" | "demo";

export type VerificationState =
  | "verified"
  | "unverified"
  | "access_denied"
  | "bill_not_found"
  | "amounts_differ"
  | "hospital_not_registered"
  | "unavailable";

export interface BillVerificationSummary {
  state: VerificationState;
  /** Patient-safe sentence; never contains an amount on a failure. */
  message: string;
  /** Field keys only, for a discrepancy. Never values. */
  discrepancyKeys: string[];
}

// ── Full analysis result ─────────────────────────────────────────────────────

export type DocumentReadStatus = "readable" | "unreadable" | "unavailable";

export interface BillAnalysisResult {
  /** Where the displayed values came from. */
  source: AnalysisSource;
  /** Whether those values were checked against the hospital's record. */
  verification: BillVerificationSummary;
  /** Hospital name as read from the document, or null. */
  hospitalName: string | null;
  /** Bill number as read from the document (or the verified session), or null. */
  billNumber: string | null;
  /** ISO date read from the document, or null. Never derived from the record. */
  billDate: string | null;
  /** Itemised charges. Empty when nothing itemised was read. */
  items: BillLineItem[];
  /** Total printed on the bill / recorded by the hospital; null when unknown. */
  totalInr: string | null;
  /** Insurance-approved amount, only when explicitly present. */
  insuranceApprovedInr: string | null;
  /** Patient-payable amount, only when explicitly present. */
  patientPayableInr: string | null;
  currency: "INR";
  /** Language the explanation was requested in */
  language: Lang;
  /** Any caveats or warnings returned by the reading/verification step */
  warnings: string[];
  /** How much of the document could be read at all. */
  readStatus: DocumentReadStatus;
}

// ── Bill Number Lookup (Low-Network Fallback) ────────────────────────────────

export type BillLookupStatus = "found" | "not_found" | "connection_error";

export interface BillLookupResponse {
  status: BillLookupStatus;
  result?: BillAnalysisResult;
  message?: string;
}

// ── Chat types ───────────────────────────────────────────────────────────────

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** ISO timestamp */
  timestamp: string;
  /** True while the assistant is streaming / loading */
  loading?: boolean;
  /** Error state for this specific message */
  error?: boolean;
}

// ── Upload / processing states ───────────────────────────────────────────────

export type UploadStatus =
  | "idle"
  | "selected"
  | "analyzing"
  | "done"
  | "error";

export interface UploadState {
  status: UploadStatus;
  file: File | null;
  previewUrl: string | null;
  errorMessage: string | null;
}

// ── Analysis step progress ───────────────────────────────────────────────────

export interface AnalysisStep {
  id: string;
  labelKey: "analyzingStep1" | "analyzingStep2" | "analyzingStep3";
  status: "pending" | "active" | "done";
}
