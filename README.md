# Patient Financial Navigator

A web application that helps patients understand a hospital bill: identify the
bill, check it against hospital records, and explain the amounts in plain
language — including Hindi and Kannada.

**Target users:** patients and their family members who receive a hospital bill
they cannot fully understand, plus hospital support staff who answer follow-up
questions. The app is designed for people who may not know what "insurance
approved but not paid" means, or why the amount due on the bill differs from
what they expected.

**Status: early. The shared data contract (Zod schemas), a health endpoint, bill
identification (image upload + OCR, or a typed bill number), access-code
authentication, bill verification against synthetic hospital records,
authorized financial detail, and a validated public explanation endpoint exist
today.** Read
[Implemented](#implemented-today) carefully before assuming a feature is
available — nothing below is aspirational.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack build) |
| Language | TypeScript (strict) |
| Validation | Zod 4 |
| OCR (bill identification) | `tesseract.js` 7 — Tesseract 5 compiled to WASM, run locally in Node |
| Access codes | HMAC-SHA256 digests (`node:crypto`) and signed bearer tokens; `bcryptjs` 3 on the database path |
| Database (optional) | PostgreSQL via `pg` 8 — schema, queries and access-code lockout in `src/lib/db/` |
| Tests | Vitest 5 |
| Styling | Tailwind CSS 4 |
| Linting | ESLint 9 (`eslint-config-next`) |
| Scripts | `tsx` 4 (runs `npm run access:issue`) |
| Runtime | Node.js ≥ 22.12 (Vitest 5 requirement; Next 16 needs ≥ 20.9) |

