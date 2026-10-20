"use client";

/**
 * src/app/page.tsx
 *
 * MediExplain AI — Medical Bill Explainer Website.
 *
 * Features:
 * 1. Upload hospital bill (processed in-memory, zero image storage).
 * 2. Extract & explain charges using OCR + LLM.
 * 3. Listen to explanation via Web Speech TTS.
 * 4. Contextual AI Chatbox.
 * 5. Patient Support Ticket tied to Bill # and Hospital ID (Requires explicit consent).
 * 6. Hospital Worker Dashboard with "Viewing as" dropdown and judge disclosure.
 */

import { useState, useRef, useCallback } from "react";
import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import FileUpload from "@/components/FileUpload";
import BillNumberLookup from "@/components/BillNumberLookup";
import AnalysisLoading from "@/components/AnalysisLoading";
import ResultsSection from "@/components/ResultsSection";
import ContextualChat from "@/components/ContextualChat";
import SupportTicketSection from "@/components/SupportTicketSection";
import HospitalWorkerDashboard from "@/components/HospitalWorkerDashboard";
import HowItWorks from "@/components/HowItWorks";
import Footer from "@/components/Footer";

import { analyzeBill } from "@/lib/services/billingService";
import { translations, type Lang } from "@/lib/i18n/translations";
import type { BillAnalysisResult } from "@/lib/types/billing";

