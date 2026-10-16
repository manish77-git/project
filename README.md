# Patient Financial Navigator

A web application that helps patients understand a hospital bill: identify the
bill, check it against hospital records, and explain the amounts in plain
language — including Hindi and Kannada.

**Target users:** patients and their family members who receive a hospital bill
they cannot fully understand, plus hospital support staff who answer follow-up
questions. The app is designed for people who may not know what "insurance
approved but not paid" means, or why the amount due on the bill differs from
what they expected.

**Status: early. The shared data contract (Zod schemas), a health endpoint and
bill identification (image upload + OCR, or a typed bill number) exist today.**
Read [Implemented](#implemented-today) carefully before assuming a feature is
available — nothing below is aspirational.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack build) |
| Language | TypeScript (strict) |
| Validation | Zod 4 |
| OCR (bill identification) | `tesseract.js` 7 — Tesseract 5 compiled to WASM, run locally in Node |
| Tests | Vitest 5 |
| Styling | Tailwind CSS 4 |
| Linting | ESLint 9 (`eslint-config-next`) |
| Runtime | Node.js ≥ 22.12 (Vitest 5 requirement; Next 16 needs ≥ 20.9) |

`dependencies` contains `next`, `react`, `react-dom`, `zod` and `tesseract.js`.
No GenAI provider, database, or auth library is installed: identification reads
text with a local OCR engine (no API key, no network call at request time), and
verification against hospital records does not exist yet.

## Implemented today

Verified by running the checks listed in [Quality checks](#quality-checks) on
2026-10-12:

- **Shared data-contract schemas** in `src/lib/schemas/`, importable from
  `@/lib/schemas` — validation only, with Vitest suites covering them:
  - bill identification result (`identification.ts`)
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
- **`GET /api/health`** — fixed liveness JSON (`{"status":"ok","service":...}`),
  no env vars, no I/O, no secrets.
- **Project tooling** — strict TypeScript, ESLint, Vitest, Tailwind, App Router
  build.
- **The UI is still the Create Next App starter page** (`src/app/page.tsx`). It
  is not the product UI.
- **No `.env.example` and no environment variables are required yet** — nothing
  reads configuration. See [Environment variables](#environment-variables).

## Planned — NOT implemented

Do not treat any of these as working. Each is documented as a target only:

- Gemini (or any cloud vision model) bill extraction — **not implemented**.
  What exists is a *local* OCR engine (`tesseract.js`), which reads printed text
  and cannot interpret layout, handwriting or scans the way a vision model can.
  See [limitations](#bill-identification-limitations).
- Access-code authentication for a bill — **not implemented**; no access-code
  schema or storage exists yet.
- Bill verification against hospital records (`POST /api/verify`) —
  **not implemented**; there are no hospital records to check against.
- Authorized financial detail (`GET /api/financials/:recordId`) — **not
  implemented**.
- Patient confirmation of a field (`POST /api/financials/confirm`) — **not
  implemented**.
- AI-generated explanation (`POST /api/explain`) — **not implemented**; only the
  shape of a valid explanation is defined.
- Callback submission endpoint (`POST /api/callback`) — **not implemented**; the
  schema and `createCallbackTicket` helper exist, nothing stores tickets.
- Supabase (or any) persistence — **not implemented**; no client, no tables.
- Authentication, authorization and same-origin checks — **not implemented**.
- Hospital support dashboard — **not implemented**.
- Any test that exercises an AI call, a database, or an expiry/lockout flow —
  **not implemented**. Real-image OCR is covered by `npm run test:ocr` (see
  [bill identification limitations](#bill-identification-limitations)).
- Any frontend work: the identification endpoint has **no UI** behind it yet —
  it is callable over HTTP only. See [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

## Prerequisites

- Node.js 22.12 or newer (`node -v`; this project was developed on v22.20.0)
- npm (a `package-lock.json` is committed — keep using npm)
- Git

## Run the application

```bash
npm install        # install dependencies
npm run dev        # start the dev server (http://localhost:3000)
npm run build      # production build
npm run start      # run the production build
```

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

## Quality checks

Run these from the project root. Last verified results (2026-10-12) are shown so
you can tell a regression from a pre-existing failure:

| Command | What it does | Last verified |
| --- | --- | --- |
| `npm test` | Vitest, single run (hermetic — no network, no real OCR) | ✅ 162 tests / 11 files passed, exit 0 |
| `npm run test:ocr` | Vitest against the **real** OCR engine and real image files | ✅ 8 tests / 1 file passed, exit 0 |
| `npm run test:watch` | Vitest in watch mode | — (interactive) |
| `npm run lint` | ESLint over the repo | ✅ 0 errors, 0 warnings, exit 0 |
| `npx tsc --noEmit` | TypeScript type-check | ✅ exit 0 |
| `npm run build` | Next.js production build | ✅ exit 0, 4 routes (`/`, `/_not-found`, `/api/bills/identify`, `/api/health`) |

`npm test` never loads the OCR engine: suites inject a fake engine, so they run
offline in about 2 seconds. `npm run test:ocr` is kept separate because the
first run downloads traineddata. There is still no CI pipeline, and no coverage
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
  It returns nothing the caller did not send, but it is currently open to abuse
  as unpaid CPU work; hardening belongs with the access-code stage.

## Environment variables

**None are needed today.** The app hard-codes its only response and never reads
process environment variables, so there is no `.env.example` and no `.env` to
create — a missing `.env` cannot break anything (unlike a missing `.env.example`,
this is not an oversight, there is genuinely nothing to configure).

`git` ignores `.env*` already, so when a later stage *does* need secrets, create
a `.env.example` with placeholder keys and keep the real `.env` local. Never
commit API keys, service-role keys, or real hospital/patient data.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, patient workflow,
  and which parts are real versus planned.
- [docs/API_CONTRACT.md](docs/API_CONTRACT.md) — the authoritative data contract
  and the one implemented endpoint.
- [docs/TEST_PLAN.md](docs/TEST_PLAN.md) — what is tested today and what still
  needs tests.
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
   `.env*`, `uploads/`, `patient-docs/`, `patient-data/`, `*.pdf`, `*.docx`,
   `*.xlsx` and `*.csv` for this reason; test fixtures must be synthetic.
