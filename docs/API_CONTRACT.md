# API Contract — Patient Financial Navigator**Status: nine endpoints are implemented — `GET /api/health`,
`POST /api/bills/identify`, `POST /api/bills/extract`,
`POST /api/bills/access/challenge`, `POST /api/bills/access/verify`,
`POST /api/bills/verify`, `GET /api/bills/financials`,
`POST /api/bills/explain` and `POST /api/bills/questions`.** The explanation
endpoint returns a validated,
server-assembled explanation for a verified session; it is no longer a
pending-validation gate. The questions endpoint answers one question about the
same session, and also writes every figure itself. Everything else in this
file describes shared data shapes implemented in `src/lib/schemas/`; it does
NOT mean an endpoint exists for them.

Implemented today: the validation layer (Zod schemas + inferred TypeScript types
exported from `@/lib/schemas`), liveness, bill identification (image upload with
local OCR, or a typed bill number), access-code authentication, verification
against synthetic hospital records, authorized financial detail, and a validated
public explanation endpoint backed by a replaceable GenAI provider port.

All non-health responses carry `cache-control: no-store`.

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
- **Tested by:** `src/app/api/health/route.test.ts` (4 tests).

### `POST /api/bills/identify`

Route handler: `src/app/api/bills/identify/route.ts` (exported `POST`). The
logic lives in `src/lib/identification/handler.ts`; the reading logic in
`src/lib/identification/service.ts`.

- **Purpose:** identification only — *what does this document appear to say?*
  It never says whether a bill is genuine. That is verification.
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

**How the status is decided:**

| Situation | Result |
| --- | --- |
| Hospital name **and** bill number read | `200`, `identified` |
| Exactly one of the two read (or only a typed number supplied) | `200`, `partial` + a warning naming what is missing |
| Too little legible text, or confidence below the floor | `200`, `unreadable_image`, all candidates `null` — nothing is guessed |
| Readable text that is not bill-like | `200`, `invalid_input` |
| OCR engine could not run at all | `503`, `{ "error": { "code": "ocr_unavailable", … } }` |
| Unexpected internal failure | `500`, `{ "error": { "code": "extraction_failed", … } }` |

An unreadable image is a **result**, never a verification outcome, and never a
fabricated value.

**Error bodies** are `{ "error": { "code", "message" } }`, with `message` safe to
show a patient (no paths, stack traces, engine messages or config):

| Code | HTTP | Cause |
| --- | --- | --- |
| `invalid_request` | 400 | Malformed JSON, missing/empty/invalid bill number, no image, bad field type |
| `empty_image` | 400 | Zero-byte upload |
| `unsupported_media_type` | 415 | Content is not a PNG/JPEG/BMP (magic bytes), or the request is neither multipart nor JSON |
| `payload_too_large` | 413 | Image over 8 MB, or a multipart body over 8 MB + 64 KB. Enforced **while the body is read**, so a chunked upload with no `content-length` is refused at the limit instead of after it has been buffered |
| `ocr_unavailable` | 503 | The OCR engine could not start or run |
| `extraction_failed` | 500 | Unexpected failure, or a result that failed schema validation |

**Never returned:** amounts, insurance or payment figures, diagnoses, patient
details, another bill's data, stack traces, or any configuration value — the
strict schema rejects them before a response is written, and the tests assert it
with a page that really does contain amounts.

**Uploads are not retained.** The bytes are read into memory for the duration of
one request and dropped when the response is written: nothing is written to
disk. Only Tesseract's `eng.traineddata` is cached (generated by the engine, not
patient data), in the OS temp directory.

**Tested by:** `handler.test.ts` (24), `service.test.ts` (23),
`extract.test.ts` (24), `image-input.test.ts` (12), `module-boundaries.test.ts`
(4). `npm run test:ocr` adds 8 more tests against the **real** engine.

### `POST /api/bills/extract`

