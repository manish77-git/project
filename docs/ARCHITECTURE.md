# Architecture — Patient Financial Navigator

High-level overview. The data shapes themselves live in
[API_CONTRACT.md](API_CONTRACT.md); this page explains how the pieces fit and —
importantly — **what is real today versus planned**.

**Stage status:** the shared data contract (Zod schemas + tests), a liveness
endpoint (`GET /api/health`), **bill identification** (`POST
/api/bills/identify` — image upload read by a local OCR engine, or a typed bill
number), **access-code authentication**, **bill verification** against synthetic
hospital records, **authorized financial detail**, and a **validated public
explanation** (`POST /api/bills/explain`) are implemented. The explanation
provider is a Gemini REST adapter behind a replaceable port; the automated
suite makes no live call. A 2026-10-19 prompt-compliance fix tuned the model's
wording to the validator without changing the validator; after it, one live
spot check per language returned a validated explanation in English, Hindi and
Kannada — one synthetic bill each, so a spot check rather than a success rate.
There is **no** real hospital integration,
**no** patient accounts or staff auth, and **no UI** behind any endpoint — the
user interface is still the Create Next App starter page. A PostgreSQL layer
exists and is optional; the app runs without a database.

## Purpose

A patient holds a hospital bill they cannot interpret. They need three things,
in this order: *which bill is this*, *is it authentic for the hospital that
issued it*, and *what do the numbers actually mean for me*. The application is
being built to answer those three questions in plain language (English, Hindi,
Kannada), without exposing protected figures to anyone who has not proved they
may see them.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, route handlers) |
| Language | TypeScript (strict) |
| Validation | Zod 4 |
| OCR | `tesseract.js` 7 (Tesseract 5 → WASM, in-process, no API key) |
| Access codes | `node:crypto` HMAC-SHA256 + signed bearer tokens; `bcryptjs` 3 on the database path |
| Database (optional) | PostgreSQL via `pg` 8 |
| Tests | Vitest 5 |
| Styling | Tailwind CSS 4 |
| Linting | ESLint 9 |
| Runtime | Node.js ≥ 22.12 |

## Major components

| Component | Where | State |
| --- | --- | --- |
| Web UI (upload, results, explanation) | `src/app/` | **Planned.** Only the starter page exists; no endpoint has a caller. |
| Data contract (schemas + types) | `src/lib/schemas/` | **Implemented**, 7 modules + tests, exported from `@/lib/schemas`. |
| HTTP API | `src/app/api/` | **Implemented:** `GET /api/health`, `POST /api/bills/identify`, `POST /api/bills/access/challenge`, `POST /api/bills/access/verify`, `POST /api/bills/verify`, `GET /api/bills/financials`, `POST /api/bills/explain` (validated response; `503` without a provider key). Callback and confirmation endpoints are planned. |
| Bill identification (upload → text → candidates) | `src/lib/identification/` | **Implemented** with a local OCR engine: image validation, OCR port, text→candidate extraction, HTTP handler. No AI provider. |
| Bill identification (AI vision) | — | **Planned.** No provider SDK is installed; the OCR port is the seam where one would be added. |
| Access codes (challenge → code → token) | `src/lib/access/` | **Implemented:** challenge service, single-use codes, signed tokens, authorization middleware, one attempt authority per deployment. |
| Bill verification against hospital records | `src/lib/verification/`, `src/lib/records/` | **Implemented** against a synthetic, in-code record repository. No real hospital integration. |
| Authorized financials | `src/lib/verification/handler.ts` | **Implemented:** released only to a session that verified, re-checked on the way out. |
| GenAI explanation drafting | `src/lib/explanation/` | **Public and validated.** Gemini REST adapter behind a provider port; the model returns field meanings only, and every amount is rendered from the record after validation. A safe server template covers provider/draft failure. Live inference was manually verified once on 2026-10-19; the automated suite still uses fakes. |
| Persistence | `src/lib/db/` | **Optional.** PostgreSQL schema, seed, parameterised queries and bcrypt access-code store. Used only when `DATABASE_URL` is set; not exercised by `npm test`. |
| Patient accounts / staff auth | — | **Planned.** Access codes authenticate a bill, not a person. |
| Support dashboard | — | **Planned.** |

Schemas are the one component every stage depends on, which is why they were
built and tested first: they are the contract that stops a later stage from
leaking data or inventing a shape.

## Intended patient workflow

Steps 1–6 are wired end to end over HTTP. There is still no UI.

1. **Upload a bill image.**
2. **Identify** — the document is read and the hospital name and bill number are
   extracted as *candidates* (`POST /api/bills/identify`). The hospital
   *identifier* is deliberately not extracted yet.
3. **Authenticate** — the patient proves they may see this bill with an access
   code issued by the hospital:
   `POST /api/bills/access/challenge` → `POST /api/bills/access/verify` → bearer
   token + server-side session.
