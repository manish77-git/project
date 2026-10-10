import { describe, expect, it } from "vitest";
import {
  callbackRequestSchema,
  callbackTicketSchema,
  callbackTimeSchema,
  createCallbackTicket,
} from "./callback";

/** Synthetic patient data only — never real contact details. */
function validRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    preferredLanguage: "en",
    callbackTime: "call_me_now",
    reason: "I do not understand the discounts on my bill.",
    patientName: "Asha Patient",
    phoneNumber: "9876543210",
    consentToCallback: true,
    ...overrides,
  };
}

describe("callbackTimeSchema and language codes", () => {
  it("accepts the four callback times (case 11)", () => {
    for (const time of ["call_me_now", "morning", "afternoon", "evening"] as const) {
      expect(callbackTimeSchema.safeParse(time).success, time).toBe(true);
    }
  });

  it("rejects invalid callback times (case 11)", () => {
    for (const bad of ["now", "night", "MORNING", "", "tonight"]) {
      expect(callbackTimeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("rejects invalid language codes (case 11)", () => {
    for (const bad of ["English", "hn", "kn-IN", "fr", ""]) {
      const result = callbackRequestSchema.safeParse(validRequest({ preferredLanguage: bad }));
      expect(result.success, `language ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it("accepts the three contract language codes (case 11)", () => {
    for (const lang of ["en", "hi", "kn"] as const) {
      const result = callbackRequestSchema.safeParse(validRequest({ preferredLanguage: lang }));
      expect(result.success, lang).toBe(true);
    }
  });
});

describe("callbackRequestSchema", () => {
  it("accepts a valid request with explicit consent", () => {
    expect(callbackRequestSchema.safeParse(validRequest()).success).toBe(true);
  });

  it("rejects a request with consent missing (case 12)", () => {
    const { consentToCallback: _omitted, ...withoutConsent } = validRequest();
    expect(callbackRequestSchema.safeParse(withoutConsent).success).toBe(false);
  });

  it("rejects a request with consent set to false (case 12)", () => {
    const result = callbackRequestSchema.safeParse(validRequest({ consentToCallback: false }));
    expect(result.success).toBe(false);
  });

  it("rejects client-supplied ticket metadata: ticketId, createdAt, status (case 13)", () => {
    for (const spoofed of [
      { ticketId: "client-made-up-id" },
      { createdAt: "2026-10-11T09:00:00Z" },
      { status: "resolved" },
    ]) {
      const result = callbackRequestSchema.safeParse(validRequest(spoofed));
      expect(result.success, JSON.stringify(spoofed)).toBe(false);
    }
  });

  it("rejects missing contact details", () => {
    const { phoneNumber: _noPhone, ...withoutPhone } = validRequest();
    expect(callbackRequestSchema.safeParse(withoutPhone).success).toBe(false);
    const { patientName: _noName, ...withoutName } = validRequest();
    expect(callbackRequestSchema.safeParse(withoutName).success).toBe(false);
  });

  it("rejects malformed phone numbers", () => {
    for (const bad of ["12345", "abcdefghij", "5551234", ""]) {
      const result = callbackRequestSchema.safeParse(validRequest({ phoneNumber: bad }));
      expect(result.success, `phone ${JSON.stringify(bad)}`).toBe(false);
    }
  });

  it("rejects unreasonable input lengths", () => {
    const longText = "x".repeat(1001);
    expect(callbackRequestSchema.safeParse(validRequest({ reason: longText })).success).toBe(false);
    expect(callbackRequestSchema.safeParse(validRequest({ reason: "ok" })).success).toBe(false);
    expect(callbackRequestSchema.safeParse(validRequest({ patientName: "A" })).success).toBe(false);
    expect(callbackRequestSchema.safeParse(validRequest({ patientName: longText })).success).toBe(false);
  });
});

describe("callbackTicketSchema and createCallbackTicket", () => {
  const serverTicket = {
    ticketId: "tkt_01HXYZ",
    createdAt: "2026-10-11T09:15:00+05:30",
    status: "new",
    ...validRequest(),
  };

  it("accepts a stored ticket with server-generated fields and status new (case 14)", () => {
    expect(callbackTicketSchema.safeParse(serverTicket).success).toBe(true);
  });

  it("accepts all four ticket statuses (case 14)", () => {
    for (const status of ["new", "callback_scheduled", "contacted", "resolved"] as const) {
      const result = callbackTicketSchema.safeParse({ ...serverTicket, status });
      expect(result.success, status).toBe(true);
    }
  });

  it("rejects a ticket without server-generated fields (case 14)", () => {
    const { ticketId: _noId, ...withoutId } = serverTicket;
    expect(callbackTicketSchema.safeParse(withoutId).success).toBe(false);
    const { createdAt: _noDate, ...withoutDate } = serverTicket;
    expect(callbackTicketSchema.safeParse(withoutDate).success).toBe(false);
    const { status: _noStatus, ...withoutStatus } = serverTicket;
    expect(callbackTicketSchema.safeParse(withoutStatus).success).toBe(false);
  });

  it("rejects a non-ISO createdAt timestamp", () => {
    const result = callbackTicketSchema.safeParse({ ...serverTicket, createdAt: "yesterday" });
    expect(result.success).toBe(false);
  });

  it("createCallbackTicket builds a valid new ticket from a request (case 14)", () => {
    const parsedRequest = callbackRequestSchema.parse(validRequest());
    const ticket = createCallbackTicket({
      ticketId: "tkt_generated_1",
      createdAt: "2026-10-11T10:00:00Z",
      request: parsedRequest,
    });
    expect(ticket.status).toBe("new");
    expect(ticket.ticketId).toBe("tkt_generated_1");
    expect(callbackTicketSchema.safeParse(ticket).success).toBe(true);
  });
});
