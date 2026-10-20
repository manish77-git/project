"use client";

/**
 * src/components/SupportTicketSection.tsx
 *
 * Patient Support Ticket feature:
 * - Request is tied to Bill Number and Hospital ID.
 * - Patient receives a Ticket ID to show to hospital staff.
 * - MANDATORY: Patient must tick "Share my request with this hospital's support worker."
 *   Without that tick, no ticket is created.
 * - Zero image retention: Image is deleted; only extracted fields are kept.
 */

import { useState } from "react";
import type { BillAnalysisResult } from "@/lib/types/billing";

interface Props {
  billContext: BillAnalysisResult;
  onTicketCreated?: (ticketId: string) => void;
  onViewDashboard?: () => void;
}

export interface SupportTicket {
  ticketId: string;
  hospitalId: string;
  hospitalName: string;
  billNumber: string;
  patientNote: string;
  amountTotal: string;
  consentVerified: boolean;
  createdAt: string;
  status: "Open" | "In Progress" | "Resolved";
}

export default function SupportTicketSection({
  billContext,
  onTicketCreated,
  onViewDashboard,
}: Props) {
  const [consentChecked, setConsentChecked] = useState(false);
  const [patientNote, setPatientNote] = useState("");
  const [issuedTicket, setIssuedTicket] = useState<SupportTicket | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const hospitalId = "HOSP-SUNRISE-01";
  const hospitalName = billContext.hospitalName || "Sunrise Community Hospital";
  const billNumber = billContext.billNumber || "INV-2026-0042";
  const totalAmount = billContext.totalInr
    ? `₹ ${parseFloat(billContext.totalInr).toLocaleString("en-IN")}`
    : "₹ 3,100";

  const handleCreateTicket = () => {
    // Enforce consent tick strictly
    if (!consentChecked) {
      setValidationError(
        "Consent required: You must check 'Share my request with this hospital’s support worker' before submitting."
      );
      return;
    }

    setValidationError(null);
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const ticketId = `TCK-${randomSuffix}`;

    const newTicket: SupportTicket = {
      ticketId,
      hospitalId,
      hospitalName,
      billNumber,
      patientNote:
        patientNote.trim() ||
        "Patient requests clarification on line-item charges and payment assistance.",
      amountTotal: totalAmount,
      consentVerified: true,
      createdAt: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      status: "Open",
    };

    // Save to localStorage so Hospital Worker Dashboard picks it up immediately
    try {
      const stored = localStorage.getItem("mediexplain_tickets");
      const list: SupportTicket[] = stored ? JSON.parse(stored) : [];
      list.unshift(newTicket);
      localStorage.setItem("mediexplain_tickets", JSON.stringify(list));
    } catch (e) {
      console.warn("Could not save to localStorage:", e);
    }

    setIssuedTicket(newTicket);
    onTicketCreated?.(ticketId);
  };

  return (
    <div
      style={{
        backgroundColor: "var(--surface)",
        borderRadius: "var(--radius-xl)",
        border: "2px solid var(--primary-border)",
        boxShadow: "var(--shadow)",
        padding: "24px 28px",
        marginTop: "2rem",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <div>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>
            Connect with a Hospital Support Worker
          </h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "2px 0 0" }}>
            Your request is directly tied to your Hospital ID and Bill Number. A worker will review your case.
          </p>
        </div>
      </div>

      {/* Bill Number & Hospital ID Linkage */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
          margin: "14px 0",
        }}
      >
        <div
          style={{
            background: "var(--surface-raised)",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase" }}>
            Hospital Identifier
          </div>
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>
            {hospitalId} ({hospitalName})
          </div>
        </div>

        <div
          style={{
            background: "var(--surface-raised)",
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", fontWeight: 700, textTransform: "uppercase" }}>
            Bill / Invoice Number
          </div>
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem", fontFamily: "monospace" }}>
            {billNumber}
          </div>
        </div>
      </div>

      {/* Zero Image Retention Policy Badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderRadius: "var(--radius-sm)",
          backgroundColor: "var(--success-light)",
          border: "1px solid #86efac",
          color: "#166534",
          fontSize: "0.78rem",
          fontWeight: 600,
          marginBottom: "14px",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <span>
          <strong>Zero Image Storage:</strong> The uploaded image was processed in-memory and immediately destroyed. Only extracted fields (Bill #, Hospital ID, Amounts) will be shared.
        </span>
      </div>

      {!issuedTicket && (
        <>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ fontSize: "0.82rem", fontWeight: 700, display: "block", marginBottom: "4px" }}>
              What do you need assistance with? (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. I do not understand why the X-ray is ₹1,200, please assist."
              value={patientNote}
              onChange={(e) => setPatientNote(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontFamily: "inherit",
                fontSize: "0.88rem",
                outline: "none",
              }}
            />
          </div>

          {/* MANDATORY CONSENT CHECKBOX */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "12px 16px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: consentChecked ? "var(--primary-light)" : "var(--surface-raised)",
              border: `1.5px solid ${consentChecked ? "var(--primary)" : "var(--border)"}`,
              cursor: "pointer",
              fontSize: "0.92rem",
              fontWeight: 600,
              color: "var(--text)",
              userSelect: "none",
              margin: "14px 0",
              transition: "all 0.18s ease",
            }}
          >
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => {
                setConsentChecked(e.target.checked);
                if (e.target.checked) setValidationError(null);
              }}
              style={{ width: "18px", height: "18px", marginTop: "2px", cursor: "pointer", accentColor: "var(--primary)" }}
            />
            <span>Share my request with this hospital’s support worker.</span>
          </label>

          {validationError && (
            <p style={{ color: "var(--error)", fontSize: "0.82rem", fontWeight: 600, margin: "-6px 0 12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{validationError}</span>
            </p>
          )}

          <button
            onClick={handleCreateTicket}
            disabled={!consentChecked}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              borderRadius: "var(--radius)",
              backgroundColor: consentChecked ? "var(--primary)" : "var(--border)",
              color: "#ffffff",
              border: "none",
              fontSize: "0.95rem",
              fontWeight: 700,
              cursor: consentChecked ? "pointer" : "not-allowed",
              transition: "all 0.2s ease",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="12" x="3" y="6" rx="2" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="3" y1="12" x2="21" y2="12" />
            </svg>
            <span>Generate Support Ticket</span>
          </button>
        </>
      )}

      {/* ISSUED TICKET RECEIPT */}
      {issuedTicket && (
        <div
          className="animate-fade-up"
          style={{
            backgroundColor: "#f0fdf4",
            border: "2px solid #22c55e",
            borderRadius: "var(--radius-lg)",
            padding: "20px 24px",
            marginTop: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "100px", backgroundColor: "#166534", color: "#ffffff", fontSize: "0.72rem", fontWeight: 800 }}>
                TICKET CREATED & RECORDED
              </span>
              <h4 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#14532d", margin: "6px 0 2px" }}>
                Ticket ID: <span style={{ fontFamily: "monospace" }}>{issuedTicket.ticketId}</span>
              </h4>
              <p style={{ fontSize: "0.85rem", color: "#166534", margin: 0 }}>
                Show this Ticket ID to your hospital's support worker or billing counter for quick reference.
              </p>
            </div>

            {onViewDashboard && (
              <button
                onClick={onViewDashboard}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid #22c55e",
                  backgroundColor: "#ffffff",
                  color: "#166534",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                }}
              >
                View in Hospital Worker Dashboard →
              </button>
            )}
          </div>

          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px dashed #86efac", fontSize: "0.82rem", color: "#166534", display: "flex", gap: "18px", flexWrap: "wrap" }}>
            <span><strong>Hospital ID:</strong> {issuedTicket.hospitalId}</span>
            <span><strong>Bill Number:</strong> {issuedTicket.billNumber}</span>
            <span><strong>Status:</strong> {issuedTicket.status}</span>
            <span><strong>Image:</strong> Purged from memory</span>
          </div>
        </div>
      )}
    </div>
  );
}
