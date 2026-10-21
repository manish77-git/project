"use client";

/**
 * src/components/BillLineItemCard.tsx
 *
 * Displays a single billing line item with amount, plain-language explanation,
 * and a speak/stop button using the Web Speech API.
 */

import { useState, useCallback, useRef } from "react";
import type { BillLineItem } from "@/lib/types/billing";
import type { Translations } from "@/lib/i18n/translations";
import type { Lang } from "@/lib/types/billing";

interface Props {
  item: BillLineItem;
  index: number;
  lang: Lang;
  t: Translations["results"];
}

// Icon components (inline SVG — no external dependency)
function SpeakerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function AlertIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export default function BillLineItemCard({ item, index, lang, t }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speechLangCode =
    lang === "hi" ? "hi-IN" : lang === "kn" ? "kn-IN" : "en-IN";

  const amountText = item.amountInr
    ? `${
        lang === "hi" ? "राशि" : lang === "kn" ? "ಮೊತ್ತ" : "Amount"
      }: ₹ ${formatAmount(item.amountInr)} ${
        lang === "hi" ? "रुपये" : lang === "kn" ? "ರೂಪಾಯಿಗಳು" : "rupees"
      }`
    : t.notStated;
  const textToSpeak = `${item.chargeLabel}. ${amountText}. ${item.explanation}`;

  const handleSpeak = useCallback(() => {
    if (!("speechSynthesis" in window)) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = speechLangCode;
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [speaking, textToSpeak, speechLangCode]);

  const formattedAmount = item.amountInr ? formatAmount(item.amountInr) : null;

  return (
    <article
      className="animate-fade-up"
      style={{
        animationDelay: `${index * 80}ms`,
        background: "var(--surface)",
        border: `1px solid ${item.confident ? "var(--border)" : "var(--warning)"}`,
        borderRadius: "var(--radius-lg)",
        padding: "20px 24px",
        boxShadow: "var(--shadow-sm)",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
          {/* Index badge */}
          <span style={{
            flexShrink: 0,
            width: "28px", height: "28px",
            borderRadius: "50%",
            background: "var(--primary-light)",
            color: "var(--primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "0.75rem", fontWeight: 700,
          }}>
            {index + 1}
          </span>

          {/* Charge name */}
          <h3 style={{
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--text)",
            margin: 0,
            lineHeight: 1.35,
          }}>
            {item.chargeLabel}
          </h3>
        </div>

        {/* Amount badge */}
        <div style={{
          flexShrink: 0,
          background: "var(--primary-light)",
          color: "var(--primary)",
          borderRadius: "var(--radius)",
          padding: "4px 12px",
          fontSize: "0.95rem",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}>
          {formattedAmount ? `₹ ${formattedAmount}` : t.notStated}
        </div>
      </div>

      {/* Low-confidence warning */}
      {!item.confident && (
        <div style={{
          display: "flex", alignItems: "center", gap: "6px",
          background: "var(--warning-light)",
          border: "1px solid var(--warning)",
          borderRadius: "var(--radius-sm)",
          padding: "8px 12px",
          marginBottom: "12px",
          color: "#92400e",
          fontSize: "0.82rem",
        }}>
          <AlertIcon />
          <span>{t.missingAmount}</span>
        </div>
      )}

      {/* Explanation */}
      {item.explanation.length > 0 && (
        <p style={{
          fontSize: "0.9rem",
          color: "var(--text-secondary)",
          lineHeight: 1.65,
          margin: "0 0 16px 0",
          paddingLeft: "38px",
        }}>
          {item.explanation}
        </p>
      )}

      {/* Listen button */}
      <div style={{ paddingLeft: "38px" }}>
        <button
          onClick={handleSpeak}
          disabled={!("speechSynthesis" in (typeof window !== "undefined" ? window : {}))}
          aria-label={speaking ? t.stopBtn : t.listenBtn}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "7px 16px",
            border: `1px solid ${speaking ? "var(--error)" : "var(--primary)"}`,
            borderRadius: "var(--radius-sm)",
            background: speaking ? "var(--error-light)" : "var(--primary-light)",
            color: speaking ? "var(--error)" : "var(--primary)",
            fontSize: "0.82rem",
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: "pointer",
            transition: "all 0.18s ease",
          }}
        >
          {speaking ? (
            <>
              {/* Wave animation */}
              <span style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "16px" }}>
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
                <span className="wave-bar" />
              </span>
              {t.stopBtn}
            </>
          ) : (
            <>
              <SpeakerIcon />
              {t.listenBtn}
            </>
          )}
        </button>
      </div>
    </article>
  );
}

function formatAmount(amountInr: string): string {
  const num = parseFloat(amountInr);
  if (isNaN(num)) return amountInr;
  return num.toLocaleString("en-IN");
}
