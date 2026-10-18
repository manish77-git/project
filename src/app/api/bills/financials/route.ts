import { getAccessDependencies } from "@/lib/access/dependencies";
import { getDefaultHospitalRecordRepository } from "@/lib/records/mock-records";
import { handleFinancialsRequest } from "@/lib/verification/handler";

/**
 * GET /api/bills/financials
 *
 * The hospital's recorded amounts for the bill this session unlocked.
 *
 * Note what this endpoint does NOT accept: any bill identifier. There is no
 * query string to tamper with and no `isVerified` flag to set — the bill comes
 * from the server-side access session, and the amounts are released only when
 * that session verified AND the record is re-checked on the way out. An
 * unresolved discrepancy returns the differing field names and no figures.
 *
 * Requires `Authorization: Bearer <accessToken>`.
 */
export async function GET(request: Request): Promise<Response> {
  const access = getAccessDependencies();
  return handleFinancialsRequest(request, {
    store: access.store,
    secret: access.secret,
    repository: getDefaultHospitalRecordRepository(),
  });
}
