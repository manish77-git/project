# Stage 4 Report — Amount/Date Validation and Public Explanations

**Date:** 2026-10-19
**Branch:** `feat/stage2-verification`
**Scope:** Stage 4 only. Stage 2 verification, record retrieval, authorization and
the Stage 3 provider port were preserved.

## Baseline

The Stage 3 recorded baseline was **355 tests in 28 files**, lint clean,
`tsc --noEmit` clean, and a successful production build. The Stage 4 work is
additive: the provider port, verification gates and response schemas remain
compatible. The public `POST /api/bills/explain` endpoint previously stopped at
`501 explanation_validation_pending` and never called the provider.

## What changed

### New

- `src/lib/explanation/validator.ts` — strict draft validation, INR/decimal
  normalization, field-association checks, multilingual claim checks and the
  deterministic server template.
- `src/lib/explanation/validator.test.ts` — 16 adversarial validator tests.
- `src/lib/explanation/__fixtures__/fake-explanation-provider.ts` — hermetic
  provider used by the service and handler suites.
- `src/lib/schemas/explanation-response.test.ts` — 8 public-response schema tests.

### Updated

- `src/lib/explanation/provider.ts` — the model now receives only the language
  and five field keys with `found`/`missing`. It no longer receives amounts and
  no longer returns free-form `explanationText`; it returns one section per
  field.
- `src/lib/explanation/service.ts` — the authorized workflow, draft validation,
  record-derived assembly and template fallback.
- `src/lib/explanation/handler.ts` — removes the pending `501`, adds the missing
  provider `503`, and returns only the final `explanationResponseSchema`.
- `src/app/api/bills/explain/route.ts` — wires the existing provider factory and
  the verified-session workflow into the public POST route.
- `src/lib/explanation/handler.test.ts`, `service.test.ts`, `provider.test.ts` —
  updated for the structured contract and adversarial cases.
- `src/lib/schemas/explanation.ts` — additive `ExplanationResponse` and
  `ExplanationSection` schemas. `explanationSchema` and the financial
  confirmation contracts are unchanged.
- `.env.example`, `README.md`, `docs/API_CONTRACT.md`,
  `docs/ARCHITECTURE.md`, `docs/TEST_PLAN.md` — Stage 4 behavior, counts and
  limitations.

## Design

The model never sees an amount or a date. It receives:

```text
language: en | hi | kn
fields: [
  { fieldKey: "billTotalAfterDiscounts", status: "found" | "missing" },
  ...
]
```

and returns:

```json
{
  "sections": [
    { "fieldKey": "billTotalAfterDiscounts", "explanation": "What this means." }
  ]
}
```

The server then:

1. Parses the draft strictly. Exactly five allow-listed fields, once each; no
   extra keys or fields.
2. Rejects prose containing any Unicode digit, currency symbol/code, percentage,
   month/relative date word, high-value number word, or common
   coverage/eligibility/waiver/payment-obligation claim.
3. Reads each amount from `record.recordAmounts[fieldKey]` and checks it against
   **that same field**. A correct number on the wrong field is still a mismatch.
4. Localizes headings, renders `INR` values deterministically, keeps missing
   values `null` with an "unknown, not zero" warning, and parses the final object
   with `explanationResponseSchema`.
5. Uses a deterministic server template if the provider fails, times out,
   returns malformed output, or the draft fails validation. The raw draft is
   discarded.

`parseAmountToCanonical` normalizes Indian/Western thousands separators,
`₹`/`INR`/`Rs.` prefixes and trailing fractional zeros. It rejects exponents,
negatives, more than two decimal places and non-ASCII digits. Dates are never
rendered because the synthetic records have none; date-like model prose is
rejected and the response warns that no dates were supplied.

## Endpoint behavior

### Before

- Verified session → `501 explanation_validation_pending`.
- No provider call.
- No explanation text, facts or reference returned.

### After

- Verified session + configured provider → `200` validated
  `explanationResponseSchema`, with server-rendered amounts.
- Missing `GEMINI_API_KEY` → `503 explanation_unavailable`, no draft.
- Unverified/expired/discrepant/missing/unregistered session → the existing
  safe `400`/`401`/`404`/`409` response, no provider call.
- Provider/draft failure → `200` with `validation: "server_template"` and a
  record-derived explanation, never the raw draft.
- Final assembly failure → `500 explanation_failed`, no details.

## Adversarial coverage

| Case | Result |
| --- | --- |
| Correct amounts, different separators/prefixes | accepted |
| Incorrect amount | `amount_mismatch` / template |
| Correct number on the wrong field | `amount_mismatch` / template |
| Invented amount, percentage or date | template |
| ASCII, Hindi and Kannada digits | template |
| Currency symbols/codes | template |
| Lowercase/capitalized month and relative dates | template |
| High-value number words (`fifteen thousand`, `हज़ार`, `ಸಾವಿರ`) | template |
| Missing amount | `null` + warning, never zero |
| Missing dates | `datesUsed: []` + warning |
| Insurance/eligibility/waiver/payment claims in `en`/`hi`/`kn` | template |
| Unknown, missing, duplicate or extra field | template |
| `confirmedByUser` or model-supplied facts/reference/dates | rejected by strict schema |
| Malformed JSON, timeout, HTTP error, blocked prompt | template |
| No API key | `503` with no draft |
| Unverified, expired, `amounts_differ`, missing bill, unregistered hospital | refused before provider |

All fixtures are synthetic. No test uses a real hospital record or patient data.

## Verification results

