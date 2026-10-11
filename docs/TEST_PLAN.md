# Test Plan — Patient Financial Navigator

What is actually tested today, what is not, and what must be tested before each
planned feature is trusted. Test statuses here reflect **real runs**, not
intentions.

## How to run

| Command | Scope |
| --- | --- |
| `npm test` | Vitest single run (all suites) |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | TypeScript type-check |
| `npm run build` | Next.js production build (also type-checks) |

No CI runs these automatically and there is no coverage threshold, so **run them
locally before pushing** — see [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md).

## Current status (last verified 2026-10-12)

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | ✅ **75 passed / 75**, 6 files, exit 0 |
| Lint | `npm run lint` | ✅ 0 errors, 0 warnings, exit 0 |
| Type-check | `npx tsc --noEmit` | ✅ exit 0 |
| Build | `npm run build` | ✅ exit 0, routes `/`, `/_not-found`, `/api/health` |

**No test has failed or been skipped in the recorded run.** Nothing below is
reported as passing unless it was executed.

### Passing suites

| Suite | Tests | What it covers |
| --- | --- | --- |
| `src/lib/schemas/identification.test.ts` | 8 | Identification accepts the four statuses; `null` (not `""`) for missing values; **rejects amounts/insurance/payment/diagnosis fields**, i.e. no information leakage through the identification shape. |
| `src/lib/schemas/verification.test.ts` | 7 | Exactly four outcomes; `unreadable_image` and identification statuses rejected as outcomes; discrepancy *keys* only, never amounts; message required. |
| `src/lib/schemas/financial.test.ts` | 28 | Status/amount pairing (`found`⇒non-null, `missing`⇒`null`, never `"0"`); invalid money strings rejected; floats rejected; page-number rules; `confirmedByUser` defaults false and **cannot be true in model output**. |
| `src/lib/schemas/callback.test.ts` | 16 | Consent must be explicit `true` (missing and `false` both rejected); client-supplied ticket metadata rejected; server ticket shape and `createCallbackTicket`; language and callback-time enums. |
| `src/lib/schemas/explanation.test.ts` | 12 | Required literal notice; traceable record reference and facts; language codes; malformed references rejected. |
| `src/app/api/health/route.test.ts` | 4 | `GET /api/health`: 200, JSON content type, exact two-field body, **no extra keys or secret-looking values**. |

All fixtures are **synthetic**. No test contacts an AI provider, a database, or
the network, and no real hospital document is used.

### Not implemented (not a failure — no test exists)

These areas have **no tests because the code does not exist yet**:

- Any end-to-end or UI test; the UI is still the starter page.
- Any test involving a real bill image, OCR/AI call, or provider mocking.
- Any endpoint other than `GET /api/health`.
- Any persistence, authentication, access-code, expiry, or lockout behaviour.
- Any callback delivery or support-dashboard behaviour.

### Could not run

Nothing was blocked in the last run. If a check cannot run (missing
dependencies, offline install, unavailable provider credentials), record it as
**could not run** with the reason — never as a pass.

## Future test requirements

Each item must exist before the corresponding feature is described as working.

1. **Unreadable or damaged bills** — blurry/skewed/torn/cropped images, wrong
   file type, oversized file, multi-page bills, and a valid image with no bill in
   it. Expected: `identificationStatus: "unreadable_image"` or
   `"invalid_input"`, never a fabricated value, and never a verification
   outcome.
2. **Information leakage** — assert that no response to an unauthenticated or
   unverified caller contains amounts, insurance details, diagnoses, other
   patients' data, stack traces, SQL errors, or environment values. Include
   negative tests that send amount-like keys and confirm rejection by the strict
   schemas (the schema suites already do this at unit level; endpoint tests must
   repeat it over HTTP).
3. **Access-code expiry and lockout** — correct code accepted once; expired code
   rejected; reused single-use code rejected; too many wrong attempts triggers
   lockout and the lockout itself expires; error messages do not reveal whether a
   bill exists. *Blocked until access codes are designed and implemented.*
4. **Financial discrepancies** — `verified` vs `amounts_differ` for each of the
   five fields, multiple simultaneous differences, missing-on-bill vs
   missing-in-record, and proof that the discrepancy response carries field keys
   but no figures.
5. **AI explanation accuracy** — every generated figure and date traces back to
   the verified record; no invented amounts or dates; the required notice is
   present; all three languages; the explanation never verifies a bill and never
   states an outcome it was not given; unreadable/ambiguous fields stay visible
   as warnings instead of being silently guessed.
6. **Callback consent** — submission without explicit consent is rejected;
   consent recorded with the ticket; a patient cannot inject their own ticket ID,
   status, or timestamps; rate limiting/abuse handling; that no callback reaches
   a number the patient did not supply.
7. **Unauthorized staff access** — staff endpoints (planned dashboard) require
   authentication and role checks; a staff member cannot read bills outside
   their scope; every access to protected data is auditable; cross-patient
   requests fail with the same response as a non-existent record.
8. **Cross-cutting** — same-origin enforcement on mutating endpoints, correct
   status codes (400 vs 401 vs 403 vs 404), and no cache of personalized
   responses.

## Conventions

- One suite per module, named `*.test.ts` next to the code it tests
  (`vitest.config.mts` picks up `src/**/*.test.ts`).
- Assert the **rejection** path too — most of this product's safety comes from
  what must fail to parse.
- Never weaken an assertion or skip a suite to make a check pass; fix the cause,
  or report the failure.
- Never commit real patient data, bill images, or credentials as a fixture.
