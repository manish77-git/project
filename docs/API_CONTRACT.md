# API Contract — Patient Financial Navigator

**Status: two endpoints are implemented — `GET /api/health` and
`POST /api/bills/identify`, both documented below. Everything else in this file
describes the shared data shapes implemented in `src/lib/schemas/`; it does NOT
mean an endpoint exists for them.**

Implemented today: the validation layer (Zod schemas + inferred TypeScript types
exported from `@/lib/schemas`), the liveness endpoint, and bill identification
(image upload with local OCR, or a typed bill number). Every endpoint listed in
[Planned endpoints](#planned-endpoints) is **planned and not implemented**.

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

### `POST /api/bills/identify`

Route handler: `src/app/api/bills/identify/route.ts` (exported `POST`). The
logic lives in `src/lib/identification/handler.ts`; the reading logic in
`src/lib/identification/service.ts`.

- **Purpose:** identification only — *what does this document appear to say?*
  It never says whether a bill is genuine. That is verification, which is
  **not implemented** and is deliberately absent from this module.
- **Content types accepted:** `multipart/form-data` (image upload) or
  `application/json` (typed bill number). Anything else is `415`.

**A. Image upload** — `multipart/form-data`

| Field | Required | Notes |
| --- | --- | --- |
| `billImage` | yes | PNG, JPEG or BMP, ≤ 8 MB. The type is decided from the file's **magic bytes**, not the declared `Content-Type`. |
| `billNumber` | no | Fallback used only when no bill number could be read from the image. Held to the **same rule as case B** and rejected with `400` if it fails — it is client input on this path too, and is never truncated to fit or echoed back unvalidated. |

An empty `billImage` field with a typed `billNumber` is treated as a manual
entry (case B).

**B. Manual entry** — `application/json`

| Field | Required | Notes |
| --- | --- | --- |
| `billNumber` | yes | 3–100 chars; letters, digits and `/ - _ .` only. Rejected with `400` otherwise. |
| `hospitalName` | no | 2–300 chars. Supplying it is what allows `identified` without an image. |

The object is strict: an unexpected property (for example `status` or
`amountRupees`) is rejected with `400`.

**Response — `200`, exactly `billIdentificationSchema`**

```json
{
  "hospitalNameCandidate": "CITY GENERAL HOSPITAL",
  "hospitalIdentifierCandidate": null,
  "billNumberCandidate": "INV-2026-0042",
  "identificationStatus": "identified",
  "warnings": []
}
```

No engine name, timing, or any other metadata is added, so the response can be
validated with the schema itself. Headers include `cache-control: no-store`.

**How the status is decided** (this is the part callers care about):

| Situation | Result |
| --- | --- |
| Hospital name **and** bill number read | `200`, `identified` |
| Exactly one of the two read (or only a typed number supplied) | `200`, `partial` + a warning naming what is missing |
| Too little legible text, or confidence below the floor | `200`, `unreadable_image`, all candidates `null`, all candidates stayed `null` — nothing is guessed |
| Readable text that is not bill-like | `200`, `invalid_input` |
| OCR engine could not run at all | `503`, `{ "error": { "code": "ocr_unavailable", … } }` |
| Unexpected internal failure | `500`, `{ "error": { "code": "extraction_failed", … } }` |

An unreadable image is a **result**, never a verification outcome, and never a
fabricated value. Extraction failure is deliberately **not** a status inside the
schema: a broken engine is an HTTP-level error, not an identification result.

**Error bodies** are `{ "error": { "code", "message" } }`, with `message` safe to
show a patient (no paths, stack traces, engine messages or config):

| Code | HTTP | Cause |
| --- | --- | --- |
| `invalid_request` | 400 | Malformed JSON, missing/empty/invalid bill number, no image, bad field type, unsupported content type |
| `empty_image` | 400 | Zero-byte upload |
| `unsupported_media_type` | 415 | Content is not a PNG/JPEG/BMP (magic bytes), or the request is neither multipart nor JSON |
| `payload_too_large` | 413 | > 8 MB, refused from `content-length` before the body is buffered |
| `ocr_unavailable` | 503 | The OCR engine could not start or run |
| `extraction_failed` | 500 | Unexpected failure, or a result that failed schema validation |

**Never returned:** amounts, insurance or payment figures, diagnoses, patient
details, another bill's data, stack traces, or any configuration value — the
strict schema rejects them before a response is written, and the tests assert it
with a page that really does contain amounts.

**Uploads are not retained.** The bytes are read into memory for the duration of
one request and dropped when the response is written: nothing is written to
disk, and there is no database. Only Tesseract's `eng.traineddata` is cached
(generated by the engine, not patient data), in the OS temp directory.

**Tested by:** `src/lib/identification/handler.test.ts` (24 tests, the full HTTP
contract), `service.test.ts` (23), `extract.test.ts` (24), `image-input.test.ts`
(12), `module-boundaries.test.ts` (4). The handler suite includes a test that
the multipart fallback and JSON entry return the *same* `400` body for the same
bad number, so the two entry paths cannot drift apart again. `npm run test:ocr` adds 8 more tests
against the **real** engine and real PNG/JPEG files, including a generated page
containing `Rs 15000` and `Rs 5000` that must not appear in the response.

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
| `POST /api/verify` | Check bill against hospital records | **PLANNED — NOT IMPLEMENTED** | `billVerificationSchema` |
| `GET /api/financials/:recordId` | Authorized financial detail | **PLANNED — NOT IMPLEMENTED** | `documentFinancialsSchema` |
| `POST /api/explain` | Generate patient explanation | **PLANNED — NOT IMPLEMENTED** | `explanationSchema` |
| `POST /api/callback` | Submit callback request | **PLANNED — NOT IMPLEMENTED** | `callbackRequestSchema` → `createCallbackTicket` |
| `POST /api/financials/confirm` | Patient confirms a field | **PLANNED — NOT IMPLEMENTED** | `financialFieldConfirmationSchema` |
| Access-code issue / redeem | Authentication for a bill | **PLANNED — NOT IMPLEMENTED**; no schema or storage designed yet | — (no schema exists) |

Bill identification was built as `POST /api/bills/identify` rather than the
`POST /api/identify` proposed above: the `bills` segment leaves room for
`/api/bills/verify` and friends, so the collection can grow per bill.

All future endpoints must additionally enforce authentication, authorization,
and same-origin checks before touching protected data. `GET /api/health` is
intentionally public; `POST /api/bills/identify` is also public today and
returns nothing the caller did not send, but it has no rate limit or same-origin
check yet — hardening it belongs with the access-code stage. Gemini, Supabase,
auth, access codes and hospital records remain out of scope.