`dependencies` contains `next`, `react`, `react-dom`, `zod`, `tesseract.js`,
`pg` and `bcryptjs`. No GenAI **SDK** is installed: identification reads text
with a local OCR engine, and the explanation adapter calls Gemini's REST API
directly with `fetch` (server-side only, optional key). A PostgreSQL database is
**optional** — the schema and query layer are committed, and the whole access
flow also runs with no database at all (see [Access codes](#access-codes)).

## Implemented today

Verified by running the checks listed in [Quality checks](#quality-checks) on
2026-10-19:

- **Shared data-contract schemas** in `src/lib/schemas/`, importable from
  `@/lib/schemas` — validation only, with Vitest suites covering them:
  - bill identification result (`identification.ts`)
  - access challenge, grant and stored-code shapes (`access.ts`)
  - bill verification outcome (`verification.ts`)
  - the five financial fields, currency and document financials (`financial.ts`)
  - generated explanation shape (`explanation.ts`)
  - callback request + stored ticket (`callback.ts`)
  - shared primitives: language, currency, decimal-string money, page numbers
    (`common.ts`)
- **`POST /api/bills/identify`** — bill identification from an uploaded image
  (PNG/JPEG/BMP, ≤ 8 MB) or from a typed bill number. Returns exactly the
  `billIdentificationSchema` shape: hospital name candidate, bill number
  candidate, identification status and warnings. It reads **no** amounts,
  insurance details or diagnoses, and returns none. See
  [docs/API_CONTRACT.md](docs/API_CONTRACT.md#post-apibillsidentify).
- **Access codes** — a two-step challenge (`POST /api/bills/access/challenge`
  then `POST /api/bills/access/verify`) that proves a patient may see one bill.
  Codes are issued server-side by `npm run access:issue`, stored only as
  digests, single-use and bound to one bill number. A successful answer returns a
  short-lived signed bearer token plus a server-side session.
- **`POST /api/bills/verify`** — checks the unlocked bill against the hospital's
  record and returns one of four outcomes (`verified`, `amounts_differ`,
  `bill_not_found`, `hospital_not_registered`), a patient-safe message and the
  **keys** of differing fields — never an amount.
- **`GET /api/bills/financials`** — the hospital's recorded amounts, released
  only for a session that verified, and re-checked against the record on the way
  out. A session that has not verified gets `409 verification_required`.
- **`POST /api/bills/explain`** — a validated, patient-facing explanation in
  English, Hindi or Kannada for a session that verified its bill. The model
  receives only the five allow-listed field keys and whether each value is
  available — never an amount, date, bill number or token. Every amount is
  rendered server-side from the authoritative record; the model contributes
  meaning only. A draft with a digit, currency, percentage, date or number
  word, an unknown/duplicate/missing field, or a coverage/eligibility/waiver/
  payment claim is discarded and replaced by a deterministic server template.
  `GEMINI_API_KEY` is required; without it the endpoint answers `503` and never
  returns a draft.
- **`GET /api/health`** — fixed liveness JSON (`{"status":"ok","service":...}`),
  no env vars, no I/O, no secrets.
- **Optional database layer** — `src/lib/db/` holds the PostgreSQL schema
  (`migrations/001 init.sql`), synthetic seed data, parameterised queries and the
  bcrypt-backed access-code store with its durable five-failure lockout. It is
  used only when `DATABASE_URL` is set.
- **Synthetic hospital records** — `src/lib/records/mock-records.ts` is the
  current authoritative record set for verification (in code, not a database).
- **Project tooling** — strict TypeScript, ESLint, Vitest, Tailwind, App Router
  build, and the access-code issuing script.
- **The UI is still the Create Next App starter page** (`src/app/page.tsx`). All
  of the above are callable over HTTP only.

## Planned — NOT implemented

Do not treat any of these as working. Each is documented as a target only:

- Gemini (or any cloud vision model) bill extraction — **not implemented**.
  What exists is a *local* OCR engine (`tesseract.js`), which reads printed text
  and cannot interpret layout, handwriting or scans the way a vision model can.
  See [limitations](#bill-identification-limitations).
- A real hospital records integration — **not implemented**; verification reads
  the synthetic in-code repository. Swapping in a real system means writing one
  `HospitalRecordRepository` adapter.
- A **live** Gemini call in the automated suite — not implemented: `npm test`
  uses an injected fake provider and a fake HTTP transport. A one-off manual
  check on 2026-10-19 did succeed against `gemini-3.5-flash-lite` (three
  provider calls; two drafts validated and one safely fell back to the server
  template). Without `GEMINI_API_KEY` the endpoint returns
  `503 explanation_unavailable`.
- A real hospital record source with dates — the explanation response therefore
  reports `datesUsed: []` and warns that the supplied record has no dates; any
  date-like model prose is rejected rather than trusted.
- Callback submission endpoint (`POST /api/callback`) — **not implemented**; the
  schema and `createCallbackTicket` helper exist, nothing stores tickets.
- Patient confirmation of a field (`POST /api/financials/confirm`) — **not
  implemented**; the schema exists, no endpoint writes it.
- Patient accounts, staff authentication and role checks — **not implemented**.
  Access codes authenticate *a bill*, not a person.
- Same-origin enforcement, CSRF protection and rate limiting — **not
  implemented** on any endpoint. Tokens are held in the `Authorization` header
  and are not cookies, which limits (but does not remove) cross-site risk.
- Hospital support dashboard — **not implemented**.
- Any test against a **live** database or a **live** AI provider — **not
  implemented**. Database logic and the Gemini adapter are tested with fakes and
  a fake transport; real-image OCR is covered by `npm run test:ocr` (see
  [bill identification limitations](#bill-identification-limitations)). A
  one-off manual live Gemini check on 2026-10-19 succeeded; the automated suite
  still makes no live model call.
- Any frontend work: none of the endpoints has a UI behind it yet. See
  [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

## Prerequisites

- Node.js 22.12 or newer (`node -v`; this project was developed on v22.20.0)
- npm (a `package-lock.json` is committed — keep using npm)
- Git
- PostgreSQL 14+ **only if** you want the optional database path

## Run the application

```bash
npm install        # install dependencies
cp .env.example .env.local   # then set ACCESS_SECRET (32+ characters)
npm run dev        # start the dev server (http://localhost:3000)
npm run build      # production build
npm run start      # run the production build
```

The access-code endpoints need `ACCESS_SECRET`; without a usable value they
answer `503` rather than accept codes protected by a guessable secret. The
explanation service reads optional `GEMINI_API_KEY`/`GEMINI_MODEL`, but it is
not reachable through a public draft endpoint. Identification, health and
synthetic-record verification run without any `.env.local`.

Check the liveness endpoint while the server is running:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","service":"patient-financial-navigator"}
```

Identify a bill from an image, or from a typed bill number:

```bash
curl -F "billImage=@bill.png;type=image/png" http://localhost:3000/api/bills/identify
# {"hospitalNameCandidate":"CITY GENERAL HOSPITAL","hospitalIdentifierCandidate":null,
#  "billNumberCandidate":"INV-2026-0042","identificationStatus":"identified","warnings":[]}

curl -H 'content-type: application/json' \
  -d '{"billNumber":"INV-2026-0042"}' http://localhost:3000/api/bills/identify
# {"hospitalNameCandidate":null,"hospitalIdentifierCandidate":null,
#  "billNumberCandidate":"INV-2026-0042","identificationStatus":"partial",
#  "warnings":["This bill number was entered by hand and has not been read from the bill image.",
#              "The hospital name could not be read from this image."]}
```

The first OCR request in a fresh environment downloads Tesseract's English
traineddata (~15 MB) into the OS temp directory; it is cached there afterwards.
Override the location with the optional `langPath`/`cachePath` engine options in
`src/lib/identification/tesseract-engine.ts` for an offline deployment.

## Access codes

Issuing a code stands in for the hospital handing one to a patient at the
counter. It is a server-side script, not an endpoint — issuing codes is staff
work, and a staff endpoint would need staff authentication that does not exist
yet.

```bash
# Prints the code once. Only a digest is stored.
npm run access:issue -- --bill INV-2026-0042 --days 7
```

Then, in the app:

1. `POST /api/bills/access/challenge` with `{"billNumber":"INV-2026-0042"}`
   returns a challenge that is bound to that bill for five minutes.
2. `POST /api/bills/access/verify` with
   `{"challengeId":"…","accessCode":"AB3DE-FGH7K"}` spends the code and returns
   `{"accessToken":"…","expiresAt":"…","billNumber":"INV-2026-0042"}`.
3. `POST /api/bills/verify` and `GET /api/bills/financials` require
   `Authorization: Bearer <accessToken>`.

Rules that hold in both storage modes:

- A code is **single-use** and valid only for the bill it was issued for.
- A challenge expires after **5 minutes** and can be answered **3 times**.
- Refusals are uniform: a wrong code, an expired challenge, an already-answered
  challenge and an unknown challenge all produce the same `401`, so the
  endpoint cannot be used to discover which bills or codes exist. Only a lockout
  is distinguished (`429` + `Retry-After`), because a locked-out patient needs to
  know to wait.
- Tokens last **15 minutes**. They are not cookies; the client sends them in the
  `Authorization` header.

### Which attempt authority is in force

Exactly one counter guards guessing in a given deployment:

- **No `DATABASE_URL`** (the default): codes are HMAC-SHA256 digests in
  `data/access-codes.json`, written by `npm run access:issue`. A bill/client
  throttle lives in the server process and locks for **15 minutes** after three
  failures.
- **`DATABASE_URL` set**: codes are bcrypt hashes in the `access_codes` table,
  single-use is enforced by that table, and its own **five-failure lockout** is
  the attempt authority. The lockout survives a restart.

The in-memory path (both the throttle and the challenge/session store) resets
when the server restarts, so it is a demo limitation, not a production posture.
Even with a database configured, the challenge and session records are still
in-memory, so a restart invalidates live tokens.

The seed file `data/access-codes.json` contains digests, never usable codes, and
is git-ignored. It is runtime state: back it up with the same care as any other
credential store, but never commit it.

## Explanations (Stage 4)

The public endpoint is `POST /api/bills/explain`; the workflow lives in
`src/lib/explanation/`.

- **Provider.** Gemini `generateContent` over REST, selected by `GEMINI_MODEL`
  (default `gemini-3.5-flash-lite`). The key travels in `x-goog-api-key`, never
  in the URL. Everything vendor-specific is behind the `ExplanationProvider`
  port, so another model can be added by writing one adapter. With no key the
  endpoint answers `503 explanation_unavailable` and calls nothing.
- **What the model sees.** Only the requested language and the five
  allow-listed field keys plus `found`/`missing`. It never receives an amount,
  date, access code, token, bill number, hospital name or patient detail.
- **Gates before the model.** A live bearer session, `outcome: "verified"`, the
  record re-fetched by the session's bill number, and verification recomputed
  on the current record. Unverified, expired, `amounts_differ`,
  `bill_not_found` and `hospital_not_registered` sessions never call the
  provider.
- **What the model may return.** Exactly one JSON object with five
  `{ fieldKey, explanation }` sections. It cannot return an amount, date,
  reference, warning or confirmation flag: the response schema is strict and
  every section key must be one of the five tracked fields, exactly once.
- **Server-side facts.** `validator.ts` reads each amount from
  `record.recordAmounts[fieldKey]`, checks the value against that same field,
  then renders headings, `INR` values, facts and warnings. A correct number
  attached to another field is a mismatch and fails closed. `null` stays
  `null` with an "unknown, not zero" warning.
- **Draft guard.** Model prose with any Unicode digit, currency, percentage,
  date word, high-value number word, or common
  coverage/eligibility/waiver/payment claim is discarded; malformed, missing,
  duplicate or unknown fields are discarded too. The fallback is a
  deterministic server template built from the record, never the raw draft.
- **What is public.** Only the parsed `explanationResponseSchema`: language,
  five safe sections, server-derived facts, `datesUsed`, warnings and the
  required notice. Raw drafts and provider error bodies never leave the server.
- **Live inference is verified manually, not by the suite.** The suite uses a
  fake provider and a fake HTTP transport; nothing contacts Google in `npm test`.
  A one-off manual check on 2026-10-19 used the real `gemini-3.5-flash-lite`
  provider: all three calls succeeded, two drafts passed validation, and one
  unsafe draft correctly fell back to the server template.

## Quality checks


Run these from the project root. Last verified results (2026-10-19) are shown so
you can tell a regression from a pre-existing failure:

| Command | What it does | Last verified |
| --- | --- | --- |
| `npm test` | Vitest, single run (hermetic — no network, no database, no real OCR, no live LLM) | ✅ 378 tests / 30 files passed, exit 0 |
| `npm run test:ocr` | Vitest against the **real** OCR engine and real image files | ✅ 8 tests / 1 file passed, exit 0 |
| `npm run test:watch` | Vitest in watch mode | — (interactive) |
| `npm run lint` | ESLint over the repo | ✅ 0 errors, 0 warnings, exit 0 |
| `npx tsc --noEmit` | TypeScript type-check | ✅ exit 0 |
| `npm run build` | Next.js production build | ✅ exit 0, 9 routes (`/`, `/_not-found`, `/api/health`, `/api/bills/identify`, `/api/bills/access/challenge`, `/api/bills/access/verify`, `/api/bills/verify`, `/api/bills/financials`, `/api/bills/explain`) |

`npm test` never loads the OCR engine: suites inject a fake engine, so they run
offline in a few seconds. `npm run test:ocr` is kept separate because the first
run downloads traineddata. There is still no CI pipeline, and no coverage
threshold configured.

## Bill identification limitations

Stated plainly, because these decide whether identification is useful for a real
patient:

- The engine is **printed-text OCR**, not a vision model. Handwritten bills,
  heavy rotation, poor lighting, creases and low-resolution photos will read
  badly — and when it cannot read, it reports `unreadable_image` rather than
  guessing.
- A hospital is only recognised when its line carries a hospital-ish word
  (`Hospital`, `Clinic`, `Medical Centre`, …). A bill printed with just a brand
  name is reported as `partial`, with the bill number if one could be read.
- Text below a legibility/confidence floor is treated as unreadable. The floor
  lives in `src/lib/identification/extract.ts` and is tunable.
- `hospitalIdentifierCandidate` is always `null`: this stage extracts the
  hospital **name** and the bill number only.
- The endpoint has no authentication, no same-origin check and no rate limit.
  Access codes protect a *bill's* data after identification; they do not protect
  the identification endpoint itself, which is currently open to abuse as unpaid
  CPU work.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ACCESS_SECRET` | For the access-code endpoints and `npm run access:issue` | 32+ characters. Protects the stored code digests and signs tokens. Missing or too weak ⇒ the access endpoints answer `503`. |
| `ACCESS_CODES_FILE` | No | Seed file for the no-database path. Default `data/access-codes.json` (git-ignored). |
| `DATABASE_URL` | No | PostgreSQL connection string. Setting it switches access codes to the `access_codes` table and makes that table the attempt authority. |
| `GEMINI_API_KEY` | No | Enables `POST /api/bills/explain`. Without it the endpoint answers `503 explanation_unavailable`; it never returns a draft. |
| `GEMINI_MODEL` | No | Gemini text model for the adapter. Default `gemini-3.5-flash-lite`. |

`.env.example` documents all five; copy it to `.env.local` (git-ignored) and
fill in real values. Never commit API keys, database passwords, or real
hospital/patient data.


## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, patient workflow,
  and which parts are real versus planned.
- [docs/API_CONTRACT.md](docs/API_CONTRACT.md) — the authoritative data contract
  and every implemented endpoint.
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md) — what is tested today and what still
  needs tests.
- [docs/STAGE4_REPORT.md](docs/STAGE4_REPORT.md) — Stage 4 design, adversarial
  results, verification run and remaining limitations.
- [docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md) — branch, commit and review
  rules.
- [docs/STAGE2_REPORT.md](docs/STAGE2_REPORT.md) — historical report for the
  schema stage.

## Working together on GitHub

Short version — full guidance in
[docs/GITHUB_WORKFLOW.md](docs/GITHUB_WORKFLOW.md):

1. `main` is the stable branch and should always pass `npm test`, `npm run lint`
   and `npx tsc --noEmit`.
2. Do each task on a short-lived feature branch (`feat/...`, `fix/...`,
   `docs/...`) branched from `main`.
3. Commit in small, meaningful steps with a message explaining *why* the change
   is needed.
4. Open a pull request, keep it small, and get one review before merging. Never
   force-push a shared branch.
5. **Never commit secrets or real patient documents.** `.gitignore` blocks
   `.env*`, `data/access-codes.json`, `uploads/`, `patient-docs/`,
   `patient-data/`, `*.pdf`, `*.docx`, `*.xlsx` and `*.csv` for this reason; test
   fixtures must be synthetic.
