"use client";

/**
 * src/components/HospitalWorkerDashboard.tsx
 *
 * Hospital Worker Dashboard (Simulated Staff Access):
 * - "Viewing as" dropdown to select hospital identity (e.g. Sunrise Community Hospital worker).
 * - Shows only that hospital's tickets.
 * - Explicit notice for judges explaining this is simulated staff access.
 */

import { useState, useEffect } from "react";
import type { SupportTicket } from "./SupportTicketSection";

const DEFAULT_HOSPITALS = [
  { id: "HOSP-SUNRISE-01", name: "Sunrise Community Hospital worker (ID: HOSP-SUNRISE-01)" },
  { id: "HOSP-CITY-001", name: "City General Hospital worker (ID: HOSP-CITY-001)" },
  { id: "HOSP-APEX-002", name: "Apex Memorial Hospital worker (ID: HOSP-APEX-002)" },
];

const SEED_TICKETS: SupportTicket[] = [
  {
    ticketId: "TCK-8492",
    hospitalId: "HOSP-SUNRISE-01",
    hospitalName: "Sunrise Community Hospital",
    billNumber: "INV-2026-0042",
    patientNote: "Patient questions the X-Ray charge (₹1,200) and asks if Ayushman Bharat PM-JAY applies.",
    amountTotal: "₹ 3,100",
    consentVerified: true,
    createdAt: "Today at 7:45 PM",
    status: "Open",
  },
  {
    ticketId: "TCK-7120",
    hospitalId: "HOSP-SUNRISE-01",
    hospitalName: "Sunrise Community Hospital",
    billNumber: "INV-2026-0038",
    patientNote: "Wants clarification on pharmacy medicine brand substitutes.",
    amountTotal: "₹ 1,840",
    consentVerified: true,
    createdAt: "Yesterday at 11:20 AM",
    status: "In Progress",
  },
  {
    ticketId: "TCK-9031",
    hospitalId: "HOSP-CITY-001",
    hospitalName: "City General Hospital",
    billNumber: "CGH-88219",
    patientNote: "Duplicate consultation entry suspected by elderly patient.",
    amountTotal: "₹ 2,400",
    consentVerified: true,
    createdAt: "Today at 3:10 PM",
    status: "Open",
  },
  {
    ticketId: "TCK-6294",
    hospitalId: "HOSP-APEX-002",
    hospitalName: "Apex Memorial Hospital",
    billNumber: "APX-5510",
    patientNote: "Dispute regarding post-op dressing kit fees.",
    amountTotal: "₹ 4,750",
    consentVerified: true,
    createdAt: "Oct 17, 2026",
    status: "Resolved",
  },
];

