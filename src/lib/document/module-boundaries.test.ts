/**
 * Structural guard: reading a document must stay independent of verified
 * records.
 *
 * The ₹3,100 bug was a fallback: "the bill did not match a record" quietly
 * became "show the sample bill". This test makes that class of regression
 * structural — the module that reads the upload cannot import the record
 * repository or the verification outcome, so it has nothing sample-shaped to
 * fall back to.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function moduleSources(): Array<{ name: string; source: string }> {
  return readdirSync(MODULE_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => ({ name, source: readFileSync(path.join(MODULE_DIR, name), "utf8") }));
}

describe("document module boundaries", () => {
  it("never imports hospital records or the sample bill", () => {
    for (const { name, source } of moduleSources()) {
      expect(source, `${name} must not import records`).not.toMatch(
        /from\s+["'][^"']*\/records[/"']/,
      );
      expect(source, `${name} must not reach for a record repository`).not.toMatch(
        /getDefaultHospitalRecordRepository|mock-records/,
      );
      expect(source, `${name} must not produce demo data`).not.toMatch(/getDemoBill/);
    }
  });

  it("never imports the verification module or its outcomes", () => {
    for (const { name, source } of moduleSources()) {
      expect(source, `${name} must not import verification`).not.toMatch(
        /from\s+["'][^"']*\/verification[/"']/,
      );
      expect(source, `${name} must not reference verification outcomes`).not.toMatch(
        /amounts_differ|bill_not_found|hospital_not_registered/,
      );
    }
  });

  it("validates results through the published document contract only", () => {
    const service = moduleSources().find((entry) => entry.name === "service.ts");
    expect(service, "service.ts should exist").toBeDefined();
    expect(service?.source).toContain("billDocumentExtractionSchema");
    expect(service?.source).toContain("safeParse");
  });

  it("exposes the extraction endpoint as POST only, with no-store responses", () => {
    const routePath = path.resolve(MODULE_DIR, "../../app/api/bills/extract/route.ts");
    const route = readFileSync(routePath, "utf8");
    const handler = readFileSync(path.join(MODULE_DIR, "handler.ts"), "utf8");

    expect(route).toMatch(/export\s+async\s+function\s+POST/);
    for (const other of ["GET", "PUT", "PATCH", "DELETE"]) {
      expect(route, `route must not export ${other}`).not.toMatch(
        new RegExp(`export\\s+(async\\s+)?function\\s+${other}`),
      );
    }
    expect(handler).toContain('"cache-control": "no-store"');
  });
});
