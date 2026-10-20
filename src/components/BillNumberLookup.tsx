"use client";

/**
 * src/components/BillNumberLookup.tsx
 *
 * Lightweight bill lookup form designed for low-network / 2G connections.
 * Allows patients to find their bill via receipt number without uploading images.
 */

import { useState, useRef, useEffect } from "react";
import type { Lang } from "@/lib/types/billing";
import type { BillAnalysisResult, BillLookupResponse } from "@/lib/types/billing";
import type { Translations } from "@/lib/i18n/translations";
import { lookupBillByNumber } from "@/lib/services/billingService";

interface Props {
  lang: Lang;
  t: Translations["billLookup"];
  onBillFound: (result: BillAnalysisResult) => void;
  onBackToOptions: () => void;
  onSwitchToUpload: () => void;
}

export default function BillNumberLookup({
  lang,
  t,
  onBillFound,
  onBackToOptions,
  onSwitchToUpload,
}: Props) {
  const [billNumber, setBillNumber] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notFoundState, setNotFoundState] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleLookup = async (overrideNumber?: string) => {
    const query = (overrideNumber !== undefined ? overrideNumber : billNumber).trim();

    if (!query) {
      setErrorMessage(t.emptyError);
      setNotFoundState(false);
      setConnectionError(false);
      inputRef.current?.focus();
      return;
    }

    setErrorMessage(null);
    setNotFoundState(false);
    setConnectionError(false);
    setIsSearching(true);

    try {
      const response: BillLookupResponse = await lookupBillByNumber(query, lang);

      if (response.status === "found" && response.result) {
        onBillFound(response.result);
      } else if (response.status === "connection_error") {
        setConnectionError(true);
      } else {
        setNotFoundState(true);
      }
    } catch {
      setConnectionError(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLookup();
    }
  };

  const handleTryAnother = () => {
    setNotFoundState(false);
    setConnectionError(false);
    setErrorMessage(null);
    setBillNumber("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div
      style={{
        backgroundColor: "var(--surface)",
        borderRadius: "var(--radius-xl)",
        border: "1.5px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        padding: "2rem",
        marginBottom: "2rem",
        maxWidth: "680px",
        margin: "0 auto",
      }}
    >
      {/* Top Header with Back button and Low Network Pill */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <button
          onClick={onBackToOptions}
          style={{
            background: "none",
            border: "none",
            color: "var(--primary)",
            fontWeight: 700,
            fontSize: "0.88rem",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "4px 8px",
            borderRadius: "6px",
          }}
        >
          {t.backBtn}
        </button>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            borderRadius: "100px",
            backgroundColor: "#f0fdf4",
            border: "1px solid #86efac",
            color: "#166534",
            fontSize: "0.74rem",
            fontWeight: 700,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/></svg>
          {t.lowNetworkBadge}
        </span>
      </div>

      {/* Title & Instruction */}
      <div style={{ marginBottom: "1.75rem" }}>
        <h2
          style={{
            fontSize: "1.55rem",
            fontWeight: 800,
            color: "var(--text)",
            marginBottom: "6px",
            letterSpacing: "-0.02em",
          }}
        >
          {t.heading}
        </h2>
        <p
          style={{
            fontSize: "0.92rem",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          {t.instruction}
        </p>
      </div>

      {/* Input Group */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: "16px",
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              alignItems: "center",
              color: "var(--text-tertiary)",
              pointerEvents: "none",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/></svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            value={billNumber}
            onChange={(e) => {
              setBillNumber(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t.placeholder}
            aria-label={t.heading}
            disabled={isSearching}
            style={{
              width: "100%",
              padding: "16px 16px 16px 52px",
              borderRadius: "var(--radius)",
              border: errorMessage
                ? "2px solid var(--error)"
                : "2px solid var(--border)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: "1.1rem",
              fontWeight: 600,
              fontFamily: "monospace",
              letterSpacing: "0.04em",
              outline: "none",
              transition: "border-color 0.2s ease",
            }}
          />
        </div>

        {/* Empty Input Validation Error */}
        {errorMessage && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "var(--error)",
              fontSize: "0.84rem",
              fontWeight: 600,
              marginTop: "8px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Sample Bill Quick-Fill Suggestion */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "0.78rem",
            color: "var(--text-tertiary)",
            fontWeight: 600,
          }}
        >
          Quick test demo numbers:
        </span>
        {["BILL-2026-001", "INV-2026-0042"].map((demoNum) => (
          <button
            key={demoNum}
            type="button"
            onClick={() => {
              setBillNumber(demoNum);
              handleLookup(demoNum);
            }}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--primary)",
              fontFamily: "monospace",
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {demoNum}
          </button>
        ))}
      </div>

      {/* Action Button */}
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={() => handleLookup()}
          disabled={isSearching}
          style={{
            width: "100%",
            padding: "14px 24px",
            borderRadius: "var(--radius)",
            backgroundColor: "var(--primary)",
            color: "white",
            border: "none",
            fontSize: "1rem",
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: isSearching ? "wait" : "pointer",
            boxShadow: "0 4px 14px rgba(29, 78, 216, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            opacity: isSearching ? 0.75 : 1,
            transition: "all 0.2s ease",
          }}
        >
          {isSearching ? (
            <>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ animation: "spin 1s linear infinite" }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>{t.searchingBtn}</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>{t.findBtn}</span>
            </>
          )}
        </button>
      </div>

      {/* NOT FOUND ERROR STATE */}
      {notFoundState && (
        <div
          style={{
            backgroundColor: "var(--error-light)",
            border: "1.5px solid #fca5a5",
            borderRadius: "var(--radius-lg)",
            padding: "18px 20px",
            marginTop: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              marginBottom: "12px",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "2px" }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <h4
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 800,
                  color: "#991b1b",
                  marginBottom: "4px",
                }}
              >
                {t.notFoundTitle}
              </h4>
              <p
                style={{
                  fontSize: "0.88rem",
                  color: "#7f1d1d",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {t.notFoundMsg}
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "14px",
            }}
          >
            <button
              type="button"
              onClick={handleTryAnother}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "white",
                color: "#991b1b",
                border: "1px solid #fca5a5",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              <span>{t.tryAnotherBtn}</span>
            </button>
            <button
              type="button"
              onClick={onSwitchToUpload}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--primary)",
                color: "white",
                border: "none",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>{t.uploadInsteadBtn}</span>
            </button>
          </div>
        </div>
      )}

      {/* CONNECTION ERROR STATE */}
      {connectionError && (
        <div
          style={{
            backgroundColor: "#fffbeb",
            border: "1.5px solid #fcd34d",
            borderRadius: "var(--radius-lg)",
            padding: "18px 20px",
            marginTop: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              marginBottom: "12px",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "2px" }}>
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <div>
              <h4
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 800,
                  color: "#92400e",
                  marginBottom: "4px",
                }}
              >
                {t.connectionErrorTitle}
              </h4>
              <p
                style={{
                  fontSize: "0.88rem",
                  color: "#78350f",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {t.connectionErrorMsg}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleLookup()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 18px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "#d97706",
              color: "white",
              border: "none",
              fontSize: "0.85rem",
              fontWeight: 700,
              cursor: "pointer",
              marginTop: "6px",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            <span>{t.retryBtn}</span>
          </button>
        </div>
      )}
    </div>
  );
}
