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
// Реальна модель User (src/models/User.js) має лише name + email.
// Обидва поля опційні на бекенді, але створити юзера можна лише
// якщо заповнене хоча б одне з них (це перевіряється і на клієнті, і на сервері).
const USER_FIELDS = [
  { key: 'name',  label: 'Ім\'я',  type: 'text',  required: false },
  { key: 'email', label: 'Email',  type: 'email', required: false },
];

let adminKey = localStorage.getItem(STORAGE_KEY) || '';
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
  adminKey = key;
  try {
    await apiFetch('/admin/stats');
    localStorage.setItem(STORAGE_KEY, key);
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
  localStorage.removeItem(STORAGE_KEY);
  appView.hidden = true;
  loginView.hidden = false;
  document.getElementById('admin-key').value = '';
});

function showApp() {
  loginView.hidden = true;
  appView.hidden = false;
  setConnStatus(true);
  loadOverview();
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
};

navItems.forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    navItems.forEach((b) => b.classList.toggle('active', b === btn));
    views.forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    pageTitle.textContent = PAGE_META[view].title;
    pageSubtitle.textContent = PAGE_META[view].subtitle;

    if (view === 'overview') loadOverview();
    if (view === 'conversations') loadSessions();
    if (view === 'users') loadUsers();
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
      ${lastMessageText ? `<span class="session-preview">${escapeHtml(lastMessageText)}</span>` : ''}
      ${time ? `<span class="session-time">${formatTime(time)}</span>` : ''}
    `;
    if (clickable) {
      row.addEventListener('click', () => selectSession(id, row));
    }
    container.appendChild(row);
  });
}

async function loadSessions() {
  try {
    const json = await apiFetch('/admin/sessions');
    const sessions = unwrapArray(json);
    renderSessionList(document.getElementById('session-list'), sessions, true);
  } catch (err) {
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
      bubble.innerHTML = `${escapeHtml(text)}${time ? `<span class="msg-time">${formatTime(time)}</span>` : ''}`;
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
  try {
    const json = await apiFetch('/users');
    const users = unwrapArray(json);
    renderUsersTable(users);
  } catch (err) {
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
      columns.map((c) => `<td>${escapeHtml(u[c] ?? '—')}</td>`).join('') +
      `<td class="muted">${formatTime(u.createdAt) || '—'}</td>` +
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
