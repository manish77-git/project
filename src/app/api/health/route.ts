import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Liveness check: tells callers (uptime monitors, load balancers, the team)
 * that the application service is up and serving requests.
 *
 * The response is a fixed, hard-coded payload on purpose:
 *   - it never reads environment variables, API keys, database credentials,
 *     or any internal configuration, so nothing sensitive can leak;
 *   - it performs no I/O, so a 200 means "the Node process is answering",
 *     not "the database happens to be reachable right now".
 *
 * The service identifier is a plain string literal rather than a package.json
 * import so the endpoint stays dependency-free and its shape is obvious.
 */
export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: "ok",
      service: "patient-financial-navigator",
    },
    { status: 200 },
  );
}
