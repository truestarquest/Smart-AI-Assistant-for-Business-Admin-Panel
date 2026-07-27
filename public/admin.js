'use strict';

/* ============================================================
   CONFIG
   ------------------------------------------------------------
   Якщо реальна модель User має інші поля — досить поправити
   USER_FIELDS нижче, решта коду (таблиця + форма) підлаштується
   автоматично.
   ============================================================ */
const API_BASE = '/api';
const STORAGE_KEY = 'admin_key';
const ROLE_STORAGE_KEY = 'admin_role';

// Демо-режим без бекенду: ці 2 ключі не йдуть в реальний /api, роль і всі
// дані на цих вкладках — mock/localStorage. Будь-який інший ключ проходить
// звичайну перевірку через reальний ADMIN_KEY і отримує роль 'admin'.
const MOCK_ROLE_KEYS = {
  'demo-admin-2024': 'admin',
  'demo-manager-2024': 'manager',
};
// Реальна модель User (src/models/User.js) має лише name + email.
// Обидва поля опційні на бекенді, але створити юзера можна лише
// якщо заповнене хоча б одне з них (це перевіряється і на клієнті, і на сервері).
const USER_FIELDS = [
  { key: 'name',  label: 'Ім\'я',  type: 'text',  required: false },
  { key: 'email', label: 'Email',  type: 'email', required: false },
];

let adminKey = sessionStorage.getItem(STORAGE_KEY) || '';
let currentRole = sessionStorage.getItem(ROLE_STORAGE_KEY) || 'admin';
let isMockSession = Object.prototype.hasOwnProperty.call(MOCK_ROLE_KEYS, adminKey);
let currentSessionId = null;
let editingUserId = null;

/* ============================================================
   FETCH HELPER
   ============================================================ */
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
      ...(options.headers || {}),
    },
  });

  let json = null;
  try { json = await res.json(); } catch (_) { /* empty body, e.g. 204 */ }

  if (!res.ok) {
    const message = (json && (json.message || json.error)) || `Помилка запиту (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Різні бекенди повертають масив по-різному (data / items / sessions / messages / users / сам масив) */
function unwrapArray(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  const candidates = ['data', 'items', 'sessions', 'messages', 'users', 'results'];
  for (const key of candidates) {
    if (Array.isArray(json[key])) return json[key];
  }
  return [];
}

/** Статистика теж може прийти або в data, або на верхньому рівні */
function unwrapObject(json) {
  if (!json) return {};
  if (json.data && typeof json.data === 'object' && !Array.isArray(json.data)) return json.data;
  if (json.stats && typeof json.stats === 'object') return json.stats;
  return json;
}

function pickNumber(obj, keys, fallback = 0) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return Number(obj[k]);
  }
  return fallback;
}

/* ============================================================
   AUTH / LOGIN
   ============================================================ */
const loginView = document.getElementById('view-login');
const appView = document.getElementById('view-app');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

async function tryLogin(key) {
  if (Object.prototype.hasOwnProperty.call(MOCK_ROLE_KEYS, key)) {
    adminKey = key;
    currentRole = MOCK_ROLE_KEYS[key];
    isMockSession = true;
    sessionStorage.setItem(STORAGE_KEY, key);
    sessionStorage.setItem(ROLE_STORAGE_KEY, currentRole);
    showApp();
    return;
  }

  adminKey = key;
  try {
    await apiFetch('/admin/stats');
    currentRole = 'admin';
    isMockSession = false;
    sessionStorage.setItem(STORAGE_KEY, key);
    sessionStorage.setItem(ROLE_STORAGE_KEY, currentRole);
    showApp();
  } catch (err) {
    adminKey = '';
    loginError.textContent = err.status === 401 || err.status === 403
      ? 'Невірний Admin Key.'
      : `Не вдалося з'єднатись: ${err.message}`;
    loginError.hidden = false;
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const key = document.getElementById('admin-key').value.trim();
  if (!key) return;
  tryLogin(key);
});

