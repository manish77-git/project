# Architecture — Patient Financial Navigator

**Stage status: shared data contract (schemas + tests) only.** No API
endpoints, no AI integration, no database, and no authentication are
implemented yet. This page documents what exists today and how the team
should build on it.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Validation | Zod 4 |
| Tests | Vitest 5 |
| Styling | Tailwind CSS 4 |
| Linting | ESLint 9 |
| Runtime | Node.js ≥ 22 |

## Project layout (relevant to this stage)

```
src/
  lib/
    schemas/
      common.ts          # shared primitives (language, currency, money, page)
      identification.ts  # bill identification result
      verification.ts    # bill verification outcome
      financial.ts       # financial fields, currency, document financials
      explanation.ts     # generated explanation (future AI stage)
      callback.ts        # callback request + stored ticket
      index.ts           # barrel — import everything from here
      *.test.ts          # Vitest suites, one per module
docs/
  API_CONTRACT.md        # the authoritative data contract
  ARCHITECTURE.md        # this file
vitest.config.mts        # Vitest config (node env, @/ alias)
```

## Schema exports and intended use

Import from the barrel, never from individual files:

```ts
import {
  billIdentificationSchema,
  type BillIdentification,
} from "@/lib/schemas";
```

Every module exports the Zod schema (runtime validation) and the inferred
type (compile-time shape) with matching names.

| Schema | Type | Used by | Purpose |
| --- | --- | --- | --- |
| `billIdentificationSchema` | `BillIdentification` | Member 2 (AI/extraction) | Validate what the model read off the bill image. Strict: rejects any financial/insurance/diagnosis fields. |
| `billVerificationSchema` | `BillVerification` | Member 2 | Validate the verification outcome (4 outcomes, safe message, discrepancy keys only — never amounts). |
| `financialFieldSchema` | `FinancialField` | Members 2 & 4 | One financial value with status/amount pairing rules. |
| `financialFieldCandidateSchema` | `FinancialFieldCandidate` | Member 2 | Same, but `confirmedByUser` is literal `false` — use for raw model output so AI can never confirm a value. |
| `financialFieldConfirmationSchema` | `FinancialFieldConfirmation` | Member 3 (backend) | The only schema that accepts `confirmedByUser: true`; reserve for the future authenticated confirmation endpoint. |
| `financialFieldsSchema` | `FinancialFields` | Members 3 & 4 | Exactly the five tracked fields. |
| `documentFinancialsSchema` | `DocumentFinancials` | Members 3 & 4 | Five fields + `currency: "INR"` + `warnings`. |
| `explanationSchema` | `Explanation` | Member 2 (AI stage) | Validate a generated explanation; enforces the required notice and traceable facts/dates. |
| `callbackRequestSchema` | `CallbackRequest` | Member 3 | Validate a patient's callback submission (explicit consent, no client-supplied ticket metadata). |
| `callbackTicketSchema` | `CallbackTicket` | Member 4 (database) | Validate the stored ticket row (server-generated id/timestamp/status). |
| `createCallbackTicket` | function | Member 3 | Build a valid `"new"` ticket from a validated request. |

Shared primitives in `common.ts`: `languageCodeSchema` (`en`/`hi`/`kn`),
`currencySchema` (`INR`), `monetaryAmountSchema` (decimal strings),
`pageNumberSchema` (positive int or `null`), `documentWarningsSchema`.

## How Zod is used

- `schema.safeParse(input)` returns `{ success: true, data }` or
  `{ success: false, error }` — never throws. Use it at trust boundaries.
- `schema.parse(input)` returns the typed value or throws — use it in tests
  or where failure is a bug.
- `.strict()` rejects unknown keys, so sensitive fields that do not belong
  in a shape (amounts in identification results, ticket metadata in patient
  requests) fail validation instead of leaking through.
- `.superRefine()` adds cross-field rules, e.g. `status: "found"` requires a
  non-null amount, `status: "missing"` requires a null amount.
- Types come from `z.infer<typeof schema>` — never re-declare the same shape
  by hand.

## Design invariants (do not weaken)

1. Money is always a decimal **string**; floats are never accepted.
2. `"missing"` amount is `null`, never `"0"` — unknown ≠ zero.
3. Identification statuses and verification outcomes are separate enums;
   `unreadable_image` is an identification status only.
4. Verification responses never carry amounts — only field keys.
5. Model output can never set `confirmedByUser: true`; only a patient action
   validated against `financialFieldConfirmationSchema` can.
6. Every explanation carries the literal notice
   `Generated from hospital-provided bill information.` and must reference
   the verified record it drew facts from.

## Testing

- Framework: **Vitest 5** (dev dependency), configured in
  `vitest.config.mts` (node environment, `@/` alias, `src/**/*.test.ts`).
- Run: `npm test` (or `npm run test:watch`).
- The schema suites use **synthetic data only** — no Gemini credentials, no
  Supabase credentials, no real hospital documents.
- Current status: 69 tests across 5 suites, all passing.

## Roadmap (not yet implemented)

Later stages, in order: API endpoints (Next.js route handlers) → Gemini
vision/extraction → Supabase persistence → authentication & authorization →
AI explanation generation. Each stage must validate its inputs with the
schemas above and keep the invariants intact.
