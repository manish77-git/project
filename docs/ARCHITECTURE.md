# Architecture — Patient Financial Navigator

High-level overview. The data shapes themselves live in
[API_CONTRACT.md](API_CONTRACT.md); this page explains how the pieces fit and —
importantly — **what is real today versus planned**.

**Stage status:** the shared data contract (Zod schemas + tests) and one
liveness endpoint (`GET /api/health`) are implemented. There is **no** AI
integration, **no** database, **no** authentication, **no** access codes and
**no** verification logic. The user interface is still the Create Next App
starter page.

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
| Tests | Vitest 5 |
| Styling | Tailwind CSS 4 |
| Linting | ESLint 9 |
| Runtime | Node.js ≥ 22.12 |

## Major components

| Component | Where | State |
| --- | --- | --- |
| Web UI (upload, results, explanation) | `src/app/` | **Planned.** Only the starter page exists. |
| Data contract (schemas + types) | `src/lib/schemas/` | **Implemented**, 6 modules + tests, exported from `@/lib/schemas`. |
| HTTP API | `src/app/api/` | **Implemented:** `GET /api/health` only. All other endpoints are planned. |
| Bill identification (AI vision) | — | **Planned.** No provider SDK is installed. |
| Bill verification against hospital records | — | **Planned.** No hospital data source exists. |
| Persistence | — | **Planned.** No database client or tables. |
| Authentication / access codes | — | **Planned.** Nothing issues, stores or checks a code. |
| Support dashboard | — | **Planned.** |

Schemas are the one component every future stage depends on, which is why they
were built and tested first: they are the contract that stops a later stage
from leaking data or inventing a shape.

## Intended patient workflow

Nothing below is wired end to end yet; the arrows are the design intent.

1. **Upload a bill image.**
2. **Identify** — the document is read and the hospital name, hospital
   identifier and bill number are extracted as *candidates*.
3. **Authenticate** — the patient proves they may see this bill (the planned
   access-code step, tied to the issuing hospital/bill).
4. **Verify** — the identified details are checked against the hospital's
   records, which produces one of four outcomes.
5. **Show financials** — only after the previous steps, the five tracked amounts
   are shown, each with its status and the patient's confirmation flag.
6. **Explain** — a plain-language explanation is generated from the *verified*
   record, in the patient's language.
7. **Callback (optional)** — the patient can request a call, with explicit
   consent, instead of acting alone.

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

## Three ideas that must not be confused

| Concept | Question it answers | Vocabulary | State |
| --- | --- | --- | --- |
| **Bill identification** | What does this document appear to say? | `identificationStatus`: `identified`, `partial`, `unreadable_image`, `invalid_input` | Schema implemented; extraction not implemented. |
| **Access-code authentication** | May this person see this bill at all? | No schema yet. | Planned; nothing implemented. |
| **Bill verification** | Does the hospital's record match this bill? | Four outcomes: `verified`, `amounts_differ`, `bill_not_found`, `hospital_not_registered` | Schema implemented; verification logic not implemented. |

The two implemented vocabularies are **deliberately disjoint**: an unreadable
image is an *identification* status, never a verification outcome, and the
verification response carries no amounts at all — only the *keys* of fields that
differed. That keeps "we could not read it", "you may not see it", and "it does
not match" from collapsing into one another.

## Design invariants (do not weaken)

1. Money is always a decimal **string**, never a float.
2. A missing amount is `null`, never `"0"` — unknown is not zero.
3. Identification statuses and verification outcomes never overlap.
4. Verification responses contain field *keys*, never amounts.
5. Model output can never set `confirmedByUser: true`.
6. Every explanation carries the exact notice
   `Generated from hospital-provided bill information.` and references the
   verified record it used.

## Team roles

The working split, consistent with the member references in the schemas and
existing docs:

| Member | Owns | Current state |
| --- | --- | --- |
| **Member 1** | Shared data contract and documentation: `src/lib/schemas`, the API contract, test plan, repository hygiene. | ✅ Delivered (schemas + tests + docs). |
| **Member 2** | AI pipeline: bill image extraction, identification, verification against records, explanation generation. | ⛔ Not started; provider not chosen or installed. |
| **Member 3** | Backend and endpoints: route handlers, authentication, same-origin checks, callback submission, patient confirmation, access codes. | ⛔ Not started; only `/api/health` exists. |
| **Member 4** | Data layer and support tooling: persistence, ticket storage, support dashboard. | ⛔ Not started; no database. |

Member 1's scope is inferred from this stage's deliverables and should be
confirmed with the team; the other three match the member annotations already in
`src/lib/schemas/*.ts`.

## Testing

- Framework: **Vitest 5**, configured in `vitest.config.mts` (node environment,
  `@/` alias, `src/**/*.test.ts`).
- Run: `npm test` (`npm run test:watch` for watch mode).
- All fixtures are **synthetic** — no credentials, no real hospital documents.
- Current status: **75 tests across 6 files, all passing** (schemas plus the
  health route). Details and gaps: [TEST_PLAN.md](TEST_PLAN.md).

## Roadmap (in order, none started)

Access codes → API endpoints (identify, verify, financials, callback) →
AI vision extraction → persistence → authentication/authorization hardening →
explanation generation → support dashboard. Each stage must validate its inputs
with the existing schemas and keep the invariants above intact.
