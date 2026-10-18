import { describe, expect, it } from "vitest";
import { MONETARY_AMOUNT_PATTERN } from "@/lib/schemas";
import {
  createMockHospitalRecordRepository,
  MOCK_HOSPITAL_RECORDS,
  normalizeBillNumberForLookup,
  type HospitalRecord,
} from "./mock-records";

const repository = createMockHospitalRecordRepository();

function recordFor(billNumber: string): HospitalRecord | undefined {
  return MOCK_HOSPITAL_RECORDS.find((record) => record.billNumber === billNumber);
}

describe("mock hospital records", () => {
  it("covers all four verification situations", async () => {
    const valid = recordFor("INV-2026-0042");
    const discrepant = recordFor("INV-2026-0043");
    const unregistered = recordFor("SUN-2026-7781");

    expect(valid, "a bill whose amounts agree").toBeDefined();
    expect(discrepant, "a bill with an amount discrepancy").toBeDefined();
    expect(unregistered, "an unregistered hospital").toBeDefined();
    expect(unregistered?.registered).toBe(false);

    // And a bill number with no record at all.
    expect(await repository.findByBillNumber("INV-2026-9999")).toBeNull();
  });

  it("really does disagree on the discrepancy record, and agree on the valid one", () => {
    const valid = recordFor("INV-2026-0042");
    const discrepant = recordFor("INV-2026-0043");

    expect(valid?.printedAmounts).toEqual(valid?.recordAmounts);
    expect(discrepant?.printedAmounts).not.toEqual(discrepant?.recordAmounts);
  });

  it("carries no field beyond the record shape, so no patient data can hide in it", () => {
    const expectedKeys = [
      "billNumber",
      "hospitalId",
      "hospitalName",
      "printedAmounts",
      "recordAmounts",
      "registered",
    ];
    for (const record of MOCK_HOSPITAL_RECORDS) {
      expect(Object.keys(record).sort()).toEqual(expectedKeys);
    }
  });

  it("uses amounts that obey the shared money contract", () => {
    for (const record of MOCK_HOSPITAL_RECORDS) {
      for (const amounts of [record.printedAmounts, record.recordAmounts]) {
        for (const [key, amount] of Object.entries(amounts)) {
          expect(typeof amount, `${record.billNumber} ${key}`).toBe("string");
          expect(amount, `${record.billNumber} ${key}`).toMatch(MONETARY_AMOUNT_PATTERN);
        }
      }
    }
  });
});

describe("repository lookups", () => {
  it("finds a bill regardless of case or spacing", async () => {
    for (const input of ["INV-2026-0042", "inv-2026-0042", "  Inv-2026-0042  "]) {
      const record = await repository.findByBillNumber(input);
      expect(record?.billNumber, input).toBe("INV-2026-0042");
    }
  });

  it("lists every record for diagnostics", async () => {
    expect(await repository.listAll()).toHaveLength(MOCK_HOSPITAL_RECORDS.length);
  });

  it("normalises bill numbers consistently", () => {
    expect(normalizeBillNumberForLookup("  inv-2026-0042 ")).toBe("INV-2026-0042");
    expect(normalizeBillNumberForLookup("ab  1234")).toBe("AB 1234");
  });
});