Route handler: `src/app/api/bills/extract/route.ts` (exported `POST`). The logic
lives in `src/lib/document/handler.ts`; the reading logic in
`src/lib/document/extract.ts` and `src/lib/document/service.ts`.

- **Purpose:** report what is printed on the uploaded bill — hospital name, bill
  number, date, itemised charges, total, insurance-approved amount and
  patient-payable amount. It is **not** verification and does not consult a
  hospital record. Every response carries
  `"notice": "Read from the uploaded bill — not independently verified."`
- **Request:** `multipart/form-data` with `billImage` (PNG, JPEG or BMP, ≤ 8 MB;
  the type is decided from magic bytes). Anything else is `415`.
- **Response — `200`, exactly `billDocumentExtractionSchema`.** Every value
  carries the line it came from; a value that is not printed, or is printed more
  than once with different figures, is `null`:

  ```json
  {
    "readStatus": "readable",
    "hospitalName": { "value": "CITY GENERAL HOSPITAL", "evidence": { "lineNumber": 1, "text": "CITY GENERAL HOSPITAL" } },
    "billNumber": { "value": "INV-2026-0042", "evidence": { "lineNumber": 3, "text": "Bill No: INV-2026-0042" } },
    "billDate": { "value": "2026-10-01", "evidence": { "lineNumber": 4, "text": "Bill Date: 01-10-2026" } },
    "lineItems": [],
    "totalAmount": { "amountRupees": "15000", "evidence": { "lineNumber": 5, "text": "Total Amount: Rs 15000" } },
    "insuranceApprovedAmount": { "amountRupees": "5000", "evidence": { "lineNumber": 6, "text": "Insurance approved: Rs 5000" } },
    "patientPayableAmount": null,
    "currency": "INR",
    "warnings": ["No itemised charges could be read from this document."],
    "notice": "Read from the uploaded bill — not independently verified."
  }
  ```

- **Unreadable input:** `200` with `readStatus: "unreadable"`, every field
  `null`, `lineItems: []` and a warning that says no figures are shown. A blank
  or noise-only image never becomes an invented amount.
- **Errors:** the identification error vocabulary (`invalid_request` 400,
  `empty_image` 400, `unsupported_media_type` 415, `payload_too_large` 413,
  `ocr_unavailable` 503, `extraction_failed` 500).
- **Never returned:** a hospital-record amount, a verification verdict, a bill
  number that was not read, or the sample bill. The document module imports
  neither `@/lib/records` nor `@/lib/verification`, enforced by
  `src/lib/document/module-boundaries.test.ts`.
- **Uploads are not retained**, same as identification. Responses are
  `cache-control: no-store`.
- **Tested by:** `src/lib/document/handler.test.ts`, `service.test.ts`,
  `extract.test.ts`, `module-boundaries.test.ts`, plus
  `src/lib/services/billingService.test.ts`. `npm run test:ocr` exercises it
  against the real engine.

## Access-code endpoints

Access codes answer a question the other endpoints must not answer by accident:
*may this person see this bill at all?* The flow is two steps so that the bill
being unlocked is decided by the server, not by the client, and so that a short
code is never guessable on its own.

```bash
# Issue a code on the server (staff work, not an endpoint):
npm run access:issue -- --bill INV-2026-0042 --days 7
```

Codes are **single-use**, bound to one bill number, and printed once by the
script. Only a digest is stored. Both endpoints:

- require `application/json` (`415` otherwise);
- answer `503 access_unavailable` when `ACCESS_SECRET` is missing or shorter than
  32 characters — they fail closed rather than protect codes with a guessable
  secret;
- answer `500 access_failed` for an unexpected server failure;
- never reveal whether a bill exists: a challenge is issued for unknown bill
  numbers exactly like known ones.

### `POST /api/bills/access/challenge`

Route handler: `src/app/api/bills/access/challenge/route.ts`. Contract in
`src/lib/access/handler.ts`.

**Request** — exactly `accessChallengeRequestSchema`, strict:

```json
{ "billNumber": "INV-2026-0042" }
```

