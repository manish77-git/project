# API Contract — Patient Financial Navigator

**Status: one endpoint is implemented — `GET /api/health`, documented below.
Everything else in this file describes the shared data shapes implemented in
`src/lib/schemas/`; it does NOT mean an endpoint exists for them.**

Implemented today: the validation layer (Zod schemas + inferred TypeScript types
exported from `@/lib/schemas`) and the liveness endpoint. Every endpoint listed
in [Planned endpoints](#planned-endpoints) is **planned and not implemented**.

## Implemented endpoints

### `GET /api/health`

Route handler: `src/app/api/health/route.ts` (exported `GET`).

- **Purpose:** liveness. It answers "is the service process serving requests?".
- **Request:** no parameters, no query string, no body, no headers, no auth.
- **Response:** `200` with `application/json`:

  ```json
  { "status": "ok", "service": "patient-financial-navigator" }
  ```

- **Errors:** none. There is no failure path and no status other than `200`.
- **Deliberately shallow:** it reads no environment variables, API keys,
  database credentials or internal configuration, and performs no I/O — so a
  `200` proves the process is answering, **not** that a database or any
  dependency is reachable. It is statically prerendered at build time (shown as
  `○ /api/health` in `npm run build` output) because the body is a constant.
- **Tested by:** `src/app/api/health/route.test.ts` (4 tests) — status `200`,
  JSON content type, an exact body of those two string fields, and no extra keys
  or anything matching `key|secret|token|password|stack|trace|env` in the
  values.

## Ground rules

1. **Validate at every boundary.** Anything that crosses a trust boundary
   (model output, client request, database row) must be parsed with the
   matching Zod schema before use.
2. **Money is a decimal string, never a number.** Format:
   `^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$` — non-negative, at most 2 fractional
   digits, no thousands separators, no exponents. This preserves exact
   rupee/paisa precision; floats are never used.
3. **Missing is not zero.** A financial field whose value could not be read
   has `status: "missing"` and `amountRupees: null`. `"0"` means a genuinely
   zero amount printed on the bill. The schemas enforce this pairing.
4. **Identification ≠ verification.** Reading a hospital name or bill number
   off an image (`identification`) is not the same as checking it against a
   hospital record (`verification`). The two use disjoint status enums.
5. **No protected amounts in verification responses.** The verification
   outcome only says *whether* amounts matched. Actual figures are released
   later, only through the authorized financial stage.
6. **AI output can never confirm a value.** `confirmedByUser` is
   `false`/literal-only in the candidate schema; only an explicit patient
   action (validated against `financialFieldConfirmationSchema` in a
   future authenticated endpoint) can set it to `true`.

## Shared primitives (`src/lib/schemas/common.ts`)

| Export | Type | Notes |
| --- | --- | --- |
| `languageCodeSchema` | `"en" \| "hi" \| "kn"` | UI / explanation / callback language |
| `currencySchema` | `"INR"` | Only supported currency |
| `monetaryAmountSchema` | `string` | Decimal-string money format above |
| `pageNumberSchema` | `number \| null` | Positive integer, 1-based; no default |
| `documentWarningsSchema` | `string[]` | Non-sensitive, human-readable warnings |

## Bill identification (`identification.ts`)

`billIdentificationSchema` → type `BillIdentification`

| Field | Type | Notes |
| --- | --- | --- |
| `hospitalNameCandidate` | `string \| null` | `null` when not readable — never `""` |
| `hospitalIdentifierCandidate` | `string \| null` | e.g. registration number |
| `billNumberCandidate` | `string \| null` | As printed on the bill |
| `identificationStatus` | `"identified" \| "partial" \| "unreadable_image" \| "invalid_input"` | |
| `warnings` | `string[]` | |

The object is **strict**: financial amounts, insurance fields, payment
details, diagnoses or any other unexpected property cause validation to fail.
Candidates are *unverified readings*, never confirmed facts.

## Bill verification (`verification.ts`)

`billVerificationSchema` → type `BillVerification`

| Field | Type | Notes |
| --- | --- | --- |
| `outcome` | `"verified" \| "amounts_differ" \| "bill_not_found" \| "hospital_not_registered"` | Exactly these four |
| `message` | `string` | Patient-safe wording; must not quote amounts |
| `discrepancyKeys` | `FinancialFieldKey[]` | Only for `amounts_differ`; default `[]`. **Keys only, never values** |

An unreadable image is **not** a verification outcome — it is
`identificationStatus: "unreadable_image"`.

## Financial fields (`financial.ts`)

`financialFieldSchema` → type `FinancialField`

| Field | Type | Notes |
| --- | --- | --- |
| `amountRupees` | `string \| null` | Decimal string; `null` when unknown |
| `status` | `"found" \| "ambiguous" \| "missing"` | |
| `evidence` | `string \| null` | Short excerpt justifying the value |
| `pageNumber` | `number \| null` | Positive integer or `null` |
| `confirmedByUser` | `boolean` | Defaults `false`; `true` only via explicit patient action |

Status/amount pairing (enforced by the schema):

- `found` → `amountRupees` **must** be a non-null decimal string.
- `missing` → `amountRupees` **must** be `null` (never `"0"`).
- `ambiguous` → candidate string or `null`.

The five tracked fields:

- `billTotalAfterDiscounts`
- `insuranceApprovedButNotPaid`
- `insurancePaidOrCredited`
- `patientPayments`
- `printedAmountDue`

Containers:

- `financialFieldsSchema` → `FinancialFields` — exactly the five fields.
- `documentFinancialsSchema` → `DocumentFinancials` — the five fields **plus**
  `currency: "INR"` and `documentWarnings: string[]`. Uses
  `financialFieldCandidateSchema` for each field, so `confirmedByUser` is
  always `false` — this represents AI-extracted candidate data.

Model-output variants and confirmation:

- `financialFieldCandidateSchema` — same as `financialFieldSchema` but
  `confirmedByUser` is the literal `false` (defaulted). Use this to validate
  raw extraction output; it **rejects** any attempt to carry `true`.
- `financialFieldConfirmationSchema` — `{ confirmedByUser: true }`. The only
  schema that accepts confirmation; reserved for the future authenticated
  patient-confirmation endpoint.

## Generated explanation (`explanation.ts`)

`explanationSchema` → type `Explanation`

| Field | Type | Notes |
| --- | --- | --- |
| `language` | `"en" \| "hi" \| "kn"` | |
| `explanationText` | `string` | 1–10000 chars |
| `verifiedRecordReference` | `{ recordId, billNumber }` | Must point at an existing verified record |
| `financialFactsUsed` | `FinancialFact[]` | At least one; each names a tracked `fieldKey` + decimal string |
| `datesUsed` | `ExplanationDate[]` | `{ label, dateIso (YYYY-MM-DD), pageNumber }` |
| `warnings` | `string[]` | Unresolved discrepancies stay visible here |
| `notice` | literal `"Generated from hospital-provided bill information."` | Exact match required |

The schema deliberately contains **no** verification outcome: an explanation
never verifies a bill; it only cites one that was verified elsewhere.
Generation with AI is a later stage and is not implemented.

## Callback (`callback.ts`)

Two schemas, deliberately separate:

`callbackRequestSchema` → `CallbackRequest` (what the **patient** submits)

| Field | Type | Notes |
| --- | --- | --- |
| `preferredLanguage` | `"en" \| "hi" \| "kn"` | |
| `callbackTime` | `"call_me_now" \| "morning" \| "afternoon" \| "evening"` | |
| `reason` | `string` | 3–1000 chars |
| `patientName` | `string` | 2–200 chars |
| `phoneNumber` | `string` | Indian mobile: optional `+91`/`0` prefix, 10–15 digits |
| `consentToCallback` | literal `true` | Must be present and `true`; **no default** |

Strict — a client-supplied `ticketId`, `createdAt` or `status` is rejected.

`callbackTicketSchema` → `CallbackTicket` (what the **server** stores)

Adds: `ticketId` (server-generated), `createdAt` (ISO 8601 with timezone),
`status: "new" | "callback_scheduled" | "contacted" | "resolved"`.

Helper: `createCallbackTicket({ ticketId, createdAt, request })` builds a
valid `"new"` ticket from a validated request.

## Planned endpoints

> **Every endpoint in this table is PLANNED — NOT IMPLEMENTED.** Only
> `GET /api/health` exists. The rows are listed so schema usage stays consistent
> when Members 2–4 build them in later stages; paths are proposals, not settled
> routes.

| Method & path (proposed) | Purpose | Status | Schema to validate with |
| --- | --- | --- | --- |
| `POST /api/identify` | Bill image → identification candidates | **PLANNED — NOT IMPLEMENTED** | `billIdentificationSchema` |
| `POST /api/verify` | Check bill against hospital records | **PLANNED — NOT IMPLEMENTED** | `billVerificationSchema` |
| `GET /api/financials/:recordId` | Authorized financial detail | **PLANNED — NOT IMPLEMENTED** | `documentFinancialsSchema` |
| `POST /api/explain` | Generate patient explanation | **PLANNED — NOT IMPLEMENTED** | `explanationSchema` |
| `POST /api/callback` | Submit callback request | **PLANNED — NOT IMPLEMENTED** | `callbackRequestSchema` → `createCallbackTicket` |
| `POST /api/financials/confirm` | Patient confirms a field | **PLANNED — NOT IMPLEMENTED** | `financialFieldConfirmationSchema` |
| Access-code issue / redeem | Authentication for a bill | **PLANNED — NOT IMPLEMENTED**; no schema or storage designed yet | — (no schema exists) |

All future endpoints must additionally enforce authentication, authorization,
and same-origin checks before touching protected data; `GET /api/health` is the
only intentionally public route. Gemini, Supabase, auth, access codes and
endpoint wiring are explicitly out of scope so far.