logoutBtn.addEventListener('click', () => {
  adminKey = '';
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(ROLE_STORAGE_KEY);
  appView.hidden = true;
  loginView.hidden = false;
  document.getElementById('admin-key').value = '';
});

/** Демо-ключі не бачать реальні вкладки (немає бекенду, яким їх авторизувати),
 *  а Manager у демо бачить лише "Історія діалогів" (перегляд, без налаштувань). */
function applyRoleVisibility() {
  navItems.forEach((btn) => {
    const view = btn.dataset.view;
    const needsReal = btn.dataset.role === 'real';
    const adminOnly = btn.dataset.role === 'admin';
    let visible = true;
    if (needsReal && isMockSession) visible = false;
    if (adminOnly && currentRole !== 'admin') visible = false;
    if (isMockSession && currentRole === 'manager' && view !== 'history') visible = false;
    btn.hidden = !visible;
  });

}

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  applyRoleVisibility();
  if (isMockSession) {
    setConnStatus(true);
    document.getElementById('conn-label').textContent = `Демо-режим · ${currentRole === 'admin' ? 'Admin' : 'Manager'}`;
    const active = document.querySelector('.nav-item.active');
    if (active && !active.hidden) {
      active.click();
    } else {
      const firstVisible = Array.from(navItems).find((b) => !b.hidden);
      if (firstVisible) firstVisible.click();
    }
  } else {
    setConnStatus(true);
    loadOverview();
  }
}

function setConnStatus(online) {
  const dot = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  dot.classList.toggle('online', online);
  dot.classList.toggle('offline', !online);
  label.textContent = online ? "З'єднано" : "Немає з'єднання";
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');

const PAGE_META = {
  overview: { title: 'Огляд', subtitle: 'Стан асистента у реальному часі' },
  conversations: { title: 'Діалоги', subtitle: 'Історія листування з користувачами' },
  users: { title: 'Користувачі', subtitle: 'Керування обліковими записами' },
  analytics: { title: 'Аналітика', subtitle: 'KPI та активність за 7 днів (демо)' },
  history: { title: 'Історія діалогів', subtitle: 'Фільтри, пошук, експорт (демо)' },
  settings: { title: 'Налаштування бота', subtitle: 'База знань, тон, розклад, webhook (демо)' },
};

navItems.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.hidden) return;
    const view = btn.dataset.view;
    navItems.forEach((b) => b.classList.toggle('active', b === btn));
    views.forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    pageTitle.textContent = PAGE_META[view].title;
    pageSubtitle.textContent = PAGE_META[view].subtitle;

    if (view === 'overview') loadOverview();
    if (view === 'conversations') loadSessions();
    if (view === 'users') loadUsers();
    if (view === 'analytics') loadAnalytics();
    if (view === 'history') loadHistory();
    if (view === 'settings') loadSettings();
  });
});

document.querySelectorAll('[data-refresh]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.refresh;
    if (target === 'overview') loadOverview();
    if (target === 'sessions') loadSessions();
    if (target === 'users') loadUsers();
  });
});

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

/* ============================================================
   WAVEFORM (signature element)
   ============================================================ */
function buildWaveform(el, barCount) {
  el.innerHTML = '';
  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement('span');
    bar.style.animationDelay = `${(Math.random() * 1.4).toFixed(2)}s`;
    bar.style.animationDuration = `${(1.1 + Math.random() * 1.1).toFixed(2)}s`;
    el.appendChild(bar);
  }
}
buildWaveform(document.getElementById('login-waveform'), 28);
buildWaveform(document.getElementById('header-waveform'), 16);

/* ============================================================
   OVERVIEW
   ============================================================ */
async function loadOverview() {
  try {
    const [statsJson, sessionsJson] = await Promise.all([
      apiFetch('/admin/stats'),
      apiFetch('/admin/sessions'),
    ]);
    setConnStatus(true);

    const stats = unwrapObject(statsJson);
    document.getElementById('stat-users').textContent =
      pickNumber(stats, ['totalUsers', 'users', 'userCount']);
    document.getElementById('stat-messages').textContent =
      pickNumber(stats, ['totalMessages', 'messages', 'messageCount']);
    document.getElementById('stat-sessions').textContent =
      pickNumber(stats, ['totalSessions', 'activeSessions', 'sessions', 'uniqueSessions', 'sessionCount']);

    const sessions = unwrapArray(sessionsJson).slice(0, 6);
    renderSessionList(document.getElementById('overview-sessions'), sessions, false);
  } catch (err) {
    setConnStatus(false);
    showToast(err.message, 'error');
  }
}

