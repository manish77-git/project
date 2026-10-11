import { describe, expect, it } from "vitest";
import { GET } from "./route";

/**
 * These tests call the route handler directly — no server is started here.
 * That keeps them fast and lets `npm test` verify the contract on its own.
 * The endpoint is also exercised over real HTTP during manual verification.
 */
describe("GET /api/health", () => {
  it("returns HTTP 200", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
  });

  it("returns JSON with the expected content type", async () => {
    const response = await GET();
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("returns exactly the expected status and service fields", async () => {
    const response = await GET();
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "patient-financial-navigator",
    });
  });

  it("exposes no extra keys, secrets, or internal configuration", async () => {
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;

    // Only the two documented fields may appear.
    expect(Object.keys(body).sort()).toEqual(["service", "status"]);

    // Values must be the fixed safe strings — nothing derived from config.
    for (const value of Object.values(body)) {
      expect(typeof value).toBe("string");
      expect(String(value)).not.toMatch(/key|secret|token|password|stack|trace|env/i);
    }
  });
});