`billNumber`: 3–100 chars, letters, digits and `/ - _ .` (spaces allowed inside).
The client may not ask for a particular record, an expiry or an attempt count.

**Response — `200`, exactly `accessChallengeSchema`**

```json
{
  "challengeId": "0d0f6d1e-8f2a-4c2b-9a51-6a1f4b0c9e77",
  "billNumber": "INV-2026-0042",
  "expiresAt": "2026-10-18T10:05:00.000Z",
  "attemptsRemaining": 3
}
```

The challenge lives **5 minutes**; `attemptsRemaining` starts at `3`. It is
bound server-side to the bill number it was created for.

| Code | HTTP | Cause |
| --- | --- | --- |
| `invalid_request` | 400 | Malformed JSON, missing/invalid bill number, or any extra property |
| `payload_too_large` | 413 | Body over 64 KB, refused while reading |
| `unsupported_media_type` | 415 | Not `application/json` |
| `too_many_attempts` | 429 | The bill/client throttle is active; response carries `Retry-After` |
| `access_unavailable` | 503 | No usable `ACCESS_SECRET` |
| `access_failed` | 500 | Unexpected failure |

### `POST /api/bills/access/verify`

Route handler: `src/app/api/bills/access/verify/route.ts`.

**Request** — exactly `accessChallengeVerificationRequestSchema`, strict:

```json
{ "challengeId": "0d0f6d1e-8f2a-4c2b-9a51-6a1f4b0c9e77", "accessCode": "AB3DE-FGH7K" }
```

`accessCode`: 6–64 chars, letters/digits/dashes. Dashes are optional and
normalised away, so `ab3de-fgh7k` and `AB3DEFGH7K` are the same code. Note what
the body may **not** contain: a bill number, an outcome, an `isVerified` flag or
a challenge status. The bill is whatever the challenge was bound to; the object
is strict, so such a field is a `400`, not a bypass.

**Response — `200`, exactly `accessGrantSchema`**

```json
{
  "accessToken": "…opaque signed value…",
  "expiresAt": "2026-10-18T10:15:00.000Z",
  "billNumber": "INV-2026-0042"
}
```

On success the code is spent, the challenge is closed and a server-side session
is created. The token lasts **15 minutes**, is signed with a key derived from
`ACCESS_SECRET`, and is only accepted while the session it names exists and has
not expired. The response never contains the code or any bill contents.

**Refusals are deliberately uniform:**

| Code | HTTP | Cause |
| --- | --- | --- |
| `invalid_request` | 400 | Malformed JSON or a body that fails the schema |
| `payload_too_large` | 413 | Body over 64 KB, refused while reading |
| `access_denied` | 401 | Wrong code, expired challenge, already-answered challenge, unknown challenge — one message for all four, so the endpoint cannot be used to discover bills or codes |
| `too_many_attempts` | 429 | Challenge locked after 3 wrong answers, or the throttle is active. `Retry-After` is included when a remaining wait is known |
| `access_unavailable` | 503 | No usable `ACCESS_SECRET` |
| `access_failed` | 500 | Unexpected failure |

### `POST /api/bills/verify`

Route handler: `src/app/api/bills/verify/route.ts`. Logic in
`src/lib/verification/handler.ts` and `service.ts`.

- **Requires** `Authorization: Bearer <accessToken>` from the challenge flow.
  Missing, invalid, expired or restarted-away sessions get the same
  `401 access_denied`. The bill comes from the session, **never** from the body.
- **Requires** `application/json` (`415` otherwise). An empty body is accepted
  and treated as `{}`.
- **Body** (optional) — exactly `billVerificationRequestSchema`, strict:

  | Field | Notes |
  | --- | --- |
  | `hospitalName` | 2–300 chars; the name read off the bill, if any. A different hospital means `bill_not_found`. |
  | `financialCandidates` | Up to 20 `{ fieldKey, amountRupees }` readings. They can only **add** discrepancies, never remove one: supplied amounts equal to the record cannot turn an `amounts_differ` bill into a verified one (which would make the response a figures oracle). |
  | *(not allowed)* | `outcome`, `discrepancyKeys`, `billNumber`, or any "verified" flag — the object is strict. |

