"use client";

/**
 * src/components/Footer.tsx
 *
 * Professional healthcare footer with medical/financial disclaimer and metadata.
 */

import type { Translations } from "@/lib/i18n/translations";

interface Props {
  t: Translations["footer"];
}

export default function Footer({ t }: Props) {
  return (
    <footer
      style={{
        backgroundColor: "var(--surface)",
        borderTop: "1px solid var(--border)",
        padding: "3rem 1.5rem 2rem",
        marginTop: "auto",
      }}
    >
      <div style={{ maxWidth: "1080px", margin: "0 auto" }}>
        {/* Top brand & links */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1.5rem",
            paddingBottom: "1.75rem",
            borderBottom: "1px solid var(--border)",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                backgroundColor: "var(--primary)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 6v12M6 12h12" />
              </svg>
            </div>
            <span
              style={{
                fontSize: "1.1rem",
                fontWeight: 800,
                color: "var(--text)",
              }}
            >
              MediExplain <span style={{ color: "var(--primary)" }}>AI</span>
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "20px",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            <a
              href="#about"
              style={{ color: "var(--text-secondary)", textDecoration: "none" }}
            >
              {t.about}
            </a>
            <a
              href="#privacy"
              style={{ color: "var(--text-secondary)", textDecoration: "none" }}
            >
              {t.privacy}
            </a>
            <a
              href="#terms"
              style={{ color: "var(--text-secondary)", textDecoration: "none" }}
            >
              {t.terms}
            </a>
          </div>
        </div>

        {/* Disclaimer */}
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            borderRadius: "var(--radius-sm)",
            padding: "14px 18px",
            marginBottom: "1.5rem",
          }}
        >
          <p
            style={{
              fontSize: "0.78rem",
              color: "var(--text-tertiary)",
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "-2px", marginRight: "6px" }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <strong>Disclaimer:</strong> {t.disclaimer}
          </p>
        </div>

        {/* Copyright */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
            fontSize: "0.76rem",
            color: "var(--text-tertiary)",
          }}
        >
          <span>© 2026 MediExplain AI</span>
          <span>Made for transparent healthcare billing</span>
        </div>
      </div>
    </footer>
  );
}
