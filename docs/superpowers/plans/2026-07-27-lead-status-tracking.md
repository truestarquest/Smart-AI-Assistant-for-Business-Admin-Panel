# Lead Status Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the message-count "conversion" proxy and the fully-mock "Історія діалогів" tab with a real per-session lead status (`new`/`qualified`/`booked`/`lost`) that the bot can set automatically and the admin can override manually.

**Architecture:** New `Session` Mongo collection (one doc per `sessionId`, upserted lazily) holds `status` + `statusSetBy`. The LLM emits a hidden `[[status:...]]` marker in its reply when it detects a qualifying signal; `openaiService.js` strips it before the user sees it and writes it via `setSessionStatus(id, status, 'auto')`. A new admin route lets a human set it via `setSessionStatus(id, status, 'manual')`. The lock rule — manual wins, auto never overwrites a manual value — lives in one pure function, `shouldApplyStatus`, so it's testable without touching Mongo. `GET /api/admin/sessions` and `GET /api/admin/analytics` both read from the same `Session` collection instead of guessing from message counts. The frontend History tab swaps its `MOCK_DIALOGS` array for the real sessions endpoint, reusing its existing filter/search/CSV-export code unchanged.

**Tech Stack:** Node/Express, Mongoose, vanilla JS frontend (no build step) — matches the existing `Settings.js` singleton-via-upsert pattern and the existing `openaiService.js` fire-and-forget webhook pattern.

## Global Constraints