export default function HomePage() {
  const [lang, setLang] = useState<Lang>("en");
  const [viewMode, setViewMode] = useState<"patient" | "worker">("patient");
  const [patientWorkflow, setPatientWorkflow] = useState<"choice" | "upload" | "lookup">("choice");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<1 | 2 | 3>(1);
  const [analysisResult, setAnalysisResult] = useState<BillAnalysisResult | null>(
    null
  );

  // Optional problem description fields
  const [userProblemDesc, setUserProblemDesc] = useState("");
  const [hospitalNameInput, setHospitalNameInput] = useState("Sunrise Community Hospital");
  const [billNumberInput, setBillNumberInput] = useState("INV-2026-0042");
  const [selectedCategory, setSelectedCategory] = useState("");

  const uploadSectionRef = useRef<HTMLDivElement>(null);
  const resultsSectionRef = useRef<HTMLDivElement>(null);

  const t = translations[lang];

  // Scroll helpers
  const scrollToUpload = () => {
    setPatientWorkflow("upload");
    uploadSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleEnterBillNumber = () => {
    setPatientWorkflow("lookup");
    uploadSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToHowItWorks = () => {
    document.getElementById("how-it-works")?.scrollIntoView({
      behavior: "smooth",
    });
  };

  const handleBillFound = (result: BillAnalysisResult) => {
    setSelectedFile(null);
    setAnalysisResult(result);
    setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 150);
  };

  // Perform bill analysis
  const handleAnalyze = useCallback(
    async (overrideFile?: File) => {
      const fileToUse = overrideFile || selectedFile;
      const fallbackFile =
        fileToUse ||
        new File(["sample-bill"], "hospital-bill.jpg", {
          type: "image/jpeg",
        });

      setIsAnalyzing(true);
      setAnalysisStep(1);
      setAnalysisResult(null);

      uploadSectionRef.current?.scrollIntoView({ behavior: "smooth" });

      try {
        const result = await analyzeBill(fallbackFile, lang, (step) => {
          setAnalysisStep(step);
        });

        // Attach hospital & bill number
        result.hospitalName = hospitalNameInput.trim() || "Sunrise Community Hospital";
        result.billNumber = billNumberInput.trim() || "INV-2026-0042";

        // ZERO IMAGE RETENTION: Delete selected file reference from memory
        setSelectedFile(null);

        setAnalysisResult(result);

        setTimeout(() => {
          resultsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 150);
      } catch (err) {
        console.error("Analysis failed:", err);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [selectedFile, lang, hospitalNameInput, billNumberInput]
  );

  const handleReset = () => {
    setAnalysisResult(null);
    setSelectedFile(null);
    setIsAnalyzing(false);
    setUserProblemDesc("");
    setPatientWorkflow("choice");
    setViewMode("patient");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg)",
      }}
    >
      {/* ── Navigation Bar with View Switcher & Language Toggle ── */}
      <Navbar
        lang={lang}
        onLangChange={setLang}
        t={t}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onReset={handleReset}
      />

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* 1. PATIENT EXPLAINER VIEW */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {viewMode === "patient" && (
        <main>
          {/* Hero Section (visible before analysis) */}
          {!analysisResult && (
            <HeroSection
              t={t}
              onUploadClick={scrollToUpload}
              onEnterBillNumberClick={handleEnterBillNumber}
              onHowItWorksClick={scrollToHowItWorks}
            />
          )}

          {/* Upload & Problem Description Section or Bill Lookup Section */}
          <section
            ref={uploadSectionRef}
            style={{
              padding: analysisResult ? "1.5rem 1.5rem 2rem" : "2rem 1.5rem 4rem",
              maxWidth: "860px",
              margin: "0 auto",
              width: "100%",
            }}
          >
            {/* If patient selected "lookup" bill number */}
            {!analysisResult && !isAnalyzing && patientWorkflow === "lookup" && (
              <BillNumberLookup
                lang={lang}
                t={t.billLookup}
                onBillFound={handleBillFound}
                onBackToOptions={() => setPatientWorkflow("choice")}
                onSwitchToUpload={() => {
                  setPatientWorkflow("upload");
                  scrollToUpload();
                }}
              />
            )}

            {/* If patient selected photo upload or initial state */}
            {!analysisResult && !isAnalyzing && patientWorkflow !== "lookup" && (
              <div
                style={{
                  backgroundColor: "var(--surface)",
                  borderRadius: "var(--radius-xl)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-sm)",
                  padding: "2rem",
                  marginBottom: "2rem",
                }}
              >
                {/* Upload Zone Title & Slow Internet Link */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "10px",
                    marginBottom: "1.5rem",
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
                      Step 1 of 2
                    </span>
                    <h2
                      style={{
                        fontSize: "1.45rem",
                        fontWeight: 800,
                        color: "var(--text)",
                        margin: "4px 0 6px",
                      }}
                    >
                      {t.upload.title}
                    </h2>
                    <p
                      style={{
                        fontSize: "0.88rem",
                        color: "var(--text-secondary)",
                        margin: 0,
                      }}
                    >
                      {t.upload.accepted}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleEnterBillNumber}
                    style={{
                      background: "none",
                      border: "1px solid #86efac",
                      borderRadius: "6px",
                      backgroundColor: "#f0fdf4",
                      color: "#166534",
                      padding: "6px 12px",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/></svg>
                    <span>Slow connection?</span>
                    <span style={{ textDecoration: "underline" }}>Enter Bill #</span>
                  </button>
                </div>

                {/* Drag & Drop File Upload Component */}
                <FileUpload
                  onFileSelected={setSelectedFile}
                  onAnalyze={() => handleAnalyze()}
                  isAnalyzing={isAnalyzing}
                  t={t.upload}
                />

                {/* Privacy Guarantee Note */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--success-light)",
                    border: "1px solid #86efac",
                    color: "#166534",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    marginTop: "12px",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
                  <span>
                    <strong>Zero Image Retention:</strong> Uploaded images are processed in volatile memory and immediately deleted. Only extracted financial fields are kept for your session.
                  </span>
                </div>

                {/* Problem Details Form */}
                <div
                  style={{
                    marginTop: "2rem",
                    paddingTop: "1.75rem",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "var(--text)",
                      marginBottom: "4px",
                    }}
                  >
                    {t.problemForm.title}
                  </h3>
                  <p
                    style={{
                      fontSize: "0.82rem",
                      color: "var(--text-secondary)",
                      marginBottom: "1rem",
                    }}
                  >
                    {t.problemForm.subtitle}
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "12px",
                      marginBottom: "12px",
                    }}
                  >
                    <input
                      type="text"
                      placeholder={t.problemForm.hospitalPlaceholder}
                      value={hospitalNameInput}
                      onChange={(e) => setHospitalNameInput(e.target.value)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--surface-raised)",
                        color: "var(--text)",
                        fontSize: "0.88rem",
                        outline: "none",
                        fontFamily: "inherit",
                      }}
                    />

                    <input
                      type="text"
                      placeholder={t.problemForm.billNumberPlaceholder}
                      value={billNumberInput}
                      onChange={(e) => setBillNumberInput(e.target.value)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--surface-raised)",
                        color: "var(--text)",
                        fontSize: "0.88rem",
                        outline: "none",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>

                  {/* Category Select */}
                  <div style={{ marginBottom: "12px" }}>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border)",
                        backgroundColor: "var(--surface-raised)",
                        color: "var(--text)",
                        fontSize: "0.88rem",
                        outline: "none",
                        fontFamily: "inherit",
                      }}
                    >
                      <option value="">
                        -- {t.problemForm.categoryLabel} --
                      </option>
                      {t.problemForm.categories.map((cat, i) => (
                        <option key={i} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Problem textarea */}
                  <textarea
                    rows={3}
                    placeholder={t.problemForm.placeholder}
                    value={userProblemDesc}
                    onChange={(e) => setUserProblemDesc(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--surface-raised)",
                      color: "var(--text)",
                      fontSize: "0.88rem",
                      lineHeight: 1.5,
                      outline: "none",
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Loading Spinner with Progress Steps */}
            {isAnalyzing && (
              <AnalysisLoading currentStep={analysisStep} t={t.upload} />
            )}
          </section>

          {/* Results Section */}
          {analysisResult && (
            <div ref={resultsSectionRef} style={{ padding: "0 1.5rem" }}>
              <ResultsSection
                result={analysisResult}
                lang={lang}
                t={t.results}
                onNewAnalysis={handleReset}
              />

              {/* ── PATIENT SUPPORT TICKET (Mandatory Consent & Ticket ID) ── */}
              <SupportTicketSection
                billContext={analysisResult}
                onViewDashboard={() => setViewMode("worker")}
              />

              {/* ── Contextual AI Chatbox (Essential Feature) ── */}
              <div style={{ margin: "2.5rem 0 4rem" }}>
                <ContextualChat
                  billContext={analysisResult}
                  lang={lang}
                  t={t.chat}
                />
              </div>
            </div>
          )}

          {/* How It Works (visible on initial screen) */}
          {!analysisResult && <HowItWorks t={t.howItWorks} />}
        </main>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* 2. HOSPITAL WORKER DASHBOARD (SIMULATED ACCESS) */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {viewMode === "worker" && <HospitalWorkerDashboard />}

      {/* ── Footer ── */}
      <Footer t={t.footer} />
    </div>
  );
}