| Check | Result |
| --- | --- |
| `npm test` | **385 passed / 385**, 30 files, exit 0 (after the prompt-compliance fix below) |
| Explanation suites | **70 passed / 70** (provider 12, validator 18, service 15, handler 17, response schema 8) |
| `npm run test:ocr` | **8 passed / 8**, exit 0 |
| `npm run lint` | 0 errors, 0 warnings, exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0, 9 routes including `/api/bills/explain` |
| Local route smoke test | challenge → verify → bill verify → explain returned `503 explanation_unavailable` with no key and `cache-control: no-store`; no provider call |

## Live provider status

**The automated suite does not call the real Gemini provider.** Every
explanation test injects a fake provider; every adapter test injects a fake HTTP
transport. The adapter's request shape, key header, error mapping and timeout
handling are covered by those tests.

A one-off manual verification on 2026-10-19, before the prompt fix below, used
the configured `gemini-3.5-flash-lite` provider with synthetic fields only:

- 3 of 3 direct provider calls completed successfully and returned JSON.
- 2 drafts passed `validateProviderDraft`; 1 was rejected safely as an
  unsupported claim.
- Over the public endpoint, 2 of 3 requests returned `validation: "validated"`;
  1 returned `validation: "server_template"` because its live draft failed the
  guard.
- No API key, access code or token was printed, and no real patient data was
  used.

Live inference works, but the model remains variable, so the safe template
fallback is a normal outcome, not a failure.

### Follow-up: prompt compliance with the validator

**Cause of the original `unsupported_claim` rejection.** The raw live draft was
not persisted, so it can only be reconstructed. The old prompt told the model
to render field meanings and only said "do not discuss insurance coverage",
while the validator rejects the bare word `cover`/`covered`/`coverage` in any
sentence, including a denial such as "not covered". Any neutral sentence for
`insuranceApprovedButNotPaid` — the natural one being "approved to cover but not
yet paid" — therefore failed even with no amount anywhere. That sentence is
reproduced in `validator.test.ts` and `service.test.ts` and still fails, so the
validator is unchanged.

**Fix (prompt and schema only).** `provider.ts` now:

- names the target language and script for each of English, Hindi and Kannada;
- forbids digits in any script, number words, dates, percentages, currency and
  identifiers, and explains it per language;
- lists the exact claim words the validator rejects in all three languages,
  explicitly including denials;
- gives per-field wording: insurers *approve / settle / credit*, never *cover*;
  the printed due amount is what the bill *shows*, never what the patient owes
  or must pay;
- pins the response schema to exactly five sections with descriptions, so the
  model returns one explanation per supplied key.

**Coverage added.** Prompt-aligned drafts validate in `en`, `hi` and `kn`
(fixture `__fixtures__/prompt-aligned-drafts.ts`), each of the validator's
rejected claim patterns is tested per language, and the live-style "cover"
sentence is asserted to fall back without its text leaving the server.

**Live verification after the fix: performed in all three languages.** The first
environment had no `GEMINI_API_KEY`, so the check was deferred. It was then run
against the configured provider through the existing `scripts/live-smoke.ts`
driver, which performs the full challenge → access verification → bill
verification → explanation workflow on the synthetic bill `INV-2026-0042` and
prints no key, access code, token, raw draft or amount. One explanation request
was made per language:

| Language | HTTP | `validation` | `explanationResponseSchema` | Facts/sections vs record | Sentences vs template |
| --- | --- | --- | --- | --- | --- |
| English (`en`) | 200 | `validated` | conforms | 5/5 and 5/5 match | 5/5 differ |
| Hindi (`hi`) | 200 | `validated` | conforms | 5/5 and 5/5 match | 5/5 differ |
| Kannada (`kn`) | 200 | `validated` | conforms | 5/5 and 5/5 match | 5/5 differ |

Every response carried `validation: "validated"`, so each was validated Gemini
output rather than the deterministic fallback; the differing sentences are the
independent confirmation that the fallback template was not returned. The
validator was not changed to achieve this, and no API key, access code, bearer
token, raw draft or amount appeared in the test output.

These are **spot checks, not a success rate.** One request per language on one
synthetic bill does not establish a general pass rate or production readiness,
and it says nothing about other bills or other prompts. Model output stays variable, so a
later request can still fall back to the server template.

## Environment

- `ACCESS_SECRET` — required by the access and verified-session endpoints.
- `GEMINI_API_KEY` — required for `POST /api/bills/explain`; absent ⇒ `503`.
- `GEMINI_MODEL` — optional; default `gemini-3.5-flash-lite`.
- `DATABASE_URL` / `ACCESS_CODES_FILE` — optional access-code storage, unchanged.

## Remaining limitations

- Live inference is spot-checked manually, not part of the automated suite. The
  2026-10-19 post-fix checks returned `validated` in English, Hindi and Kannada,
  but one request per language is not a success rate. Model output varies, so a
  request can still fall back to the server template when a draft violates the
  safety guard, and the claim filter is lexical so it can reject legitimate
  wording.
- Access-session state (challenges, attempt counters, tokens) is held in
  memory, so a restart invalidates live tokens; production needs a shared store
  behind the same interface.
- The synthetic records contain no dates, so `datesUsed` is always empty. A real
  record adapter with dates would need an authoritative date field and the same
  association checks before dates could be rendered.
- Prose checks are defense in depth, not semantic understanding. A model could
  still phrase a meaning poorly without using a number; the response's amounts
  remain server-derived, but prose quality and factual phrasing are not
  automatically verified.
- The endpoint still has no same-origin check or rate limiting, and there is no
  frontend caller.
- No live database or real hospital integration is exercised by the tests.