**Response — `200`, exactly `billVerificationSchema`**

```json
{
  "outcome": "verified",
  "message": "The hospital's record matches this bill.",
  "discrepancyKeys": []
}
```

| Outcome | Meaning |
| --- | --- |
| `verified` | The bill and the hospital's record agree. |
| `amounts_differ` | One or more tracked fields disagree; `discrepancyKeys` names them. |
| `bill_not_found` | No record for this bill (or the named hospital differs). |
| `hospital_not_registered` | The hospital issues bills but is not registered with us. |

**Never returned:** amounts, insurance or payment figures, patient details,
another bill's data, stack traces or configuration. Only field **keys** may
appear, and only for `amounts_differ`.

| Code | HTTP | Cause |
| --- | --- | --- |
| `invalid_request` | 400 | Malformed JSON, unexpected property, invalid candidate, or two candidates for one field |
| `access_denied` | 401 | No valid bearer session |
| `payload_too_large` | 413 | Body over 64 KB, refused while reading |
| `unsupported_media_type` | 415 | Not `application/json` |
| `access_unavailable` | 503 | No usable `ACCESS_SECRET` |
| `verification_failed` | 500 | Unexpected failure, or an invalid result |

The outcome is also stored on the server-side session, for the financials gate.

**Tested by:** `src/lib/verification/handler.test.ts` (18) and
`service.test.ts` (17), plus the records repository suite.

### `GET /api/bills/financials`

Route handler: `src/app/api/bills/financials/route.ts`.

- **Requires** `Authorization: Bearer <accessToken>` and a session that has
  already called `POST /api/bills/verify`.
- **Accepts no bill identifier at all** — no path parameter, no query string,
  no `isVerified` flag. The bill is the one the session proved.
- The record is **re-checked** before release; a stored `verified` outcome alone
  does not open the amounts.

**Response — `200`, exactly `documentFinancialsSchema`**

```json
{
  "billTotalAfterDiscounts": { "amountRupees": "15000", "status": "found", "evidence": null, "pageNumber": null, "confirmedByUser": false },
  "insuranceApprovedButNotPaid": { "amountRupees": "5000", "status": "found", "evidence": null, "pageNumber": null, "confirmedByUser": false },
  "insurancePaidOrCredited": { "amountRupees": "0", "status": "found", "evidence": null, "pageNumber": null, "confirmedByUser": false },
  "patientPayments": { "amountRupees": "10000", "status": "found", "evidence": null, "pageNumber": null, "confirmedByUser": false },
  "printedAmountDue": { "amountRupees": "10000", "status": "found", "evidence": null, "pageNumber": null, "confirmedByUser": false },
  "currency": "INR",
  "documentWarnings": ["These are the amounts held in the hospital's record, not a re-print of your bill."]
}
```

Every refusal path returns **no figures**:

| Code | HTTP | Cause |
| --- | --- | --- |
| `access_denied` | 401 | No valid bearer session |
| `bill_not_found` | 404 | The session's bill is no longer in the repository |
| `verification_required` | 409 | The session has not called verify yet |
| `amounts_differ` | 409 | The record still disagrees; body adds `discrepancyKeys` (keys only) |
| `hospital_not_registered` | 409 | The hospital is not registered |
| `access_unavailable` | 503 | No usable `ACCESS_SECRET` |
| `verification_failed` | 500 | Unexpected failure |

**Tested by:** `src/lib/verification/handler.test.ts`, including leak assertions
over every refusal path.

### `POST /api/bills/explain`

Route handler: `src/app/api/bills/explain/route.ts`. Contract in
`src/lib/explanation/handler.ts`; generation in `service.ts`.

- **Requires** `Authorization: Bearer <accessToken>` with a live session whose
  recorded outcome is `verified`.
