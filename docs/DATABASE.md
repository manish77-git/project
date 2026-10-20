# Database — Patient Financial Navigator

PostgreSQL 14+ (developed on 17). Owner: database/backend member.
All SQL lives in `db/`. The app talks to Postgres only from server code.

## Set up locally

1. Install PostgreSQL and pgAdmin 4 (postgresql.org/download). Remember the `postgres` password.
2. In pgAdmin, create a database named `navigator`.
3. In its Query Tool, run `db/migrations/001_init.sql`, then `db/seed.sql` (once each).
4. Copy `.env.example` to `.env.local` and put your real password in `DATABASE_URL`.
5. Check the connection: `node --env-file=.env.local scripts/db-test.mjs`
   should print `Rows in bill_financials: 10`.

Each teammate runs their own local database. Never commit `.env.local`.

## Tables

| Table | Purpose |
| --- | --- |
| `hospitals` | Hospital name and registration number |
| `bills` | Hospital-side bill records, unique per (hospital, bill number) |
| `bill_financials` | The five tracked fields per bill (money is `NUMERIC(12,2)`) |
| `access_codes` | Bcrypt-hashed codes with expiry and lockout counters |
| `callback_tickets` | Patient callback requests; consent is required by a `CHECK` |

Rules the database enforces (same as `docs/API_CONTRACT.md`):
- `found` needs an amount; `missing` must have none ("missing is not zero").
- Only an explicit patient action sets `confirmed_by_user` (and `confirmed_at`).
- A callback ticket cannot be saved without `consent_to_callback = true`.

## Functions for API routes (`src/lib/db/queries.ts`)

```ts
import { getDb } from "@/lib/db/client";
import { findBill, getFinancials, saveCallbackTicket } from "@/lib/db/queries";

const db = getDb();
const bill = await findBill(db, "City General Hospital", "INV-2026-0042"); // BillRecord | null
const fields = await getFinancials(db, bill.billId);                       // FinancialFields
const ticket = await saveCallbackTicket(db, requestBody, bill.billId);     // CallbackTicket
```

- `findBill` returns **no amounts**. Verification and identification stay separate.
- `getFinancials` must only be called **after** the access code is validated.
- All inputs are passed as SQL parameters (no string-built SQL).
- Rows are validated with the shared Zod schemas before they leave this layer.

## Access codes (`src/lib/db/access-codes.ts`)

```ts
import { issueAccessCode, redeemAccessCode } from "@/lib/db/access-codes";

const issued = await issueAccessCode(db, bill.billId);          // { code, expiresAt, ... }
const result = await redeemAccessCode(db, bill.billId, input); // see statuses below
```

- Only a bcrypt hash is stored; `issueAccessCode` returns the plain code once.
- Statuses: `ok`, `invalid` (with `attemptsLeft`), `locked`, `expired`, `not_found`.
- 5 wrong guesses lock the bill for 15 minutes; even the right code is refused while locked.
- A code is reusable until it expires (`redeemed_at` records the first use). It is NOT single-use.
- Show the same message for `not_found` and `invalid`, and rate-limit by IP in the API layer.
- Only call `getFinancials` after `redeemAccessCode` returns `ok`.

## Testing

- `npm test` runs hermetic unit tests with a fake database. No Postgres needed.
- `npm run test:db` runs `src/lib/db/integration.test.ts` against your REAL local
  database (needs `.env.local` and the migration + seed applied). This is the proof
  that the schema, constraints and queries work end to end.

## Known gaps

- Verification/explanation routes may still use an in-code record repository
  instead of these Postgres functions until they are wired up.
- The database runs locally. A hosted Postgres is needed if the demo must be online.
- No automatic migration runner yet: run the SQL files by hand (pgAdmin or `psql`).

## Seed data

`db/seed.sql` is synthetic. Demo access code for bill `INV-2026-0042` is `DEMO-1234`.
Never put real patient or hospital data in the repo.

