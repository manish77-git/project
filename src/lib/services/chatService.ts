/**
 * src/lib/services/chatService.ts
 *
 * Chat service layer — sends bill context + user message to AI.
 *
 * Real endpoint: POST /api/chat  (to be implemented with Gemini SDK)
 * Fallback:      Mock responses that reference the bill context.
 *
 * INTEGRATION NOTE:
 *   Add src/app/api/chat/route.ts that:
 *   1. Receives { messages, billContext, language } in the body
 *   2. Calls Gemini with a system prompt built from billContext
 *   3. Returns { reply: string }
 */

import type { BillAnalysisResult, ChatMessage, Lang } from "../types/billing";

const API_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL ?? "")
    : "";

// ── Mock responses ────────────────────────────────────────────────────────────

const MOCK_RESPONSES_EN: Record<number, string> = {
  0: "Great question! A consultation fee is what you pay for the doctor's time and expertise during your appointment. It's typically set by the hospital or clinic and may vary based on the specialist you visited.",
  1: "Blood tests are usually charged based on the number of tests and the complexity of the analysis. The CBC (Complete Blood Count) checks your blood cell levels, while LFT (Liver Function Test) checks how well your liver is working.",
  2: "An X-ray charge covers the cost of the imaging equipment, the radiologist who reads the scan, and the radiographer who took the image. Chest X-rays are one of the most common diagnostic tools.",
  3: "Pharmacy charges on a hospital bill typically include medications administered during your stay or treatment, as well as any disposable medical supplies used. Ask the hospital for an itemized list if you need more detail.",
  4: "To dispute a charge, start by requesting a fully itemized bill from the hospital billing department. Then compare each item with your discharge summary. If you find a discrepancy, write a formal dispute letter citing the specific charge and your reason for questioning it.",
};

const MOCK_RESPONSES_HI: Record<number, string> = {
  0: "अच्छा सवाल! परामर्श शुल्क वह राशि है जो आप डॉक्टर के समय और विशेषज्ञता के लिए अपनी अपॉइंटमेंट के दौरान चुकाते हैं। यह आमतौर पर अस्पताल या क्लिनिक द्वारा निर्धारित की जाती है।",
  1: "रक्त परीक्षण शुल्क परीक्षणों की संख्या और विश्लेषण की जटिलता के आधार पर लिया जाता है। CBC आपके रक्त कोशिका स्तरों की जाँच करता है और LFT आपके लिवर की कार्यप्रणाली की जाँच करता है।",
  2: "X-ray शुल्क में इमेजिंग उपकरण, स्कैन पढ़ने वाले रेडियोलॉजिस्ट और छवि लेने वाले रेडियोग्राफर की लागत शामिल है।",
  3: "अस्पताल बिल पर दवाई शुल्क में आमतौर पर आपके उपचार के दौरान दी गई दवाइयाँ और उपयोग की गई चिकित्सा आपूर्ति शामिल होती है।",
  4: "किसी शुल्क पर विवाद करने के लिए, पहले अस्पताल से पूरी मद-वार बिल माँगें। फिर प्रत्येक मद की अपनी डिस्चार्ज सारांश से तुलना करें।",
};

