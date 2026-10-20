# 🏥 Patient Financial Navigator — Understand Your Hospital Bill

**Understand Your Bill. Make Informed Decisions.**

An AI-powered backend that helps patients understand hospital financial information through clear, multilingual explanations grounded in verified records.

## 🧰 Tech Stack

### ⚙️ Backend
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

### 🤖 AI & OCR
![Google Gemini](https://img.shields.io/badge/Google_Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)
![Tesseract OCR](https://img.shields.io/badge/Tesseract_OCR-4285F4?style=for-the-badge)

### 🗄️ Database & Validation
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Integration_in_progress-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white)

### 🧪 Testing & Security
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)
![Gitleaks](https://img.shields.io/badge/Gitleaks-Secret_Scanning-red?style=for-the-badge)

---

**Core Principle:** Records Decide. AI Explains.

## ✨ What Is Patient Financial Navigator?

Hospital bills and insurance-related financial information can be difficult to understand. Patients may struggle to determine what an amount represents, what insurance has approved, or what the bill indicates is still due.

Patient Financial Navigator aims to make this information easier to understand through bill identification, access verification, and AI-generated explanations.

The system combines OCR, synthetic hospital records, verification controls, financial-data validation, and Google Gemini to explain supported financial fields in English, Hindi, and Kannada.

🌿 **Our mission:** Make hospital financial information clearer, safer, and more accessible.

## 🎯 The Problem

Patients can face difficulties because of:

- Complicated hospital billing terminology.
- Confusing insurance and financial fields.
- Difficulty understanding billed, approved, and outstanding amounts.
- Language barriers and unfamiliar terminology.
- Concerns about sharing sensitive financial information.
- Missing or incomplete information.

## 💡 Our Solution

Patient Financial Navigator separates verified financial facts from AI-generated explanations.

| Challenge | How the System Helps |
|---|---|
| Identifying a bill | Uses OCR to extract permitted identification information |
| Unauthorized access | Uses access codes, challenges, and verification controls |
| Unclear financial fields | Explains supported fields in simple language |
| Language barriers | Supports English, Hindi, and Kannada explanations |
| Incorrect AI-generated facts | Validates model output and uses authoritative server-side financial values |
| Missing or invalid information | Uses explicit verification outcomes and safe error responses |
| AI provider failures | Can return deterministic fallback explanations |

## 🔄 How It Works

1. **Identify the Bill** — Submit a supported bill image for OCR-based identification.
2. **Verify Access** — Complete the access-code challenge and verification process.
3. **Verify the Record** — Check the bill against the available authoritative record.
4. **Retrieve Financial Information** — Release financial fields only after the required verification and authorization checks succeed.
5. **Explain the Information** — Gemini generates explanations in the selected language.
6. **Validate the Explanation** — The backend validates the draft and renders financial facts from the verified record.

The current workflow uses synthetic hospital records. Real hospital integrations are not implemented.

## 🌟 Key Features

### 📷 1. Bill Identification and OCR

- Extracts permitted hospital and bill identification information.
- Validates uploaded image types and request sizes.
- Handles unreadable or invalid uploads.
- Keeps OCR-extracted financial amounts separate from authoritative financial records.

OCR accuracy depends on image quality, supported formats, and label readability.

### 🔐 2. Access Verification

- Access-code challenge and verification flow.
- Challenge expiry and failed-attempt limits.
- Hashed access-code handling.
- Signed tokens and server-side session validation.
- Single-use code enforcement in the supported storage implementation.
- Safe responses for failed verification and unavailable records.

**Important:** Some access state is stored in memory. The complete database-backed workflow and persistence across restarts have not yet been verified.

### 🧠 3. Verified Financial Information

The backend supports these verification outcomes:

- `verified`
- `amounts_differ`
- `bill_not_found`
- `hospital_not_registered`

Financial information is not released merely because OCR extracts an amount. The backend checks the verified record and applies the required authorization rules.

### 🤖 4. Gemini-Powered Explanations

- **Provider:** Google Gemini
- **Model:** Configurable using `GEMINI_MODEL`
- **API:** `POST /api/bills/explain`
- **Languages:** English, Hindi, and Kannada
- **Fallback:** Deterministic server-generated explanations when appropriate

The AI explains the meaning of the currently supported financial fields. It does not determine authoritative financial values.

The server validates the AI draft and renders financial facts from the verified record. Missing amounts remain missing rather than being converted to zero.

The application does not currently provide full explanations of every individual medical bill item.

### 🛡️ 5. Financial Accuracy and AI Safety

The central rule is:

> **RECORDS DECIDE. AI EXPLAINS.**

The backend aims to ensure that:

- The model receives only the information permitted by its explanation contract.
- Unsupported financial claims are rejected.
- Financial amounts come from the authoritative server-side record.
- Failed or malformed model responses do not become trusted facts.
- API keys remain server-side.
- Provider errors and redirects are handled safely.

The explanation validator uses heuristic text checks alongside structural validation. It does not guarantee that every possible misleading phrase can be detected.

### 🗄️ 6. PostgreSQL Foundation

Database-related code already exists, including:

- PostgreSQL connection utilities.
- SQL migrations and seed data.
- Hospital, bill, and financial-field tables.
- Access-code storage helpers.
- Query functions and callback-ticket storage groundwork.

**Database integration is incomplete.** The main bill workflow still uses synthetic in-code records, and end-to-end operation against a real PostgreSQL instance has not been verified.

### 🔁 7. Backend API Foundation

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/bills/identify` | Identify a bill using supported input |
| `POST` | `/api/bills/access/challenge` | Start access verification |
| `POST` | `/api/bills/access/verify` | Verify access credentials |
| `POST` | `/api/bills/verify` | Verify the bill and record the result |
| `GET` | `/api/bills/financials` | Retrieve authorized financial fields |
| `POST` | `/api/bills/explain` | Generate and validate financial explanations |

Callback and financial-field confirmation APIs are not yet complete.

## 🛡️ Security and Privacy

The project includes request-size limits, access-control checks, token validation, safe error handling, server-side AI credentials, and secret-scanning automation.

GitHub Actions runs the project's automated quality checks. Gitleaks scans for exposed secrets, including scheduled and manually triggered full-history scans.

Important remaining limitations include:

- No complete same-origin/CSRF or application-level rate-limiting protection.
- Access state remains process-local in parts of the current implementation.
- Multi-instance deployment requires shared persistent state and appropriate rate limiting.
- Database-backed end-to-end behavior remains unverified.
- The current project is not production-ready for real patient data.

## 🧰 Technology Stack

| Technology | Purpose |
|---|---|
| Next.js | Backend application and API routes |
| TypeScript | Typed application logic |
| Google Gemini API | Multilingual financial explanations |
| OCR and Tesseract | Bill identification |
| PostgreSQL | Planned persistent storage; integration in progress |
| Zod | Request and response validation |
| Vitest | Automated testing |
| GitHub Actions | Continuous integration |
| Gitleaks | Secret scanning |

## 📊 Project Progress Tracker

| Component | Estimated Progress |
|---|---:|
| Backend APIs and security | 75% |
| GenAI explanations | 80% |
| Database integration | 40% |
| Testing and quality assurance | **0%** |
| Callback and confirmation APIs | 20% |
| Frontend | 0% |
| Deployment and real-world validation | 15% |
| **Overall MVP** | **Approximately 60–65%** |

*These are approximate planning estimates, not measured completion metrics.*

The testing stage is deliberately tracked at **0%** until the dedicated systematic testing milestone is completed. Previous automated checks have passed, but that does not mean the full testing stage is finished.

## 🚀 Getting Started

### Prerequisites

- Node.js and npm.
- Git.
- A Google Gemini API key for live AI explanations.
- PostgreSQL for database integration and live database testing.

### 1. Clone the Repository

```bash
git clone https://github.com/manish77-git/project.git
cd project
```

### 2. Install Dependencies

```bash
npm ci
```

### 3. Configure Environment Variables

Create a local `.env.local` file using `.env.example` as a reference. Configure the variables required by the existing implementation, such as:

```dotenv
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=your_supported_gemini_model
ACCESS_SECRET=your_long_random_secret
DATABASE_URL=your_postgresql_connection_string
```

Only configure `DATABASE_URL` when a suitable PostgreSQL database exists. Follow the repository's actual configuration for any additional optional variables.

**Never commit `.env.local` or expose secrets to the browser.**

### 4. Run the Development Server

```bash
npm run dev
```

The Next.js application normally starts at:

`http://localhost:3000`

### 5. Run Automated Checks

```bash
npm test
npm run test:ocr
npm run lint
npx next typegen
npx tsc --noEmit
npm run build
```

Run these commands to verify the current checkout rather than assuming previous results guarantee that all future changes work.

## 🧪 Testing and Reliability

The planned dedicated testing stage must verify:

- Valid and invalid bill-identification inputs.
- OCR errors and oversized requests.
- Expired access challenges and exhausted attempts.
- Authorization before releasing financial information.
- Token and session validation.
- Gemini failures, malformed output, and unsupported financial claims.
- English, Hindi, and Kannada explanation behavior.
- Database migrations, queries, and seed data.
- Persistence of access-code consumption and required state across restarts.
- Full bill verification and explanation using actual PostgreSQL records.

Unit tests using mocks and integration tests using a real database must be reported separately.

## 🔮 Future Work

The immediate development priorities are:

1. Complete PostgreSQL integration with bill verification and financial-data retrieval.
2. Complete systematic testing, including database persistence and end-to-end behavior.
3. Implement callback and financial-field confirmation APIs.
4. Evaluate deployment and production security requirements.

The patient-facing frontend remains deferred.

## 🤝 Contributing

Contributions and improvements are welcome.

1. Fork the repository.
2. Create a focused feature branch.
3. Implement and document the change.
4. Run the relevant tests and quality checks.
5. Open a pull request with a clear explanation.

Do not commit secrets, private patient data, or unverified financial claims.

## 📚 Attribution

- Google Gemini — AI inference.
- Tesseract — OCR technology.
- PostgreSQL — relational database.
- Next.js — application framework.
- Vitest — testing framework.
- GitHub Actions — continuous integration.
- Gitleaks — secret detection.

Review the licensing and attribution requirements of dependencies before distributing the project.

---

**Patient Financial Navigator — Understand the bill. Protect the facts. Help patients make informed decisions.**
