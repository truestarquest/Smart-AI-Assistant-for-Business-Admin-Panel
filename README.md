# 🛡️ Aegis AI — Smart AI Assistant for Business

<p align="center">
  <a href="https://smart-ai-assistant-for-business-admin.onrender.com">
    <img src="https://img.shields.io/badge/Live_Demo-Render-informational?style=for-the-badge&logo=render&logoColor=white" alt="Live Demo" />
  </a>
  <img src="https://img.shields.io/badge/Node.js-v20+-success?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js Version" />
  <img src="https://img.shields.io/badge/Database-MongoDB-brightgreen?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/LLM-OpenAI--Compatible-blue?style=for-the-badge&logo=openai&logoColor=white" alt="LLM Integration" />
</p>

An intelligent, multi-channel customer support assistant tailored for small-to-medium businesses. **Aegis AI** features a zero-dependency embeddable web chat widget, a fully integrated Telegram bot, and an intuitive administrative dashboard—all backed by production-ready LLM routing.

🚀 **Live Demo:** [smart-ai-assistant-for-business-admin.onrender.com](https://smart-ai-assistant-for-business-admin.onrender.com)

---

## 🔑 Instant Live Admin Preview

Experience the full administrative dashboard **without needing a backend or database set up**:

* 🌐 **URL:** `/admin.html`
* 🛠️ **Full Access Demo:** `demo-admin-2024` *(Read/Write demo; state is non-persistent)*
* 👁️ **Read-Only Demo:** `demo-manager-2024` *(Manager view)*

> Both demo accounts run entirely client-side using local fixture data—zero credentials or API keys required!

---

## 🔥 Key Features

### 💬 Customer-Facing
* **Drop-in Web Widget:** Vanilla `public/chat-widget.js` script—zero build steps, instant drop-in integration.
* **Seamless Telegram Bot:** Runs off the exact same core engine, state management, and conversation history as the web chat.
* **Auto-Language Detection:** Dynamically detects visitor language (bilingual UA/EN support natively) and responds in kind.
* **Strict Knowledge Base Grounding:** Responds solely on admin-supplied facts and pricing—zero hallucination on crucial business data.
* **Smart Business Hours:** Automatically dispatches off-hours automated replies outside operating hours to optimize API overhead.
* **Hardened Security:** Built-in prompt-injection pre-filtering (Regex pre-checks + hardened system prompt).

### 📊 Admin Panel (`/admin.html`)
* **Live Overview:** Real-time metrics tracking active sessions, total users, and message volumes.
* **Full Dialogue History:** Comprehensive session inspection with search, status filtering, date range views, CSV exports, and instant resets.
* **Simple Lead CRM:** Auto-tagging lead lifecycle management (`new` ➔ `qualified` / `booked` / `lost`) powered by server-side parsing with permanent manual admin overrides.
* **Custom Bot Configuration:** Real-time updates to knowledge bases, tone-of-voice presets (*Business*, *Friendly*, *Sales*), operating schedules, and live-tested CRM webhooks.
* **Dual-Role Demo Mode:** Fast local UI showcase for potential clients or stakeholders.

---

## 🛠️ Tech Stack

* **Core Runtime:** Node.js (v20+), Express.js
* **Database:** MongoDB via Mongoose
* **AI Orchestration:** OpenAI-compatible API *(supports OpenAI, local LLMs, or endpoints like NVIDIA's `integrate.api.nvidia.com`)*
* **Messaging Integrations:** Telegraf (Telegram Bot API)
* **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
* **Security Middleware:** Helmet, CORS, Express Rate Limit (route-tiered), Express Mongo Sanitize, `xss` sanitization
* **Deployment:** Render (`render.yaml` included)

---

## 📐 Architecture

```
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

> **Resilient Fallback Design:** If MongoDB is unreachable, Aegis AI gracefully degrades—allowing active chat interactions to function without persistent history, preventing service downtime.

---

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository and install dependencies
npm install

# Set up your environment variables
cp .env.example .env

# Run in development mode with auto-reload
npm run dev

# Or start in production mode
npm start
```

### 2. Environment Variables (`.env`)

| Variable | Mandatory? | Description |
| :--- | :---: | :--- |
| `PORT` | ❌ | Server port *(Defaults to `3000`)* |
| `MONGODB_URI` | 🟡 Recommended | Database connection string. Chat works without persistence if omitted. |
| `OPENAI_API_KEY` | ✅ | API key for your chosen OpenAI-compatible provider. |
| `OPENAI_MODEL` | ❌ | Model identifier *(Defaults to `gpt-4o-mini`)*. |
| `OPENAI_BASE_URL` | ❌ | Omit for official OpenAI API; set for alternative endpoints. |
| `TELEGRAM_BOT_TOKEN` | ❌ | Bot token from `@BotFather`. Telegram bot is disabled if unset. |
| `ADMIN_KEY` | ✅ | Master secret key required to authenticate `/admin.html`. |
| `ALLOWED_ORIGIN` | 🟢 Prod Only | Comma-separated list of permitted CORS origins. |
| `MAX_MESSAGE_LENGTH` | ❌ | Input character safety ceiling *(Defaults to `1000`)*. |

---

## 📂 Project Structure

```text
├── server.js                     # Application entry point, middleware & route bootstrapping
├── src/
│   ├── bot/
│   │   └── index.js              # Telegram bot handler & spam protection
│   ├── middleware/
│   │   └── adminAuth.js          # Authentication check via x-admin-key
│   ├── models/                   # Mongoose Schemas (Message, User, Settings, Session)
│   ├── routes/                   # API Endpoints (chat, admin, users)
│   └── services/
│       └── openaiService.js      # Unified LLM handling, language detection & webhooks
└── public/
    ├── index.html                # Product landing page
    ├── chat-widget.{js,css}      # Embeddable zero-dependency chat widget
    └── admin.html                # Modern Administrative Dashboard UI
```

---

## 🗺️ Roadmap

- [ ] Multi-channel analytics breakdown (Web Widget vs. Telegram traffic comparison)
- [ ] Custom date-range picker for historical analytics
- [ ] Direct KPI card CSV / JSON data export

---

## 🔒 Security Highlights

* **Static Admin Secret:** Access to `/admin.html` is secured via an `ADMIN_KEY` header. Ensure this is changed prior to deployment.
* **Environment Protection:** `.env` files are ignored by default and kept strictly out of git history.