const MOCK_RESPONSES_KN: Record<number, string> = {
  0: "ಉತ್ತಮ ಪ್ರಶ್ನೆ! ಸಮಾಲೋಚನೆ ಶುಲ್ಕವೆಂದರೆ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ ಸಮಯದಲ್ಲಿ ವೈದ್ಯರ ಸಮಯ ಮತ್ತು ಪರಿಣತಿಗೆ ಪಾವತಿಸುವ ಮೊತ್ತ. ಇದು ಆಸ್ಪತ್ರೆಯ ನಿಯಮಾವಳಿಗಳಿಗೆ ಅನುಗುಣವಾಗಿರುತ್ತದೆ.",
  1: "ರಕ್ತ ಪರೀಕ್ಷೆಗಳ ಶುಲ್ಕವು ಪರೀಕ್ಷೆಗಳ ವಿಧ ಮತ್ತು ತಾಂತ್ರಿಕ ವಿವರಗಳನ್ನು ಆಧರಿಸಿರುತ್ತದೆ. CBC ರಕ್ತ ಕಣಗಳ ಮಟ್ಟವನ್ನು ಹಾಗೂ LFT ಯಕೃತ್ತಿನ ಆರೋಗ್ಯವನ್ನು ತಿಳಿಸುತ್ತದೆ.",
  2: "ಎಕ್ಸ್‌ರೇ ಶುಲ್ಕವು ಇಮೇಜಿಂಗ್ ಉಪಕರಣಗಳ ನಿರ್ವಹಣೆ, ಸ್ಕ್ಯಾನ್ ಪರಿಶೀಲಿಸುವ ರೇಡಿಯಾಲಜಿಸ್ಟ್ ವೆಚ್ಚಗಳನ್ನು ಒಳಗೊಂಡಿರುತ್ತದೆ. ಎದೆಯ ಎಕ್ಸ್‌ರೇ ಸಾಮಾನ್ಯ ತಪಾಸಣಾ ವಿಧಾನವಾಗಿದೆ.",
  3: "ಆಸ್ಪತ್ರೆಯ ಬಿಲ್‌ನಲ್ಲಿನ ಫಾರ್ಮಸಿ ಶುಲ್ಕವು ದಾಖಲಾತಿ ಸಮಯದಲ್ಲಿ ನೀಡಲಾದ ಔಷಧಿಗಳು ಮತ್ತು ಬಳಸಲಾದ ವೈದ್ಯಕೀಯ ಸಾಮಗ್ರಿಗಳನ್ನು ಒಳಗೊಂಡಿರುತ್ತದೆ.",
  4: "ಯಾವುದೇ ಶುಲ್ಕದ ಬಗ್ಗೆ ಸಂದೇಹವಿದ್ದರೆ, ಮೊದಲು ಆಸ್ಪತ್ರೆಯಿಂದ ವಿವರವಾದ (itemized) ರಶೀದಿಯನ್ನು ಕೇಳಿ. ಅದನ್ನು ನಿಮ್ಮ ಡಿಸ್ಚಾರ್ಜ್ ಸಾರಾಂಶದೊಂದಿಗೆ ತಾಳೆ ನೋಡಿ ಲಿಖಿತ ವಿವರಣೆ ಪಡೆಯಿರಿ.",
};

let mockIndex = 0;

async function callChatEndpoint(
  userMessage: string,
  history: ChatMessage[],
  billContext: BillAnalysisResult,
  lang: Lang,
): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        history: history.map((m) => ({ role: m.role, content: m.content })),
        billContext: {
          hospitalName: billContext.hospitalName,
          billNumber: billContext.billNumber,
          items: billContext.items.map((i) => ({
            label: i.chargeLabel,
            amount: i.amountInr,
          })),
          total: billContext.totalInr,
        },
        language: lang,
      }),
    });

    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    return typeof json.reply === "string" ? json.reply : null;
  } catch {
    return null;
  }
}

/**
 * Send a chat message and receive an AI reply.
 * Falls back to contextual mock responses if the endpoint is unavailable.
 */
export async function sendChatMessage(
  userMessage: string,
  history: ChatMessage[],
  billContext: BillAnalysisResult,
  lang: Lang,
): Promise<string> {
  // Simulate network delay for realism
  await delay(900 + Math.random() * 700);

  const real = await callChatEndpoint(userMessage, history, billContext, lang);
  if (real !== null) return real;

  // Mock fallback: rotate through canned responses in selected language
  const pool =
    lang === "hi"
      ? MOCK_RESPONSES_HI
      : lang === "kn"
      ? MOCK_RESPONSES_KN
      : MOCK_RESPONSES_EN;
  const keys = Object.keys(pool);
  const response = pool[Number(keys[mockIndex % keys.length])];
  mockIndex++;
  return response;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
