# Patient Financial Navigator

A web application that helps patients understand a hospital bill: identify the
bill, check it against hospital records, and explain the amounts in plain
language — including Hindi and Kannada.

**Target users:** patients and their family members who receive a hospital bill
they cannot fully understand, plus hospital support staff who answer follow-up
questions. The app is designed for people who may not know what "insurance
approved but not paid" means, or why the amount due on the bill differs from
what they expected.

**Status: early. Only the shared data contract (Zod schemas) and one health
endpoint exist today.** Read [Implemented](#implemented-today) carefully before
assuming a feature is available — nothing below is aspirational.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack build) |
| Language | TypeScript (strict) |
| Validation | Zod 4 |
| Tests | Vitest 5 |
| Styling | Tailwind CSS 4 |
| Linting | ESLint 9 (`eslint-config-next`) |
| Runtime | Node.js ≥ 22.12 (Vitest 5 requirement; Next 16 needs ≥ 20.9) |

No AI provider, database, or auth library is installed. `dependencies` contains
only `next`, `react`, `react-dom` and `zod`.

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

- Bill image upload and AI (Gemini) vision extraction — **not implemented**.
- Bill identification endpoint (`POST /api/identify`) — **not implemented**.
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
- Any test that exercises a real image, AI call, database, or expiry/lockout
  flow — **not implemented**. See [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

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

## Quality checks

Run these from the project root. Last verified results (2026-10-12) are shown so
you can tell a regression from a pre-existing failure:

| Command | What it does | Last verified |
| --- | --- | --- |
| `npm test` | Vitest, single run | ✅ 75 tests / 6 files passed, exit 0 |
| `npm run test:watch` | Vitest in watch mode | — (interactive) |
| `npm run lint` | ESLint over the repo | ✅ 0 errors, 0 warnings, exit 0 |
| `npx tsc --noEmit` | TypeScript type-check | ✅ exit 0 |
| `npm run build` | Next.js production build | ✅ exit 0, 3 routes (`/`, `/_not-found`, `/api/health`) |

There is no CI pipeline and no coverage threshold configured.

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
