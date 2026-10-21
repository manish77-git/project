import { describe, expect, it } from "vitest";
import { fakeOcrEngine } from "@/lib/identification/__fixtures__/fake-ocr-engine";
import { syntheticBillPng } from "@/lib/identification/__fixtures__/synthetic-image";
import { handleExtractRequest } from "./handler";

const png = syntheticBillPng(["SYNTHETIC HOSPITAL"]);
const pngBuffer = Uint8Array.from(png).buffer;

function uploadRequest(field: string = "billImage"): Request {
  const form = new FormData();
  form.append(field, new File([pngBuffer], "bill.png", { type: "image/png" }));
  return new Request("http://localhost/api/bills/extract", {
    method: "POST",
    body: form,
  });
}

describe("handleExtractRequest", () => {
  it("returns the values read from the uploaded image, never cached", async () => {
    const response = await handleExtractRequest(uploadRequest(), {
      engine: fakeOcrEngine({
        text: [
          "CITY GENERAL HOSPITAL",
          "Bill No: INV-2026-0042",
          "Total Amount: Rs 2,750",
        ].join("\n"),
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.readStatus).toBe("readable");
    expect(body.totalAmount).toEqual({
      amountRupees: "2750",
      evidence: { lineNumber: 3, text: "Total Amount: Rs 2,750" },
    });
    expect(body.notice).toMatch(/not independently verified/i);
    expect(body).not.toHaveProperty("verified");
    expect(body).not.toHaveProperty("outcome");
  });

  it("says explicitly when the image could not be read", async () => {
    const response = await handleExtractRequest(uploadRequest(), {
      engine: fakeOcrEngine({ text: "", meanConfidence: 0 }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.readStatus).toBe("unreadable");
    expect(body.totalAmount).toBeNull();
    expect(body.lineItems).toEqual([]);
  });

  it("rejects a request with no image", async () => {
    const form = new FormData();
    form.append("notTheImage", "x");
    const response = await handleExtractRequest(
      new Request("http://localhost/api/bills/extract", { method: "POST", body: form }),
      { engine: fakeOcrEngine({ text: "CITY GENERAL HOSPITAL" }) },
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
  });

  it("rejects JSON bodies", async () => {
    const response = await handleExtractRequest(
      new Request("http://localhost/api/bills/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ billNumber: "INV-2026-0042" }),
      }),
      { engine: fakeOcrEngine({ text: "CITY GENERAL HOSPITAL" }) },
    );

    expect(response.status).toBe(415);
  });
});