4. **Verify** — `POST /api/bills/verify`, authenticated by that token, checks the
   bill against the hospital's record and produces one of four outcomes. The
   bill comes from the session, never from the request body.
5. **Show financials** — `GET /api/bills/financials`, only for a session that
   verified; each of the five tracked amounts is shown with its status and the
   patient's confirmation flag.
6. **Explain** — `POST /api/bills/explain` returns a validated, plain-language
   explanation generated from the verified record in the patient's language.
7. **Callback (optional)** — *planned*: the patient can request a call, with
   explicit consent, instead of acting alone.

## Candidate data versus trusted records

This is the central trust rule of the design, and it is enforced in the schemas
rather than in prose:

- **AI-extracted candidate data** is what a model *thinks* it read. It is
  represented by the `…Candidate` shapes (`billIdentificationSchema`,
  `documentFinancialsSchema`, `financialFieldCandidateSchema`). Candidates are
  unverified, may be missing (`null`, never a misleading `"0"`), and **can never
  be marked confirmed by a model** — `confirmedByUser` is the literal `false` in
  those shapes, so a model that tries to claim confirmation fails validation
  instead of being trusted.
- **Trusted hospital records** are the hospital's own data plus a value the
  patient has explicitly confirmed. Only
  `financialFieldConfirmationSchema` (a future authenticated, same-origin-checked
  patient action) can set `confirmedByUser: true`; stored records then validate
  against `financialFieldSchema`.
- **Explanations never create trust.** An explanation must cite the record it
  came from and the exact facts it used; it cannot verify anything itself.

## Four ideas that must not be confused

| Concept | Question it answers | Vocabulary | State |
| --- | --- | --- | --- |
| **Bill identification** | What does this document appear to say? | `identificationStatus`: `identified`, `partial`, `unreadable_image`, `invalid_input` | **Implemented** (`src/lib/identification/`). |
| **Access-code authentication** | May this person see this bill at all? | Challenge + signed grant; refusals are uniform `401`, lockout is `429` | **Implemented** (`src/lib/access/`). |
| **Bill verification** | Does the hospital's record match this bill? | Four outcomes: `verified`, `amounts_differ`, `bill_not_found`, `hospital_not_registered` | **Implemented** against synthetic records (`src/lib/verification/`). |
| **Financial release** | What are the recorded figures? | `documentFinancialsSchema`; keys only on a refusal | **Implemented**, verified sessions only. |
| **Explanation drafting** | How do we explain this verified record? | `explanationResponseSchema`; model-written meanings; server-built facts | **Implemented** (`src/lib/explanation/`), validated and public for verified sessions. |

The vocabularies are **deliberately disjoint**: an unreadable image is an
*identification* status, never a verification outcome; "you may not see it" is
an access refusal, never a verification outcome; and the verification response
carries no amounts at all — only the *keys* of fields that differed. That keeps
"we could not read it", "you may not see it", and "it does not match" from
collapsing into one another.

## Design invariants (do not weaken)

1. Money is always a decimal **string**, never a float.
2. A missing amount is `null`, never `"0"` — unknown is not zero.
3. Identification statuses and verification outcomes never overlap.
4. Verification responses contain field *keys*, never amounts.
5. Model output can never set `confirmedByUser: true`.
6. Every explanation carries the exact notice
   `Generated from hospital-provided bill information.` and references the
   verified record it used.
7. A bill identifier never comes from the request on a protected endpoint: it
   comes from the access session. No client-supplied boolean decides access.
8. Exactly **one** attempt authority guards codes in a deployment — never a
   challenge counter *and* a table lockout enforcing the same guess budget.

## Access-code pipeline (implemented)

```
POST /api/bills/access/challenge
  └─ handler.ts          strict JSON, uniform refusals, 503 without a secret
       └─ service.ts     bind challenge to bill, TTL, attempt budget
            └─ throttle.ts        one authority: in-memory OR storage-managed

POST /api/bills/access/verify
  └─ handler.ts
       └─ service.ts        challenge state → throttle → code verifier
            ├─ code-verifier.ts   digest store (no DB) | access_codes table (DB)
            └─ token.ts           HMAC-signed grant + server-side session
```

`dependencies.ts` is the single place that chooses the pair: a configured
`DATABASE_URL` selects the bcrypt/table store and the storage-managed throttle;
without it, the seeded digest store and the in-memory throttle are used. Routes
see only ports, so the choice never leaks into the HTTP layer.

## Verification pipeline (implemented)

```
POST /api/bills/verify            GET /api/bills/financials
  └─ verification/handler.ts        └─ authorization.ts (bearer token → session)
       └─ verification/service.ts         └─ re-check record before release
            └─ records/mock-records.ts    synthetic hospital records
```

Verification compares the patient-side amounts with the hospital's record and
stores the outcome on the session. Financials re-checks the record instead of
trusting the stored outcome alone, and every refusal path returns no figures.

## Explanation pipeline (Stage 4 — public and validated)

