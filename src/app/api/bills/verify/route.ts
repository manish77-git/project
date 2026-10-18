import { getAccessDependencies } from "@/lib/access/dependencies";
import { getDefaultHospitalRecordRepository } from "@/lib/records/mock-records";
import { handleVerifyRequest } from "@/lib/verification/handler";

/**
 * POST /api/bills/verify
 *
 * Checks the bill against the hospital's record and answers with the four
 * business outcomes only — `verified`, `amounts_differ`, `bill_not_found`,
 * `hospital_not_registered` — plus a patient-safe message and the KEYS of any
 * fields that differed. Never an amount.
 *
 * Requires `Authorization: Bearer <accessToken>` from the access challenge. The
 * bill comes from that session, not from the request body, so a bill number or
 * a successful OCR read on its own grants nothing.
 *
 * The records are synthetic (`src/lib/records/mock-records.ts`); there is no
 * real hospital integration.
 */
export async function POST(request: Request): Promise<Response> {
  const access = getAccessDependencies();
  return handleVerifyRequest(request, {
    store: access.store,
    secret: access.secret,
    repository: getDefaultHospitalRecordRepository(),
  });
}
