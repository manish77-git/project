/**
 * Structural guard: identification must stay independent of verification.
 *
 * The two stages answer different questions ("what does the document appear to
 * say?" vs "does the hospital's record match it?") and are built by different
 * stages of the roadmap. Keeping them at arm's length is what lets each be
 * tested and reasoned about on its own — and it is what stops a
 * "we could not read it" case from drifting into a verification outcome.
 *
 * A dependency is cheap to introduce by accident, so this asserts it directly
 * rather than trusting review.
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

describe("identification module boundaries", () => {
  it("has no dependency on the verification module", () => {
    for (const { name, source } of moduleSources()) {
      expect(source, `${name} must not import verification`).not.toMatch(
        /from\s+["'][^"']*verification["']/,
      );
      expect(source, `${name} must not reference verification outcomes`).not.toMatch(
        /amounts_differ|bill_not_found|hospital_not_registered/,
      );
    }
  });

  it("does not reach into verification's schema module either", () => {
    for (const { name, source } of moduleSources()) {
      expect(source, `${name} must not import billVerificationSchema`).not.toContain(
        "billVerificationSchema",
      );
    }
  });

  it("validates results through the published identification schema only", () => {
    // `service.ts` is the single gate where an untrusted result becomes a
    // response shape; `extract.ts` builds plain objects for it to validate.
    const service = moduleSources().find((entry) => entry.name === "service.ts");
    expect(service, "service.ts should exist").toBeDefined();
    expect(service?.source).toContain("billIdentificationSchema");
    expect(service?.source).toContain("safeParse");
  });

  it("exposes the new endpoint at the documented path, POST only", () => {
    const routePath = path.resolve(MODULE_DIR, "../../app/api/bills/identify/route.ts");
    const route = readFileSync(routePath, "utf8");

    expect(route).toMatch(/export\s+async\s+function\s+POST/);
    for (const other of ["GET", "PUT", "PATCH", "DELETE"]) {
      expect(route, `route must not export ${other}`).not.toMatch(
        new RegExp(`export\\s+(async\\s+)?function\\s+${other}`),
      );
    }
  });
});