/* ============================================================
   CONVERSATIONS
   ============================================================ */
function sessionField(session, keys, fallback = '') {
  for (const k of keys) {
    if (session[k] !== undefined && session[k] !== null) return session[k];
  }
  return fallback;
}

function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderSessionList(container, sessions, clickable = true) {
  container.innerHTML = '';
  if (!sessions.length) {
    container.innerHTML = '<div class="empty-state"><p>Сесій ще немає.</p></div>';
    return;
  }
  sessions.forEach((s) => {
    const id = sessionField(s, ['sessionId', 'id', '_id']);
    const lastMessage = sessionField(s, ['lastMessage', 'preview', 'text']);
    const lastMessageText = typeof lastMessage === 'object' ? (lastMessage.text || '') : lastMessage;
    const count = sessionField(s, ['messageCount', 'count'], '');
    const time = sessionField(s, ['updatedAt', 'lastActivity', 'createdAt'])
      || (typeof lastMessage === 'object' && lastMessage ? lastMessage.createdAt : '');

    const row = document.createElement('div');
    row.className = 'session-row';
    row.innerHTML = `
      <div class="session-row-top">
        <span class="session-id">${escapeHtml(id)}</span>
        ${count !== '' ? `<span class="session-count">${escapeHtml(String(count))}</span>` : ''}
      </div>
      ${lastMessageText ? `<span class="session-preview">${renderPreview(lastMessageText)}</span>` : ''}
      ${time ? `<span class="session-time">${formatTime(time)}</span>` : ''}
    `;
    if (clickable) {
      row.addEventListener('click', () => selectSession(id, row));
    }
    container.appendChild(row);
  });
}

async function loadSessions() {
  const container = document.getElementById('session-list');
  container.innerHTML = '<div class="empty-state"><p>Завантаження…</p></div>';
  try {
    const json = await apiFetch('/admin/sessions');
    const sessions = unwrapArray(json);
    renderSessionList(container, sessions, true);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Помилка завантаження: ${escapeHtml(err.message)}</p></div>`;
    showToast(err.message, 'error');
  }
}

async function selectSession(sessionId, rowEl) {
  currentSessionId = sessionId;
  document.querySelectorAll('#session-list .session-row').forEach((r) => r.classList.remove('active'));
  if (rowEl) rowEl.classList.add('active');

  document.getElementById('thread-title').textContent = sessionId;
  const thread = document.getElementById('thread');
  thread.innerHTML = '<div class="empty-state"><p>Завантаження…</p></div>';

  try {
    const json = await apiFetch(`/admin/messages?sessionId=${encodeURIComponent(sessionId)}`);
    const messages = unwrapArray(json);
    document.getElementById('thread-meta').textContent = `${messages.length} повідомлень`;

    if (!messages.length) {
      thread.innerHTML = '<div class="empty-state"><p>У цій сесії ще немає повідомлень.</p></div>';
      return;
    }

    thread.innerHTML = '';
    messages.forEach((m) => {
      const role = sessionField(m, ['role'], 'bot');
      const text = sessionField(m, ['text', 'message'], '');
      const time = sessionField(m, ['createdAt', 'timestamp']);

      const bubble = document.createElement('div');
      bubble.className = `msg ${role === 'user' ? 'msg-user' : 'msg-bot'}`;
      const bodyHtml = role === 'user' ? renderUserText(text) : renderBotText(text);
      bubble.innerHTML = `${bodyHtml}${time ? `<span class="msg-time">${formatTime(time)}</span>` : ''}`;
      thread.appendChild(bubble);
    });
    thread.scrollTop = thread.scrollHeight;
  } catch (err) {
    thread.innerHTML = `<div class="empty-state"><p>Помилка завантаження: ${escapeHtml(err.message)}</p></div>`;
  }
}

/* ============================================================
   USERS (CRUD)
   ============================================================ */
async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '<tr><td colspan="99" class="muted">Завантаження…</td></tr>';
  try {
    const json = await apiFetch('/users');
    const users = unwrapArray(json);
    renderUsersTable(users);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="99" class="muted">Помилка завантаження: ${escapeHtml(err.message)}</td></tr>`;
    showToast(err.message, 'error');
  }
}

