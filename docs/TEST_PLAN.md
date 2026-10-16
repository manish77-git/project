# Test Plan — Patient Financial Navigator

What is actually tested today, what is not, and what must be tested before each
planned feature is trusted. Test statuses here reflect **real runs**, not
intentions.

## How to run

| Command | Scope |
| --- | --- |
| `npm test` | Vitest single run (all hermetic suites — no network, no real OCR) |
| `npm run test:ocr` | Vitest against the **real** OCR engine and real image files |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | TypeScript type-check |
| `npm run build` | Next.js production build (also type-checks) |

No CI runs these automatically and there is no coverage threshold, so **run them
locally before pushing** — see [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md).

## Current status (last verified 2026-10-16)

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | ✅ **162 passed / 162**, 11 files, exit 0 |
| Real-OCR tests | `npm run test:ocr` | ✅ **8 passed / 8**, 1 file, exit 0 |
| Lint | `npm run lint` | ✅ 0 errors, 0 warnings, exit 0 |
| Type-check | `npx tsc --noEmit` | ✅ exit 0 |
| Build | `npm run build` | ✅ exit 0, routes `/`, `/_not-found`, `/api/bills/identify`, `/api/health` |

**No test has failed or been skipped in the recorded run.** Nothing below is
reported as passing unless it was executed.

### Why there are two test commands

`npm test` must stay hermetic and fast, so it never loads the OCR engine: the
suites inject a fake engine (`src/lib/identification/__fixtures__/fake-ocr-engine.ts`).
That proves the pipeline, but it cannot prove the engine works. `npm run
test:ocr` closes that gap by running the real Tesseract engine over real PNG and
JPEG files, and is separate because the first run downloads ~15 MB of
traineddata into the OS temp directory.

**Measured on 2026-10-16** (`npm run test:ocr`, real engine, real files): both
`synthetic-bill.png` and `synthetic-bill.jpg` read back exactly — `CITY GENERAL
HOSPITAL` / `Bill No: INV-2026-0042` — at mean confidence 95, and identify as
`identified`; a noise image reports `unreadable_image` at confidence 8. Fixture
provenance: `src/lib/identification/__fixtures__/README.md`.

### Passing suites

| Suite | Tests | What it covers |
| --- | --- | --- |
| `src/lib/schemas/identification.test.ts` | 8 | Identification accepts the four statuses; `null` (not `""`) for missing values; **rejects amounts/insurance/payment/diagnosis fields**, i.e. no information leakage through the identification shape. |
| `src/lib/schemas/verification.test.ts` | 7 | Exactly four outcomes; `unreadable_image` and identification statuses rejected as outcomes; discrepancy *keys* only, never amounts; message required. |
| `src/lib/schemas/financial.test.ts` | 28 | Status/amount pairing (`found`⇒non-null, `missing`⇒`null`, never `"0"`); invalid money strings rejected; floats rejected; page-number rules; `confirmedByUser` defaults false and **cannot be true in model output**. |
| `src/lib/schemas/callback.test.ts` | 16 | Consent must be explicit `true` (missing and `false` both rejected); client-supplied ticket metadata rejected; server ticket shape and `createCallbackTicket`; language and callback-time enums. |
| `src/lib/schemas/explanation.test.ts` | 12 | Required literal notice; traceable record reference and facts; language codes; malformed references rejected. |
| `src/app/api/health/route.test.ts` | 4 | `GET /api/health`: 200, JSON content type, exact two-field body, **no extra keys or secret-looking values**. |
| `src/lib/identification/image-input.test.ts` | 12 | Magic-byte type sniffing (PNG/JPEG/BMP vs text/PDF/truncated); empty, oversized and non-image uploads rejected; **content wins over the client-declared type**; `content-length` pre-check. |
| `src/lib/identification/extract.test.ts` | 24 | OCR text → candidates: labelled and unlabelled bill numbers; dates, phone numbers, GSTINs and amounts are **not** mistaken for bill numbers; label-only lines are not hospital names; the top-of-page search window; `unreadable_image` / `partial` / `invalid_input` selection; typed-number fallback, match and disagreement. |
| `src/lib/identification/service.test.ts` | 23 | Image path and manual path end to end with a fake engine: `identified`, `unreadable_image`, `partial`; engine failure vs unexpected failure; every input rejection; **no protected key or value in any result**; manual entry marked as hand-typed. |
| `src/lib/identification/handler.test.ts` | 24 | The HTTP contract: status codes 200/400/413/415/500/503, `cache-control: no-store`, exact response keys, error bodies, multipart vs JSON dispatch, the fallback path, and leak assertions over a page containing amounts and a diagnosis. Also that the multipart typed fallback obeys the **same** bill-number rule as JSON entry — same `400` body for the same bad value, no silent truncation of an over-long number, and no OCR work spent on a rejected request. |
| `src/lib/identification/module-boundaries.test.ts` | 4 | Identification has **no dependency on verification** (no import, no verification outcome vocabulary), validates through `billIdentificationSchema`, and the route exports `POST` only. |
| `tests/ocr/real-ocr.test.ts` (opt-in) | 8 | The **real** engine over real PNG and JPEG files: exact text read, `identified` for both formats, no protected value in the response, blank and noise images never fabricated. |

All fixtures are **synthetic**. No test contacts an AI provider, a database, or
the network, and no real hospital document is used. Images are either generated
in memory (`__fixtures__/synthetic-image.ts`) or rendered from invented text
(`__fixtures__/synthetic-bill.png|.jpg`).

### Not implemented (not a failure — no test exists)

These areas have **no tests because the code does not exist yet**:

- Any end-to-end or UI test; the UI is still the starter page, and
  `POST /api/bills/identify` has no caller in the app.
- Any test of a real, badly photographed bill: rotation, shadows, creases,
  handwriting, multi-page documents. The OCR tests use clean synthetic pages.
- Any AI/vision provider call (none is integrated).
- Verification, authorized financials, explanations, callbacks, the support
  dashboard — no endpoint exists for any of them.
- Any persistence, authentication, access-code, expiry, or lockout behaviour.
- Same-origin enforcement, rate limiting and abuse handling on
  `POST /api/bills/identify` (it is public and unmetered today).

### Could not run

Nothing was blocked in the last run. If a check cannot run (missing
dependencies, offline install, unavailable provider credentials), record it as
**could not run** with the reason — never as a pass.

## Future test requirements

Each item must exist before the corresponding feature is described as working.

1. **Unreadable or damaged bills** — *partly covered*: wrong file type,
   oversized file, and a valid image with nothing legible in it are tested
   (`image-input.test.ts`, `real-ocr.test.ts`). Still to add: blurry, skewed,
   torn, cropped and multi-page images, and a real photograph with no bill in
   it. Expected: `identificationStatus: "unreadable_image"` or `"invalid_input"`,
   never a fabricated value, and never a verification outcome.
2. **Information leakage** — *covered for identification* (unit, HTTP and real
   OCR levels, including a page that genuinely contains amounts). Still to add
   for verification and financials: that no response to an unauthenticated or
   unverified caller contains amounts, insurance details, diagnoses, other
   patients' data, stack traces, SQL errors, or environment values.
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