- **Accepts only the language.** The body is strict:

  ```json
  { "language": "en" }
  ```

  `language` is `en`, `hi` or `kn`. No bill number, query parameter,
  `isVerified` flag or outcome is accepted. The bill comes from the session.
- The record is re-fetched by the session's bill number and re-verified before
  anything else happens.

**Response — `200`, exactly `explanationResponseSchema`**

```json
{
  "validation": "validated",
  "explanation": {
    "language": "en",
    "explanationText": "Bill total after discounts\nThis is the total amount billed after any reductions have been applied.\nHospital record: INR 15,000.",
    "verifiedRecordReference": { "recordId": "mock:INV-2026-0042", "billNumber": "INV-2026-0042" },
    "financialFactsUsed": [
      { "fieldKey": "billTotalAfterDiscounts", "amountRupees": "15000", "pageNumber": null }
    ],
    "datesUsed": [],
    "warnings": ["The hospital record supplied for this explanation contains no dates."],
    "notice": "Generated from hospital-provided bill information."
  },
  "sections": [
    {
      "fieldKey": "billTotalAfterDiscounts",
      "heading": "Bill total after discounts",
      "explanation": "This is the total amount billed after any reductions have been applied.",
      "amountRupees": "15000",
      "status": "found"
    }
  ]
}
```

The example is abbreviated: a real response has exactly five sections and five
matching facts, one per tracked field.

**How the response is assembled.** The model receives only the language and the
five allow-listed `fieldKey`s plus `found`/`missing`; it never sees an amount or
a date. It returns one short `{ fieldKey, explanation }` section per field. The
server then:

1. parses the draft with a strict shape; unknown, missing, duplicated or extra
   fields fail closed;
2. rejects prose containing any Unicode digit, currency, percentage, date word,
   high-value number word, or common coverage/eligibility/waiver/payment claim;
3. reads every amount from `record.recordAmounts[fieldKey]` and checks it
   against **that same field** (a correct number attached to another field is a
   mismatch);
4. localizes headings, renders `INR` values deterministically, keeps missing
   values `null` with an "unknown, not zero" warning, and parses the final
   object with `explanationResponseSchema`.

If the provider fails, times out, returns malformed output, or the draft fails
validation, the response is a deterministic server template
(`validation: "server_template"`) built from the same record. The raw draft is
discarded and never returned. The supplied synthetic records contain no dates,
so `datesUsed` is empty and a warning says so; date-like prose is rejected
rather than trusted.

| Code | HTTP | Cause |
| --- | --- | --- |
| `invalid_request` | 400 | Malformed JSON, missing/invalid language, or any extra property |
| `access_denied` | 401 | Missing, invalid or expired bearer session |
| `payload_too_large` | 413 | Body over 64 KB, refused while reading |
| `unsupported_media_type` | 415 | Not `application/json` |
| `verification_required` | 409 | The session has not called verify |
| `amounts_differ` | 409 | Discrepancy still unresolved; body adds `discrepancyKeys` (keys only) |
| `hospital_not_registered` | 409 | Hospital is not registered |
| `bill_not_found` | 404 | No record for the session's bill |
| `explanation_unavailable` | 503 | `GEMINI_API_KEY` is absent; no provider call and no draft |
| `access_unavailable` | 503 | No usable `ACCESS_SECRET` |
| `explanation_failed` | 500 | The final server assembly failed validation |

**Provider (server-side only):** Gemini `generateContent` over REST, configured
by `GEMINI_API_KEY` and `GEMINI_MODEL` (default `gemini-3.5-flash-lite`). The key
is sent in `x-goog-api-key`, never in the URL or a prompt, and provider error
bodies are discarded. The provider port is replaceable, so the tests inject a
fake without a live key.

**Tested by:** `src/lib/explanation/provider.test.ts` (12),
`validator.test.ts` (18), `service.test.ts` (15) and `handler.test.ts` (17),
plus `src/lib/schemas/explanation-response.test.ts` (8). All use a fake provider
or a fake HTTP transport; the automated suite makes no live call. Live spot
checks by hand on 2026-10-19, after the prompt fix, returned `validated` in
English, Hindi and Kannada (one synthetic bill per language).

