"use client";

/**
 * src/components/AnalysisLoading.tsx
 *
 * Animated loading state displayed while the bill is being analyzed.
 * Shows step-by-step progress: OCR -> Charge extraction -> Explanations.
 */

import type { Translations } from "@/lib/i18n/translations";

interface Props {
  currentStep: 1 | 2 | 3;
  t: Translations["upload"];
}

export default function AnalysisLoading({ currentStep, t }: Props) {
  const steps = [
    { num: 1, label: t.analyzingStep1 },
    { num: 2, label: t.analyzingStep2 },
    { num: 3, label: t.analyzingStep3 },
  ];

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-up"
      style={{
        backgroundColor: "var(--surface)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow)",
        padding: "3.5rem 2rem",
        textAlign: "center",
        maxWidth: "600px",
        margin: "2rem auto",
      }}
    >
      {/* Central Spinner */}
      <div
        style={{
          width: "68px",
          height: "68px",
          borderRadius: "50%",
          border: "4px solid var(--primary-light)",
          borderTopColor: "var(--primary)",
          margin: "0 auto 1.5rem",
        }}
        className="animate-spin"
      />

      {/* Main Title */}
      <h2
        style={{
          fontSize: "1.35rem",
          fontWeight: 800,
          color: "var(--text)",
          margin: "0 0 0.5rem",
        }}
      >
        {t.analyzing}
      </h2>

      <p
        style={{
          fontSize: "0.9rem",
          color: "var(--text-secondary)",
          margin: "0 0 2rem",
        }}
      >
        AI is reviewing charges, verifying line items, and translating medical terms.
      </p>

      {/* Steps List */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          textAlign: "left",
          maxWidth: "380px",
          margin: "0 auto",
        }}
      >
        {steps.map(({ num, label }) => {
          const isDone = currentStep > num;
          const isCurrent = currentStep === num;

          return (
            <div
              key={num}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: isCurrent
                  ? "var(--primary-light)"
                  : isDone
                  ? "var(--success-light)"
                  : "var(--surface-raised)",
                transition: "all 0.3s ease",
              }}
            >
              {/* Circle check/spinner */}
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  flexShrink: 0,
                  backgroundColor: isDone
                    ? "var(--success)"
                    : isCurrent
                    ? "var(--primary)"
                    : "var(--border)",
                  color: "#ffffff",
                }}
              >
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : isCurrent ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                ) : (
                  num
                )}
              </div>

              {/* Step text */}
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: isCurrent ? 700 : isDone ? 500 : 400,
                  color: isCurrent
                    ? "var(--primary)"
                    : isDone
                    ? "var(--text)"
                    : "var(--text-tertiary)",
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
