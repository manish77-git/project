/**
 * src/lib/types/billing.ts
 *
 * Shared types for billing analysis — frontend layer.
 * Aligned with the Zod schemas in src/lib/schemas/ but decoupled for UI use.
 */

import type { Lang } from "../i18n/translations";

export type { Lang };

// ── Individual line item on a hospital bill ──────────────────────────────────

export interface BillLineItem {
  /** Unique ID within this analysis result */
  id: string;
  /** The raw charge name as it appears on the bill */
  chargeLabel: string;
  /** Amount in INR as a string (preserves exact paisa precision) */
  amountInr: string;
  /** Plain-language explanation suitable for a patient */
  explanation: string;
  /** True when the item was confidently extracted; false = low-confidence / unclear */
  confident: boolean;
}

// ── Full analysis result ─────────────────────────────────────────────────────

export type AnalysisSource = "real" | "demo";

export interface BillAnalysisResult {
  /** Whether this came from real OCR + LLM or is hardcoded demo data */
  source: AnalysisSource;
  /** Hospital name candidate (may be null if not identified) */
  hospitalName: string | null;
  /** Bill number candidate */
  billNumber: string | null;
  /** Parsed line items */
  items: BillLineItem[];
  /** Total amount string; null if it could not be calculated */
  totalInr: string | null;
  /** Language the explanation was generated in */
  language: Lang;
  /** Any caveats or warnings returned by the analysis */
  warnings: string[];
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
