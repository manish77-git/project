"use client";

/**
 * src/components/HeroSection.tsx
 *
 * Landing hero with headline, clear CTAs, and privacy notice.
 * Reorganized single-column layout without preview card.
 */

import type { Translations } from "@/lib/i18n/translations";

interface Props {
  t: Translations;
  onUploadClick: () => void;
  onEnterBillNumberClick: () => void;
  onHowItWorksClick?: () => void;
}

export default function HeroSection({
  t,
  onUploadClick,
  onEnterBillNumberClick,
  onHowItWorksClick,
}: Props) {
  return (
    <section
      style={{
        padding: "3.5rem 1.5rem 2.5rem",
        maxWidth: "920px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      <div
        className="animate-fade-up"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "100px",
            backgroundColor: "var(--primary-light)",
            border: "1px solid var(--border-focus)",
            color: "var(--primary)",
            fontSize: "0.8rem",
            fontWeight: 600,
            marginBottom: "1.25rem",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "var(--primary)",
            }}
            className="animate-pulse"
          />
          {t.hero.badge}
        </div>

        {/* Heading */}
        <h1
          style={{
            fontSize: "clamp(2.2rem, 4.5vw, 3.4rem)",
            fontWeight: 800,
            color: "var(--text)",
            letterSpacing: "-0.025em",
            lineHeight: 1.18,
            marginBottom: "1rem",
            maxWidth: "780px",
          }}
        >
          {t.hero.heading}
        </h1>

        {/* Subheading */}
        <p
          style={{
            fontSize: "1.05rem",
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            marginBottom: "2.25rem",
            maxWidth: "660px",
          }}
        >
          {t.hero.subheading}
        </p>

        {/* ── TWO CLEAR OPTIONS: Upload Bill vs Enter Bill Number ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "18px",
            width: "100%",
            maxWidth: "840px",
            marginBottom: "1.75rem",
            textAlign: "left",
          }}
        >
          {/* Option 1: Upload Bill */}
          <div
            style={{
              backgroundColor: "var(--surface)",
              borderRadius: "var(--radius-lg)",
              border: "2px solid var(--primary-border)",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "14px",
              boxShadow: "0 2px 8px rgba(29, 78, 216, 0.08)",
              transition: "all 0.2s ease",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--primary)" }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <h3 style={{ fontSize: "1.02rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>
                  {t.hero.optionUploadTitle}
                </h3>
              </div>
              <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.45 }}>
                {t.hero.optionUploadDesc}
              </p>
            </div>

            <button
              onClick={onUploadClick}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "10px 16px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--primary)",
                color: "#ffffff",
                border: "none",
                fontSize: "0.88rem",
                fontWeight: 700,
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>{t.hero.optionUploadBtn}</span>
            </button>
          </div>

          {/* Option 2: Enter Bill Number */}
          <div
            style={{
              backgroundColor: "var(--surface)",
              borderRadius: "var(--radius-lg)",
              border: "2px solid #86efac",
              padding: "18px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "14px",
              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.08)",
              transition: "all 0.2s ease",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
                    <path d="M14 8H8" />
                    <path d="M16 12H8" />
                    <path d="M13 16H8" />
                  </svg>
                  <h3 style={{ fontSize: "1.02rem", fontWeight: 800, color: "var(--text)", margin: 0 }}>
                    {t.hero.optionLookupTitle}
                  </h3>
                </div>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    backgroundColor: "#f0fdf4",
                    color: "#166534",
                    border: "1px solid #86efac",
                    padding: "2px 7px",
                    borderRadius: "100px",
                  }}
                >
                  2G Friendly
                </span>
              </div>
              <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.45 }}>
                {t.hero.optionLookupDesc}
              </p>
            </div>

            <button
              onClick={onEnterBillNumberClick}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "10px 16px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "#16a34a",
                color: "#ffffff",
                border: "none",
                fontSize: "0.88rem",
                fontWeight: 700,
                fontFamily: "inherit",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>{t.hero.optionLookupBtn}</span>
            </button>
          </div>
        </div>

        {/* How It Works Button */}
        {onHowItWorksClick && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "1.5rem" }}>
            <button
              type="button"
              onClick={onHowItWorksClick}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 18px",
                borderRadius: "var(--radius)",
                backgroundColor: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                fontSize: "0.85rem",
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {t.hero.ctaHowItWorks || "How It Works"}
            </button>
          </div>
        )}

        {/* Privacy Note */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--border)",
            maxWidth: "580px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p
            style={{
              fontSize: "0.82rem",
              color: "var(--text-secondary)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {t.hero.privacyNote}
          </p>
        </div>
      </div>
    </section>
  );
}
