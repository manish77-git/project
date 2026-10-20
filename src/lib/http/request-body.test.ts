import { describe, expect, it } from "vitest";
import {
  MAX_JSON_BODY_BYTES,
  exceedsDeclaredLength,
  readBodyWithLimit,
  readJsonBody,
  readMultipartFormData,
} from "./request-body";

const ENDPOINT = "http://localhost:3000/api/test";

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

/** A streamed body that reports how many bytes the handler actually pulled. */
function countedStream(chunkBytes: number, chunkCount: number): {
  stream: ReadableStream<Uint8Array>;
  pulled: () => number;
} {
  const chunk = new Uint8Array(chunkBytes);
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunkBytes * chunkCount) {
        controller.close();
        return;
      }
      pulled += chunkBytes;
      controller.enqueue(chunk);
    },
  });
  return { stream, pulled: () => pulled };
}

function streamedRequest(
  stream: ReadableStream<Uint8Array>,
  contentType: string,
): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "content-type": contentType },
    body: stream,
    // Node requires this when a request body is a stream.
    duplex: "half",
  } as RequestInit);
}

describe("exceedsDeclaredLength", () => {
  it("compares a declared length against the limit", () => {
    expect(exceedsDeclaredLength(null, 100)).toBe(false);
    expect(exceedsDeclaredLength("not-a-number", 100)).toBe(false);
    expect(exceedsDeclaredLength("50", 100)).toBe(false);
    expect(exceedsDeclaredLength("100", 100)).toBe(false);
    expect(exceedsDeclaredLength("101", 100)).toBe(true);
  });
});

describe("readBodyWithLimit", () => {
  it("reads a body that fits", async () => {
    const result = await readBodyWithLimit(jsonRequest("hello"), 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new TextDecoder().decode(result.bytes)).toBe("hello");
  });

  it("refuses a declared length over the limit without reading the body", async () => {
    const { stream, pulled } = countedStream(1024, 10);
    const request = new Request(ENDPOINT, {
      method: "POST",
      headers: { "content-length": "10000" },
      body: stream,
      duplex: "half",
    } as RequestInit);

    const result = await readBodyWithLimit(request, 1000);
    expect(result).toEqual({ ok: false, reason: "too_large" });
    // The stream may buffer one chunk of its own accord; nothing beyond that is
    // pulled, so the 10 KiB body is never read through.
    expect(pulled()).toBeLessThanOrEqual(1024);
  });

  it("stops reading a streamed body as soon as the limit is crossed", async () => {
    // 64 chunks of 64 KiB = 4 MiB available; the limit is 256 KiB.
    const { stream, pulled } = countedStream(64 * 1024, 64);
    const result = await readBodyWithLimit(streamedRequest(stream, "application/octet-stream"), 256 * 1024);

    expect(result).toEqual({ ok: false, reason: "too_large" });
    // Five chunks cross 256 KiB; the remaining 59 are never pulled.
    expect(pulled()).toBeLessThanOrEqual(5 * 64 * 1024);
  });
});

describe("readJsonBody", () => {
  it("parses a JSON object", async () => {
    const result = await readJsonBody(jsonRequest('{"language":"hi"}'));
    expect(result).toEqual({ ok: true, value: { language: "hi" } });
  });

  it("reports malformed JSON separately from an oversized body", async () => {
    expect(await readJsonBody(jsonRequest("{not json"))).toEqual({
      ok: false,
      reason: "invalid_json",
    });

    const big = JSON.stringify({ padding: "x".repeat(MAX_JSON_BODY_BYTES + 1) });
    expect(await readJsonBody(jsonRequest(big))).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects a streamed JSON body that exceeds the limit", async () => {
    const { stream } = countedStream(32 * 1024, 16);
    const request = streamedRequest(stream, "application/json");

    expect(await readJsonBody(request)).toEqual({ ok: false, reason: "too_large" });
  });
});

describe("readMultipartFormData", () => {
  function formRequest(fields: Record<string, string>): Request {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return new Request(ENDPOINT, { method: "POST", body: form });
  }

  it("parses a form that fits", async () => {
    const result = await readMultipartFormData(formRequest({ billNumber: "INV-1" }), 64 * 1024);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.form.get("billNumber")).toBe("INV-1");
  });

  it("refuses an oversized multipart body that declares no content-length", async () => {
    // Valid-looking multipart preamble, then far more data than the limit.
    const { stream, pulled } = countedStream(256 * 1024, 32);
    const request = streamedRequest(stream, "multipart/form-data; boundary=probe");

    const result = await readMultipartFormData(request, 256 * 1024);
    expect(result).toEqual({ ok: false, reason: "too_large" });
    // Counting happens while parsing; the whole 8 MiB is never pulled.
    expect(pulled()).toBeLessThanOrEqual(3 * 256 * 1024);
  });

  it("reports a body that is not a form at all", async () => {
    const result = await readMultipartFormData(
      jsonRequest('{"not":"multipart"}', { "content-type": "multipart/form-data; boundary=x" }),
      64 * 1024,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_body" });
  });
});
