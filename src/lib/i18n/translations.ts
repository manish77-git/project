/**
 * src/lib/i18n/translations.ts
 *
 * Centralised English | Hindi | Kannada translation resource.
 * All UI strings live here — strictly typed and maintainable.
 */

export type Lang = "en" | "hi" | "kn";

export const translations = {
  en: {
    // ── Nav ──
    nav: {
      brand: "MediExplain AI",
      tagline: "Your hospital bill, explained simply.",
      langLabel: "Language",
      langEn: "English",
      langHi: "हिंदी",
      langKn: "ಕನ್ನಡ",
    },

    // ── Hero ──
    hero: {
      badge: "GenAI Powered · Multilingual · Audio Guidance",
      heading: "Understand Your Hospital Bill.",
      subheading:
        "Upload a photo, document, or video of your hospital bill to understand each charge in simple language. You can also listen to the explanation read aloud in your preferred language.",
      ctaUpload: "Upload Bill",
      ctaHowItWorks: "How It Works",
      privacyNote:
        "Your bill is processed securely. Avoid sharing unnecessary personal information.",
      sampleLabel: "Sample Hospital Bill",
      demoNotice:
        "Demo: Using a sample bill. Upload your own to analyze a real bill.",
      optionUploadTitle: "Option 1: Upload Bill",
      optionUploadDesc:
        "Upload a photo or document of your hospital bill for AI OCR & line-by-line explanation.",
      optionUploadBtn: "Upload Bill Photo",
      optionLookupTitle: "Option 2: Enter Bill Number",
      optionLookupDesc:
        "Having a slow internet connection? Enter your bill number instead.",
      optionLookupBadge: "Low Network / 2G Friendly",
      optionLookupBtn: "Enter Bill Number",
      viewSampleBtn: "View a sample bill (demo data)",
    },

    // ── Low-Network Bill Lookup Form ──
    billLookup: {
      heading: "Find Your Bill",
      instruction: "Enter the bill number printed on your hospital receipt.",
      placeholder: "e.g. BILL-2026-001",
      findBtn: "Find My Bill",
      searchingBtn: "Searching Hospital Records...",
      backBtn: "← Back",
      lowNetworkBadge: "Low-Bandwidth Mode · No Images Transmitted (< 2 KB)",
      emptyError: "Please enter the bill number printed on your hospital receipt.",
      notFoundTitle: "Bill Not Found",
      notFoundMsg:
        "We couldn't find a bill with that number. Please check the number or upload a photo of your bill.",
      tryAnotherBtn: "Try Another Bill Number",
      uploadInsteadBtn: "Upload Bill Instead",
      connectionErrorTitle: "Connection Error",
      connectionErrorMsg:
        "Could not connect to the hospital billing server. Please check your network and try again.",
      retryBtn: "Retry Lookup",
      accessCodeLabel: "Hospital access code",
      accessCodePlaceholder: "e.g. AB3DE-FGH7K",
      accessCodeHint:
        "Issued by the hospital. Without it, bill amounts cannot be shown.",
    },

    // ── Problem Form (if user wants to describe their issue) ──
    problemForm: {
      title: "Describe Your Billing Problem (Optional)",
      subtitle: "Tell us what seems confusing, unexpected, or incorrect about your bill.",
      placeholder: "e.g. I was charged twice for consultation, or my insurance covered less than expected...",
      hospitalPlaceholder: "Hospital or Clinic name",
      billNumberPlaceholder: "Bill / Invoice number",
      categoryLabel: "Issue Category",
      categories: [
        "General clarification",
        "Unexpected charges",
        "Duplicate charges",
        "Insurance claim denial",
        "Payment / reimbursement questions",
        "Other",
      ],
    },

    // ── Upload ──
    upload: {
      title: "Upload Your Hospital Bill & Documents",
      dropzone: "Drag and drop your bill or supporting evidence here, or",
      browse: "Browse Files",
      accepted: "Accepted: JPG, PNG, BMP · Max 8 MB (PDFs are not supported yet)",
      selected: "Selected file",
      preview: "Bill preview",
      changeFile: "Change file",
      analyzeBtn: "Analyze Bill with AI",
      analyzing: "Reading your hospital bill…",
      analyzingStep1: "Extracting text with OCR and Vision…",
      analyzingStep2: "Identifying charges and billing items…",
      analyzingStep3: "Generating plain-language explanations in English…",
      errorType:
        "Unsupported file type. Please upload a JPG, PNG or BMP image. PDFs are not supported yet.",
      errorSize: "File exceeds 8 MB limit. Please choose a smaller file.",
      errorGeneric: "Something went wrong. Please try again.",
      retryBtn: "Try Again",
      accessCodeLabel: "Hospital access code (optional)",
      accessCodePlaceholder: "e.g. AB3DE-FGH7K",
      accessCodeHint:
        "Only a code issued by the hospital lets us check these figures against its record. Without one, the figures stay unverified.",
    },

    // ── Results ──
    results: {
      heading: "Here's What Your Bill Means",
      demoBanner:
        "Demo data — the results below use a sample bill, clearly demonstrated for testing.",
      realBanner: "Analysis complete — based on your uploaded document.",
      documentBanner:
        "Read from the uploaded bill — not independently verified.",
      verifiedBanner:
        "Verified against this bill's record in the hospital system.",
      noResultBanner:
        "No report was produced — the uploaded document could not be read.",
      documentSubtitle: "These figures were read by OCR, not from a hospital record.",
      verifiedSubtitle: "The amounts below come from the hospital record.",
      demoSubtitle: "This is a sample bill, not the document you uploaded.",
      hospitalNotStated: "Hospital name not read from the bill",
      billNumberLabel: "Bill number",
      billDateLabel: "Bill date",
      totalNotStated: "Total not printed on the bill",
      notStated: "Not available",
      missingAmount: "No amount is available for this charge.",
      couldNotReadTitle: "This bill could not be read",
      couldNotReadMsg:
        "No figures are shown because no readable text was found. Try a clearer photo, or enter the bill number instead.",
      noChargesTitle: "No itemised charges were found",
      noChargesMsg:
        "The bill was read, but it did not contain any itemised charge or total that we can safely display.",
      documentFinding:
        "These figures come only from reading the uploaded document. They have not been compared with any hospital record.",
      verifiedFinding:
        "These amounts were read from the hospital record linked to this bill.",
      itemLabel: "Charge",
      amountLabel: "Amount",
      explanationLabel: "What this means",
      listenBtn: "Listen",
      stopBtn: "Stop",
      listenAllBtn: "Listen to All",
      stopPlaybackBtn: "Stop Playback",
      totalLabel: "Total Bill",
      unclear: "Unable to identify this charge confidently.",
      copyBtn: "Copy Summary",
      copiedBtn: "Copied!",
      newAnalysisBtn: "Analyze Another Bill",
      lookUpAnotherBtn: "Look Up Another Bill",
      downloadBtn: "Download Report",
      findingsTitle: "Key Findings & Notes",
      findingsList: [
        "Charges are listed before applicable government health scheme deductions.",
        "Insurance pre-authorization was noted; check if final settlement has cleared.",
        "No duplicate consultation charges detected on this statement.",
      ],
      nextStepsTitle: "Recommended Next Steps",
      nextStepsList: [
        "Request an itemized billing receipt from the hospital desk.",
        "Compare lab and pharmacy charges with your doctor's discharge summary.",
        "Contact your insurer with the pre-auth number if you dispute the balance.",
      ],
    },

    // ── Chat ──
    chat: {
      heading: "Contextual AI Billing Assistant",
      subheading:
        "I have full context of your analyzed bill. Ask anything about specific charges, insurance coverage, or dispute steps.",
      placeholder: "E.g. What does the X-ray charge include? or How do I dispute?",
      sendBtn: "Send",
      assistantName: "MediExplain AI",
      you: "You",
      typing: "Thinking…",
      errorMsg: "Sorry, I could not process that. Please try again.",
      retryBtn: "Retry",
      emptyState:
        "Your bill has been analyzed! Ask me anything about your charges or what to do next.",
      suggestedPrompts: [
        "Explain the consultation fee in simpler terms.",
        "Is this a typical amount for a blood test?",
        "What should I ask the hospital billing department?",
        "How do I dispute a charge I think is wrong?",
        "Summarize all my charges in one paragraph.",
      ],
      disclaimer:
        "This is an AI assistant providing administrative & billing clarification. It is not licensed legal or medical advice.",
    },

    // ── How It Works ──
    howItWorks: {
      heading: "How It Works",
      steps: [
        {
          number: "1",
          title: "Upload",
          description:
            "Take a photo or upload your hospital bill, lab slip, or insurance statement.",
        },
        {
          number: "2",
          title: "Analyze",
          description:
            "Our AI reads each charge and converts technical billing jargon into simple, honest explanations.",
        },
        {
          number: "3",
          title: "Listen & Chat",
          description:
            "Listen to your bill read aloud in your language, and ask follow-up questions in the interactive AI chat.",
        },
      ],
    },

    // ── Footer ──
    footer: {
      disclaimer:
        "MediExplain AI provides informational assistance only. It does not constitute medical, legal, or financial advice. Always verify billing information with your healthcare provider.",
      privacy: "Privacy & Data Handling",
      terms: "Terms of Use",
      about: "About MediExplain AI",
    },

    // ── Misc ──
    misc: {
      loading: "Loading…",
      error: "Something went wrong.",
      backToTop: "Back to top",
    },
  },

  // ────────────────────────────────────────────────────────────
  // HINDI
  // ────────────────────────────────────────────────────────────
  hi: {
    nav: {
      brand: "MediExplain AI",
      tagline: "आपका अस्पताल का बिल, सरल भाषा में।",
      langLabel: "भाषा",
      langEn: "English",
      langHi: "हिंदी",
      langKn: "ಕನ್ನಡ",
    },

    hero: {
      badge: "GenAI संचालित · बहुभाषी · ऑडियो मार्गदर्शन",
      heading: "अपना अस्पताल बिल समझें।",
      subheading:
        "अपने अस्पताल बिल, रसीद या वीडियो को अपलोड करें और हर शुल्क को सरल भाषा में समझें। आप अपनी पसंदीदा भाषा में स्पष्टीकरण सुन भी सकते हैं।",
      ctaUpload: "बिल अपलोड करें",
      ctaHowItWorks: "यह कैसे काम करता है",
      privacyNote:
        "आपका बिल सुरक्षित रूप से संसाधित किया जाता है। अनावश्यक व्यक्तिगत जानकारी साझा करने से बचें।",
      sampleLabel: "नमूना अस्पताल बिल",
      demoNotice:
        "डेमो: एक नमूना बिल का उपयोग किया जा रहा है। अपना खुद का बिल अपलोड करें।",
      optionUploadTitle: "विकल्प 1: बिल अपलोड करें",
      optionUploadDesc:
        "AI OCR और पंक्ति-वार व्याख्या के लिए अपने बिल का फ़ोटो अपलोड करें।",
      optionUploadBtn: "बिल फ़ोटो अपलोड करें",
      optionLookupTitle: "विकल्प 2: बिल नंबर दर्ज करें",
      optionLookupDesc:
        "धीमा इंटरनेट है? इसके बजाय रसीद पर दिया गया बिल नंबर दर्ज करें।",
      optionLookupBadge: "कम नेटवर्क / 2G अनुकूल",
      optionLookupBtn: "बिल नंबर दर्ज करें",
      viewSampleBtn: "नमूना बिल देखें (डेमो डेटा)",
    },

    // ── Low-Network Bill Lookup Form ──
    billLookup: {
      heading: "अपना बिल खोजें",
      instruction: "अपनी अस्पताल रसीद पर छपा बिल नंबर दर्ज करें।",
      placeholder: "उदा. BILL-2026-001",
      findBtn: "मेरा बिल खोजें",
      searchingBtn: "अस्पताल रिकॉर्ड खोज रहे हैं...",
      backBtn: "← वापस",
      lowNetworkBadge: "कम बैंडविड्थ मोड · कोई फ़ोटो नहीं भेजी जाती (< 2 KB)",
      emptyError: "कृपया अपनी अस्पताल रसीद पर छपा बिल नंबर दर्ज करें।",
      notFoundTitle: "बिल नहीं मिला",
      notFoundMsg:
        "हमें उस नंबर का कोई बिल नहीं मिला। कृपया नंबर जांचें या अपने बिल का फ़ोटो अपलोड करें।",
      tryAnotherBtn: "दूसरा बिल नंबर आज़माएँ",
      uploadInsteadBtn: "इसके बजाय बिल अपलोड करें",
      connectionErrorTitle: "कनेक्शन त्रुटि",
      connectionErrorMsg:
        "अस्पताल बिलिंग सर्वर से कनेक्ट नहीं हो सका। कृपया अपना नेटवर्क जांचें और पुनः प्रयास करें।",
      retryBtn: "पुनः खोजें",
      accessCodeLabel: "अस्पताल एक्सेस कोड",
      accessCodePlaceholder: "उदा. AB3DE-FGH7K",
      accessCodeHint:
        "अस्पताल द्वारा जारी। इसके बिना बिल की राशि नहीं दिखाई जा सकती।",
    },

    problemForm: {
      title: "अपनी बिलिंग समस्या का विवरण दें (वैकल्पिक)",
      subtitle: "बताएं कि आपके बिल में क्या अस्पष्ट या अप्रत्याशित लगता है।",
      placeholder: "उदा. मुझसे परामर्श के लिए दो बार शुल्क लिया गया, या बीमा ने कम कवर किया...",
      hospitalPlaceholder: "अस्पताल का नाम",
      billNumberPlaceholder: "बिल / इनवॉइस नंबर",
      categoryLabel: "समस्या की श्रेणी",
      categories: [
        "सामान्य स्पष्टीकरण",
        "अप्रत्याशित शुल्क",
        "दोहरा (डुप्लिकेट) शुल्क",
        "बीमा दावा अस्वीकृति",
        "भुगतान / प्रतिपूर्ति प्रश्न",
        "अन्य",
      ],
    },

    upload: {
      title: "अपना अस्पताल बिल व दस्तावेज़ अपलोड करें",
      dropzone: "यहाँ फ़ाइल खींचें और छोड़ें, या",
      browse: "फ़ाइल चुनें",
      accepted: "स्वीकृत: JPG, PNG, BMP · अधिकतम 8 MB (PDF अभी समर्थित नहीं है)",
      selected: "चयनित फ़ाइल",
      preview: "बिल पूर्वावलोकन",
      changeFile: "फ़ाइल बदलें",
      analyzeBtn: "AI से बिल का विश्लेषण करें",
      analyzing: "आपका अस्पताल बिल पढ़ा जा रहा है…",
      analyzingStep1: "OCR और विज़न से टेक्स्ट निकाला जा रहा है…",
      analyzingStep2: "शुल्कों और मदों की पहचान की जा रही है…",
      analyzingStep3: "सरल हिंदी में स्पष्टीकरण तैयार किए जा रहे हैं…",
      errorType:
        "असमर्थित फ़ाइल प्रकार। कृपया JPG, PNG या BMP छवि अपलोड करें। PDF अभी समर्थित नहीं है।",
      errorSize:
        "फ़ाइल 8 MB की सीमा से अधिक है। कृपया एक छोटी फ़ाइल चुनें।",
      errorGeneric: "कुछ गलत हुआ। कृपया पुनः प्रयास करें।",
      retryBtn: "पुनः प्रयास करें",
      accessCodeLabel: "अस्पताल एक्सेस कोड (वैकल्पिक)",
      accessCodePlaceholder: "उदा. AB3DE-FGH7K",
      accessCodeHint:
        "केवल अस्पताल द्वारा जारी कोड से ही इन आंकड़ों को उसके रिकॉर्ड से जांचा जा सकता है। कोड के बिना आंकड़े असत्यापित रहते हैं।",
    },

    results: {
      heading: "आपके बिल का अर्थ",
      demoBanner:
        "डेमो डेटा — नीचे दिए गए परिणाम एक नमूना बिल पर आधारित हैं।",
      realBanner: "विश्लेषण पूर्ण — आपके अपलोड किए गए दस्तावेज़ के आधार पर।",
      documentBanner:
        "आपके अपलोड किए गए बिल से पढ़ा गया — स्वतंत्र रूप से सत्यापित नहीं।",
      verifiedBanner: "इस बिल के अस्पताल रिकॉर्ड से सत्यापित।",
      noResultBanner:
        "कोई रिपोर्ट नहीं बनाई गई — अपलोड किया गया दस्तावेज़ पढ़ा नहीं जा सका।",
      documentSubtitle: "ये आंकड़े OCR द्वारा पढ़े गए हैं, अस्पताल रिकॉर्ड से नहीं।",
      verifiedSubtitle: "नीचे दी गई राशियाँ अस्पताल के रिकॉर्ड से हैं।",
      demoSubtitle: "यह एक नमूना बिल है, आपका अपलोड किया हुआ नहीं।",
      hospitalNotStated: "अस्पताल का नाम बिल से नहीं पढ़ा जा सका",
      billNumberLabel: "बिल नंबर",
      billDateLabel: "बिल तिथि",
      totalNotStated: "बिल पर कुल राशि नहीं छपी",
      notStated: "उपलब्ध नहीं",
      missingAmount: "इस शुल्क के लिए कोई राशि उपलब्ध नहीं है।",
      couldNotReadTitle: "यह बिल पढ़ा नहीं जा सका",
      couldNotReadMsg:
        "कोई आंकड़ा नहीं दिखाया गया है क्योंकि कोई पढ़ने योग्य पाठ नहीं मिला। कृपया साफ़ फ़ोटो लें या बिल नंबर दर्ज करें।",
      noChargesTitle: "कोई मद-वार शुल्क नहीं मिला",
      noChargesMsg:
        "बिल पढ़ा गया, लेकिन उसमें कोई ऐसी मद या कुल राशि नहीं मिली जिसे हम सुरक्षित रूप से दिखा सकें।",
      documentFinding:
        "ये आंकड़े केवल अपलोड किए गए दस्तावेज़ को पढ़ने से हैं। इन्हें किसी अस्पताल रिकॉर्ड से नहीं मिलाया गया।",
      verifiedFinding:
        "ये राशियाँ इस बिल से जुड़े अस्पताल रिकॉर्ड से पढ़ी गई हैं।",
      itemLabel: "शुल्क",
      amountLabel: "राशि",
      explanationLabel: "इसका अर्थ",
      listenBtn: "सुनें",
      stopBtn: "रोकें",
      listenAllBtn: "सब सुनें",
      stopPlaybackBtn: "ऑडियो रोकें",
      totalLabel: "कुल बिल",
      unclear: "इस शुल्क की पहचान विश्वास के साथ नहीं की जा सकी।",
      copyBtn: "सारांश कॉपी करें",
      copiedBtn: "कॉपी हो गया!",
      newAnalysisBtn: "एक और बिल विश्लेषण करें",
      lookUpAnotherBtn: "दूसरा बिल खोजें",
      downloadBtn: "रिपोर्ट डाउनलोड करें",
      findingsTitle: "मुख्य निष्कर्ष व टिप्पणियाँ",
      findingsList: [
        "शुल्क सरकारी स्वास्थ्य योजना कटौती से पहले सूचीबद्ध हैं।",
        "बीमा पूर्व-प्राधिकरण नोट किया गया; जांचें कि क्या अंतिम निपटान हो चुका है।",
        "इस विवरण में कोई दोहरा परामर्श शुल्क नहीं पाया गया।",
      ],
      nextStepsTitle: "सुझाए गए अगले कदम",
      nextStepsList: [
        "अस्पताल काउंटर से पूरी मद-वार (itemized) रसीद मांगें।",
        "दवा और लैब शुल्कों की अपनी डिस्चार्ज सारांश से तुलना करें।",
        "यदि आपको शेष राशि पर संदेह है तो बीमाकर्ता से संपर्क करें।",
      ],
    },

    chat: {
      heading: "प्रासंगिक AI बिलिंग सहायक",
      subheading:
        "मुझे आपके विश्लेषित बिल का पूरा संदर्भ पता है। किसी भी शुल्क, बीमा या अगले कदम के बारे में पूछें।",
      placeholder: "जैसे: X-Ray शुल्क में क्या शामिल है? या विवाद कैसे करें?",
      sendBtn: "भेजें",
      assistantName: "MediExplain AI",
      you: "आप",
      typing: "सोच रहा हूँ…",
      errorMsg: "माफ़ करें, अनुरोध संसाधित नहीं हो सका। पुनः प्रयास करें।",
      retryBtn: "पुनः प्रयास करें",
      emptyState:
        "आपके बिल का विश्लेषण हो गया है! शुल्कों के बारे में कोई भी प्रश्न पूछें।",
      suggestedPrompts: [
        "परामर्श शुल्क को और सरल भाषा में समझाएं।",
        "रक्त परीक्षण के लिए यह राशि सामान्य है?",
        "मुझे अस्पताल के बिलिंग विभाग से क्या पूछना चाहिए?",
        "गलत शुल्क का विवाद कैसे करें?",
        "मेरे सभी शुल्कों का सारांश दें।",
      ],
      disclaimer:
        "यह AI सहायक केवल प्रशासनिक और बिलिंग मार्गदर्शन प्रदान करता है। यह कानूनी या चिकित्सा सलाह नहीं है।",
    },

    howItWorks: {
      heading: "यह कैसे काम करता है",
      steps: [
        {
          number: "1",
          title: "अपलोड करें",
          description:
            "अपने अस्पताल बिल, लैब रसीद या दस्तावेज़ की फ़ोटो लें और अपलोड करें।",
        },
        {
          number: "2",
          title: "विश्लेषण करें",
          description:
            "हमारा AI हर शुल्क को समझकर चिकित्सा बिलिंग भाषा को सरल हिंदी में बदलता है।",
        },
        {
          number: "3",
          title: "सुनें और चैट करें",
          description:
            "हर शुल्क का अर्थ अपनी भाषा में सुनें और अनुवर्ती प्रश्नों के लिए लाइव AI से चैट करें।",
        },
      ],
    },

    footer: {
      disclaimer:
        "MediExplain AI केवल सूचनात्मक सहायता प्रदान करता है। यह चिकित्सा, कानूनी या वित्तीय सलाह नहीं है। हमेशा अपने स्वास्थ्य सेवा प्रदाता से बिल की पुष्टि करें।",
      privacy: "गोपनीयता और डेटा सुरक्षा",
      terms: "उपयोग की शर्तें",
      about: "हमारे बारे में",
    },

    misc: {
      loading: "लोड हो रहा है…",
      error: "कुछ गलत हुआ।",
      backToTop: "ऊपर जाएं",
    },
  },

  // ────────────────────────────────────────────────────────────
  // KANNADA
  // ────────────────────────────────────────────────────────────
  kn: {
    nav: {
      brand: "MediExplain AI",
      tagline: "ನಿಮ್ಮ ಆಸ್ಪತ್ರೆ ಬಿಲ್, ಸರಳ ಭಾಷೆಯಲ್ಲಿ.",
      langLabel: "ಭಾಷೆ",
      langEn: "English",
      langHi: "हिंदी",
      langKn: "ಕನ್ನಡ",
    },

    hero: {
      badge: "GenAI ಚಾಲಿತ · ಬಹುಭಾಷಾ · ಆಡಿಯೋ ಮಾರ್ಗದರ್ಶನ",
      heading: "ನಿಮ್ಮ ಆಸ್ಪತ್ರೆ ಬಿಲ್ ಅರ್ಥಮಾಡಿಕೊಳ್ಳಿ.",
      subheading:
        "ನಿಮ್ಮ ಆಸ್ಪತ್ರೆ ಬಿಲ್, ದಾಖಲೆ ಅಥವಾ ವೀಡಿಯೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ ಮತ್ತು ಪ್ರತಿ ಶುಲ್ಕವನ್ನು ಸರಳ ಕನ್ನಡದಲ್ಲಿ ಅರ್ಥಮಾಡಿಕೊಳ್ಳಿ. ನೀವು ವಿವರಣೆಯನ್ನು ಕೇಳಲೂಬಹುದು.",
      ctaUpload: "ಬಿಲ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
      ctaHowItWorks: "ಇದು ಹೇಗೆ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ",
      privacyNote:
        "ನಿಮ್ಮ ಬಿಲ್ ಅನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಸಂಸ್ಕರಿಸಲಾಗುತ್ತದೆ. ಅನಗತ್ಯ ವೈಯಕ್ತಿಕ ವಿವರಗಳನ್ನು ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.",
      sampleLabel: "ಮಾದರಿ ಆಸ್ಪತ್ರೆ ಬಿಲ್",
      demoNotice:
        "ಡೆಮೊ: ಮಾದರಿ ಬಿಲ್ ಬಳಸಲಾಗುತ್ತಿದೆ. ನೈಜ ಬಿಲ್ ವಿಶ್ಲೇಷಿಸಲು ನಿಮ್ಮದೇ ಬಿಲ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
      optionUploadTitle: "ಆಯ್ಕೆ 1: ಬಿಲ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
      optionUploadDesc:
        "AI OCR ಮತ್ತು ಸಾಲು-ಸಾಲಿನ ವಿವರಣೆಗಾಗಿ ನಿಮ್ಮ ಆಸ್ಪತ್ರೆ ಬಿಲ್ ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
      optionUploadBtn: "ಬಿಲ್ ಫೋಟೋ ಅಪ್‌ಲೋಡ್",
      optionLookupTitle: "ಆಯ್ಕೆ 2: ಬಿಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ",
      optionLookupDesc:
        "ನಿಧಾನ ಇಂಟರ್ನೆಟ್ ಸಂಪರ್ಕವಿದೆಯೇ? ರಶೀದಿಯ ಬಿಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.",
      optionLookupBadge: "ಕಡಿಮೆ ನೆಟ್‌ವರ್ಕ್ / 2G ಸ್ನೇಹಿ",
      optionLookupBtn: "ಬಿಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ",
      viewSampleBtn: "ಮಾದರಿ ಬಿಲ್ ನೋಡಿ (ಡೆಮೊ ಡೇಟಾ)",
    },

    // ── Low-Network Bill Lookup Form ──
    billLookup: {
      heading: "ನಿಮ್ಮ ಬಿಲ್ ಹುಡುಕಿ",
      instruction: "ನಿಮ್ಮ ಆಸ್ಪತ್ರೆಯ ರಶೀದಿಯಲ್ಲಿ ಮುದ್ರಿಸಲಾದ ಬಿಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.",
      placeholder: "ಉದಾ. BILL-2026-001",
      findBtn: "ನನ್ನ ಬಿಲ್ ಹುಡುಕಿ",
      searchingBtn: "ದಾಖಲೆಗಳನ್ನು ಹುಡುಕಲಾಗುತ್ತಿದೆ...",
      backBtn: "← ಹಿಂದಕ್ಕೆ",
      lowNetworkBadge: "ಕಡಿಮೆ ಬ್ಯಾಂಡ್‌ವಿಡ್ತ್ ಮೋಡ್ · ಚಿತ್ರ ರವಾನೆಯಿಲ್ಲ (< 2 KB)",
      emptyError: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ರಶೀದಿಯ ಬಿಲ್ ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ.",
      notFoundTitle: "ಬಿಲ್ ಕಂಡುಬಂದಿಲ್ಲ",
      notFoundMsg:
        "ಆ ಸಂಖ್ಯೆಯ ಯಾವುದೇ ಬಿಲ್ ನಮಗೆ ಸಿಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಸಂಖ್ಯೆ ಪರಿಶೀಲಿಸಿ ಅಥವಾ ಬಿಲ್ ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
      tryAnotherBtn: "ಮತ್ತೊಂದು ಬಿಲ್ ಸಂಖ್ಯೆ ಪ್ರಯತ್ನಿಸಿ",
      uploadInsteadBtn: "ಬದಲಿಗೆ ಬಿಲ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
      connectionErrorTitle: "ಸಂಪರ್ಕ ದೋಷ",
      connectionErrorMsg:
        "ಆಸ್ಪತ್ರೆಯ ಬಿಲ್ಲಿಂಗ್ ಸರ್ವರ್‌ಗೆ ಸಂಪರ್ಕಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ನೆಟ್‌ವರ್ಕ್ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      retryBtn: "ಮತ್ತೆ ಹುಡುಕಿ",
      accessCodeLabel: "ಆಸ್ಪತ್ರೆ ಪ್ರವೇಶ ಕೋಡ್",
      accessCodePlaceholder: "ಉದಾ. AB3DE-FGH7K",
      accessCodeHint:
        "ಆಸ್ಪತ್ರೆ ನೀಡಿದ ಕೋಡ್. ಅದಿಲ್ಲದೆ ಬಿಲ್ ಮೊತ್ತ ತೋರಿಸಲಾಗದು.",
    },

    problemForm: {
      title: "ನಿಮ್ಮ ಬಿಲ್ಲಿಂಗ್ ಸಮಸ್ಯೆಯನ್ನು ವಿವರಿಸಿ (ಐಚ್ಛಿಕ)",
      subtitle: "ನಿಮ್ಮ ಬಿಲ್‌ನಲ್ಲಿ ಏನು ಅಸ್ಪಷ್ಟ ಅಥವಾ ಗೊಂದಲಮಯವಾಗಿದೆ ಎಂದು ತಿಳಿಸಿ.",
      placeholder: "ಉದಾ: ಸಮಾಲೋಚನೆಗೆ ಎರಡು ಬಾರಿ ಶುಲ್ಕ ವಿಧಿಸಲಾಗಿದೆ, ಅಥವಾ ವಿಮೆ ಕಡಿಮೆ ಹಣ ನೀಡಿದೆ...",
      hospitalPlaceholder: "ಆಸ್ಪತ್ರೆಯ ಹೆಸರು",
      billNumberPlaceholder: "ಬಿಲ್ / ಇನ್‌ವಾಯ್ಸ್ ಸಂಖ್ಯೆ",
      categoryLabel: "ಸಮಸ್ಯೆಯ ವರ್ಗ",
      categories: [
        "ಸಾಮಾನ್ಯ ವಿವರಣೆ",
        "ಅನಿರೀಕ್ಷಿತ ಶುಲ್ಕಗಳು",
        "ನಕಲಿ (Duplicate) ಶುಲ್ಕಗಳು",
        "ವಿಮೆ ಕ್ಲೇಮ್ ತಿರಸ್ಕಾರ",
        "ಪಾವತಿ / ಮರುಪಾವತಿ ಪ್ರಶ್ನೆಗಳು",
        "ಇತರ",
      ],
    },

    upload: {
      title: "ನಿಮ್ಮ ಆಸ್ಪತ್ರೆ ಬಿಲ್ ಮತ್ತು ದಾಖಲೆಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
      dropzone: "ಇಲ್ಲಿ ಫೈಲ್ ಎಳೆದು ಬಿಡಿ, ಅಥವಾ",
      browse: "ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ",
      accepted: "ಸ್ವೀಕರಿಸಲಾಗುವ ಮಾದರಿಗಳು: JPG, PNG, BMP · ಗರಿಷ್ಠ 8 MB (PDF ಇನ್ನೂ ಬೆಂಬಲಿತವಲ್ಲ)",
      selected: "ಆಯ್ಕೆಮಾಡಿದ ಫೈಲ್",
      preview: "ಬಿಲ್ ಮುನ್ನೋಟ",
      changeFile: "ಫೈಲ್ ಬದಲಾಯಿಸಿ",
      analyzeBtn: "AI ನೊಂದಿಗೆ ಬಿಲ್ ವಿಶ್ಲೇಷಿಸಿ",
      analyzing: "ನಿಮ್ಮ ಆಸ್ಪತ್ರೆ ಬಿಲ್ ಓದಲಾಗುತ್ತಿದೆ…",
      analyzingStep1: "OCR ಮತ್ತು ವಿಷನ್ ಮೂಲಕ ಪಠ್ಯ ಹೊರತೆಗೆಯಲಾಗುತ್ತಿದೆ…",
      analyzingStep2: "ಶುಲ್ಕಗಳು ಮತ್ತು ಐಟಂಗಳನ್ನು ಗುರುತಿಸಲಾಗುತ್ತಿದೆ…",
      analyzingStep3: "ಸರಳ ಕನ್ನಡದಲ್ಲಿ ವಿವರಣೆಗಳನ್ನು ರಚಿಸಲಾಗುತ್ತಿದೆ…",
      errorType:
        "ಬೆಂಬಲವಿಲ್ಲದ ಫೈಲ್ ಮಾದರಿ. ದಯವಿಟ್ಟು JPG, PNG ಅಥವಾ BMP ಚಿತ್ರ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ. PDF ಇನ್ನೂ ಬೆಂಬಲಿತವಲ್ಲ.",
      errorSize:
        "ಫೈಲ್ 8 MB ಮಿತಿಯನ್ನು ಮೀರಿದೆ. ದಯವಿಟ್ಟು ಸಣ್ಣ ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ.",
      errorGeneric: "ದೋಷ ಸಂಭವಿಸಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      retryBtn: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
      accessCodeLabel: "ಆಸ್ಪತ್ರೆ ಪ್ರವೇಶ ಕೋಡ್ (ಐಚ್ಛಿಕ)",
      accessCodePlaceholder: "ಉದಾ. AB3DE-FGH7K",
      accessCodeHint:
        "ಆಸ್ಪತ್ರೆ ನೀಡಿದ ಕೋಡ್ ಇದ್ದರೆ ಮಾತ್ರ ಈ ಮೊತ್ತಗಳನ್ನು ಅದರ ದಾಖಲೆಯೊಂದಿಗೆ ಪರಿಶೀಲಿಸಬಹುದು. ಕೋಡ್ ಇಲ್ಲದೆ ಮೊತ್ತಗಳು ಪರಿಶೀಲಿಸದೆ ಉಳಿಯುತ್ತವೆ.",
    },

    results: {
      heading: "ನಿಮ್ಮ ಬಿಲ್‌ನ ವಿವರಣೆ",
      demoBanner:
        "ಡೆಮೊ ಡೇಟಾ — ಕೆಳಗಿನ ಫಲಿತಾಂಶಗಳು ಪರೀಕ್ಷಾರ್ಥ ಮಾದರಿ ಬಿಲ್ ಆಧರಿಸಿವೆ.",
      realBanner: "ವಿಶ್ಲೇಷಣೆ ಪೂರ್ಣಗೊಂಡಿದೆ — ನಿಮ್ಮ ದಾಖಲೆಯ ಆಧಾರದ ಮೇಲೆ.",
      documentBanner:
        "ನಿಮ್ಮ ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ಬಿಲ್‌ನಿಂದ ಓದಲಾಗಿದೆ — ಸ್ವತಂತ್ರವಾಗಿ ಪರಿಶೀಲಿಸಲಾಗಿಲ್ಲ.",
      verifiedBanner: "ಈ ಬಿಲ್‌ನ ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯೊಂದಿಗೆ ಪರಿಶೀಲಿಸಲಾಗಿದೆ.",
      noResultBanner:
        "ಯಾವುದೇ ವರದಿ ತಯಾರಾಗಿಲ್ಲ — ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ದಾಖಲೆ ಓದಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.",
      documentSubtitle: "ಈ ಮೊತ್ತಗಳನ್ನು OCR ಓದಿದೆ, ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯಿಂದ ಅಲ್ಲ.",
      verifiedSubtitle: "ಕೆಳಗಿನ ಮೊತ್ತಗಳು ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯಿಂದ.",
      demoSubtitle: "ಇದು ಮಾದರಿ ಬಿಲ್, ನೀವು ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ದಾಖಲೆ ಅಲ್ಲ.",
      hospitalNotStated: "ಆಸ್ಪತ್ರೆಯ ಹೆಸರು ಬಿಲ್‌ನಿಂದ ಓದಲಾಗಿಲ್ಲ",
      billNumberLabel: "ಬಿಲ್ ಸಂಖ್ಯೆ",
      billDateLabel: "ಬಿಲ್ ದಿನಾಂಕ",
      totalNotStated: "ಬಿಲ್‌ನಲ್ಲಿ ಒಟ್ಟು ಮೊತ್ತ ಇಲ್ಲ",
      notStated: "ಲಭ್ಯವಿಲ್ಲ",
      missingAmount: "ಈ ಶುಲ್ಕಕ್ಕೆ ಮೊತ್ತ ಲಭ್ಯವಿಲ್ಲ.",
      couldNotReadTitle: "ಈ ಬಿಲ್ ಓದಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ",
      couldNotReadMsg:
        "ಓದಬಹುದಾದ ಪಠ್ಯ ಸಿಗದ ಕಾರಣ ಯಾವುದೇ ಮೊತ್ತ ತೋರಿಸಿಲ್ಲ. ಸ್ಪಷ್ಟ ಫೋಟೋ ತೆಗೆದುಕೊಳ್ಳಿ ಅಥವಾ ಬಿಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ.",
      noChargesTitle: "ಯಾವುದೇ ವಿವರ ಶುಲ್ಕ ಸಿಗಲಿಲ್ಲ",
      noChargesMsg:
        "ಬಿಲ್ ಓದಲಾಗಿದೆ, ಆದರೆ ಸುರಕ್ಷಿತವಾಗಿ ತೋರಿಸಬಹುದಾದ ವಿವರ ಅಥವಾ ಒಟ್ಟು ಮೊತ್ತ ಅದರಲ್ಲಿ ಇರಲಿಲ್ಲ.",
      documentFinding:
        "ಈ ಮೊತ್ತಗಳು ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ದಾಖಲೆಯ ಓದಿನಿಂದ ಮಾತ್ರ. ಅವನ್ನು ಯಾವುದೇ ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯೊಂದಿಗೆ ಹೋಲಿಸಿಲ್ಲ.",
      verifiedFinding:
        "ಈ ಮೊತ್ತಗಳನ್ನು ಈ ಬಿಲ್‌ಗೆ ಸಂಬಂಧಿಸಿದ ಆಸ್ಪತ್ರೆ ದಾಖಲೆಯಿಂದ ಓದಲಾಗಿದೆ.",
      itemLabel: "ಶುಲ್ಕ",
      amountLabel: "ಮೊತ್ತ",
      explanationLabel: "ಇದರ ಅರ್ಥ",
      listenBtn: "ಕೇಳಿ",
      stopBtn: "ನಿಲ್ಲಿಸಿ",
      listenAllBtn: "ಎಲ್ಲವನ್ನೂ ಕೇಳಿ",
      stopPlaybackBtn: "ಆಡಿಯೋ ನಿಲ್ಲಿಸಿ",
      totalLabel: "ಒಟ್ಟು ಬಿಲ್",
      unclear: "ಈ ಶುಲ್ಕವನ್ನು ಖಚಿತವಾಗಿ ಗುರುತಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.",
      copyBtn: "ಸಾರಾಂಶ ಕಾಪಿ ಮಾಡಿ",
      copiedBtn: "ಕಾಪಿ ಆಗಿದೆ!",
      newAnalysisBtn: "ಮತ್ತೊಂದು ಬಿಲ್ ವಿಶ್ಲೇಷಿಸಿ",
      lookUpAnotherBtn: "ಮತ್ತೊಂದು ಬಿಲ್ ಹುಡುಕಿ",
      downloadBtn: "ವರದಿ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ",
      findingsTitle: "ಪ್ರಮುಖ ಅಂಶಗಳು ಮತ್ತು ಟಿಪ್ಪಣಿಗಳು",
      findingsList: [
        "ಸರ್ಕಾರಿ ಆರೋಗ್ಯ ಯೋಜನೆಗಳ ರಿಯಾಯಿತಿ ಕಡಿತಕ್ಕೆ ಮುಂಚಿನ ಶುಲ್ಕಗಳನ್ನು ಪಟ್ಟಿಮಾಡಲಾಗಿದೆ.",
        "ವಿಮಾ ಪೂರ್ವ-ಅನುಮೋದನೆ ಲಭ್ಯವಿದೆ; ಅಂತಿಮ ಪಾವತಿ ಕ್ಲಿಯರ್ ಆಗಿದೆಯೇ ಎಂದು ಪರಿಶೀಲಿಸಿ.",
        "ಈ ಹೇಳಿಕೆಯಲ್ಲಿ ಯಾವುದೇ ನಕಲಿ ಕನ್ಸಲ್ಟೇಶನ್ ಶುಲ್ಕಗಳು ಕಂಡುಬಂದಿಲ್ಲ.",
      ],
      nextStepsTitle: "ಶಿಫಾರಸು ಮಾಡಿದ ಮುಂದಿನ ಹಂತಗಳು",
      nextStepsList: [
        "ಆಸ್ಪತ್ರೆಯ ಕೌಂಟರ್‌ನಿಂದ ಐಟಮ್-ವಾರು (itemized) ರಶೀದಿಯನ್ನು ಪಡೆದುಕೊಳ್ಳಿ.",
        "ಔಷಧ ಮತ್ತು ಲ್ಯಾಬ್ ಶುಲ್ಕಗಳನ್ನು ಡಿಸ್ಚಾರ್ಜ್ ಸಾರಾಂಶದೊಂದಿಗೆ ತಾಳೆ ನೋಡಿ.",
        "ಉಳಿದ ಮೊತ್ತದ ಬಗ್ಗೆ ಸಂದೇಹವಿದ್ದರೆ ವಿಮಾ ಸಂಸ್ಥೆಯನ್ನು ಸಂಪರ್ಕಿಸಿ.",
      ],
    },

    chat: {
      heading: "ಸಂದರ್ಭೋಚಿತ AI ಬಿಲ್ಲಿಂಗ್ ಸಹಾಯಕ",
      subheading:
        "ನನಗೆ ನಿಮ್ಮ ಬಿಲ್‌ನ ಪೂರ್ಣ ವಿವರ ತಿಳಿದಿದೆ. ಯಾವುದೇ ಶುಲ್ಕ, ವಿಮೆ ಅಥವಾ ಮುಂದಿನ ಕ್ರಮಗಳ ಬಗ್ಗೆ ಕೇಳಿ.",
      placeholder: "ಉದಾ: X-Ray ಶುಲ್ಕದಲ್ಲಿ ಏನೆಲ್ಲಾ ಬರುತ್ತದೆ? ಅಥವಾ ವಿವಾದ ಹೇಗೆ ಮಾಡುವುದು?",
      sendBtn: "ಕಳುಹಿಸಿ",
      assistantName: "MediExplain AI",
      you: "ನೀವು",
      typing: "ಯೋಚಿಸುತ್ತಿದೆ…",
      errorMsg: "ಕ್ಷಮಿಸಿ, ಪ್ರತಿಕ್ರಿಯೆ ನೀಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
      retryBtn: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
      emptyState:
        "ನಿಮ್ಮ ಬಿಲ್ ವಿಶ್ಲೇಷಿಸಲಾಗಿದೆ! ನಿಮ್ಮ ಶುಲ್ಕಗಳ ಬಗ್ಗೆ ಯಾವುದೇ ಪ್ರಶ್ನೆಗಳನ್ನು ಕೇಳಿ.",
      suggestedPrompts: [
        "ಕನ್ಸಲ್ಟೇಶನ್ ಶುಲ್ಕವನ್ನು ಇನ್ನಷ್ಟು ಸರಳವಾಗಿ ವಿವರಿಸಿ.",
        "ರಕ್ತ ಪರೀಕ್ಷೆಗೆ ಈ ಮೊತ್ತ ಸಾಮಾನ್ಯವೇ?",
        "ಆಸ್ಪತ್ರೆ ಬಿಲ್ಲಿಂಗ್ ವಿಭಾಗವನ್ನು ನಾನು ಏನು ಕೇಳಬೇಕು?",
        "ತಪ್ಪಾದ ಶುಲ್ಕವನ್ನು ಪ್ರಶ್ನಿಸುವುದು ಹೇಗೆ?",
        "ನನ್ನ ಎಲ್ಲಾ ಶುಲ್ಕಗಳ ಸಾರಾಂಶವನ್ನು ನೀಡಿ.",
      ],
      disclaimer:
        "ಈ AI ಸಹಾಯಕ ಕೇವಲ ಆಡಳಿತಾತ್ಮಕ ಮತ್ತು ಬಿಲ್ಲಿಂಗ್ ಸ್ಪಷ್ಟೀಕರಣ ನೀಡುತ್ತದೆ. ಇದು ಕಾನೂನು ಅಥವಾ ವೈದ್ಯಕೀಯ ಸಲಹೆಯಲ್ಲ.",
    },

    howItWorks: {
      heading: "ಇದು ಹೇಗೆ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತದೆ",
      steps: [
        {
          number: "1",
          title: "ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
          description:
            "ನಿಮ್ಮ ಆಸ್ಪತ್ರೆ ಬಿಲ್ ಅಥವಾ ದಾಖಲೆಯ ಫೋಟೋ ತೆಗೆದು ಇಲ್ಲಿ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
        },
        {
          number: "2",
          title: "ವಿಶ್ಲೇಷಿಸಿ",
          description:
            "ನಮ್ಮ AI ಪ್ರತಿ ಶುಲ್ಕವನ್ನು ಪರಿಶೀಲಿಸಿ ಸಂಕೀರ್ಣ ಪದಗಳನ್ನು ಸರಳ ಕನ್ನಡಕ್ಕೆ ಪರಿವರ್ತಿಸುತ್ತದೆ.",
        },
        {
          number: "3",
          title: "ಕೇಳಿ & ಚಾಟ್ ಮಾಡಿ",
          description:
            "ವಿವರಣೆಯನ್ನು ಧ್ವನಿ ಮೂಲಕ ಆಲಿಸಿ, ನಂತರ ಸಂದೇಹಗಳಿಗೆ ನೇರವಾಗಿ AI ಯೊಂದಿಗೆ ಚಾಟ್ ಮಾಡಿ.",
        },
      ],
    },

    footer: {
      disclaimer:
        "MediExplain AI ಕೇವಲ ಮಾಹಿತಿ ಉದ್ದೇಶಿತ ಸಹಾಯವನ್ನು ನೀಡುತ್ತದೆ. ಇದು ವೈದ್ಯಕೀಯ, ಕಾನೂನು ಅಥವಾ ಹಣಕಾಸು ಸಲಹೆಯಲ್ಲ. ವಿವರಗಳನ್ನು ನಿಮ್ಮ ಆಸ್ಪತ್ರೆಯೊಂದಿಗೆ ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಿ.",
      privacy: "ಗೌಪ್ಯತೆ ಮತ್ತು ಡೇಟಾ ಭದ್ರತೆ",
      terms: "ಬಳಕೆಯ ನಿಯಮಗಳು",
      about: "ನಮ್ಮ ಬಗ್ಗೆ",
    },

    misc: {
      loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ…",
      error: "ಏನೋ ದೋಷ ಸಂಭವಿಸಿದೆ.",
      backToTop: "ಮೇಲಕ್ಕೆ ಹೋಗಿ",
    },
  },
} as const;

type DeepString<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
  ? readonly (U extends string ? string : DeepString<U>)[]
  : T extends object
  ? { readonly [K in keyof T]: DeepString<T[K]> }
  : T;

export type Translations = DeepString<typeof translations.en>;
export type TranslationKey = keyof Translations;