**Prompt shape:** the system instruction names the target language and script,
forbids digits, number words, dates, percentages and currency in any spelling,
lists the exact claim words the validator rejects (in all three languages), and
gives per-field wording that avoids them — the insurance fields are described as
*approved awaiting settlement*, *settled* or *credited*, never *covered*. The
response schema fixes the section count at five. The validator itself is
unchanged: a draft that still uses a forbidden word falls back to the server
template.

### `POST /api/bills/questions`

Route handler: `src/app/api/bills/questions/route.ts` (exported `POST`). The
logic lives in `src/lib/questions/handler.ts`; the classification prompt in
`src/lib/questions/provider.ts`; the checks and server-side answer text in
`src/lib/questions/validator.ts`; the workflow in `src/lib/questions/service.ts`.

- **Purpose:** answer one natural-language question about the bill this session
  unlocked. The body cannot name a bill, an amount, an outcome or a verification
  flag — those come from the session and the record.
- **Content type:** `application/json`; anything else is `415`.
- **Request — exactly two fields, strict:**

  ```json
  { "question": "What amount is recorded as due?", "language": "en" }
  ```

  | Field | Required | Notes |
  | --- | --- | --- |
  | `question` | yes | Trimmed, 1–500 characters. Longer input is `400`, never truncated. |
  | `language` | yes | `en`, `hi` or `kn`. |

  An extra property — `billNumber`, `amountRupees`, `outcome`, `isVerified` — is
  `400`. A query string is ignored entirely.
- **Authorization:** a live bearer session whose recorded outcome is not `null`.
  The bill is resolved from the session, never the request, and the verdict is
  recomputed against the current record before anything is answered.

**Four question types, and who writes the answer**

| Type | Example | Answer written by | May contain a figure? |
| --- | --- | --- | --- |
| Meaning | "What does insurance approved mean?" | Gemini, after validation | no |
| Recorded fact | "What amount is recorded as due?" | **the server**, from `recordAmounts` | yes, the record's value |
| Discrepancy | "Why is my bill different?" | **the server**, from the verification result's field keys | no |
| Unsupported | "Should I sue the hospital?" | Gemini, after validation (or the server) | no |

Two kinds of clarification are answered by the server: when the question is too
vague to attach to one field, and when the model reports it cannot place the
question. The service never picks a field on the patient's behalf.

**Response — `200`, exactly `questionAnswerResponseSchema`**

```json
{
  "validation": "server_rendered",
  "answer": {
    "language": "en",
    "question": "What amount is recorded as due?",
    "answerType": "record_fact",
    "answerText": "Amount shown as due\nHospital record: INR 10,000.",
    "fieldKey": "printedAmountDue",
    "amountRupees": "10000",
    "verifiedRecordReference": { "recordId": "mock:INV-2026-0042", "billNumber": "INV-2026-0042" },
    "financialFactsUsed": [
      { "fieldKey": "printedAmountDue", "amountRupees": "10000", "pageNumber": null }
    ],
    "warnings": [],
    "notice": "This answer is informational. Amounts come only from the hospital's record."
  }
}
```

`validation` records provenance, not approval: `validated` means model prose
passed every check, `server_rendered` means the server wrote it. A draft that
fails is never labelled `validated`.

**How the boundary is enforced.**

1. The model receives the question, the five field **keys** with
   available/missing, and whether the bill is verified. No amount, date, bill
   number, hospital name, token or session id is sent.
2. The question is passed inside explicit data markers, and the system
   instruction says it is data — not instructions. Injection therefore has to
   defeat the output checks as well.
3. The draft is parsed strictly (`type`, `fieldKey`, `explanation`). A
   `record_fact` with no field is turned into a clarification, never a guess; a
   field on any other type fails the draft.
