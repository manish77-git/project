import { z } from "zod";

/**
 * Shared building blocks used by more than one schema module.
 * Keep small: anything used by exactly one schema belongs in that schema's file.
 */

/** UI / explanation / callback language codes as defined in docs/API_CONTRACT.md. */
export const languageCodeSchema = z.enum(["en", "hi", "kn"]);
export type LanguageCode = z.infer<typeof languageCodeSchema>;

/** INR is the only supported currency in this application. */
export const currencySchema = z.literal("INR");
export type Currency = z.infer<typeof currencySchema>;

/**
 * Monetary values are ALWAYS decimal strings, never numbers.
 *
 * Accepted format (enforced by the regex):
 *   - one or more digits, e.g. "0", "1234"
 *   - optionally one fractional part with 1 or 2 digits, e.g. "0.5", "1234.56"
 *   - no leading zeros ("007" is rejected), no negative sign, no thousands
 *     separators, no exponents, no trailing dot.
 *
 * Strings (not floats) preserve exact rupee/paisa precision and make it
 * impossible for "missing" to silently become 0 through rounding.
 */
export const MONETARY_AMOUNT_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;

export const monetaryAmountSchema = z
  .string()
  .regex(
    MONETARY_AMOUNT_PATTERN,
    'Must be a non-negative decimal string with at most 2 fractional digits, e.g. "1234" or "1234.56"',
  );
export type MonetaryAmount = z.infer<typeof monetaryAmountSchema>;

/**
 * Page number on the source document (1-based), or null when the value was
 * not tied to a specific page. Intentionally NOT defaulted: callers must
 * decide explicitly, so a forgotten page number becomes null — not 1.
 */
export const pageNumberSchema = z.number().int().positive().nullable();
export type PageNumber = z.infer<typeof pageNumberSchema>;

/** Human-readable, non-sensitive warnings attached to a processed document. */
export const documentWarningsSchema = z.array(z.string());
