"use client";

/**
 * src/components/ContextualChat.tsx
 *
 * Essential feature: Interactive Contextual AI Chatbox that appears
 * after the bill analysis has been completed.
 *
 * Keeps the current bill context, supports multiline input (Shift+Enter),
 * suggested prompts, typing indicator, and multilingual responses.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { sendChatMessage } from "@/lib/services/chatService";
import type {
  BillAnalysisResult,
  ChatMessage,
  Lang,
} from "@/lib/types/billing";
import type { Translations } from "@/lib/i18n/translations";

interface Props {
  billContext: BillAnalysisResult;
  lang: Lang;
  t: Translations["chat"];
}

function buildInitialMessage(billContext: BillAnalysisResult, lang: Lang): ChatMessage {
  const hospital = billContext.hospitalName || "your hospital";
  const total = billContext.totalInr
    ? `₹ ${parseFloat(billContext.totalInr).toLocaleString("en-IN")}`
    : billContext.language === "hi"
      ? "बिल पर नहीं छपी"
      : billContext.language === "kn"
        ? "ಬಿಲ್‌ನಲ್ಲಿ ಇಲ್ಲ"
        : "not stated on the bill";

  const sourceNote =
    billContext.source === "verified"
      ? billContext.language === "hi"
        ? "अस्पताल रिकॉर्ड से सत्यापित"
        : billContext.language === "kn"
          ? "ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯಿಂದ ಪರಿಶೀಲಿಸಲಾಗಿದೆ"
          : "verified against the hospital record"
      : billContext.source === "demo"
        ? billContext.language === "hi"
          ? "एक नमूना बिल (डेमो)"
          : billContext.language === "kn"
            ? "ಮಾದರಿ ಬಿಲ್ (ಡೆಮೊ)"
            : "a sample bill for demonstration"
        : billContext.language === "hi"
          ? "आपके अपलोड किए गए बिल से पढ़ा गया, सत्यापित नहीं"
          : billContext.language === "kn"
            ? "ನಿಮ್ಮ ಅಪ್‌ಲೋಡ್ ಬಿಲ್‌ನಿಂದ ಓದಲಾಗಿದೆ, ಪರಿಶೀಲಿಸಿಲ್ಲ"
            : "read from your uploaded bill and not independently verified";

  let greeting = "";
  if (lang === "hi") {
    greeting = `नमस्ते! मेरे पास **${hospital}** के बिल का यह संदर्भ है: ${sourceNote} (कुल राशि ${total})। आप किसी भी शुल्क या सहायता के बारे में पूछ सकते हैं।`;
  } else if (lang === "kn") {
    greeting = `ನಮಸ್ಕಾರ! **${hospital}** ಬಿಲ್‌ನ ಈ ಮಾಹಿತಿ ನನ್ನ ಬಳಿ ಇದೆ: ${sourceNote} (ಒಟ್ಟು ಮೊತ್ತ ${total})। ನಿರ್ದಿಷ್ಟ ಶುಲ್ಕಗಳು ಅಥವಾ ಮುಂದಿನ ಕ್ರಮಗಳ ಬಗ್ಗೆ ಕೇಳಿ.`;
  } else {
    greeting = `Hello! I have this bill context from **${hospital}** — ${sourceNote} (total charges: ${total}). I can explain charges, help you draft a dispute, or clarify your next steps.`;
  }

  return {
    id: "msg-init",
    role: "assistant",
    content: greeting,
    timestamp: "Now",
  };
}

export default function ContextualChat({ billContext, lang, t }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    buildInitialMessage(billContext, lang),
  ]);
  // The key includes the figures and source, so two different bills (even with
  // the same number) never share chat history.
  const currentKey = `${billContext.billNumber || ""}-${billContext.totalInr || ""}-${billContext.source}-${lang}`;
  const [prevKey, setPrevKey] = useState(() => currentKey);
  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    setMessages([buildInitialMessage(billContext, lang)]);
  }

  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const text = (textToSend || inputText).trim();
      if (!text || isTyping) return;

      setErrorState(false);
      setInputText("");
      setHasStarted(true);

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        const reply = await sendChatMessage(
          text,
          messages,
          billContext,
          lang
        );

        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          role: "assistant",
          content: reply,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };

        setMessages((prev) => [...prev, botMsg]);
      } catch {
        setErrorState(true);
      } finally {
        setIsTyping(false);
      }
    },
    [inputText, isTyping, messages, billContext, lang]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePromptClick = (prompt: string) => {
    handleSend(prompt);
  };

  return (
    <section
      aria-label="Contextual AI Chatbox"
      className="animate-fade-up delay-200"
      style={{
        maxWidth: "960px",
        margin: "0 auto",
        backgroundColor: "var(--surface)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "580px",
      }}
    >
      {/* Chat Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "var(--surface-raised)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              backgroundColor: "var(--primary)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </div>
          <div>
            <h3
              style={{
                fontSize: "0.98rem",
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              {t.heading}
            </h3>
            <p
              style={{
                fontSize: "0.76rem",
                color: "var(--secondary)",
                fontWeight: 600,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor: "var(--secondary)",
                }}
              />
              Active Session · Bill Context Loaded
            </p>
          </div>
        </div>

        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--text-tertiary)",
            fontFamily: "monospace",
          }}
        >
          {lang.toUpperCase()}
        </span>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          backgroundColor: "#fafbfc",
        }}
      >
        {messages.map((m) => {
          const isUser = m.role === "user";

          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isUser ? "flex-end" : "flex-start",
                maxWidth: "85%",
                alignSelf: isUser ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-tertiary)",
                  marginBottom: "4px",
                  padding: "0 4px",
                }}
              >
                {isUser ? t.you : t.assistantName} · {m.timestamp}
              </div>

              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: isUser
                    ? "18px 18px 4px 18px"
                    : "18px 18px 18px 4px",
                  backgroundColor: isUser
                    ? "var(--primary)"
                    : "var(--surface)",
                  color: isUser ? "#ffffff" : "var(--text)",
                  border: isUser ? "none" : "1px solid var(--border)",
                  fontSize: "0.9rem",
                  lineHeight: 1.6,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.content}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div
            style={{
              alignSelf: "flex-start",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              borderRadius: "18px 18px 18px 4px",
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
            <span>{t.typing}</span>
            <div style={{ display: "flex", gap: "3px" }}>
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}

        {/* Error notification */}
        {errorState && (
          <div
            role="alert"
            style={{
              alignSelf: "center",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 14px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--error-light)",
              border: "1px solid var(--error)",
              fontSize: "0.82rem",
              color: "var(--error)",
            }}
          >
            <span>{t.errorMsg}</span>
            <button
              onClick={() => handleSend(messages[messages.length - 1]?.content)}
              style={{
                background: "none",
                border: "none",
                color: "var(--error)",
                fontWeight: 700,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {t.retryBtn}
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts (visible before deep conversation) */}
      {!hasStarted && (
        <div
          style={{
            padding: "10px 16px",
            backgroundColor: "var(--surface)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "8px",
            overflowX: "auto",
            whiteSpace: "nowrap",
          }}
        >
          {t.suggestedPrompts.slice(0, 3).map((prompt, i) => (
            <button
              key={i}
              onClick={() => handlePromptClick(prompt)}
              style={{
                padding: "6px 12px",
                borderRadius: "100px",
                border: "1px solid var(--primary)",
                backgroundColor: "var(--primary-light)",
                color: "var(--primary)",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--primary)";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--primary-light)";
                e.currentTarget.style.color = "var(--primary)";
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>{prompt}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div
        style={{
          padding: "14px 18px",
          borderTop: "1px solid var(--border)",
          backgroundColor: "var(--surface)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "10px",
          }}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={t.placeholder}
            rows={1}
            disabled={isTyping}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              backgroundColor: "var(--surface-raised)",
              color: "var(--text)",
              fontSize: "0.88rem",
              lineHeight: 1.5,
              resize: "none",
              fontFamily: "inherit",
              outline: "none",
              transition: "border 0.2s ease, box-shadow 0.2s ease",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--primary)";
              e.target.style.boxShadow = "var(--shadow-focus)";
              e.target.style.backgroundColor = "var(--surface)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--border)";
              e.target.style.boxShadow = "none";
              e.target.style.backgroundColor = "var(--surface-raised)";
            }}
          />

          <button
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isTyping}
            aria-label={t.sendBtn}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "var(--radius)",
              border: "none",
              backgroundColor:
                !inputText.trim() || isTyping
                  ? "var(--border)"
                  : "var(--primary)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor:
                !inputText.trim() || isTyping ? "not-allowed" : "pointer",
              transition: "background 0.2s ease, transform 0.15s ease",
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* Small disclaimer */}
        <p
          style={{
            margin: "8px 0 0",
            fontSize: "0.72rem",
            color: "var(--text-tertiary)",
            textAlign: "center",
          }}
        >
          {t.disclaimer}
        </p>
      </div>
    </section>
  );
}
