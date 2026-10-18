import { describe, expect, it } from "vitest";
import {
  buildExplanationPrompt,
  createGeminiExplanationProvider,
  createGeminiProviderFromEnv,
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_GEMINI_MODEL,
  ExplanationProviderError,
  type ExplanationProviderInput,
  type FetchLike,
} from "./provider";

const INPUT: ExplanationProviderInput = {
  language: "hi",
  fields: [
    { fieldKey: "billTotalAfterDiscounts", status: "found" },
    { fieldKey: "printedAmountDue", status: "found" },
    { fieldKey: "insurancePaidOrCredited", status: "missing" },
  ],
};

function geminiResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text }] }, finishReason: "STOP" },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function providerError(
  provider: { generate(input: ExplanationProviderInput): Promise<string> },
): Promise<ExplanationProviderError> {
  try {
    await provider.generate(INPUT);
  } catch (error) {
    expect(error).toBeInstanceOf(ExplanationProviderError);
    return error as ExplanationProviderError;
  }
  throw new Error("expected the provider to fail");
}

describe("buildExplanationPrompt", () => {
  it("describes fields and availability without sending any amount", () => {
    const { system, user } = buildExplanationPrompt(INPUT);

    expect(system).toContain("Hindi (hi)");
    expect(system).toContain("Do NOT write any amount");
    expect(system).toContain("missing is unknown");
    expect(user).toContain("billTotalAfterDiscounts");
    expect(user).toContain("printedAmountDue");
    expect(user).toContain("missing from the record");
    expect(user).toContain("available");
    expect(user).not.toContain("INR");
    expect(user).not.toContain("15000");
  });
});

describe("Gemini provider adapter", () => {
  it("sends the key in a header, asks for sections, and includes no amounts", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    const fetchImpl: FetchLike = async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return geminiResponse(
        '{"sections":[{"fieldKey":"printedAmountDue","explanation":"ok"}]}',
      );
    };

    const provider = createGeminiExplanationProvider({
      apiKey: "test-key",
      model: "gemini-test-model",
      fetchImpl,
    });

    await expect(provider.generate(INPUT)).resolves.toBe(
      '{"sections":[{"fieldKey":"printedAmountDue","explanation":"ok"}]}',
    );

    expect(capturedUrl).toBe(
      `${DEFAULT_GEMINI_BASE_URL}/models/gemini-test-model:generateContent`,
    );
    expect(capturedUrl).not.toContain("test-key");

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("test-key");

    const body = JSON.parse(String(capturedInit?.body)) as {
      generationConfig: {
        responseMimeType: string;
        responseSchema: {
          required: string[];
          properties: {
            sections: {
              items: {
                properties: { fieldKey: { enum: string[] } };
                required: string[];
              };
            };
          };
        };
      };
      systemInstruction: { parts: { text: string }[] };
    };

    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.required).toEqual(["sections"]);
    expect(
      body.generationConfig.responseSchema.properties.sections.items.required,
    ).toEqual(["fieldKey", "explanation"]);
    expect(
      body.generationConfig.responseSchema.properties.sections.items.properties
        .fieldKey.enum,
    ).toEqual([
      "billTotalAfterDiscounts",
      "insuranceApprovedButNotPaid",
      "insurancePaidOrCredited",
      "patientPayments",
      "printedAmountDue",
    ]);

    expect(body.systemInstruction.parts[0]?.text).toContain("Do NOT write any amount");

    const sent = JSON.stringify(body);
    expect(sent).not.toContain("INV-2026-0042");
    expect(sent).not.toContain("CITY GENERAL HOSPITAL");
    expect(sent).not.toContain("accessCode");
    expect(sent).not.toContain("15000");
    expect(sent).not.toContain("10000");
    expect(sent).not.toContain("INR");
  });

  it("maps an HTTP error to unavailable without exposing the response body", async () => {
    const provider = createGeminiExplanationProvider({
      apiKey: "test-key",
      fetchImpl: async () => new Response("vendor secret detail", { status: 500 }),
    });

    const error = await providerError(provider);
    expect(error.reason).toBe("unavailable");
    expect(error.message).not.toContain("vendor secret detail");
  });

  it("maps an aborted request to timeout", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    const provider = createGeminiExplanationProvider({
      apiKey: "test-key",
      timeoutMs: 5,
      fetchImpl: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          capturedSignal = init?.signal;
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    });

    const error = await providerError(provider);
    expect(capturedSignal).toBeDefined();
    expect(error.reason).toBe("timeout");
  });

  it("maps a non-JSON response to bad_response", async () => {
    const provider = createGeminiExplanationProvider({
      apiKey: "test-key",
      fetchImpl: async () => new Response("not json", { status: 200 }),
    });

    expect((await providerError(provider)).reason).toBe("bad_response");
  });

  it("maps an empty candidate list to bad_response", async () => {
    const provider = createGeminiExplanationProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    });

    expect((await providerError(provider)).reason).toBe("bad_response");
  });

  it("maps a blocked prompt to blocked", async () => {
    const provider = createGeminiExplanationProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }),
          { status: 200 },
        ),
    });

    expect((await providerError(provider)).reason).toBe("blocked");
  });

  it("maps a truncated or empty answer to bad_response", async () => {
    const truncated = createGeminiExplanationProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: "partial" }] }, finishReason: "MAX_TOKENS" },
            ],
          }),
          { status: 200 },
        ),
    });
    expect((await providerError(truncated)).reason).toBe("bad_response");

    const empty = createGeminiExplanationProvider({
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "   " }] }, finishReason: "STOP" }],
          }),
          { status: 200 },
        ),
    });
    expect((await providerError(empty)).reason).toBe("bad_response");
  });
});

describe("createGeminiProviderFromEnv", () => {
  it("returns null when no key is configured", () => {
    expect(createGeminiProviderFromEnv({})).toBeNull();
    expect(createGeminiProviderFromEnv({ GEMINI_API_KEY: "   " })).toBeNull();
  });

  it("uses the configured model and falls back to the default", () => {
    expect(createGeminiProviderFromEnv({ GEMINI_API_KEY: "key" })?.name).toBe(
      `gemini:${DEFAULT_GEMINI_MODEL}`,
    );
    expect(
      createGeminiProviderFromEnv({
        GEMINI_API_KEY: "key",
        GEMINI_MODEL: "gemini-configured-model",
      })?.name,
    ).toBe("gemini:gemini-configured-model");
  });
});
