-- 001_init.sql — Patient Financial Navigator (plain PostgreSQL 14+)
-- Mirrors the Zod data contract in src/lib/schemas/ and docs/API_CONTRACT.md.
-- Run: psql "$DATABASE_URL" -f db/migrations/001_init.sql

begin;

create extension if not exists pgcrypto;  -- gen_random_uuid(), crypt()

-- ---------------------------------------------------------------- hospitals
create table hospitals (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 2 and 300),
  registration_no text unique,
  created_at      timestamptz not null default now()
);

-- -------------------------------------------------------------------- bills
-- Hospital-side records. Used for verification (POST /api/bills/verify).
create table bills (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references hospitals(id) on delete restrict,
  bill_number text not null
              check (bill_number ~ '^[A-Za-z0-9/._-]{3,100}$'),
  currency    text not null default 'INR' check (currency = 'INR'),
  created_at  timestamptz not null default now(),
  unique (hospital_id, bill_number)
);

create index bills_bill_number_idx on bills (bill_number);

-- ---------------------------------------------------------- bill_financials
-- The five tracked fields, one row each. Money is NUMERIC, never float.
-- API layer converts to decimal strings (^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$).
create type field_key as enum (
  'billTotalAfterDiscounts',
  'insuranceApprovedButNotPaid',
  'insurancePaidOrCredited',
  'patientPayments',
  'printedAmountDue'
);

create table bill_financials (
  bill_id           uuid not null references bills(id) on delete cascade,
  field_key         field_key not null,
  amount_rupees     numeric(12,2) check (amount_rupees >= 0),
  status            text not null check (status in ('found','ambiguous','missing')),
  evidence          text,
  page_number       integer check (page_number > 0),
  confirmed_by_user boolean not null default false,
  confirmed_at      timestamptz,
  primary key (bill_id, field_key),
  -- "Missing is not zero": found needs an amount, missing must have none.
  constraint found_has_amount   check (status <> 'found'   or amount_rupees is not null),
  constraint missing_has_no_amt check (status <> 'missing' or amount_rupees is null),
  -- Only an explicit patient action may confirm, and it must be timestamped.
  constraint confirm_has_time   check (confirmed_by_user = (confirmed_at is not null))
);

-- ------------------------------------------------------------- access_codes
-- Authentication for a bill. Store only a hash, never the code itself.
create table access_codes (
  id              uuid primary key default gen_random_uuid(),
  bill_id         uuid not null references bills(id) on delete cascade,
  code_hash       text not null,
  expires_at      timestamptz not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until    timestamptz,
  redeemed_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index access_codes_bill_idx on access_codes (bill_id);

-- ---------------------------------------------------------- callback_tickets
create table callback_tickets (
  ticket_id           uuid primary key default gen_random_uuid(),
  bill_id             uuid references bills(id) on delete set null,
  preferred_language  text not null check (preferred_language in ('en','hi','kn')),
  callback_time       text not null
                      check (callback_time in ('call_me_now','morning','afternoon','evening')),
  reason              text not null check (char_length(reason) between 3 and 1000),
  patient_name        text not null check (char_length(patient_name) between 2 and 200),
  phone_number        text not null
                      check (phone_number ~ '^(\+91|0)?[0-9]{10,15}$'),
  -- Explicit consent is mandatory; there is no default.
  consent_to_callback boolean not null check (consent_to_callback),
  consent_at          timestamptz not null default now(),
  status              text not null default 'new'
                      check (status in ('new','callback_scheduled','contacted','resolved')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index callback_tickets_status_idx on callback_tickets (status, created_at);

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger callback_tickets_updated_at
  before update on callback_tickets
  for each row execute function set_updated_at();

commit;