- Status enum is exactly `new | qualified | booked | lost` (spec: reuse the 4 values already used by the History tab's mock data) — do not add or rename values.
- Manual status writes always set `statusSetBy: 'manual'` and always win; auto writes are a no-op once a session is `statusSetBy: 'manual'` (spec: "Manual locks it").
- No name/phone capture — History rows show sessionId / last-message preview / date / status only (spec: non-goal).
- This repo has no test framework (confirmed: no `test/` dir, no test script in `package.json`). Verification is live `node -e` / `curl` checks against a locally-run server, same style already used for the schedule/webhook work earlier in this session — not `pytest`/`jest` style.
- Every DB-touching function must degrade the same way the rest of the service layer does: `mongoose.connection.readyState !== 1` → return a safe default, never hang or throw past the caller.

---

### Task 1: `Session` model + pure lock-rule logic

**Files:**
- Create: `src/models/Session.js`

**Interfaces:**
- Produces: `STATUSES` (array `['new','qualified','booked','lost']`), `shouldApplyStatus(existingDoc, setBy)` → `boolean` (pure, no I/O), `getSessionStatus(sessionId)` → `Promise<{status, statusSetBy}>`, `setSessionStatus(sessionId, status, setBy)` → `Promise<{_id, status, statusSetBy, updatedAt}>` (throws `Error` if `status` isn't in `STATUSES`), `getStatusesForSessions(sessionIds: string[])` → `Promise<Record<string,string>>` (sessionId → status, only for sessions that have a `Session` doc).

- [ ] **Step 1: Write the file**

```js
'use strict';

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const STATUSES = ['new', 'qualified', 'booked', 'lost'];

// One doc per chat session, upserted lazily — same "singleton via upsert"
// shape as Settings.js, just keyed by sessionId instead of a fixed id.
const sessionSchema = new Schema(
  {
    _id: { type: String }, // sessionId
    status: { type: String, enum: STATUSES, default: 'new' },
    statusSetBy: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const SessionModel = model('Session', sessionSchema);

const DEFAULT_STATUS = { status: 'new', statusSetBy: 'auto' };

/**
 * The lock rule: once a human has set a status by hand, the bot's
 * auto-tagging must never silently overwrite it. Pure function — no
 * Mongo I/O — so it can be tested without a database connection.
 * @param {{statusSetBy?: string}|null} existingDoc
 * @param {'auto'|'manual'} setBy
 * @returns {boolean}
 */
function shouldApplyStatus(existingDoc, setBy) {
  if (setBy === 'manual') return true;
  return !existingDoc || existingDoc.statusSetBy !== 'manual';
}

async function getSessionStatus(sessionId) {
  if (mongoose.connection.readyState !== 1) return DEFAULT_STATUS;
  try {
    const doc = await SessionModel.findById(sessionId).lean();
    return doc || DEFAULT_STATUS;
  } catch (err) {
    console.error('[Session] Failed to load status:', err.message);
    return DEFAULT_STATUS;
  }
}

async function setSessionStatus(sessionId, status, setBy) {
  if (!STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database is not connected');
  }
  const existing = await SessionModel.findById(sessionId).lean();
  if (!shouldApplyStatus(existing, setBy)) return existing;
  return SessionModel.findByIdAndUpdate(
    sessionId,
    { $set: { status, statusSetBy: setBy, updatedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

/**
 * Bulk status lookup for the sessions list / analytics — sessions with no
 * Session doc yet are simply absent from the returned map (caller treats
 * that as 'new', same default as getSessionStatus).
 * @param {string[]} sessionIds
 * @returns {Promise<Record<string, string>>}
 */
async function getStatusesForSessions(sessionIds) {
  if (mongoose.connection.readyState !== 1 || !sessionIds.length) return {};
  try {
    const docs = await SessionModel.find({ _id: { $in: sessionIds } }).select('status').lean();
    const map = {};
    for (const d of docs) map[d._id] = d.status;
    return map;
  } catch (err) {
    console.error('[Session] Failed to load statuses:', err.message);
    return {};
  }
}

module.exports = {
  STATUSES,
  shouldApplyStatus,
  getSessionStatus,
  setSessionStatus,
  getStatusesForSessions,
};
```

- [ ] **Step 2: Verify the pure lock-rule logic without a database**

Run:
```bash
node -e "
const { shouldApplyStatus, STATUSES } = require('./src/models/Session');
console.log('STATUSES:', STATUSES);
console.log('no existing doc, auto:', shouldApplyStatus(null, 'auto'));            // expect true
console.log('existing auto doc, auto:', shouldApplyStatus({statusSetBy:'auto'}, 'auto'));   // expect true
console.log('existing manual doc, auto:', shouldApplyStatus({statusSetBy:'manual'}, 'auto')); // expect false
console.log('existing manual doc, manual:', shouldApplyStatus({statusSetBy:'manual'}, 'manual')); // expect true
"
```
Expected output: `true`, `true`, `false`, `true` in that order.

- [ ] **Step 3: Syntax-check the file loads cleanly**

Run: `node -c src/models/Session.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/models/Session.js
git commit -m "feat: add Session model for real lead-status tracking"
```

---

### Task 2: Auto-tagging — bot emits and strips the status marker

**Files:**
- Modify: `src/services/openaiService.js`

**Interfaces:**
- Consumes: `setSessionStatus` from `../models/Session` (Task 1).
- Produces: `stripStatusMarker(text)` → `{text: string, status: string|null}` (pure, exported for the verification step below). `getChatReply` behavior changes: the returned string never contains a `[[status:...]]` marker, and a detected marker triggers a fire-and-forget `setSessionStatus` call.

- [ ] **Step 1: Add the marker-stripping helper and import**

In `src/services/openaiService.js`, add near the top (after the existing `const Message = require('../models/Message');` line):

```js
const { setSessionStatus } = require('../models/Session');
```

Then add this near `buildSystemPrompt` (e.g. directly above it), as a standalone exported function:

```js
const STATUS_MARKER_RE = /\s*\[\[status:(qualified|booked|lost)\]\]\s*$/i;

/**
 * Strips the bot's hidden lead-status marker (if present) from the end of
 * its reply. The marker is a server-side signal, never meant for the user
 * to see — see the "СТАТУС ЛІДА" block in buildSystemPrompt().
 * @param {string} text
 * @returns {{text: string, status: string|null}}
 */
function stripStatusMarker(text) {
  const match = text.match(STATUS_MARKER_RE);
  if (!match) return { text, status: null };
  return { text: text.replace(STATUS_MARKER_RE, '').trimEnd(), status: match[1].toLowerCase() };
}
```

- [ ] **Step 2: Verify stripStatusMarker in isolation (no DB, no network)**

Run:
```bash
node -e "
const { stripStatusMarker } = require('./src/services/openaiService');
console.log(JSON.stringify(stripStatusMarker('Гаразд, записую вас на демо! [[status:booked]]')));
console.log(JSON.stringify(stripStatusMarker('Дякую, це не по бюджету.[[status:lost]]')));
console.log(JSON.stringify(stripStatusMarker('Звичайна відповідь без мітки.')));
"
```
Expected:
```
{"text":"Гаразд, записую вас на демо!","status":"booked"}
{"text":"Дякую, це не по бюджету.","status":"lost"}
{"text":"Звичайна відповідь без мітки.","status":null}
```
(This will fail with "stripStatusMarker is not a function" until Step 4's export change is also in place — run this after Step 4, not before.)

- [ ] **Step 3: Extend the system prompt**

In `buildSystemPrompt`, the returned template string currently ends with the "ФОРМАТУВАННЯ" block:
```
ФОРМАТУВАННЯ — КРИТИЧНО ВАЖЛИВО:
Використовуй ТІЛЬКИ базові HTML-теги: <b>, <i>, <code>, <pre>.
НІКОЛИ не використовуй Markdown: без зірочок **, без підкреслень __, без хештегів #.
Якщо наводиш код — обов'язково загортай у <pre><code>...</code></pre>.`;
```
Change the closing backtick line so one more block is appended before it:
```
ФОРМАТУВАННЯ — КРИТИЧНО ВАЖЛИВО:
Використовуй ТІЛЬКИ базові HTML-теги: <b>, <i>, <code>, <pre>.
НІКОЛИ не використовуй Markdown: без зірочок **, без підкреслень __, без хештегів #.
Якщо наводиш код — обов'язково загортай у <pre><code>...</code></pre>.

СТАТУС ЛІДА — СЛУЖБОВА ПОЗНАЧКА, ПІСЛЯ ЗВИЧАЙНОЇ ВІДПОВІДІ:
Якщо з цього повідомлення користувача ЧІТКО видно результат розмови, додай в самому кінці своєї відповіді, окремим рядком, ОДНУ службову мітку:
- [[status:booked]] — користувач явно погодився записатись/оформити замовлення/купити.
- [[status:qualified]] — користувач явно зацікавлений і уточнює деталі щодо покупки чи тарифів.
- [[status:lost]] — користувач явно відмовився або сказав, що це йому не підходить.
В усіх інших випадках НЕ додавай жодної мітки. Ця мітка не показується користувачу — це внутрішній сигнал для CRM, тому вона має бути єдиним, що йде після звичайного тексту відповіді, без жодних інших символів після неї.`;
```

- [ ] **Step 4: Strip the marker and persist status in `getChatReply`**

Find this block near the end of `getChatReply`:
```js
  const reply = completion.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('Empty response from LLM');

  return reply;
```
Replace it with:
```js
  const rawReply = completion.choices?.[0]?.message?.content?.trim();
  if (!rawReply) throw new Error('Empty response from LLM');

  const { text: reply, status } = stripStatusMarker(rawReply);

  if (status && sessionId) {
    setSessionStatus(sessionId, status, 'auto').catch((err) => {
      console.error('[Session] Auto status update failed:', err.message);
    });
  }

  return reply;
```

- [ ] **Step 5: Export `stripStatusMarker`**

Find the `module.exports` block at the bottom of the file:
```js
module.exports = {
  openai,
  OPENAI_MODEL,
  buildSystemPrompt,
  saveMessage,
  getChatReply,
  isBotOpenNow,
  sendWebhookRequest,
};
```
Add `stripStatusMarker`:
```js
module.exports = {
  openai,
  OPENAI_MODEL,
  buildSystemPrompt,
  saveMessage,
  getChatReply,
  isBotOpenNow,
  sendWebhookRequest,
  stripStatusMarker,
};
```

- [ ] **Step 6: Re-run Step 2's verification now that the export exists**

Run the same `node -e` command from Step 2. Expected output matches what's shown there exactly.

- [ ] **Step 7: Syntax-check**

Run: `node -c src/services/openaiService.js`
Expected: no output (exit 0).

- [ ] **Step 8: Commit**

```bash
git add src/services/openaiService.js
git commit -m "feat: bot auto-tags lead status via hidden reply marker"
```

---

### Task 3: Manual status override route

**Files:**
- Modify: `src/routes/admin.js`

**Interfaces:**
- Consumes: `STATUSES`, `setSessionStatus` from `../models/Session` (Task 1).
- Produces: `PUT /api/admin/sessions/:sessionId/status` — body `{ "status": "qualified" }`, 400 on invalid status, 503 if DB not connected, 200 with `{ success: true, data: <Session doc> }` on success.

- [ ] **Step 1: Add the import**

Near the top of `src/routes/admin.js`, alongside the existing `Settings` import:
```js
const { STATUSES, setSessionStatus } = require('../models/Session');
```

- [ ] **Step 2: Add the route**

Add this route (placing it near the other `/sessions`-related route is fine — right after the existing `GET /sessions` handler works):
```js
// PUT /api/admin/sessions/:sessionId/status — manual override, always wins
// over the bot's auto-tagging from then on (see Session.js shouldApplyStatus).
router.put('/sessions/:sessionId/status', async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database is not connected' });
  const { sessionId } = req.params;
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `status must be one of: ${STATUSES.join(', ')}` });
  }
  try {
    const updated = await setSessionStatus(sessionId, status, 'manual');
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[admin] Failed to set session status:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});
```

- [ ] **Step 3: Syntax-check**

Run: `node -c src/routes/admin.js`
Expected: no output (exit 0).

- [ ] **Step 4: Live verification (no DB required for the validation paths)**

Start the server locally (background) with a fake Mongo URI so it starts DB-disconnected, same approach used earlier in this session:
```bash
PORT=4123 MONGODB_URI="mongodb://127.0.0.1:1/nope" ADMIN_KEY="test-admin-key" NODE_ENV=development node server.js &
sleep 4
```
Then:
```bash
KEY="test-admin-key"
echo "-- invalid status (expect 400) --"
curl -s http://localhost:4123/api/admin/sessions/abc/status -X PUT -H "x-admin-key: $KEY" -H "Content-Type: application/json" -d '{"status":"bogus"}'
echo
echo "-- valid status, no DB (expect 503) --"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4123/api/admin/sessions/abc/status -X PUT -H "x-admin-key: $KEY" -H "Content-Type: application/json" -d '{"status":"qualified"}'
echo "-- no admin key (expect 401) --"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4123/api/admin/sessions/abc/status -X PUT -H "Content-Type: application/json" -d '{"status":"qualified"}'
```
Expected: `{"success":false,"message":"status must be one of: new, qualified, booked, lost"}`, then `503`, then `401`.

Stop the server: `pkill -f "node server.js"`

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin.js
git commit -m "feat: add manual lead-status override route"
```

---

### Task 4: Real status in `GET /api/admin/sessions`

**Files:**
- Modify: `src/routes/admin.js:64-92` (the existing `GET /sessions` handler)

**Interfaces:**
- Consumes: `getStatusesForSessions` from `../models/Session` (Task 1).
- Produces: each object in the `/sessions` response array gains a `status` field (`'new'` when no `Session` doc exists yet).

- [ ] **Step 1: Add the import**

Extend the Task 3 import line to also pull in `getStatusesForSessions`:
```js
const { STATUSES, setSessionStatus, getStatusesForSessions } = require('../models/Session');
```

- [ ] **Step 2: Merge status into the response**

The existing handler currently ends with:
```js
    const total = totalResult[0]?.total || 0;

    res.json({ success: true, data: sessions, total });
```
Change it to look up and merge statuses before responding:
```js
    const total = totalResult[0]?.total || 0;
    const statusMap = await getStatusesForSessions(sessions.map((s) => s.sessionId));
    const sessionsWithStatus = sessions.map((s) => ({ ...s, status: statusMap[s.sessionId] || 'new' }));

    res.json({ success: true, data: sessionsWithStatus, total });
```

- [ ] **Step 3: Syntax-check**

Run: `node -c src/routes/admin.js`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.js
git commit -m "feat: include real lead status in /admin/sessions response"
```

---

### Task 5: Analytics conversion % uses real status

**Files:**
- Modify: `src/routes/admin.js` (the `GET /analytics` handler)

**Interfaces:**
- Consumes: `getStatusesForSessions` from `../models/Session` (already imported by Task 4).
- Produces: `conversionRate` in the `/analytics` response now reflects real `qualified`/`booked` sessions instead of the "4+ messages" proxy. Response shape is unchanged (same field name, same type — a number).

- [ ] **Step 1: Replace the proxy calculation**

Find this block in the `/analytics` handler:
```js
    // "Конверсія в лід" — без окремої CRM/lead-схеми ми не знаємо, хто
    // реально залишив контакт, тож використовуємо чесний proxy: частка
    // сесій за 7 днів, що зайшли за межі одного привітання (4+ повідомлень
    // = діалог, що розвинувся, а не одноразовий "привіт"). Не справжня
    // конверсія — коли з'явиться реальний lead-статус, замінити на нього.
    const qualified = sessionSizes.filter((s) => s.count >= 4).length;
    const conversionRate = sessionSizes.length
      ? Math.round((qualified / sessionSizes.length) * 1000) / 10
      : 0;
```
Replace with:
```js
    // "Конверсія в лід" — реальний lead-статус (Session.status), більше не
    // проксі за кількістю повідомлень. Сесія рахується конвертованою, якщо
    // її статус — 'qualified' або 'booked' (виставлений ботом автоматично
    // або адміном вручну, див. src/models/Session.js).
    const sessionIdsInWindow = sessionSizes.map((s) => s._id);
    const statusMap = await getStatusesForSessions(sessionIdsInWindow);
    const qualified = sessionIdsInWindow.filter((id) => ['qualified', 'booked'].includes(statusMap[id] || 'new')).length;
    const conversionRate = sessionIdsInWindow.length
      ? Math.round((qualified / sessionIdsInWindow.length) * 1000) / 10
      : 0;
```

- [ ] **Step 2: Syntax-check**

Run: `node -c src/routes/admin.js`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin.js
git commit -m "feat: analytics conversion rate uses real lead status"
```

---

### Task 6: History tab — swap mock data for real sessions, add status control

**Files:**
- Modify: `public/admin.js` (History section, `~line 898-998`; i18n dictionaries `~line 56` and `~line 149`)
- Modify: `public/admin.css` (add one small rule for the status `<select>`)

**Interfaces:**
- Consumes: `GET /admin/sessions` (now includes `status`, Task 4), `PUT /admin/sessions/:sessionId/status` (Task 3), `GET /admin/messages?sessionId=` (existing route, already used by `selectSession` in the Conversations tab), existing helpers `apiFetch`, `unwrapArray`, `escapeHtml`, `renderUserText`, `renderBotText`, `formatTime`, `showToast`, `t`.
- Produces: the История tab renders real sessions; changes nothing about any other tab's behavior.

- [ ] **Step 1: Remove `MOCK_DIALOGS` and replace the data-fetch/filter functions**

Delete the entire `MOCK_DIALOGS` array (lines 901-930) and replace `filteredMockDialogs()` / `renderHistoryList()` with real-data versions. Replace this whole block:
```js
const MOCK_DIALOGS = [ /* ... */ ];
function statusLabel(status) { return t(`status_${status}`); }
let historyInitialized = false;

function filteredMockDialogs() {
  const search = document.getElementById('history-search').value.trim().toLowerCase();
  const status = document.getElementById('history-status-filter').value;
  const date = document.getElementById('history-date-filter').value;
  return MOCK_DIALOGS.filter((d) => {
    if (status && d.status !== status) return false;
    if (date && d.date !== date) return false;
    if (search && !(`${d.name} ${d.phone}`.toLowerCase().includes(search))) return false;
    return true;
  });
}

function renderHistoryList() {
  const container = document.getElementById('history-list');
  const dialogs = filteredMockDialogs();
  if (!dialogs.length) {
    container.innerHTML = `<div class="empty-state"><p>${t('history_none')}</p></div>`;
    return;
  }
  container.innerHTML = dialogs.map((d) => `
    <div class="history-card" data-id="${d.id}">
      <div class="history-card-head">
        <div>
          <span class="history-name">${escapeHtml(d.name)}</span>
          <span class="history-phone muted">${escapeHtml(d.phone)}</span>
        </div>
        <div class="history-card-meta">
          <span class="status-badge status-${d.status}">${statusLabel(d.status)}</span>
          <span class="session-time">${d.date}</span>
        </div>
      </div>
      <div class="history-thread" hidden>
        ${d.messages.map((m) => `<div class="msg ${m.role === 'user' ? 'msg-user' : 'msg-bot'}">${escapeHtml(m.text)}</div>`).join('')}
      </div>
    </div>
  `).join('');
```
(Leave the closing lines that follow — the `.forEach` wiring click handlers on `.history-card-head` — in place; see next step for what happens to it.)

With:
```js
function statusLabel(status) { return t(`status_${status}`); }
let historyInitialized = false;
let historySessions = []; // fetched once per tab visit, filtered client-side

async function fetchHistorySessions() {
  const json = await apiFetch('/admin/sessions?limit=100');
  return unwrapArray(json).map((s) => ({
    id: s.sessionId || s.id,
    status: s.status || 'new',
    preview: (typeof s.lastMessage === 'object' && s.lastMessage) ? (s.lastMessage.text || '') : (s.lastMessage || ''),
    date: (s.lastMessage && s.lastMessage.createdAt) ? s.lastMessage.createdAt : (s.updatedAt || s.createdAt || ''),
  }));
}

function filteredHistorySessions() {
  const search = document.getElementById('history-search').value.trim().toLowerCase();
  const status = document.getElementById('history-status-filter').value;
  const date = document.getElementById('history-date-filter').value;
  return historySessions.filter((d) => {
    if (status && d.status !== status) return false;
    if (date && !String(d.date).slice(0, 10).includes(date)) return false;
    if (search && !(`${d.id} ${d.preview}`.toLowerCase().includes(search))) return false;
    return true;
  });
}

function renderHistoryList() {
  const container = document.getElementById('history-list');
  const dialogs = filteredHistorySessions();
  if (!dialogs.length) {
    container.innerHTML = `<div class="empty-state"><p>${t('history_none')}</p></div>`;
    return;
  }
  container.innerHTML = dialogs.map((d) => `
    <div class="history-card" data-id="${escapeHtml(d.id)}">
      <div class="history-card-head">
        <div>
          <span class="history-name">${escapeHtml(d.id)}</span>
          <span class="history-phone muted">${escapeHtml(d.preview).slice(0, 60)}</span>
        </div>
        <div class="history-card-meta">
          <select class="status-select status-${d.status}" data-session-id="${escapeHtml(d.id)}">
            ${STATUS_VALUES.map((s) => `<option value="${s}" ${s === d.status ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
          </select>
          <span class="session-time">${formatTime(d.date)}</span>
        </div>
      </div>
      <div class="history-thread" hidden data-loaded="0"></div>
    </div>
  `).join('');
```

- [ ] **Step 2: Add the `STATUS_VALUES` constant used above**

Directly above the `function statusLabel(status)` line added in Step 1, add:
```js
const STATUS_VALUES = ['new', 'qualified', 'booked', 'lost'];
```

- [ ] **Step 3: Rewrite the click/status-change wiring**

Immediately after the `renderHistoryList` function (Step 1's replacement), find the existing wiring block:
```js
  container.querySelectorAll('.history-card').forEach((card) => {
    card.querySelector('.history-card-head').addEventListener('click', () => {
      card.querySelector('.history-thread').hidden = !card.querySelector('.history-thread').hidden;
      card.classList.toggle('open');
    });
  });
}
```
Replace with a version that (a) lazy-loads the thread on first expand, using the same `/admin/messages` endpoint and rendering helpers `selectSession` already uses, and (b) wires the new status `<select>` to `PUT /admin/sessions/:sessionId/status` without also toggling the thread open (clicking the dropdown shouldn't expand/collapse the card):
```js
  container.querySelectorAll('.history-card').forEach((card) => {
    const sessionId = card.dataset.id;
    const threadEl = card.querySelector('.history-thread');

    card.querySelector('.history-card-head').addEventListener('click', async (e) => {
      if (e.target.closest('.status-select')) return; // don't toggle when interacting with the dropdown
      const opening = threadEl.hidden;
      threadEl.hidden = !opening;
      card.classList.toggle('open', opening);
      if (opening && threadEl.dataset.loaded !== '1') {
        threadEl.innerHTML = `<div class="empty-state"><p>${t('thread_loading')}</p></div>`;
        try {
          const json = await apiFetch(`/admin/messages?sessionId=${encodeURIComponent(sessionId)}`);
          const messages = unwrapArray(json);
          threadEl.innerHTML = messages.length
            ? messages.map((m) => {
                const role = m.role === 'user' ? 'user' : 'bot';
                const body = role === 'user' ? renderUserText(m.text) : renderBotText(m.text);
                return `<div class="msg ${role === 'user' ? 'msg-user' : 'msg-bot'}">${body}</div>`;
              }).join('')
            : `<div class="empty-state"><p>${t('thread_none')}</p></div>`;
          threadEl.dataset.loaded = '1';
        } catch (err) {
          threadEl.innerHTML = `<div class="empty-state"><p>${t('thread_error', escapeHtml(err.message))}</p></div>`;
        }
      }
    });

    card.querySelector('.status-select').addEventListener('click', (e) => e.stopPropagation());
    card.querySelector('.status-select').addEventListener('change', async (e) => {
      const select = e.target;
      const newStatus = select.value;
      select.className = `status-select status-${newStatus}`;
      try {
        await apiFetch(`/admin/sessions/${encodeURIComponent(sessionId)}/status`, {
          method: 'PUT',
          body: JSON.stringify({ status: newStatus }),
        });
        const local = historySessions.find((d) => d.id === sessionId);
        if (local) local.status = newStatus;
        showToast(t('history_status_updated'), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}
```

- [ ] **Step 4: Point `exportHistoryToCsv` at real fields**

Find:
```js
function exportHistoryToCsv() {
  const dialogs = filteredMockDialogs();
  const header = currentLang === 'en'
    ? ['Name', 'Phone', 'Status', 'Date']
    : ["Ім'я", 'Телефон', 'Статус', 'Дата'];
  const rows = dialogs.map((d) => [d.name, d.phone, statusLabel(d.status), d.date]);
```
Replace with:
```js
function exportHistoryToCsv() {
  const dialogs = filteredHistorySessions();
  const header = currentLang === 'en'
    ? ['Session', 'Last message', 'Status', 'Date']
    : ['Сесія', 'Останнє повідомлення', 'Статус', 'Дата'];
  const rows = dialogs.map((d) => [d.id, d.preview, statusLabel(d.status), formatTime(d.date)]);
```
(The rest of `exportHistoryToCsv` — CSV-building, blob, download — is unchanged.)

- [ ] **Step 5: Fetch real sessions when the tab loads**

Find:
```js
function loadHistory() {
  if (!historyInitialized) {
    document.getElementById('history-search').addEventListener('input', renderHistoryList);
    document.getElementById('history-status-filter').addEventListener('change', renderHistoryList);
    document.getElementById('history-date-filter').addEventListener('change', renderHistoryList);
    document.getElementById('history-export-btn').addEventListener('click', exportHistoryToCsv);
    historyInitialized = true;
  }
  renderHistoryList();
}
```
Replace with:
```js
async function loadHistory() {
  if (!historyInitialized) {
    document.getElementById('history-search').addEventListener('input', renderHistoryList);
    document.getElementById('history-status-filter').addEventListener('change', renderHistoryList);
    document.getElementById('history-date-filter').addEventListener('change', renderHistoryList);
    document.getElementById('history-export-btn').addEventListener('click', exportHistoryToCsv);
    historyInitialized = true;
  }
  try {
    historySessions = await fetchHistorySessions();
  } catch (err) {
    showToast(err.message, 'error');
    historySessions = [];
  }
  renderHistoryList();
}
```

- [ ] **Step 6: Drop the "(демо)" wording and add the status-update toast key**

In the UA dictionary (~line 56):
```js
    page_sub_history: 'Фільтри, пошук, експорт (демо)',
```
becomes:
```js
    page_sub_history: 'Фільтри, пошук, експорт CSV',
    history_status_updated: 'Статус оновлено',
```
In the EN dictionary (~line 149):
```js
    page_sub_history: 'Filters, search, export (demo)',
```
becomes:
```js
    page_sub_history: 'Filters, search, CSV export',
    history_status_updated: 'Status updated',
```

- [ ] **Step 7: Add the status-select CSS rule**

In `public/admin.css`, near the existing `.history-filters` rules, add:
```css
.status-select {
  background: transparent;
  border: 1px solid var(--glass-border);
  border-radius: 6px;
  color: inherit;
  font-size: 12px;
  padding: 3px 6px;
  cursor: pointer;
}
```
(Reuses the existing `status-badge`/`status-*` color classes already defined elsewhere in this file for the `status-${status}` modifier classes — no new color rules needed.)

- [ ] **Step 8: Syntax-check**

Run: `node -c public/admin.js` (this only checks JS syntax validity, not DOM behavior — browser verification is next).
Expected: no output (exit 0).

- [ ] **Step 9: Browser verification**

Start the static file server for this repo's `public/` dir (already configured in `.claude/launch.json` as `smart-ai-admin-public`, port 4174) and confirm in the Browser pane:
1. Navigate to `admin.html`, log in.
2. Open Історія діалогів — confirm the subtitle no longer says "(демо)".
3. Since there's no local Mongo, `GET /admin/sessions` will fail (no backend running against this static server) — confirm the tab shows the `history_none`/error toast gracefully rather than throwing an unhandled JS error (check `read_console_messages` for errors).
4. This step only proves the frontend fails gracefully without a backend; full behavior (real rows, status dropdown persisting) needs to be checked against the deployed Render instance with real Mongo — note this for the user in the handoff summary.

- [ ] **Step 10: Commit**

```bash
git add public/admin.js public/admin.css
git commit -m "feat: History tab uses real sessions and lead status instead of mock data"
```

---

## Self-review notes (for the plan author, not a task)

- Spec coverage: Session model ✓ (Task 1), auto-tagging ✓ (Task 2), manual override ✓ (Task 3), История tab real data ✓ (Task 6), analytics conversion % ✓ (Task 5), sessions endpoint carries status ✓ (Task 4, a prerequisite for Task 6). Non-goals (name/phone, per-channel, date-range) correctly left out.
- Every task's DB-touching paths were checked against `mongoose.connection.readyState !== 1` guards, matching the Global Constraints line.
- Task 6 Step 9 explicitly flags that full functional verification needs a real Mongo connection (Render's), which isn't available locally — this is called out rather than silently claimed as "tested".