function renderUsersTable(users) {
  const theadRow = document.getElementById('users-thead-row');
  const tbody = document.getElementById('users-tbody');

  const columns = USER_FIELDS.map((f) => f.key);
  theadRow.innerHTML =
    USER_FIELDS.map((f) => `<th>${escapeHtml(f.label)}</th>`).join('') +
    '<th>Створено</th><th></th>';

  tbody.innerHTML = '';
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 2}" class="muted">Користувачів ще немає.</td></tr>`;
    return;
  }

  users.forEach((u) => {
    const id = u._id || u.id;
    const tr = document.createElement('tr');
    tr.innerHTML =
      columns.map((c, i) => `<td data-label="${escapeHtml(USER_FIELDS[i].label)}">${escapeHtml(u[c] ?? '—')}</td>`).join('') +
      `<td class="muted" data-label="Створено">${formatTime(u.createdAt) || '—'}</td>` +
      `<td class="row-actions">
        <button class="icon-btn" data-edit="${id}">Редагувати</button>
        <button class="icon-btn danger" data-delete="${id}">Видалити</button>
      </td>`;
    tbody.appendChild(tr);

    tr.querySelector('[data-edit]').addEventListener('click', () => openUserModal(u));
    tr.querySelector('[data-delete]').addEventListener('click', () => deleteUser(id));
  });
}