4. Model prose runs through the explanation validator's existing text checks:
   any digit in any script, currency, percentage, date word, high-value number
   word, or coverage/eligibility/waiver/payment claim rejects the whole draft.
5. `record_fact` answers are assembled **only** from
   `record.recordAmounts[fieldKey]`, re-checked with `validateFinancialFact`,
   and refused if the stored value does not satisfy `monetaryAmountSchema`.
   The model's sentence is discarded entirely.
6. A bill with an unresolved difference may be asked about — that is how a
   discrepancy question is answered — but its figures are never released: a
   figure question on such a bill returns an `unsupported` answer with no
   amount. The same applies when re-verification no longer reports `verified`.

| Code | HTTP | Cause |
| --- | --- | --- |
| `invalid_request` | 400 | Malformed JSON, empty/oversized question, unsupported language, or any extra property |
| `access_denied` | 401 | Missing, invalid or expired bearer session |
| `payload_too_large` | 413 | Body over 64 KB, refused while reading |
| `unsupported_media_type` | 415 | Not `application/json` |
| `verification_required` | 409 | The session has not called verify |
| `hospital_not_registered` | 409 | Hospital is not registered |
| `bill_not_found` | 404 | No record for the session's bill |
| `question_unavailable` | 503 | `GEMINI_API_KEY` is absent; no provider call and no answer |
| `access_unavailable` | 503 | No usable `ACCESS_SECRET` |
| `question_failed` | 500 | The assembled answer failed its own schema |

A provider failure, timeout or rejected draft is **not** an error status: the
answer is a `200` with `answerType: "unavailable"` and server-written text, so
the patient is told plainly that no answer was prepared rather than shown a
plausible invention.

**Tested by:** `src/lib/questions/provider.test.ts` (15),
`validator.test.ts` (15), `service.test.ts` (17) and `handler.test.ts` (14),
plus `src/lib/schemas/questions.test.ts` (16). All use a fake provider; the
suite makes no live call.

**Limitations (deliberate, for this stage).** Classification is the model's
judgement, so a meaning question can occasionally be answered as `unsupported`,
or vice versa — the cost of a wrong classification is a less useful answer, not
an unreleased or invented figure. The synthetic records carry no dates, so no
answer can say when something happened; a question about a date gets a meaning
or unsupported answer, never a date. There is no conversation memory: each
request is one question with no history, and no rate limit beyond the shared
in-memory access state.

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
7. **A bill identifier never comes from the request** on a protected endpoint,
   and no client-supplied boolean decides access.

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

## Access codes (`access.ts`)

| Schema | Purpose |
| --- | --- |
| `accessChallengeRequestSchema` | Step 1 request: `{ billNumber }`, strict. |
| `accessChallengeSchema` | Step 1 response: `challengeId`, `billNumber`, `expiresAt`, `attemptsRemaining`. |
| `accessChallengeVerificationRequestSchema` | Step 2 request: `{ challengeId, accessCode }`, strict. |
| `accessGrantSchema` | Step 2 response: `accessToken`, `expiresAt`, `billNumber`. |
| `storedAccessCodeSchema` | Server-side only: `codeDigest` (64 hex), `billNumber`, `expiresAt`, `consumedAt`. Never returned. |

`accessCodeSchema` accepts 6–64 letters/digits/dashes; `accessBillNumberSchema`
is 3–100 chars of letters, digits and `/ - _ .`. Matching normalises case and
whitespace, so `inv-2026-0042` and `INV-2026-0042` are the same bill.

## Bill verification (`verification.ts`)

`billVerificationSchema` → type `BillVerification`

| Field | Type | Notes |
| --- | --- | --- |
| `outcome` | `"verified" \| "amounts_differ" \| "bill_not_found" \| "hospital_not_registered"` | Exactly these four |
| `message` | `string` | Patient-safe wording; must not quote amounts |
| `discrepancyKeys` | `FinancialFieldKey[]` | Only for `amounts_differ`; default `[]`. **Keys only, never values** |

