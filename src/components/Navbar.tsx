"use client";

/**
 * src/components/Navbar.tsx
 *
 * Header with MediExplain AI branding, tagline, navigation mode toggle,
 * and LanguageSwitcher.
 */

import LanguageSwitcher from "./LanguageSwitcher";
import type { Lang } from "@/lib/types/billing";
import type { Translations } from "@/lib/i18n/translations";

interface Props {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  t: Translations;
  viewMode: "patient" | "worker";
  onViewModeChange: (mode: "patient" | "worker") => void;
  onReset?: () => void;
}

export default function Navbar({
  lang,
  onLangChange,
  t,
  viewMode,
  onViewModeChange,
  onReset,
}: Props) {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        backgroundColor: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
        padding: "0 1.5rem",
        height: "68px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      {/* Brand logo & tagline */}
      <button
        onClick={onReset}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          textAlign: "left",
          textDecoration: "none",
        }}
      >
        <div
          style={{
            width: "40px",
            height: "40px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, var(--primary), var(--secondary))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: "20px",
            boxShadow: "0 2px 8px rgba(29, 78, 216, 0.25)",
            flexShrink: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 6v12M6 12h12" />
          </svg>
        </div>
        <div>
          <div
            style={{
              fontSize: "1.15rem",
              fontWeight: 800,
              color: "var(--text)",
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {t.nav.brand.split(" ")[0]}
            <span style={{ color: "var(--primary)" }}>
              {t.nav.brand.split(" ")[1] || "AI"}
            </span>
          </div>
          <div
            style={{
              fontSize: "0.76rem",
              color: "var(--text-secondary)",
              fontWeight: 500,
            }}
          >
            {t.nav.tagline}
          </div>
        </div>
      </button>

      {/* Center: Mode switcher (Patient Explainer vs Hospital Worker) */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "3px",
        }}
      >
        <button
          onClick={() => onViewModeChange("patient")}
          style={{
            padding: "6px 14px",
            borderRadius: "8px",
            border: "none",
            fontFamily: "inherit",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.18s ease",
            background: viewMode === "patient" ? "var(--surface)" : "transparent",
            color: viewMode === "patient" ? "var(--primary)" : "var(--text-secondary)",
            boxShadow: viewMode === "patient" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Patient Explainer
          </span>
        </button>

        <button
          onClick={() => onViewModeChange("worker")}
          style={{
            padding: "6px 14px",
            borderRadius: "8px",
            border: "none",
            fontFamily: "inherit",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.18s ease",
            background: viewMode === "worker" ? "var(--surface)" : "transparent",
            color: viewMode === "worker" ? "var(--primary)" : "var(--text-secondary)",
            boxShadow: viewMode === "worker" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
              <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
              <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
              <path d="M10 6h4" />
              <path d="M10 10h4" />
              <path d="M10 14h4" />
              <path d="M10 18h4" />
            </svg>
            Hospital Worker Dashboard
          </span>
        </button>
      </div>

      {/* Nav actions: Language Switcher */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <LanguageSwitcher
          lang={lang}
          onChange={onLangChange}
          t={t.nav}
        />
      </div>
    </header>
  );
}