export default function HospitalWorkerDashboard() {
  const [selectedHospitalId, setSelectedHospitalId] = useState("HOSP-SUNRISE-01");
  const [tickets, setTickets] = useState<SupportTicket[]>(SEED_TICKETS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("mediexplain_tickets");
      if (stored) {
        const parsed = JSON.parse(stored);
        queueMicrotask(() => {
          setTickets(parsed);
        });
      } else {
        localStorage.setItem("mediexplain_tickets", JSON.stringify(SEED_TICKETS));
      }
    } catch {
      // Keep SEED_TICKETS default
    }
  }, []);

  const handleStatusChange = (ticketId: string, newStatus: "Open" | "In Progress" | "Resolved") => {
    const updated = tickets.map((t) => (t.ticketId === ticketId ? { ...t, status: newStatus } : t));
    setTickets(updated);
    try {
      localStorage.setItem("mediexplain_tickets", JSON.stringify(updated));
    } catch (e) {
      console.warn(e);
    }
  };

  const filteredTickets = tickets.filter((t) => t.hospitalId === selectedHospitalId);

  return (
    <section
      aria-label="Hospital Worker Dashboard"
      style={{
        maxWidth: "1080px",
        margin: "0 auto",
        padding: "2.5rem 1.5rem 4rem",
      }}
    >
      {/* ── PLAIN NOTICE FOR JUDGES ── */}
      <div
        style={{
          backgroundColor: "#eff6ff",
          border: "1.5px solid #3b82f6",
          borderRadius: "var(--radius-lg)",
          padding: "18px 22px",
          marginBottom: "2rem",
          color: "#1e3a8a",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "2px" }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 800, margin: "0 0 4px" }}>
              Notice for Judges: Simulated Staff Access
            </h3>
            <p style={{ fontSize: "0.86rem", lineHeight: 1.6, margin: 0 }}>
              Hospital workers cannot log in directly in this prototype. The <strong>“Viewing as”</strong> dropdown
              below simulates role-based access for hospital support staff. In a production deployment, real authentication,
              audit trails, and access control would integrate directly with the hospital&apos;s own Identity Provider (IdP/SSO/EHR system).
            </p>
          </div>
        </div>
      </div>

      {/* Viewing As Selector Card */}
      <div
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-sm)",
          padding: "22px 26px",
          marginBottom: "2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "var(--primary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Role-Based Filtering
          </span>
          <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "2px 0 4px" }}>
            Hospital Support Worker Portal
          </h2>
          <p style={{ fontSize: "0.84rem", color: "var(--text-secondary)", margin: 0 }}>
            Showing only tickets submitted by patients for this specific hospital ID.
          </p>
        </div>

        {/* "Viewing as" Dropdown */}
        <div>
          <label style={{ fontSize: "0.78rem", fontWeight: 700, display: "block", marginBottom: "4px", color: "var(--text-secondary)" }}>
            Viewing as:
          </label>
          <select
            value={selectedHospitalId}
            onChange={(e) => setSelectedHospitalId(e.target.value)}
            style={{
              padding: "10px 16px",
              borderRadius: "var(--radius)",
              border: "1.5px solid var(--primary)",
              backgroundColor: "var(--surface)",
              color: "var(--text)",
              fontFamily: "inherit",
              fontSize: "0.92rem",
              fontWeight: 600,
              outline: "none",
              cursor: "pointer",
            }}
          >
            {DEFAULT_HOSPITALS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tickets List */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>
            Assigned Tickets ({filteredTickets.length})
          </h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
            Zero Image Retention · Text Fields Only
          </span>
        </div>

        {filteredTickets.length === 0 ? (
          <div
            style={{
              backgroundColor: "var(--surface)",
              border: "1px dashed var(--border)",
              borderRadius: "var(--radius-lg)",
              padding: "40px",
              textAlign: "center",
              color: "var(--text-tertiary)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "10px" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            </div>
            <h4 style={{ fontSize: "1.05rem", color: "var(--text)", marginBottom: "4px" }}>
              No Tickets for this Hospital
            </h4>
            <p style={{ fontSize: "0.85rem", margin: 0 }}>
              When a patient checking the consent box submits a ticket for this Hospital ID, it will appear here.
            </p>
          </div>
        ) : (
          filteredTickets.map((ticket) => {
            const isResolved = ticket.status === "Resolved";
            const isInProgress = ticket.status === "In Progress";

            return (
              <article
                key={ticket.ticketId}
                className="animate-fade-up"
                style={{
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "20px 24px",
                  marginBottom: "16px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: "12px",
                    paddingBottom: "10px",
                    borderBottom: "1px solid var(--border)",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "1.05rem", color: "var(--primary)" }}>
                        {ticket.ticketId}
                      </span>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: "100px",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          backgroundColor: isResolved ? "#dcfce7" : isInProgress ? "#dbeafe" : "#fef3c7",
                          color: isResolved ? "#166534" : isInProgress ? "#1e40af" : "#92400e",
                        }}
                      >
                        {ticket.status}
                      </span>
                      <span style={{ fontSize: "0.75rem", background: "#f0fdf4", color: "#166534", padding: "2px 8px", borderRadius: "4px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Patient Consent Verified</span>
                      </span>
                    </div>

                    <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: "4px 0 2px" }}>
                      Bill Number: <span style={{ fontFamily: "monospace" }}>{ticket.billNumber}</span> · Total: {ticket.amountTotal}
                    </h4>
                    <p style={{ fontSize: "0.78rem", color: "var(--text-tertiary)", margin: 0 }}>
                      {ticket.hospitalName} ({ticket.hospitalId}) · Created {ticket.createdAt}
                    </p>
                  </div>

                  {/* Actions for worker */}
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      onClick={() => handleStatusChange(ticket.ticketId, "In Progress")}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--surface)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Mark In Progress
                    </button>
                    <button
                      onClick={() => handleStatusChange(ticket.ticketId, "Resolved")}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--success)",
                        backgroundColor: "var(--success-light)",
                        color: "var(--success)",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Resolve
                    </button>
                  </div>
                </div>

                {/* Patient Note */}
                <div
                  style={{
                    fontSize: "0.88rem",
                    color: "var(--text)",
                    lineHeight: 1.6,
                    backgroundColor: "var(--surface-raised)",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    marginBottom: "8px",
                  }}
                >
                  <strong>Patient Problem Description:</strong> {ticket.patientNote}
                </div>

                <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                    <span><strong>Image:</strong> Purged from memory (zero image storage)</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    <span><strong>Contact Action:</strong> Ready for hospital worker review</span>
                  </span>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
