# Test Plan — Patient Financial Navigator

What is actually tested today, what is not, and what must be tested before each
planned feature is trusted. Test statuses here reflect **real runs**, not
intentions.

## How to run

| Command | Scope |
| --- | --- |
| `npm test` | Vitest single run (all hermetic suites — no network, no database, no real OCR) |
| `npm run test:ocr` | Vitest against the **real** OCR engine and real image files |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | TypeScript type-check |
| `npm run build` | Next.js production build (also type-checks) |

No CI runs these automatically and there is no coverage threshold, so **run them
locally before pushing** — see [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md).

## Current status (last verified 2026-10-19)

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | ✅ **385 passed / 385**, 30 files, exit 0 |
| Real-OCR tests | `npm run test:ocr` | ✅ **8 passed / 8**, 1 file, exit 0 |
| Lint | `npm run lint` | ✅ 0 errors, 0 warnings, exit 0 |
| Type-check | `npx tsc --noEmit` | ✅ exit 0 |
| Build | `npm run build` | ✅ exit 0, 9 routes: `/`, `/_not-found`, `/api/health`, `/api/bills/identify`, `/api/bills/access/challenge`, `/api/bills/access/verify`, `/api/bills/verify`, `/api/bills/financials`, `/api/bills/explain` |

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
| `src/lib/schemas/access.test.ts` | 10 | Strict challenge/answer requests (no bill number on the answer, no verdict flags); bill-number and code character rules; grant shape; stored digest must be 64 hex chars. |
| `src/lib/schemas/verification.test.ts` | 7 | Exactly four outcomes; `unreadable_image` and identification statuses rejected as outcomes; discrepancy *keys* only, never amounts; message required. |
| `src/lib/schemas/financial.test.ts` | 28 | Status/amount pairing (`found`⇒non-null, `missing`⇒`null`, never `"0"`); invalid money strings rejected; floats rejected; page-number rules; `confirmedByUser` defaults false and **cannot be true in model output**. |
| `src/lib/schemas/callback.test.ts` | 16 | Consent must be explicit `true` (missing and `false` both rejected); client-supplied ticket metadata rejected; server ticket shape and `createCallbackTicket`; language and callback-time enums. |
| `src/lib/schemas/explanation.test.ts` | 12 | Required literal notice; traceable record reference and facts; language codes; malformed references rejected. |
| `src/lib/schemas/explanation-response.test.ts` | 8 | The public response requires exactly five sections, one per tracked field; rejects unknown fields, duplicate/missing fact associations, status/amount contradictions, numeric amounts and confirmation flags. |
| `src/app/api/health/route.test.ts` | 4 | `GET /api/health`: 200, JSON content type, exact two-field body, **no extra keys or secret-looking values**. |
| `src/lib/identification/image-input.test.ts` | 10 | Magic-byte type sniffing (PNG/JPEG/BMP vs text/PDF/truncated); empty, oversized and non-image uploads rejected; **content wins over the client-declared type**; the multipart body ceiling leaves room for framing on top of a maximum-size image. |
| `src/lib/http/request-body.test.ts` | 10 | Bounded body reading: a declared `content-length` over the limit is refused without reading, a **streamed body with no `content-length`** stops being pulled at the limit, JSON size vs malformed JSON are distinguished, and multipart parsing is bounded the same way. |
| `src/lib/http/endpoint-body-limits.test.ts` | 6 | Each route (identify, access challenge/verify, verify, explain) refuses an oversized body with `413 payload_too_large`; the streamed-upload case never reaches the OCR engine and never buffers the whole body. |
| `src/lib/identification/extract.test.ts` | 24 | OCR text → candidates: labelled and unlabelled bill numbers; dates, phone numbers, GSTINs and amounts are **not** mistaken for bill numbers; label-only lines are not hospital names; the top-of-page search window; `unreadable_image` / `partial` / `invalid_input` selection; typed-number fallback, match and disagreement. |
| `src/lib/identification/service.test.ts` | 23 | Image path and manual path end to end with a fake engine: `identified`, `unreadable_image`, `partial`; engine failure vs unexpected failure; every input rejection; **no protected key or value in any result**; manual entry marked as hand-typed. |
| `src/lib/identification/handler.test.ts` | 24 | The HTTP contract: status codes 200/400/413/415/500/503, `cache-control: no-store`, exact response keys, error bodies, multipart vs JSON dispatch, the fallback path, and leak assertions over a page containing amounts and a diagnosis. Also that the multipart typed fallback obeys the **same** bill-number rule as JSON entry. |
| `src/lib/identification/module-boundaries.test.ts` | 4 | Identification has **no dependency on verification** (no import, no verification outcome vocabulary), validates through `billIdentificationSchema`, and the route exports `POST` only. |
| `src/lib/document/extract.test.ts` | 16 | OCR text → document values: a field is present only when its label is printed, every value keeps the exact line it came from, the demo ₹3,100 appears nowhere, two different printed totals are refused as ambiguous, itemised charges are separated from totals, and blank/noise input is `unreadable` with all-null fields. |
| `src/lib/document/service.test.ts` | 6 | The extraction service end to end with a fake engine: values validated through `billDocumentExtractionSchema`, unreadable images return no figures, engine failure is a safe error, and the notice is always the fixed unverified label. |
| `src/lib/document/handler.test.ts` | 4 | `POST /api/bills/extract`: multipart only, 400/413/415/500/503, `cache-control: no-store`, exact response keys, and an unreadable upload that returns nulls rather than a sample bill. |
| `src/lib/document/module-boundaries.test.ts` | 4 | The reading layer imports **neither** `@/lib/records` nor `@/lib/verification` and cannot produce `getDemoBill`; validates through `billDocumentExtractionSchema`; the route exports `POST` only. This is the structural guard against the ₹3,100 fallback returning. |
| `src/lib/services/billingService.test.ts` | 20 | Frontend pipeline: a bill's own amount shown as unverified (never ₹3,100), two uploads stay separate, unmatched/rejected bills never receive a record or demo report, missing amounts stay null, OCR figures are never promoted to verified, only the verified bill's record supplies figures, AI amounts that disagree with the record are refused, and read/AI/network timeouts produce no fabricated report. |
| `src/lib/access/codes.test.ts` | 12 | Unambiguous alphabet; grouping and normalisation (case, spaces, dashes); deterministic digests; a digest never contains the code; the secret changes the digest, so a store leak alone cannot be brute-forced; short/absent secret refused. |
| `src/lib/access/service.test.ts` | 19 | Challenge bound to its bill; 5-minute TTL; three attempts then lock; **failure counters live outside the challenge**, so a fresh challenge inherits the limit; client bucket only when identified; throttle release boundary; expired/already-answered/unknown challenge; wrong-bill, expired and spent code; ordering of checks (an expired challenge is not a free attempt). |
| `src/lib/access/store.test.ts` | 5 | In-memory housekeeping: expired challenges and sessions are dropped once a later write triggers a sweep, live ones are kept, failure counters are dropped after the throttle window, and codes are never swept away. |
| `src/lib/access/throttle.test.ts` | 7 | Limit then countdown; releases exactly at the window end; a bill is throttled for every client; a client is throttled across bills; no invented client bucket; clearing on success; the storage-managed strategy reports no local wait. |
| `src/lib/access/code-verifier.test.ts` | 11 | Digest store: correct code spent so replay fails, wrong/expired/different-bill codes refused, case-insensitive bill match. Database store over a fake `Queryable`: unknown bill refused without reading a code, spent/expired/wrong code refused, the table's real lockout surfaced as a wait. |
| `src/lib/access/token.test.ts` | 9 | Tokens carry a bill and a session id and **no code or bill contents**; issued tokens accepted; wrong secret, edited payload, edited signature, expiry (including exactly at expiry) and malformed input rejected; bearer-header parsing. |
| `src/lib/access/authorization.test.ts` | 7 | A token alone is not enough: signature **and** the server-side session must agree. Missing/non-bearer header, foreign secret, unknown session, expired session, token naming another bill, and no configured secret all refused with one response. |
| `src/lib/access/dependencies.test.ts` | 5 | The single-authority rule: with a database, the table lockout is used and **no in-memory bucket is armed**; without one, the digest store plus the in-memory throttle are used; no verifier when the secret is unusable and there is no database. |
| `src/lib/access/handler.test.ts` | 12 | Access HTTP contract: documented challenge shape, identical answers for known and unknown bills, 400 on browser-supplied flags, 415/400/503, 429 with `Retry-After`, grant never echoes the code, uniform 401s for wrong code/expired/unknown challenge, lockout after three attempts, no challenge reuse, no verdict or retargeted bill in the answer. |
| `src/lib/db/access-codes.test.ts` | 10 | `issueAccessCode` returns the code once and stores only its hash; `redeemAccessCode` over a fake `Queryable`: correct code accepted in any case/whitespace and resets the counter, wrong code counts an attempt, the fifth sets `locked_until`, a locked bill refuses even the right code without moving the counter, counting restarts after a lock expires, expired/spent codes count no attempt, `not_found` when the bill has no code, and `singleUse` decides whether a redeemed code is refused. |
| `src/lib/db/queries.test.ts` | 9 | `findBill` and `findBillByNumber` trim and parameterise inputs and return `null` when nothing matches; bill lookup reads **no amounts**; financial rows return decimal strings and mark absent fields `missing`, not zero; a row that breaks the contract is rejected; `saveCallbackTicket` stores a valid request, returns a `"new"` ticket, and refuses (without touching the database) when consent is absent. |
| `src/lib/records/mock-records.test.ts` | 7 | The synthetic set covers all four verification situations and really disagrees on the discrepancy record; it carries no field beyond the record shape (so no patient data can hide in it); every amount obeys the money contract; lookups ignore case and spacing; `listAll` returns every record; normalisation is consistent. |
| `src/lib/verification/service.test.ts` | 17 | Four outcomes; baseline discrepancies are always counted; supplied candidates can only **add** discrepancies, so they cannot turn `amounts_differ` into `verified`; duplicate field keys refused; a named hospital that does not match means `bill_not_found`; the response never carries amounts. |
| `src/lib/verification/handler.test.ts` | 18 | Auth gate on both endpoints; 200/400/401/404/409/415/503; financials refused before verify, released after; **every refusal path carries no figures** — discrepancies return keys only; the record is re-checked at release; `cache-control: no-store`. |
| `src/lib/explanation/provider.test.ts` | 10 | Prompt names the language, marks missing values `missing from the record`, and forbids digits, amounts and claims; adapter sends the key in `x-goog-api-key` (never the URL), asks for the strict section schema; HTTP error → `unavailable` without the vendor body, abort → `timeout`, non-JSON/empty/truncated/blocked responses mapped safely; env factory returns null for a missing key. |
| `src/lib/explanation/validator.test.ts` | 16 | Indian INR grouping and canonical decimal parsing (commas, `₹`/`INR`/`Rs.`, trailing zeros, rejecting exponents/negatives/Unicode digits); field-specific amount matching incl. a correct value on the wrong field; missing stays `null`, never zero; strict five-section draft shape; ASCII/Hindi/Kannada digits, currency, percentages, dates, number words and coverage/eligibility/waiver/payment claims rejected; server template renders the record. |
| `src/lib/explanation/service.test.ts` | 13 | `en`/`hi`/`kn` accepted and passed through; unsupported languages refused before any provider call; unverified, expired, `amounts_differ`, `bill_not_found` and `hospital_not_registered` sessions refused; stale `verified` session cannot open a discrepancy; facts and record reference built from the server record; missing amounts stay `null` with warnings; provider receives **only** language and field availability; unsafe prose, model-supplied facts/`confirmedByUser` and malformed/timeout responses fall back to the template. |
| `src/lib/explanation/handler.test.ts` | 16 | `/api/bills/explain` requires a verified bearer session; 400/401/404/409/415/503; `amounts_differ` returns keys only; verified session returns a validated 200 response whose amounts come from the record; missing key returns `503 explanation_unavailable` with no draft; unsafe drafts fall back to the template; **raw drafts and provider errors never appear publicly**; extra `isVerified`/bill fields rejected; query retargeting ignored. |
| `tests/ocr/real-ocr.test.ts` (opt-in) | 10 | The **real** engine over real PNG and JPEG files: exact text read, `identified` for both formats, no protected value in the identification response, the bill's own total/insurance/date read by document extraction, and blank/noise images never fabricated. |