async function deleteUser(id) {
  if (!confirm('Видалити цього користувача?')) return;
  try {
    await apiFetch(`/users/${id}`, { method: 'DELETE' });
    showToast('Користувача видалено', 'success');
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/* ---- modal ---- */
const userModal = document.getElementById('user-modal');
const userForm = document.getElementById('user-form');
const modalTitle = document.getElementById('modal-title');

function buildUserForm(existing) {
  userForm.innerHTML = USER_FIELDS.map((f) => {
    const value = existing ? (existing[f.key] ?? '') : '';
    if (f.type === 'select') {
      const opts = f.options.map((o) =>
        `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`
      ).join('');
      return `<div class="field"><label>${f.label}</label>
        <select name="${f.key}" ${f.required ? 'required' : ''}>${opts}</select></div>`;
    }
    return `<div class="field"><label>${f.label}</label>
      <input type="${f.type}" name="${f.key}" value="${escapeHtml(value)}" ${f.required ? 'required' : ''}></div>`;
  }).join('') + `
    <div class="modal-actions">
      <button type="button" class="btn-ghost" id="modal-cancel">Скасувати</button>
      <button type="submit" class="btn btn-primary">${existing ? 'Зберегти' : 'Створити'}</button>
    </div>
  `;
  userForm.querySelector('#modal-cancel').addEventListener('click', closeUserModal);
}

function openUserModal(existing = null) {
  editingUserId = existing ? (existing._id || existing.id) : null;
  modalTitle.textContent = existing ? 'Редагувати користувача' : 'Новий користувач';
  buildUserForm(existing);
  userModal.hidden = false;
}

function closeUserModal() {
  userModal.hidden = true;
  editingUserId = null;
}

document.getElementById('add-user-btn').addEventListener('click', () => openUserModal(null));
document.getElementById('modal-close').addEventListener('click', closeUserModal);
userModal.addEventListener('click', (e) => { if (e.target === userModal) closeUserModal(); });

userForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(userForm);
  const payload = {};
  USER_FIELDS.forEach((f) => {
    const value = (formData.get(f.key) || '').trim();
    if (value) payload[f.key] = value;
  });

  if (!Object.keys(payload).length) {
    showToast("Заповніть ім'я або email", 'error');
    return;
  }

  try {
    if (editingUserId) {
      await apiFetch(`/users/${editingUserId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      showToast('Зміни збережено', 'success');
    } else {
      await apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Користувача створено', 'success');
    }
    closeUserModal();
    loadUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

/* ============================================================
   TEXT RENDERING — clean previews + safe formatting
   ------------------------------------------------------------
   Session previews are one-line summaries: any HTML tags or
   markdown emphasis markers in the raw text should be stripped
   entirely (not just escaped — escaped tags still show up as
   ugly literal "<b>" clutter in a preview line).

   Full thread messages are different: the bot's own replies use
   a tiny set of formatting tags (the same ones the public chat
   widget supports — <b> <i> <code> <pre>), and it's genuinely
   useful for an admin to see that formatting when reading a
   transcript. So thread rendering allows exactly that fixed
   whitelist through, nothing else. User-typed messages are NEVER
   given that treatment — customer input is always fully escaped,
   since a visitor could otherwise type raw HTML/script tags into
   the chat and have them execute in the admin's authenticated
   session the moment someone opens that transcript.
   ============================================================ */
const SAFE_INLINE_TAGS = ['b', 'strong', 'i', 'em', 'code', 'pre'];

function stripToPlainText(value) {
  if (!value) return '';
  return String(value)
    .replace(/<[^>]*>/g, ' ')            // strip HTML tags entirely
    .replace(/\*\*(.*?)\*\*/g, '$1')     // markdown bold
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1') // inline/code fences
    .replace(/\*(.*?)\*/g, '$1')         // markdown italic / stray bullet markers
    .replace(/\s+/g, ' ')
    .trim();
}

/** Heuristic: a string that's mostly literal "?" characters is almost
 *  always mojibake from a charset mismatch at write-time (bytes already
 *  replaced with 0x3F before we ever received them) — not something we
 *  can recover client-side. Flag it instead of showing a wall of "??????". */
function isLikelyMojibake(value) {
  if (!value) return false;
  const text = String(value).trim();
  if (text.length < 6) return false;
  const qMarks = (text.match(/\?/g) || []).length;
  return qMarks / text.length > 0.4;
}

const ENCODING_WARNING =
  '<span class="encoding-warn" title="Текст, ймовірно, збережено з пошкодженим кодуванням на сервері (не виправити на клієнті)">⚠ пошкоджене кодування</span>';

/** One-line, fully plain-text preview for session lists. */
function renderPreview(value) {
  const plain = stripToPlainText(value);
  if (isLikelyMojibake(plain)) return ENCODING_WARNING;
  return escapeHtml(plain);
}

/** Bot message in the full thread view: escape everything, then
 *  re-open only the exact whitelisted tags (no attributes possible —
 *  escapeHtml already neutralized anything with extra content inside
 *  the brackets, so only a bare "<b>"/"</b>" etc. can ever match). */
function renderBotText(value) {
  if (isLikelyMojibake(value)) return ENCODING_WARNING;
  let escaped = escapeHtml(value);
  SAFE_INLINE_TAGS.forEach((tag) => {
    escaped = escaped
      .replace(new RegExp(`&lt;${tag}&gt;`, 'g'), `<${tag}>`)
      .replace(new RegExp(`&lt;/${tag}&gt;`, 'g'), `</${tag}>`);
  });
  return escaped;
}

/** User-typed message: always fully escaped, no exceptions. */
function renderUserText(value) {
  if (isLikelyMojibake(value)) return ENCODING_WARNING;
  return escapeHtml(value);
}

/* ============================================================
   ANALYTICS (mock KPIs + 7-day sparkline)
   ------------------------------------------------------------
   No backend for this tab: numbers are generated once per day
   (seeded by today's date, so refreshing doesn't jump around)
   and cached in localStorage.
   ============================================================ */
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function dateSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h || 1;
}

function getMockAnalytics() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const cacheKey = `mock_analytics_${todayKey}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  const rand = seededRandom(dateSeed(todayKey));
  const week = Array.from({ length: 7 }, () => Math.round(24 + rand() * 60));
  const data = {
    dialogsToday: week[week.length - 1],
    conversionRate: Math.round((18 + rand() * 16) * 10) / 10,
    avgResponseSeconds: Math.round((1.2 + rand() * 2.4) * 10) / 10,
    activeBots: 1,
    week,
  };
  localStorage.setItem(cacheKey, JSON.stringify(data));
  return data;
}

function renderSparkline(container, values) {
  const w = 640, h = 160, pad = 10;
  const max = Math.max(...values), min = Math.min(...values);
  const span = Math.max(max - min, 1);
  const stepX = (w - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${h - pad} L${points[0][0].toFixed(1)},${h - pad} Z`;
  const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const todayIdx = new Date().getDay();
  const labels = Array.from({ length: 7 }, (_, i) => days[(todayIdx - 6 + i + 70) % 7]);

  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" class="sparkline" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--cyan)" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="var(--cyan)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#sparkFill)"/>
      <path d="${linePath}" fill="none" stroke="var(--cyan)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="var(--bg-elevated)" stroke="var(--cyan)" stroke-width="2"/>`).join('')}
    </svg>
    <div class="sparkline-labels">${labels.map((l) => `<span>${l}</span>`).join('')}</div>
  `;
}

function loadAnalytics() {
  const data = getMockAnalytics();
  document.getElementById('kpi-dialogs-today').textContent = data.dialogsToday;
  document.getElementById('kpi-conversion').textContent = `${data.conversionRate}%`;
  document.getElementById('kpi-response-time').textContent = `${data.avgResponseSeconds}с`;
  document.getElementById('kpi-active-bots').textContent = data.activeBots;
  renderSparkline(document.getElementById('activity-chart'), data.week);
}

/* ============================================================
   HISTORY (mock dialogs — filters, search, CSV export)
   ============================================================ */
const MOCK_DIALOGS = [
  { id: 'd1', name: 'Олена Ковальчук', phone: '+380 67 123 4567', status: 'booked', date: '2026-07-24', messages: [
    { role: 'user', text: 'Привіт, скільки коштує базовий тариф?' },
    { role: 'bot', text: 'Вітаю! Базовий тариф — $29/міс, включає до 200 діалогів.' },
    { role: 'user', text: 'Добре, хочу записатись на демо' },
    { role: 'bot', text: 'Чудово, ось посилання для запису: t.me/aegis_demo' },
  ]},
  { id: 'd2', name: 'Дмитро Іваненко', phone: '+380 50 987 6543', status: 'qualified', date: '2026-07-25', messages: [
    { role: 'user', text: 'Чи інтегрується з Telegram?' },
    { role: 'bot', text: 'Так, через One-Time Deep Links — клієнт переходить у ваш бот одразу з контекстом розмови.' },
  ]},
  { id: 'd3', name: 'Марія Соколова', phone: '+380 63 555 1122', status: 'new', date: '2026-07-26', messages: [
    { role: 'user', text: 'Добрий день' },
    { role: 'bot', text: 'Вітаю! Чим можу допомогти?' },
  ]},
  { id: 'd4', name: 'Андрій Петренко', phone: '+380 99 222 3344', status: 'lost', date: '2026-07-20', messages: [
    { role: 'user', text: 'А є безкоштовний період?' },
    { role: 'bot', text: 'Пробний період — 14 днів, без картки.' },
    { role: 'user', text: 'Занадто дорого для нас, дякую' },
  ]},
  { id: 'd5', name: 'Ірина Бондаренко', phone: '+380 68 444 5566', status: 'booked', date: '2026-07-23', messages: [
    { role: 'user', text: 'Потрібна інтеграція з нашою CRM' },
    { role: 'bot', text: 'Підтримуємо webhook — налаштовується в адмін-панелі за 2 хвилини.' },
    { role: 'user', text: 'Записуйте нас на дзвінок' },
  ]},
  { id: 'd6', name: 'Сергій Мельник', phone: '+380 96 777 8899', status: 'qualified', date: '2026-07-22', messages: [
    { role: 'user', text: 'Скільки часу займає впровадження?' },
    { role: 'bot', text: 'Зазвичай 1-2 дні на базове налаштування бота.' },
  ]},
];
const STATUS_LABELS = { new: 'Новий', qualified: 'Кваліфікований', booked: 'Записаний', lost: 'Втрачений' };
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
    container.innerHTML = '<div class="empty-state"><p>Нічого не знайдено за цим фільтром.</p></div>';
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
          <span class="status-badge status-${d.status}">${STATUS_LABELS[d.status]}</span>
          <span class="session-time">${d.date}</span>
        </div>
      </div>
      <div class="history-thread" hidden>
        ${d.messages.map((m) => `<div class="msg ${m.role === 'user' ? 'msg-user' : 'msg-bot'}">${escapeHtml(m.text)}</div>`).join('')}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.history-card').forEach((card) => {
    card.querySelector('.history-card-head').addEventListener('click', () => {
      card.querySelector('.history-thread').hidden = !card.querySelector('.history-thread').hidden;
      card.classList.toggle('open');
    });
  });
}

function exportHistoryToCsv() {
  const dialogs = filteredMockDialogs();
  const header = ['Ім\'я', 'Телефон', 'Статус', 'Дата'];
  const rows = dialogs.map((d) => [d.name, d.phone, STATUS_LABELS[d.status], d.date]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dialogs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV завантажено', 'success');
}

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

/* ============================================================
   BOT SETTINGS (mock, admin only — persisted to localStorage)
   ============================================================ */
const SETTINGS_STORAGE_KEY = 'bot_settings';
let settingsInitialized = false;

function getStoredSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)) || {};
  } catch (_) {
    return {};
  }
}

function loadSettings() {
  const s = getStoredSettings();
  document.getElementById('settings-kb').value = s.knowledgeBase || '';
  document.getElementById('settings-tone').value = s.tone || 'business';
  document.getElementById('settings-hours-from').value = s.hoursFrom || '09:00';
  document.getElementById('settings-hours-to').value = s.hoursTo || '18:00';
  document.getElementById('settings-webhook').value = s.webhookUrl || '';

  const activeDays = s.weekdays || ['1', '2', '3', '4', '5'];
  document.querySelectorAll('#settings-weekdays button').forEach((btn) => {
    btn.classList.toggle('active', activeDays.includes(btn.dataset.day));
  });

  if (s.savedAt) {
    document.getElementById('settings-saved-at').textContent = `Збережено: ${formatTime(s.savedAt)}`;
  }

  if (!settingsInitialized) {
    document.querySelectorAll('#settings-weekdays button').forEach((btn) => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });

    document.getElementById('settings-save-btn').addEventListener('click', () => {
      const weekdays = Array.from(document.querySelectorAll('#settings-weekdays button.active'))
        .map((b) => b.dataset.day);
      const payload = {
        knowledgeBase: document.getElementById('settings-kb').value,
        tone: document.getElementById('settings-tone').value,
        hoursFrom: document.getElementById('settings-hours-from').value,
        hoursTo: document.getElementById('settings-hours-to').value,
        weekdays,
        webhookUrl: document.getElementById('settings-webhook').value.trim(),
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
      document.getElementById('settings-saved-at').textContent = `Збережено: ${formatTime(payload.savedAt)}`;
      showToast('Налаштування збережено', 'success');
    });

    document.getElementById('settings-webhook-test').addEventListener('click', async () => {
      const url = document.getElementById('settings-webhook').value.trim();
      if (!url) { showToast('Спочатку вкажіть Webhook URL', 'error'); return; }
      try {
        await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'test', source: 'aegis-admin', sentAt: new Date().toISOString() }),
        });
        showToast('Запит надіслано (перевірте лог на боці CRM)', 'success');
      } catch (err) {
        showToast(`Не вдалося надіслати запит: ${err.message}`, 'error');
      }
    });

    settingsInitialized = true;
  }
}

/* ============================================================
   UTIL
   ============================================================ */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   INIT
   ============================================================ */
(function init() {
  if (adminKey) {
    tryLogin(adminKey);
  }
})();