```
POST /api/bills/explain
  └─ explanation/handler.ts    verified bearer session + record re-check
       └─ explanation/service.ts
            ├─ language contract (en | hi | kn)
            ├─ live session + recorded outcome == verified
            ├─ authoritative record by session bill → verification recomputed
            ├─ provider.ts → Gemini REST adapter (replaceable port)
            │    input: field keys + found/missing only — no amounts, no dates
            ├─ validator.ts
            │    ├─ strict shape: exactly five allow-listed fields
            │    ├─ prose guard: digits/currency/percent/date/number words/
            │    │   coverage/eligibility/waiver/payment claims
            │    ├─ validateFinancialFact: record value for THAT field
            │    ├─ server-rendered headings, INR values and warnings
            │    └─ explanationResponseSchema parse
            └─ deterministic server template on any provider/draft failure
```

The model contributes meanings only. It never sees the token, access code, bill
number, hospital name, amount or date, and it cannot add financial facts, set
`confirmedByUser`, or make the explanation public. Every amount in the response
is rendered server-side from `record.recordAmounts[fieldKey]`; a correct number
attached to the wrong field is a mismatch. Missing values stay `null` and are
warned about, never replaced with zero. Raw drafts and provider error bodies
never leave the server.

## Team roles

The working split, consistent with the member references in the schemas and
existing docs:

| Member | Owns | Current state |
| --- | --- | --- |
| **Member 1** | Shared data contract and documentation: `src/lib/schemas`, the API contract, test plan, repository hygiene. | ✅ Delivered (schemas + access schemas + tests + docs). |
| **Member 2** | AI pipeline: bill image extraction, identification, verification against records, explanation generation. | 🟡 Identification extraction shipped using **local OCR** (no AI provider); verification shipped against **synthetic** records; explanation generation is public and validated, and live Gemini inference was manually verified once on 2026-10-19; the automated suite still uses fakes. |
| **Member 3** | Backend and endpoints: route handlers, authentication, same-origin checks, callback submission, patient confirmation, access codes. | 🟡 Identification, access codes, verification and financials shipped; same-origin checks, callbacks and confirmation not started. |
| **Member 4** | Data layer and support tooling: persistence, ticket storage, support dashboard. | 🟡 Optional PostgreSQL schema + access-code store shipped; tickets and dashboard not started. |

Member 1's scope is inferred from this stage's deliverables and should be
confirmed with the team; the other three match the member annotations already in
`src/lib/schemas/*.ts`.

## Testing

- Framework: **Vitest 5**, configured in `vitest.config.mts` (node environment,
  `@/` alias, `src/**/*.test.ts`).
- Run: `npm test` (`npm run test:watch` for watch mode).
- All fixtures are **synthetic** — no credentials, no real hospital documents.
- Current status: **385 tests across 30 files, all passing** (schemas, health
  route, identification, access codes, verification, financials, explanation
  validation and the synthetic records repository). Database access is tested
  with a fake `Queryable`; the Gemini adapter uses a fake HTTP transport. No
  test opens a real connection or calls a live model.
- `npm run test:ocr` (separate config, `vitest.ocr.config.mts`) runs **8 more
  tests against the real OCR engine** and real PNG/JPEG files; it is kept out of
  `npm test` because the first run downloads traineddata. Details and gaps:
  [TEST_PLAN.md](TEST_PLAN.md).

## Identification pipeline (implemented)

```
POST /api/bills/identify
  └─ handler.ts        content type → multipart | JSON; maps outcomes to HTTP
       └─ service.ts   validates the upload, runs OCR, validates the result
            ├─ image-input.ts      magic-byte sniffing, type + size limits
            ├─ ocr.ts              the OcrEngine port (engine-agnostic)
            │    └─ tesseract-engine.ts   real engine: Tesseract via WASM
            └─ extract.ts          text → candidates, status, warnings
```

Decisions worth keeping: the OCR engine sits behind a port so the pipeline and
its tests need no real engine; `extract.ts` is pure and engine-free; the service
parses every result with `billIdentificationSchema` before it leaves, so the
published contract — not this code — decides the response shape; and the module
has **no dependency on verification**, which lets the two stages be built and
tested on their own.

## Roadmap (in order)

1. ~~Bill identification (upload, OCR, candidates, endpoint)~~ — **done**.
2. ~~Access codes~~ — **done**.
3. ~~Verification against hospital records~~ — **done for synthetic records**; a
   real hospital adapter is still needed.
4. ~~Authorized financials~~ — **done**.
5. ~~Validated public explanation~~ — **done**; live spot checks on 2026-10-19
   returned `validated` in English, Hindi and Kannada (one synthetic bill each).
6. AI vision extraction (replacing or supplementing OCR) — **next**.
7. Persistence beyond the optional access-code store (tickets, records) → 8.
   accounts, staff auth, same-origin and rate-limit hardening → 9. support
   dashboard.

Each stage must validate its inputs with the existing schemas and keep the
invariants above intact.