All fixtures are **synthetic**. No test contacts a live AI provider, a PostgreSQL
server, or the network; the database suites use a fake `Queryable`, the Gemini
adapter uses a fake HTTP transport, and no real hospital document is used. Images are either generated in memory
(`__fixtures__/synthetic-image.ts`) or rendered from invented text
(`__fixtures__/synthetic-bill.png|.jpg`).

### Not implemented (not a failure — no test exists)

These areas have **no tests because the code does not exist yet**:

- Any end-to-end or UI test; the UI is still the starter page, and no endpoint
  has a caller in the app.
- Any test of a real, badly photographed bill: rotation, shadows, creases,
  handwriting, multi-page documents. The OCR tests use clean synthetic pages.
- Any **live** AI/vision provider call *in the automated suite*. The Gemini HTTP
  adapter is tested with a fake transport; `npm test` makes no request to
  Google. Live inference is spot-checked by hand instead: after the 2026-10-19
  prompt-compliance fix, one live request per language returned
  `validation: "validated"` and a schema-conformant response in English, Hindi
  and Kannada, with all five sections/facts matching the synthetic record and
  all five generated sentences differing from the fallback template. That is one
  synthetic bill per language — a spot check, not a measured success rate or a
  production-readiness claim.
- Callbacks, patient confirmation, and the support dashboard — no endpoint
  exists for any of them.
