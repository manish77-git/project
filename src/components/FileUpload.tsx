"use client";

/**
 * src/components/FileUpload.tsx
 *
 * Drag-and-drop file upload zone with:
 * - Image preview
 * - File validation (type + size)
 * - Remove / change file
 * - Keyboard accessible
 */

import { useState, useCallback, useRef, useId } from "react";
import type { Translations } from "@/lib/i18n/translations";

interface Props {
  onFileSelected: (file: File | null) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  t: Translations["upload"];
  disabled?: boolean;
}

// Only formats the OCR engine can actually decode. PDFs are not supported yet,
// so the picker must not promise them.
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/bmp"];
const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

function UploadIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
      stroke="var(--primary)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"
      aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="var(--success)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function FileUpload({ onFileSelected, onAnalyze, isAnalyzing, t, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropZoneId = useId();

  const clearPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

  const processFile = useCallback((incoming: File) => {
    setError(null);
    if (!ACCEPTED_TYPES.includes(incoming.type)) {
      setError(t.errorType);
      return;
    }
    if (incoming.size > MAX_SIZE_BYTES) {
      setError(t.errorSize);
      return;
    }
    clearPreview();
    setFile(incoming);
    onFileSelected(incoming);
    if (incoming.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(incoming));
    }
  }, [clearPreview, onFileSelected, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) processFile(dropped);
  }, [processFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
    e.target.value = "";
  }, [processFile]);

  const handleRemove = useCallback(() => {
    clearPreview();
    setFile(null);
    setError(null);
    onFileSelected(null);
  }, [clearPreview, onFileSelected]);

  const fileSizeLabel = file
    ? file.size > 1024 * 1024
      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(file.size / 1024)} KB`
    : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Drop zone */}
      {!file && (
        <div
          id={dropZoneId}
          role="button"
          tabIndex={0}
          aria-label={`${t.dropzone} ${t.browse}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
          style={{
            border: `2px dashed ${dragOver ? "var(--primary)" : error ? "var(--error)" : "var(--border)"}`,
            borderRadius: "var(--radius-lg)",
            padding: "48px 24px",
            textAlign: "center",
            cursor: "pointer",
            background: dragOver ? "var(--primary-light)" : error ? "var(--error-light)" : "var(--surface-raised)",
            transition: "all 0.2s ease",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.bmp"
            onChange={handleInputChange}
            style={{ display: "none" }}
            aria-label={t.title}
          />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <UploadIcon />
            <div>
              <p style={{ margin: 0, color: "var(--text)", fontWeight: 500, fontSize: "0.95rem" }}>
                {t.dropzone}{" "}
                <span style={{ color: "var(--primary)", textDecoration: "underline", fontWeight: 600 }}>
                  {t.browse}
                </span>
              </p>
              <p style={{ margin: "6px 0 0", color: "var(--text-tertiary)", fontSize: "0.82rem" }}>
                {t.accepted}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Validation error */}
      {error && (
        <div role="alert" style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "10px 14px",
          background: "var(--error-light)",
          border: "1px solid var(--error)",
          borderRadius: "var(--radius-sm)",
          color: "var(--error)",
          fontSize: "0.85rem",
        }}>
          <XIcon size={14} />
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--error)", padding: 0 }}
          >
            {t.retryBtn}
          </button>
        </div>
      )}

      {/* File preview */}
      {file && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}>
          {/* Image preview */}
          {previewUrl && (
            <div style={{ position: "relative", width: "100%", height: "220px", overflow: "hidden", background: "#f1f5f9" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={t.preview}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
              <div style={{
                position: "absolute", top: "10px", right: "10px",
                background: "var(--success-light)",
                border: "1px solid var(--success)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 10px",
                display: "flex", alignItems: "center", gap: "5px",
                fontSize: "0.78rem", color: "var(--success)", fontWeight: 600,
              }}>
                <CheckIcon />
                {t.selected}
              </div>
            </div>
          )}

          {/* PDF placeholder */}
          {!previewUrl && (
            <div style={{
              padding: "24px", display: "flex", alignItems: "center", gap: "12px",
              background: "var(--surface-raised)",
            }}>
              <div style={{
                width: "48px", height: "48px", borderRadius: "var(--radius-sm)",
                background: "var(--primary-light)", display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--primary)",
              }}>
                <FileIcon />
              </div>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem", color: "var(--text)" }}>
                  {file.name}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                  Image · {fileSizeLabel}
                </p>
              </div>
            </div>
          )}

          {/* File metadata + actions */}
          <div style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
          }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>{file.name}</p>
              <p style={{ margin: "2px 0 0", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{fileSizeLabel}</p>
            </div>
            <button
              onClick={handleRemove}
              disabled={isAnalyzing}
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "5px 12px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface)",
                color: "var(--text-secondary)",
                fontSize: "0.8rem", fontWeight: 500, fontFamily: "inherit",
                cursor: isAnalyzing ? "not-allowed" : "pointer",
                opacity: isAnalyzing ? 0.5 : 1,
              }}
            >
              <XIcon size={12} />
              {t.changeFile}
            </button>
          </div>
        </div>
      )}

      {/* Analyze button */}
      {file && !isAnalyzing && (
        <button
          onClick={onAnalyze}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "14px",
            background: "var(--primary)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius)",
            fontSize: "1rem",
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: "pointer",
            transition: "background 0.2s ease, transform 0.15s ease",
            boxShadow: "0 2px 8px rgba(29,78,216,0.25)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--primary-hover)";
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--primary)";
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
          }}
        >
          {t.analyzeBtn}
        </button>
      )}
    </div>
  );
}
