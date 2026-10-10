/**
 * Barrel for all shared data-contract schemas.
 *
 * Import from "@/lib/schemas" everywhere instead of reaching into the
 * individual files — that keeps the contract in one obvious place.
 *
 * Each module exports BOTH the Zod schema (runtime validation) and the
 * inferred TypeScript type (compile-time shape), e.g.:
 *
 *   import { billIdentificationSchema, type BillIdentification } from "@/lib/schemas";
 *
 * See docs/API_CONTRACT.md for the full contract and docs/ARCHITECTURE.md
 * for how each team member is expected to use these.
 */

export * from "./common";
export * from "./identification";
export * from "./verification";
export * from "./financial";
export * from "./explanation";
export * from "./callback";
