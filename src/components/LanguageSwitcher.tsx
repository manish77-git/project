"use client";

/**
 * src/components/LanguageSwitcher.tsx
 *
 * Accessible three-way toggle: English | हिंदी | ಕನ್ನಡ
 */

import type { Lang } from "@/lib/types/billing";
import type { Translations } from "@/lib/i18n/translations";

interface Props {
  lang: Lang;
  onChange: (lang: Lang) => void;
  t: Translations["nav"];
}

export default function LanguageSwitcher({ lang, onChange, t }: Props) {
  const options: { code: Lang; label: string }[] = [
    { code: "en", label: t.langEn || "English" },
    { code: "hi", label: t.langHi || "हिंदी" },
    { code: "kn", label: t.langKn || "ಕನ್ನಡ" },
  ];

  return (
    <div
      role="group"
      aria-label={t.langLabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: "3px",
      }}
    >
      {options.map(({ code, label }) => {
        const active = lang === code;
        return (
          <button
            key={code}
            onClick={() => onChange(code)}
            aria-pressed={active}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "none",
              fontFamily: "inherit",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.18s ease",
              background: active ? "var(--primary)" : "transparent",
              color: active ? "#ffffff" : "var(--text-secondary)",
              boxShadow: active ? "0 2px 6px rgba(29,78,216,0.28)" : "none",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
