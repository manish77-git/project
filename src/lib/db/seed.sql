-- seed.sql — SYNTHETIC DATA ONLY. Never put real patient or hospital data here.
-- Run after migrations: psql "$DATABASE_URL" -f db/seed.sql

begin;

insert into hospitals (id, name, registration_no) values
  ('11111111-1111-1111-1111-111111111111', 'CITY GENERAL HOSPITAL', 'REG-DEMO-001'),
  ('22222222-2222-2222-2222-222222222222', 'SUNRISE MEDICAL CENTRE', 'REG-DEMO-002');

insert into bills (id, hospital_id, bill_number) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'INV-2026-0042'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'SMC/2026/118');

-- Bill 1: everything found.
insert into bill_financials (bill_id, field_key, amount_rupees, status, evidence, page_number) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'billTotalAfterDiscounts',     50000.00, 'found', 'Net payable 50000', 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'insuranceApprovedButNotPaid', 30000.00, 'found', 'Insurer approved 30000', 2),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'insurancePaidOrCredited',     15000.00, 'found', 'Insurer paid 15000', 2),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'patientPayments',              5000.00, 'found', 'Advance paid 5000', 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'printedAmountDue',            30000.00, 'found', 'Balance due 30000', 1);

-- Bill 2: exercises the "missing" and "ambiguous" cases (missing is NOT zero).
insert into bill_financials (bill_id, field_key, amount_rupees, status, evidence, page_number) values
  ('aaaaaaaa-0000-0000-0000-000000000002', 'billTotalAfterDiscounts',     12500.00, 'found',     'Total 12500', 1),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'insuranceApprovedButNotPaid', null,     'missing',   null,          null),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'insurancePaidOrCredited',      0.00,    'found',     'Insurance: 0', 2),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'patientPayments',              2000.00, 'ambiguous', 'Illegible 2000?', 1),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'printedAmountDue',            10500.00, 'found',     'Due 10500', 1);

-- Demo access code for bill 1 is DEMO-1234 (bcrypt hash via pgcrypto).
insert into access_codes (bill_id, code_hash, expires_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   crypt('DEMO-1234', gen_salt('bf', 10)),
   now() + interval '30 days');

commit;