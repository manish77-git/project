# Stage 2 Final Report — Shared Types, Zod Schemas & Tests

**Commit:** `738ff09` — `feat: add shared Zod data-contract schemas with tests`
**Status:** pushed to `origin/main` (fast-forward). API endpoints, Gemini,
authentication, and database work were deliberately **not** started.

---

## 1. Inspection findings

- The repo is a fresh Next.js 16 + TypeScript (strict) + Tailwind 4 + ESLint 9
  app. There was **no existing `docs/`, no schemas, and no test framework**.
- The untracked `FINANCIAL NAVIGATOR.txt` is just a copy of `.gitignore`, not
  a contract. No existing data contract was found to reuse or correct, so
  [docs/API_CONTRACT.md](API_CONTRACT.md) was authored as the contract of
  record, matching the implemented schemas exactly, with all endpoints
  explicitly marked *planned, not implemented*.

## 2. Files created / modified

### Created — schemas (`src/lib/schemas/`)

| File | Purpose |
| --- | --- |
| `common.ts` | Shared primitives: `languageCodeSchema` (`en`/`hi`/`kn`), `currencySchema` (`"INR"` literal), `monetaryAmountSchema` (decimal-string money), `pageNumberSchema`, `documentWarningsSchema`. |
| `identification.ts` | `billIdentificationSchema`: three nullable candidates (hospital name, hospital identifier, bill number), the four-value `identificationStatus`, warnings. `.strict()` rejects any financial/insurance/payment/diagnosis field. |
| `verification.ts` | `billVerificationSchema`: exactly four outcomes, patient-safe `message`, `discrepancyKeys` (field **keys** only, default `[]`). No amounts can ever parse. |
| `financial.ts` | Reusable `financialFieldSchema`; the five named fields in `financialFieldsSchema`; `documentFinancialsSchema` (five candidate fields + `currency: "INR"` + `documentWarnings`); `financialFieldCandidateSchema` (model output) and `financialFieldConfirmationSchema` (patient action). |
| `explanation.ts` | `explanationSchema`: `verifiedRecordReference`, traceable `financialFactsUsed`/`datesUsed`, required warnings, exact literal notice enforced via `z.literal`. |
| `callback.ts` | `callbackRequestSchema` (patient) and `callbackTicketSchema` (server), plus `createCallbackTicket` helper. |
| `index.ts` | Barrel — everything imports from `@/lib/schemas`. |
| `*.test.ts` (5 suites) | 71 tests covering all required case groups, synthetic data only. |

### Created — config & docs

- `vitest.config.mts` — Vitest 5, node environment, `@/` alias,
  `src/**/*.test.ts`.
- `docs/API_CONTRACT.md` — the authoritative data contract.
- `docs/ARCHITECTURE.md` — schema exports, per-member usage table, invariants.

### Modified

- `package.json` — added `zod` ^4.6.5 (runtime), `vitest` 5.0.3 (dev),
  `test`/`test:watch` scripts; bumped `@types/node` 20 → 22 (required by
  Vitest 5's peer dependency; matches the Node ≥22 runtime the project
  already required).
- `package-lock.json` — lockfile for the above.
- `eslint.config.mjs` — allow `_`-prefixed unused vars and the
  rest-sibling omit-destructuring pattern.

## 3. How Zod validates

Every trust boundary (model output, client request, database row) is parsed
with the matching schema:

- `.strict()` — an unexpected key (an amount inside an identification result,
  a client-supplied `ticketId` in a callback request) makes the whole parse
  **fail** rather than silently pass through.
- `.superRefine()` — cross-field rules, e.g. status/amount pairing.
- `safeParse()` returns `{ success, data | error }` and never throws — use it
  at boundaries; `parse()` throws — use it in tests.
- Types always come from `z.infer<typeof schema>` so runtime validation and
  compile-time shapes can never drift. No shape is declared by hand twice.

## 4. How missing values never become zero

- `status: "found"` **requires** a non-null decimal string.
- `status: "missing"` **requires** `amountRupees: null` — the string `"0"` is
  rejected in that state, because zero is a number genuinely printed on a
  bill while `null` means "we couldn't read it".
- `ambiguous` allows a candidate string or `null`.
- The money regex `^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$` accepts only
  non-negative strings with ≤ 2 fractional digits — no float coercion
  anywhere, and nothing ever converts `null` to `0`.

## 5. How identification is kept separate from verification

- Two **disjoint enums in two separate modules**: `unreadable_image` exists
  only as an identification status, and tests prove it (with `identified`,
  `partial`, `invalid_input`) is rejected as a verification outcome.
- The identification schema rejects amounts outright (`.strict()`).
- The verification schema has no amount fields at all — only discrepancy
  field *keys*.
- Protected figures flow exclusively through `documentFinancialsSchema` in
  the later, authorized financial stage.

## 6. Actual check results

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npm test` | ✅ **71/71 passed**, 5 suites, exit 0 |
| Lint | `npm run lint` | ✅ 0 errors, 0 warnings, exit 0 |
| Type-check | `npx tsc --noEmit` | ✅ exit 0 |
| Build | `npm run build` | ✅ compiled + TypeScript + 4 static pages, exit 0 |
| Git | commit `738ff09`, push | ✅ fast-forward to `origin/main` |

All checks were run against the exact files that were committed. Two
intermediate issues were fixed at the root, not suppressed: a `tsc` spread
error (fixtures retyped from `unknown` to `Record<string, unknown>`) and lint
warnings for the omit-key pattern (ESLint rule configured accordingly).

## 7. Remaining issues

- `npm audit` reports 5 high-severity advisories in the existing Next.js
  dependency tree — untouched by this stage; worth a separate look.
- Schemas are validation only. `createCallbackTicket` generates nothing
  itself: the future endpoint must supply `ticketId`
  (e.g. `crypto.randomUUID()`) and `createdAt`.

## 8. How Members 2, 3, and 4 use the schemas

Import from the barrel only:

```ts
import {
  billIdentificationSchema, type BillIdentification,
  financialFieldCandidateSchema,   // Member 2: validate raw Gemini output — can never claim confirmedByUser
  documentFinancialsSchema,        // Members 3/4: stored financial records, INR + warnings
  callbackRequestSchema, createCallbackTicket, // Member 3: POST /api/callback
  callbackTicketSchema,            // Member 4: validate rows before writing to the DB
  type FinancialField, type CallbackTicket,
} from "@/lib/schemas";

const parsed = billIdentificationSchema.safeParse(modelOutput);
if (!parsed.success) {
  // handle parsed.error — never use unvalidated output
}
```

Rule of thumb: `safeParse` at every trust boundary; types always via
`z.infer`. See [ARCHITECTURE.md](ARCHITECTURE.md) for the per-member export
table and [API_CONTRACT.md](API_CONTRACT.md) for the full contract.
