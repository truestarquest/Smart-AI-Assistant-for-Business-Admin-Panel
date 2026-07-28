# 🛡️ Aegis AI — Smart AI Assistant for Business Admin Panel

> **Smart AI-powered customer support assistant: an embeddable website widget, a Telegram bot, and an admin dashboard with CRM and analytics**

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node.js](https://img.shields.io/badge/node.js-v20%2B-green)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-production%20ready-success)

---

## 🔑 Instant Admin Preview

Try the admin panel **without any database or backend setup required**:

* 🌐 **URL:** `/admin.html`
* 🛠️ **Full Access Demo:** `demo-admin-2024` *(full read/write access, local fixture data)*
* 👁️ **Read-Only Demo:** `demo-manager-2024` *(manager read-only view)*

> Both demo accounts run entirely client-side against local fixture data — zero API keys or database required!

🌍 **Live Demo:** [smart-ai-assistant-for-business-admin.onrender.com](https://smart-ai-assistant-for-business-admin.onrender.com)

---

## ✨ Key Features

### 💬 Customer-Facing
- ✅ **Embeddable Chat Widget** — drop-in script (`public/chat-widget.js`), single line integration, no build step required.
- ✅ **Telegram Bot** — powered by the exact same engine and shares conversation history with the web widget.
- ✅ **Bilingual Support (UA/EN)** — automatic per-message visitor language detection.
- ✅ **Knowledge Base Grounding** — answers strictly anchored to business-provided facts with zero hallucinated pricing or facts.
- ✅ **Smart Operating Hours** — automated off-hours responses outside business schedule to avoid unnecessary AI token expenditure.
- ✅ **Prompt Injection Safeguards** — regex input pre-filtering combined with a hardened system prompt.

### 📊 Admin Panel (`/admin.html`)
- ✅ **Overview Dashboard** — real-time metrics: active users, message counts, and live sessions.
- ✅ **Conversations Browser** — seamless inspection of complete message threads for any session.
- ✅ **CRM & Lead Tracking** — visitor list with automatic lead lifecycle tagging (`new` ➔ `qualified` / `booked` / `lost`).
- ✅ **Analytics** — 7-day activity chart, lead conversion rates, and average bot response time.
- ✅ **Dialog History** — search, status & date filtering, manual lead status overrides, CSV exports, and one-click history resets.
- ✅ **Bot Settings** — knowledge base editor, tone-of-voice presets (*Business*, *Friendly*, *Sales*), schedule configuration, and live-tested CRM Webhooks.

---

## 🛠️ Tech Stack

| Category | Technology |
|-----------|-----------|
| **Backend** | Node.js (v20+), Express.js |
| **Database** | MongoDB (Mongoose) |
| **AI Core** | OpenAI-compatible API (OpenAI, NVIDIA API, local LLMs) |
| **Messaging** | Telegraf (Telegram Bot API) |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6+, zero frameworks) |
| **Security Middleware** | Helmet, CORS, Express Rate Limit, Mongo Sanitize, XSS Protection |
| **Deployment** | Render (`render.yaml`) |

---

## 📐 System Architecture

```text
                               ┌─────────────────────────┐
    Chat Widget (public/) ────►│                         │
                               │   Express.js API Server │─────► OpenAI-Compatible LLM
   Telegram Bot (src/bot/)────►│                         │
                               └───────────┬─────────────┘
                                           │
                                           ▼
                                    MongoDB Database
                         (Messages, Lead Status, Settings)
                                           ▲
                                           │
    Admin Panel (public/admin.html) ───────┴────── (Auth via x-admin-key)
```

> **Resilient Fallback Design:** If MongoDB is unreachable, Aegis AI gracefully degrades — active chat interactions function seamlessly in real time without persistence, preventing service downtime.

---

## 🚀 How to Run Locally (Quick Start)

### Prerequisites
- Node.js 20+
- MongoDB *(optional, required only for session history persistence)*

```bash
# 1. Clone the repository and install dependencies
npm install

# 2. Create the configuration file from the example
cp .env.example .env

# 3. Start in development mode (with auto-reload)
npm run dev

# Or start in production mode
npm start
```

---

## 📂 Project Structure

```text
aegis-ai/
├── server.js                    # Application entry point — middleware, routes, boot
├── src/
│   ├── bot/
│   │   └── index.js             # Telegram bot handler (anti-spam, shared chat logic)
│   ├── middleware/
│   │   └── adminAuth.js          # Authentication check via x-admin-key header
│   ├── models/                  # Mongoose schemas (Message, User, Settings, Session)
│   ├── routes/                  # API endpoints (chat, admin, users)
│   └── services/
│       └── openaiService.js      # Core LLM service, language detection, lead tracking, webhooks
├── public/
│   ├── index.html               # Product landing page
│   ├── chat-widget.{js,css}     # Embeddable zero-dependency chat widget
│   └── admin.html               # Administrative Dashboard UI
└── render.yaml                  # Deployment configuration for Render
```

---

## 🎯 Key Implementation Details

### 1. **Unified Core Engine (`openaiService.js`)**
A shared service serving both the web chat widget and Telegram bot ensures unified system prompts, a single source of truth for the knowledge base, and centralized operating hours scheduling:
```javascript
// Single point of interaction handling across all channels
async function getChatReply({ message, sessionId, channel }) {
    // 1. Check business working hours schedule
    // 2. Auto-detect visitor language per message
    // 3. Query LLM with automated lead status tagging
    // 4. Trigger CRM Webhook upon new lead creation
}
```

### 2. **Automatic Lead Lifecycle Tagging**
The LLM automatically tags the lead status via a hidden response marker unless manually overridden by an administrator:
```javascript
// Lead status marker parsed server-side from AI completion response
const leadStatusMatch = reply.match(/\[STATUS:\s*(new|qualified|booked|lost)\]/);
```

---

## 🗺️ Roadmap (Future Enhancements)

- [ ] Multi-channel traffic analytics breakdown (Web Widget vs Telegram)
- [ ] Custom date-range selector for historical analytics
- [ ] Direct CSV / JSON data export for KPI dashboard cards

---

<div align="center">

**Made with ❤️**

*Thank you for checking out this project!*

</div>
