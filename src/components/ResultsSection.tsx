"use client";

/**
 * src/components/ResultsSection.tsx
 *
 * Results section displaying the analyzed bill items, total,
 * listen buttons (TTS), findings, recommended next steps, and action toolbar.
 */

import { useState } from "react";
import BillLineItemCard from "./BillLineItemCard";
import type { BillAnalysisResult, Lang } from "@/lib/types/billing";
import type { Translations } from "@/lib/i18n/translations";

interface Props {
  result: BillAnalysisResult;
  lang: Lang;
  t: Translations["results"];
  onNewAnalysis: () => void;
}

export default function ResultsSection({ result, lang, t, onNewAnalysis }: Props) {
  const [copied, setCopied] = useState(false);
  const [isSpeakingAll, setIsSpeakingAll] = useState(false);

  const handleListenAll = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Text to speech is not supported in this browser.");
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setIsSpeakingAll(false);
      return;
    }

    const hospitalStr = result.hospitalName || "Hospital Statement";
    const billStr = result.billNumber ? `Bill number ${result.billNumber}.` : "";
    const totalStr = result.totalInr ? `Total bill is ${result.totalInr} rupees.` : "";

    const itemsStr = result.items
      .map(
        (it, idx) =>
          `Item ${idx + 1}: ${it.chargeLabel}, ${it.amountInr} rupees. ${it.explanation}`
      )
      .join(". ");

    const fullScript = `${hospitalStr}. ${billStr} ${totalStr} ${itemsStr}`;

    const utterance = new SpeechSynthesisUtterance(fullScript);
    utterance.lang = lang === "hi" ? "hi-IN" : lang === "kn" ? "kn-IN" : "en-IN";
    utterance.rate = 0.95;

    utterance.onend = () => setIsSpeakingAll(false);
    utterance.onerror = () => setIsSpeakingAll(false);

    setIsSpeakingAll(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleCopy = () => {
    const summaryText = [
      `${result.hospitalName || "Hospital Bill"} — Bill #${result.billNumber || "N/A"}`,
      `Total: ₹ ${result.totalInr ? parseFloat(result.totalInr).toLocaleString("en-IN") : "N/A"}`,
      "",
      ...result.items.map(
        (item, idx) =>
          `${idx + 1}. ${item.chargeLabel}: ₹ ${item.amountInr}\n   ${item.explanation}`
      ),
    ].join("\n");

    navigator.clipboard.writeText(summaryText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const totalFormatted = result.totalInr
    ? parseFloat(result.totalInr).toLocaleString("en-IN")
    : null;

  return (
    <section
      aria-labelledby="results-heading"
      className="animate-fade-up"
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "1rem 0 3rem",
      }}
    >
      {/* Banner: Real vs Demo Data */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "12px 18px",
          borderRadius: "var(--radius)",
          backgroundColor:
            result.source === "demo"
              ? "var(--warning-light)"
              : "var(--success-light)",
          border: `1px solid ${
            result.source === "demo" ? "var(--warning)" : "var(--success)"
          }`,
          marginBottom: "1.75rem",
          fontSize: "0.88rem",
          color: result.source === "demo" ? "#92400e" : "var(--success)",
          fontWeight: 600,
        }}
      >
        {result.source === "demo" ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        )}
        <span>{result.source === "demo" ? t.demoBanner : t.realBanner}</span>
      </div>

      {/* Main Results Card Header */}
      <div
        style={{
          backgroundColor: "var(--surface)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          padding: "24px 28px",
          marginBottom: "1.75rem",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "0.78rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--primary)",
            }}
          >
            {result.hospitalName || "Hospital Statement"}
          </span>
          <h2
            id="results-heading"
            style={{
              fontSize: "1.65rem",
              fontWeight: 800,
              color: "var(--text)",
              margin: "4px 0 2px",
            }}
          >
            {t.heading}
          </h2>
          <p
            style={{
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            Bill #{result.billNumber || "DEMO-2026-001"} · Verified with AI
          </p>
        </div>

        {/* Total Bill Badge */}
        {totalFormatted && (
          <div
            style={{
              backgroundColor: "var(--primary-light)",
              border: "1px solid var(--border-focus)",
              borderRadius: "var(--radius)",
              padding: "12px 20px",
              textAlign: "right",
            }}
          >
            <div
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                color: "var(--primary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {t.totalLabel}
            </div>
            <div
              style={{
                fontSize: "1.7rem",
                fontWeight: 800,
                color: "var(--primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ₹ {totalFormatted}
            </div>
          </div>
        )}
      </div>

      {/* Voice Guidance / Listen to All Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          backgroundColor: isSpeakingAll ? "var(--error-light)" : "var(--surface)",
          border: isSpeakingAll ? "2px solid var(--error)" : "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "14px 20px",
          marginBottom: "1.25rem",
          boxShadow: "var(--shadow-sm)",
          transition: "all 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {isSpeakingAll ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
          )}
          <div>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "var(--text)" }}>
              {isSpeakingAll ? "Reading Entire Bill Aloud..." : "Voice Guidance & Audio Navigation"}
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: 0 }}>
              Listen to the hospital name, bill number, all itemized charges, and total amount read aloud.
            </p>
          </div>
        </div>

        <button
          onClick={handleListenAll}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "9px 20px",
            borderRadius: "var(--radius-sm)",
            backgroundColor: isSpeakingAll ? "var(--error)" : "var(--primary)",
            color: "white",
            border: "none",
            fontSize: "0.88rem",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            boxShadow: isSpeakingAll
              ? "0 2px 10px rgba(220, 38, 38, 0.3)"
              : "0 2px 8px rgba(29, 78, 216, 0.25)",
            transition: "all 0.2s ease",
          }}
        >
          {isSpeakingAll ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
          <span>{isSpeakingAll ? t.stopPlaybackBtn : t.listenAllBtn}</span>
        </button>
      </div>

      {/* Vertical list of line item cards with Listen buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          marginBottom: "2rem",
        }}
      >
        {result.items.map((item, index) => (
          <BillLineItemCard
            key={item.id || index}
            item={item}
            index={index}
            lang={lang}
            t={t}
          />
        ))}
      </div>

      {/* Findings & Next Steps Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1.25rem",
          marginBottom: "2rem",
        }}
      >
        {/* Key Findings */}
        <div
          style={{
            backgroundColor: "var(--surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            padding: "20px 24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              {t.findingsTitle}
            </h3>
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.2rem",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {t.findingsList.map((f, i) => (
              <li
                key={i}
                style={{
                  fontSize: "0.86rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                }}
              >
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Recommended Next Steps */}
        <div
          style={{
            backgroundColor: "var(--surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            padding: "20px 24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              {t.nextStepsTitle}
            </h3>
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.2rem",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {t.nextStepsList.map((step, i) => (
              <li
                key={i}
                style={{
                  fontSize: "0.86rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                }}
              >
                {step}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Action Buttons: Copy, Download, New Analysis */}
      <div
        className="no-print"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          justifyContent: "flex-end",
        }}
      >
        <button
          onClick={handleCopy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "9px 18px",
            borderRadius: "var(--radius)",
            backgroundColor: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.18s ease",
          }}
        >
          {copied ? (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{t.copiedBtn}</span>
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
              <span>{t.copyBtn}</span>
            </>
          )}
        </button>

        <button
          onClick={handlePrint}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "9px 18px",
            borderRadius: "var(--radius)",
            backgroundColor: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            fontSize: "0.88rem",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.18s ease",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect width="12" height="8" x="6" y="14" />
          </svg>
          <span>{t.downloadBtn}</span>
        </button>

        <button
          onClick={onNewAnalysis}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "9px 20px",
            borderRadius: "var(--radius)",
            backgroundColor: "var(--primary)",
            color: "#ffffff",
            border: "none",
            fontSize: "0.88rem",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "all 0.18s ease",
          }}
        >
          + {t.newAnalysisBtn}
        </button>
      </div>
    </section>
  );
}