`billVerificationRequestSchema` → type `BillVerificationRequest` — the optional
body described under `POST /api/bills/verify`; strict, and it has no bill
number and no outcome field.

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

`explanationResponseSchema` → type `ExplanationResponse` is the additive public
shape used by `POST /api/bills/explain`. It adds `validation`
(`validated` | `server_template`) and exactly five `sections`
(`fieldKey`, localized `heading`, safe `explanation`, server-rendered
`amountRupees`, `status`). Cross-field rules require one section per tracked
field, no duplicate section or fact keys, and the same key set in sections and
`financialFactsUsed`. `amountRupees` must be `null` exactly when `status` is
`missing`; a model cannot supply a value because the provider draft has no
amount field.

## Bill questions (`questions.ts`)

`questionRequestSchema` → `QuestionRequest`

| Field | Type | Notes |
| --- | --- | --- |
| `question` | `string` | Trimmed, 1–500 characters (`MAX_QUESTION_LENGTH`) |
| `language` | `"en" \| "hi" \| "kn"` | |

Strict — a client-supplied `billNumber`, `amountRupees`, `outcome` or
`isVerified` is rejected.

`questionAnswerSchema` → `QuestionAnswer`

| Field | Type | Notes |
| --- | --- | --- |
| `language` | `"en" \| "hi" \| "kn"` | |
| `question` | `string` | Echoed back, so screen readers can read both together |
| `answerType` | `meaning` \| `record_fact` \| `discrepancy` \| `clarification` \| `unsupported` \| `unavailable` | What the answer is |
| `answerText` | `string` | 1–4000 chars |
| `fieldKey` | `FinancialFieldKey \| null` | Set only for `record_fact` |
| `amountRupees` | decimal string \| `null` | Rendered from the record; only `record_fact` may carry one |
| `verifiedRecordReference` | `{ recordId, billNumber } \| null` | Set only for `record_fact` |
| `financialFactsUsed` | `FinancialFact[]` | Exactly one fact for `record_fact`, empty otherwise |
| `warnings` | `string[]` | e.g. "unknown, not zero" for a missing value |
| `notice` | literal `"This answer is informational. Amounts come only from the hospital's record."` | Exact match required |

Cross-field rules, enforced by `superRefine`: a `record_fact` answer must name
its field, cite the record, and carry exactly one fact whose `fieldKey` and
`amountRupees` match the answer. Every other answer type must leave `fieldKey`,
`amountRupees`, `verifiedRecordReference` and `financialFactsUsed` empty. A
meaning or refusal answer therefore cannot carry a figure, by construction.

`questionAnswerResponseSchema` → `QuestionAnswerResponse` adds `validation`
(`validated` | `server_rendered`) around the answer.

The schema cannot compare a figure with the record — that happens in
`src/lib/questions/validator.ts`, against the same field, exactly as the
explanation path does it.

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

> **Every endpoint in this table is PLANNED — NOT IMPLEMENTED.** The rows are
> listed so schema usage stays consistent when later stages build them; paths
> are proposals, not settled routes.

| Method & path (proposed) | Purpose | Status | Schema to validate with |
| --- | --- | --- | --- |
| `POST /api/callback` | Submit callback request | **PLANNED — NOT IMPLEMENTED** | `callbackRequestSchema` → `createCallbackTicket` |
| `POST /api/financials/confirm` | Patient confirms a field | **PLANNED — NOT IMPLEMENTED** | `financialFieldConfirmationSchema` |
| Staff code issuing | Issue access codes from a dashboard | **PLANNED — NOT IMPLEMENTED**; today it is `npm run access:issue` on the server | — |

All future endpoints must additionally enforce authentication, authorization,
same-origin checks and rate limiting before touching protected data.
`GET /api/health` is intentionally public. `POST /api/bills/identify` is also
public today: it returns nothing the caller did not send, but it has no rate
limit or same-origin check yet. The access-code endpoints are authenticated by
the code itself but are not same-origin checked. Gemini, a real hospital
integration, patient accounts and staff auth remain out of scope.
