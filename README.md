# Aegis AI — Smart AI Assistant for Business Admin Panel

An AI-powered customer support assistant for small/medium businesses: an
embeddable web chat widget, a Telegram bot, and an admin dashboard to manage
both — knowledge base, tone of voice, working hours, lead tracking, and
analytics, all backed by a real LLM.

Live demo: [smart-ai-assistant-for-business-admin.onrender.com](https://smart-ai-assistant-for-business-admin.onrender.com)

**Try the admin panel without any credentials** — open `/admin.html` and log
in with `demo-admin-2024` (full read/write demo, changes aren't persisted)
or `demo-manager-2024` (read-only). Both run entirely client-side against
fixture data, no database or API key required — the fastest way to see the
dashboard without asking for real access.

## Features

**Customer-facing**
- Embeddable chat widget (`public/chat-widget.js`) — drop-in, no build step, bilingual (UA/EN)
- Telegram bot, sharing the exact same conversation logic and history as the web widget
- Replies in whichever language the visitor writes in, detected per message
- Answers are grounded in an admin-editable knowledge base — the bot never invents prices or facts it wasn't given
- Configurable working hours — outside them, visitors get an automatic off-hours reply instead of an LLM call
- Basic prompt-injection resistance (regex pre-filter + a hardened system prompt)

**Admin panel** (`/admin.html`)
- **Overview** — live stats: users, messages, active sessions
- **Conversations** — browse any session's full message thread
- **Users** — simple CRM-style user list (name/email)
- **Analytics** — 7-day activity chart, real lead-conversion rate, average bot response time
- **Dialog history** — every session with filters (search/status/date), manual lead-status override, CSV export, and a one-click "clear all history" reset
- **Bot settings** — knowledge base, tone of voice (business/friendly/sales), working-hours schedule, and a CRM webhook (fires on every new lead, with a live test button)
- Two-role demo mode (`demo-admin-2024` full access / `demo-manager-2024` read-only) for exploring the UI with zero backend setup

**Lead status tracking** — every session is auto-tagged `new` → `qualified` /
`booked` / `lost` by the LLM itself (a hidden marker on its own reply, parsed
server-side), or set manually by an admin — a manual override always locks
out further auto-tagging for that session.

## Tech stack

- **Backend:** Node.js 20+, Express, MongoDB (Mongoose)
- **AI:** OpenAI-compatible chat completion API (works with OpenAI directly, or any compatible endpoint — deployed against NVIDIA's `integrate.api.nvidia.com`)
- **Messaging:** Telegraf (Telegram Bot API)
- **Frontend:** vanilla HTML/CSS/JS, no framework, no build step
- **Security:** helmet, cors, express-rate-limit (tiered per route), express-mongo-sanitize, `xss` sanitization on every stored message
- **Deploy:** Render (`render.yaml` included)

## Architecture

```
Chat widget (public/)  ─┐
                         ├─▶ Express API ─▶ OpenAI-compatible LLM
Telegram bot (src/bot/)─┘        │
                                  ▼
                              MongoDB
                    (messages, sessions/lead-status, settings)
                                  ▲
                                  │
                    Admin panel (public/admin.html) ── x-admin-key auth
```

Both the widget and the Telegram bot call the same `getChatReply()` service
(`src/services/openaiService.js`) — one system prompt, one knowledge base,
one place where language detection / off-hours / lead-tagging / webhook
logic live, instead of duplicated per channel.

The app starts even if MongoDB isn't reachable — it degrades (chat still
works without history/persistence) rather than crashing on boot.

## Getting started

```bash
npm install
cp .env.example .env   # fill in your own values, see below
npm run dev             # nodemon, auto-restart
# or: npm start
```

### Environment variables (`.env`)

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no | defaults to `3000` |
| `MONGODB_URI` | recommended | app runs without it, but chat has no memory/persistence |
| `OPENAI_API_KEY` | yes | any OpenAI-compatible provider's key |
| `OPENAI_MODEL` | no | defaults to `gpt-4o-mini` |
| `OPENAI_BASE_URL` | no | omit for real OpenAI; set for an OpenAI-compatible endpoint |
| `TELEGRAM_BOT_TOKEN` | no | Telegram bot disabled if unset |
| `ADMIN_KEY` | yes | secret for `/admin.html` — **change the default before deploying** |
| `ALLOWED_ORIGIN` | yes in production | comma-separated list of allowed CORS origins |
| `MAX_MESSAGE_LENGTH` | no | defaults to `1000` |

## Project structure

```
server.js                    entry point — middleware, routes, boot
src/
  bot/index.js                Telegram bot (anti-spam, shares chat logic)
  routes/{chat,admin,users}.js
  middleware/adminAuth.js      static x-admin-key check
  models/{Message,User,Settings,Session}.js
  services/openaiService.js    shared LLM call, language detection,
                                lead-status tagging, webhooks, schedule
public/
  index.html, chat-widget.{js,css}   landing page + embeddable widget
  admin.html, admin.{js,css}          admin dashboard
```

## Roadmap

Not built yet:
- Per-channel breakdown (web widget vs. Telegram) on the analytics chart
- Date-range picker for analytics (currently a fixed 7-day window)
- CSV/export for the KPI cards, matching the Dialog history export