- Any test against a **real** PostgreSQL instance or a real hospital system.
  Schema and queries are exercised with fakes; the migration is not applied by
  any test.
- Same-origin enforcement, CSRF protection, rate limiting and abuse handling on
  any endpoint.
- Patient accounts, staff authentication, and role-scoped staff access.

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
2. **Information leakage** — *covered for identification, verification and
   financials* at unit and HTTP levels, including a page that genuinely contains
   amounts and refusal paths that must carry none. Still to add: concurrency and
   timing checks, and a scan for secrets in error paths under a real database
   failure.
3. **Access-code expiry and lockout** — *covered*: correct code accepted once;
   expired and already-used codes rejected; three wrong answers lock the
   challenge; the limit survives a new challenge; client and bill buckets; the
   database lockout is surfaced with its real wait; refusals do not reveal
   whether a bill exists. Still to add: a load test for concurrent redemptions
   of one code, which the store documents as read-then-write.
4. **Financial discrepancies** — *covered for the current record set*: each of
   the five fields, several simultaneous differences, missing-on-bill vs
   missing-in-record, and proof that the discrepancy response carries field keys
   but no figures. Still to add: more record fixtures and a property test over
   generated amounts.
5. **AI explanation accuracy** — *covered for the current synthetic record*:
   three languages; the verified-session and discrepancy gates; server-built
   facts and field association; missing amounts stay `null`; unfamiliar amounts,
   dates, percentages, number words and common
   coverage/eligibility/waiver/payment-obligation claims are discarded; the
   provider never receives amounts or bill/hospital/token/code data; the public
   response is validated and raw drafts are not. Still to add: real recorded
   dates to trace, a live provider call inside the automated suite, and a review
   of whether prose states a fact correctly as well as avoiding figures.

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
