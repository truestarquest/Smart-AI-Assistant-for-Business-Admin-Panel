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
  { key: 'name',  type: 'text',  required: false },
  { key: 'email', type: 'email', required: false },
];

/* ============================================================
   I18N (UK/EN) — same pattern as the main landing page's switcher,
   just without the hologram-dissolve animation (not worth it for
   a staff-only tool). data-i18n on static markup, t(key) for
   anything rendered from JS.
   ============================================================ */
const TRANSLATIONS = {
  uk: {
    login_title: 'Aegis AI — Admin',
    login_subtitle: 'Керування та моніторинг асистента',
    login_label: 'Admin Key',
    login_submit: 'Увійти',
    login_hint1: 'Ключ перевіряється при першому запиті та зберігається локально у цьому браузері.',
    login_hint2: 'Демо-режим (без бекенду):',
    login_error_invalid: 'Невірний Admin Key.',
    login_error_connect: (msg) => `Не вдалося з'єднатись: ${msg}`,

    nav_overview: 'Огляд', nav_conversations: 'Діалоги', nav_users: 'Користувачі',
    nav_analytics: 'Аналітика', nav_history: 'Історія діалогів', nav_settings: 'Налаштування бота',
    logout: 'Вийти',
    conn_connecting: "З'єднання…", conn_online: "З'єднано", conn_offline: "Немає з'єднання",
    conn_demo: (role) => `Демо-режим · ${role === 'admin' ? 'Admin' : 'Manager'}`,

    page_sub_overview: 'Стан асистента у реальному часі',
    page_sub_conversations: 'Історія листування з користувачами',
    page_sub_users: 'Керування обліковими записами',
    page_sub_analytics: 'KPI та активність за 7 днів',
    page_sub_history: 'Фільтри, пошук, експорт (демо)',
    page_sub_settings: 'База знань і тон — реальні; розклад/webhook — демо',

    refresh: 'Оновити',
    overview_recent: 'Останні сесії',
    overview_users_foot: 'усього зареєстровано',
    overview_messages_foot: 'повідомлень у системі',
    overview_sessions_foot: 'унікальних діалогів',
    sessions: 'Сесії',
    thread_pick: 'Оберіть сесію',
    thread_empty: 'Виберіть сесію зліва, щоб переглянути листування.',
    thread_loading: 'Завантаження…',
    thread_none: 'У цій сесії ще немає повідомлень.',
    thread_error: (msg) => `Помилка завантаження: ${msg}`,
    thread_messages_count: (n) => `${n} повідомлень`,
    sessions_none: 'Сесій ще немає.',

    user_add: '+ Додати',
    user_new: 'Новий користувач',
    user_edit: 'Редагувати користувача',
    user_created: 'Створено',
    user_edit_btn: 'Редагувати',
    user_delete_btn: 'Видалити',
    user_cancel: 'Скасувати',
    user_save: 'Зберегти',
    user_create: 'Створити',
    user_none: 'Користувачів ще немає.',
    user_loading: 'Завантаження…',
    user_delete_confirm: 'Видалити цього користувача?',
    user_deleted: 'Користувача видалено',
    user_changes_saved: 'Зміни збережено',
    user_created_toast: 'Користувача створено',
    user_fill_required: "Заповніть ім'я або email",
    field_name: "Ім'я",
    field_email: 'Email',

    kpi_dialogs_today: 'Діалогів сьогодні',
    kpi_dialogs_today_foot: 'за сьогодні',
    kpi_conversion: 'Конверсія в лід',
    kpi_conversion_foot: 'діалог → залишений контакт',
    kpi_response_time: 'Сер. час відповіді',
    kpi_response_time_foot: 'користувач → бот',
    kpi_active_bots: 'Активні боти',
    kpi_active_bots_foot: 'підключено до Telegram',
    analytics_chart_title: 'Активність за 7 днів',
    analytics_chart_note: 'реальні дані з бази',

    history_export: 'Експорт у CSV',
    history_search_ph: "Пошук за ім'ям або телефоном…",
    history_none: 'Нічого не знайдено за цим фільтром.',
    history_csv_done: 'CSV завантажено',
    status_all: 'Усі статуси', status_new: 'Новий', status_qualified: 'Кваліфікований',
    status_booked: 'Записаний', status_lost: 'Втрачений',

    settings_kb: 'База знань',
    settings_kb_ph: 'Факти про продукт, тарифи, відповіді на часті питання…',
    settings_tone: 'Тон спілкування',
    tone_business: 'Діловий', tone_friendly: 'Дружній', tone_sales: 'Продажний',
    settings_schedule: 'Розклад роботи бота',
    schedule_from: 'З', schedule_to: 'До',
    schedule_hint: 'Вихідні дні — вимкнені кнопки вище.',
    day_mon: 'Пн', day_tue: 'Вт', day_wed: 'Ср', day_thu: 'Чт', day_fri: 'Пт', day_sat: 'Сб', day_sun: 'Нд',
    settings_webhook: 'Webhook для CRM',
    webhook_test: 'Тестовий запит',
    webhook_missing: 'Спочатку вкажіть Webhook URL',
    webhook_sent: 'Запит надіслано (перевірте лог на боці CRM)',
    webhook_failed: (msg) => `Не вдалося надіслати запит: ${msg}`,
    settings_save: 'Зберегти налаштування',
    settings_saved: (time) => `Збережено: ${time}`,
    settings_saved_toast: 'Налаштування збережено',
    settings_load_failed: (msg) => `Не вдалося завантажити налаштування: ${msg}`,
  },
  en: {
    login_title: 'Aegis AI — Admin',
    login_subtitle: 'Manage and monitor the assistant',
    login_label: 'Admin Key',
    login_submit: 'Sign in',
    login_hint1: 'The key is checked on first request and stored locally in this browser.',
    login_hint2: 'Demo mode (no backend):',
    login_error_invalid: 'Invalid Admin Key.',
    login_error_connect: (msg) => `Could not connect: ${msg}`,

    nav_overview: 'Overview', nav_conversations: 'Conversations', nav_users: 'Users',
    nav_analytics: 'Analytics', nav_history: 'Dialog history', nav_settings: 'Bot settings',
    logout: 'Log out',
    conn_connecting: 'Connecting…', conn_online: 'Connected', conn_offline: 'No connection',
    conn_demo: (role) => `Demo mode · ${role === 'admin' ? 'Admin' : 'Manager'}`,

    page_sub_overview: 'Assistant status in real time',
    page_sub_conversations: 'Message history with users',
    page_sub_users: 'Manage accounts',
    page_sub_analytics: '7-day KPIs and activity',
    page_sub_history: 'Filters, search, export (demo)',
    page_sub_settings: 'Knowledge base & tone are real; schedule/webhook are demo',

    refresh: 'Refresh',
    overview_recent: 'Recent sessions',
    overview_users_foot: 'registered in total',
    overview_messages_foot: 'messages in the system',
    overview_sessions_foot: 'unique dialogs',
    sessions: 'Sessions',
    thread_pick: 'Pick a session',
    thread_empty: 'Pick a session on the left to see the transcript.',
    thread_loading: 'Loading…',
    thread_none: 'No messages in this session yet.',
    thread_error: (msg) => `Failed to load: ${msg}`,
    thread_messages_count: (n) => `${n} messages`,
    sessions_none: 'No sessions yet.',

    user_add: '+ Add',
    user_new: 'New user',
    user_edit: 'Edit user',
    user_created: 'Created',
    user_edit_btn: 'Edit',
    user_delete_btn: 'Delete',
    user_cancel: 'Cancel',
    user_save: 'Save',
    user_create: 'Create',
    user_none: 'No users yet.',
    user_loading: 'Loading…',
    user_delete_confirm: 'Delete this user?',
    user_deleted: 'User deleted',
    user_changes_saved: 'Changes saved',
    user_created_toast: 'User created',
    user_fill_required: 'Fill in a name or email',
    field_name: 'Name',
    field_email: 'Email',

    kpi_dialogs_today: 'Dialogs today',
    kpi_dialogs_today_foot: 'today',
    kpi_conversion: 'Lead conversion',
    kpi_conversion_foot: 'dialog → contact left',
    kpi_response_time: 'Avg. response time',
    kpi_response_time_foot: 'user → bot',
    kpi_active_bots: 'Active bots',
    kpi_active_bots_foot: 'connected to Telegram',
    analytics_chart_title: '7-day activity',
    analytics_chart_note: 'real data from the database',

    history_export: 'Export CSV',
    history_search_ph: 'Search by name or phone…',
    history_none: 'Nothing matches this filter.',
    history_csv_done: 'CSV downloaded',
    status_all: 'All statuses', status_new: 'New', status_qualified: 'Qualified',
    status_booked: 'Booked', status_lost: 'Lost',

    settings_kb: 'Knowledge base',
    settings_kb_ph: 'Product facts, pricing, answers to common questions…',
    settings_tone: 'Tone of voice',
    tone_business: 'Business', tone_friendly: 'Friendly', tone_sales: 'Sales',
    settings_schedule: "Bot's working hours",
    schedule_from: 'From', schedule_to: 'To',
    schedule_hint: 'Days off — buttons above are disabled.',
    day_mon: 'Mo', day_tue: 'Tu', day_wed: 'We', day_thu: 'Th', day_fri: 'Fr', day_sat: 'Sa', day_sun: 'Su',
    settings_webhook: 'CRM webhook',
    webhook_test: 'Send test request',
    webhook_missing: 'Enter a Webhook URL first',
    webhook_sent: 'Request sent (check the log on the CRM side)',
    webhook_failed: (msg) => `Failed to send request: ${msg}`,
    settings_save: 'Save settings',
    settings_saved: (time) => `Saved: ${time}`,
    settings_saved_toast: 'Settings saved',
    settings_load_failed: (msg) => `Failed to load settings: ${msg}`,
  },
};

const LANG_STORAGE_KEY = 'aegis_admin_lang';
let currentLang = (() => {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'en' || saved === 'uk' ? saved : 'uk';
  } catch {
    return 'uk';
  }
})();

/** t('key') for plain strings, t('key', arg) for the function-valued entries above. */
function t(key, ...args) {
  const entry = TRANSLATIONS[currentLang][key];
  if (typeof entry === 'function') return entry(...args);
  return entry !== undefined ? entry : key;
}

function applyLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* best-effort */ }

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (TRANSLATIONS[lang][key] !== undefined) el.textContent = TRANSLATIONS[lang][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (TRANSLATIONS[lang][key] !== undefined) el.placeholder = TRANSLATIONS[lang][key];
  });
  document.querySelectorAll('.lang-switcher').forEach((sw) => {
    sw.setAttribute('data-active', lang);
    sw.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
  });

  // Re-render whatever's currently on screen so already-rendered dynamic
  // text (toasts aside — those are transient) picks up the new language too,
  // not just the static markup covered by data-i18n above.
  if (!appView.hidden) {
    const activeBtn = document.querySelector('.nav-item.active');
    if (activeBtn) {
      pageTitle.textContent = t(`nav_${activeBtn.dataset.view}`);
      pageSubtitle.textContent = t(`page_sub_${activeBtn.dataset.view}`);
      const view = activeBtn.dataset.view;
      if (view === 'overview') loadOverview();
      if (view === 'conversations') loadSessions();
      if (view === 'users') loadUsers();
      if (view === 'analytics') loadAnalytics();
      if (view === 'history') loadHistory();
      if (view === 'settings') loadSettings();
    }
    if (isMockSession) {
      document.getElementById('conn-label').textContent = t('conn_demo', currentRole);
    } else {
      const dot = document.getElementById('conn-dot');
      setConnStatus(dot.classList.contains('online'));
    }
  }
}

document.querySelectorAll('.lang-btn').forEach((btn) => {
  btn.addEventListener('click', () => applyLang(btn.getAttribute('data-lang')));
});

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
      ? t('login_error_invalid')
      : t('login_error_connect', err.message);
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
    document.getElementById('conn-label').textContent = t('conn_demo', currentRole);
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
  label.textContent = online ? t('conn_online') : t('conn_offline');
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');

navItems.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.hidden) return;
    const view = btn.dataset.view;
    navItems.forEach((b) => b.classList.toggle('active', b === btn));
    views.forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    pageTitle.textContent = t(`nav_${view}`);
    pageSubtitle.textContent = t(`page_sub_${view}`);

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
  return d.toLocaleString(currentLang === 'en' ? 'en-GB' : 'uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderSessionList(container, sessions, clickable = true) {
  container.innerHTML = '';
  if (!sessions.length) {
    container.innerHTML = `<div class="empty-state"><p>${t('sessions_none')}</p></div>`;
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
  container.innerHTML = `<div class="empty-state"><p>${t('thread_loading')}</p></div>`;
  try {
    const json = await apiFetch('/admin/sessions');
    const sessions = unwrapArray(json);
    renderSessionList(container, sessions, true);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${t('thread_error', escapeHtml(err.message))}</p></div>`;
    showToast(err.message, 'error');
  }
}

async function selectSession(sessionId, rowEl) {
  currentSessionId = sessionId;
  document.querySelectorAll('#session-list .session-row').forEach((r) => r.classList.remove('active'));
  if (rowEl) rowEl.classList.add('active');

  document.getElementById('thread-title').textContent = sessionId;
  const thread = document.getElementById('thread');
  thread.innerHTML = `<div class="empty-state"><p>${t('thread_loading')}</p></div>`;

  try {
    const json = await apiFetch(`/admin/messages?sessionId=${encodeURIComponent(sessionId)}`);
    const messages = unwrapArray(json);
    document.getElementById('thread-meta').textContent = t('thread_messages_count', messages.length);

    if (!messages.length) {
      thread.innerHTML = `<div class="empty-state"><p>${t('thread_none')}</p></div>`;
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
    thread.innerHTML = `<div class="empty-state"><p>${t('thread_error', escapeHtml(err.message))}</p></div>`;
  }
}

/* ============================================================
   USERS (CRUD)
   ============================================================ */
function userFieldLabel(key) {
  return key === 'name' ? t('field_name') : key === 'email' ? t('field_email') : key;
}

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = `<tr><td colspan="99" class="muted">${t('user_loading')}</td></tr>`;
  try {
    const json = await apiFetch('/users');
    const users = unwrapArray(json);
    renderUsersTable(users);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="99" class="muted">${t('thread_error', escapeHtml(err.message))}</td></tr>`;
    showToast(err.message, 'error');
  }
}

function renderUsersTable(users) {
  const theadRow = document.getElementById('users-thead-row');
  const tbody = document.getElementById('users-tbody');

  const columns = USER_FIELDS.map((f) => f.key);
  theadRow.innerHTML =
    columns.map((c) => `<th>${escapeHtml(userFieldLabel(c))}</th>`).join('') +
    `<th>${t('user_created')}</th><th></th>`;

  tbody.innerHTML = '';
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length + 2}" class="muted">${t('user_none')}</td></tr>`;
    return;
  }

  users.forEach((u) => {
    const id = u._id || u.id;
    const tr = document.createElement('tr');
    tr.innerHTML =
      columns.map((c) => `<td data-label="${escapeHtml(userFieldLabel(c))}">${escapeHtml(u[c] ?? '—')}</td>`).join('') +
      `<td class="muted" data-label="${escapeHtml(t('user_created'))}">${formatTime(u.createdAt) || '—'}</td>` +
      `<td class="row-actions">
        <button class="icon-btn" data-edit="${id}">${t('user_edit_btn')}</button>
        <button class="icon-btn danger" data-delete="${id}">${t('user_delete_btn')}</button>
      </td>`;
    tbody.appendChild(tr);

    tr.querySelector('[data-edit]').addEventListener('click', () => openUserModal(u));
    tr.querySelector('[data-delete]').addEventListener('click', () => deleteUser(id));
  });
}

async function deleteUser(id) {
  if (!confirm(t('user_delete_confirm'))) return;
  try {
    await apiFetch(`/users/${id}`, { method: 'DELETE' });
    showToast(t('user_deleted'), 'success');
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
    const label = userFieldLabel(f.key);
    if (f.type === 'select') {
      const opts = f.options.map((o) =>
        `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`
      ).join('');
      return `<div class="field"><label>${label}</label>
        <select name="${f.key}" ${f.required ? 'required' : ''}>${opts}</select></div>`;
    }
    return `<div class="field"><label>${label}</label>
      <input type="${f.type}" name="${f.key}" value="${escapeHtml(value)}" ${f.required ? 'required' : ''}></div>`;
  }).join('') + `
    <div class="modal-actions">
      <button type="button" class="btn-ghost" id="modal-cancel">${t('user_cancel')}</button>
      <button type="submit" class="btn btn-primary">${existing ? t('user_save') : t('user_create')}</button>
    </div>
  `;
  userForm.querySelector('#modal-cancel').addEventListener('click', closeUserModal);
}

function openUserModal(existing = null) {
  editingUserId = existing ? (existing._id || existing.id) : null;
  modalTitle.textContent = existing ? t('user_edit') : t('user_new');
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
    showToast(t('user_fill_required'), 'error');
    return;
  }

  try {
    if (editingUserId) {
      await apiFetch(`/users/${editingUserId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      showToast(t('user_changes_saved'), 'success');
    } else {
      await apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) });
      showToast(t('user_created_toast'), 'success');
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
   ANALYTICS — real data from /api/admin/analytics (see routes/admin.js)
   ============================================================ */
const DAY_KEYS = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'];

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
  const todayIdx = new Date().getDay();
  const labels = Array.from({ length: 7 }, (_, i) => t(DAY_KEYS[(todayIdx - 6 + i + 70) % 7]));

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

async function loadAnalytics() {
  try {
    const json = await apiFetch('/admin/analytics');
    const data = unwrapObject(json);
    document.getElementById('kpi-dialogs-today').textContent = data.dialogsToday ?? 0;
    document.getElementById('kpi-conversion').textContent = `${data.conversionRate ?? 0}%`;
    document.getElementById('kpi-response-time').textContent = `${data.avgResponseSeconds ?? 0}с`.replace('с', currentLang === 'en' ? 's' : 'с');
    document.getElementById('kpi-active-bots').textContent = data.activeBots ?? 0;
    renderSparkline(document.getElementById('activity-chart'), data.week?.length ? data.week : [0, 0, 0, 0, 0, 0, 0]);
  } catch (err) {
    showToast(err.message, 'error');
  }
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

  container.querySelectorAll('.history-card').forEach((card) => {
    card.querySelector('.history-card-head').addEventListener('click', () => {
      card.querySelector('.history-thread').hidden = !card.querySelector('.history-thread').hidden;
      card.classList.toggle('open');
    });
  });
}

function exportHistoryToCsv() {
  const dialogs = filteredMockDialogs();
  const header = currentLang === 'en'
    ? ['Name', 'Phone', 'Status', 'Date']
    : ["Ім'я", 'Телефон', 'Статус', 'Дата'];
  const rows = dialogs.map((d) => [d.name, d.phone, statusLabel(d.status), d.date]);
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
  showToast(t('history_csv_done'), 'success');
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
   BOT SETTINGS
   ------------------------------------------------------------
   Knowledge base + tone are real now — GET/PUT /api/admin/settings,
   read straight into buildSystemPrompt() on the server (see
   src/services/openaiService.js). Schedule + webhook stay
   localStorage/demo for this round (no bot-side enforcement yet —
   see conversation history for why that's scoped separately).
   ============================================================ */
const LOCAL_SETTINGS_KEY = 'bot_settings_local'; // schedule + webhook only
let settingsInitialized = false;

function getLocalSettings() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SETTINGS_KEY)) || {};
  } catch (_) {
    return {};
  }
}

async function loadSettings() {
  const local = getLocalSettings();
  document.getElementById('settings-hours-from').value = local.hoursFrom || '09:00';
  document.getElementById('settings-hours-to').value = local.hoursTo || '18:00';
  document.getElementById('settings-webhook').value = local.webhookUrl || '';

  const activeDays = local.weekdays || ['1', '2', '3', '4', '5'];
  document.querySelectorAll('#settings-weekdays button').forEach((btn) => {
    btn.classList.toggle('active', activeDays.includes(btn.dataset.day));
  });

  try {
    const json = await apiFetch('/admin/settings');
    const remote = unwrapObject(json);
    document.getElementById('settings-kb').value = remote.knowledgeBase || '';
    document.getElementById('settings-tone').value = remote.tone || 'business';
    if (remote.updatedAt) {
      document.getElementById('settings-saved-at').textContent = t('settings_saved', formatTime(remote.updatedAt));
    }
  } catch (err) {
    showToast(t('settings_load_failed', err.message), 'error');
  }

  if (!settingsInitialized) {
    document.querySelectorAll('#settings-weekdays button').forEach((btn) => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });

    document.getElementById('settings-save-btn').addEventListener('click', async () => {
      const weekdays = Array.from(document.querySelectorAll('#settings-weekdays button.active'))
        .map((b) => b.dataset.day);
      localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify({
        hoursFrom: document.getElementById('settings-hours-from').value,
        hoursTo: document.getElementById('settings-hours-to').value,
        weekdays,
        webhookUrl: document.getElementById('settings-webhook').value.trim(),
      }));

      try {
        const json = await apiFetch('/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            knowledgeBase: document.getElementById('settings-kb').value,
            tone: document.getElementById('settings-tone').value,
          }),
        });
        const saved = unwrapObject(json);
        document.getElementById('settings-saved-at').textContent = t('settings_saved', formatTime(saved.updatedAt || new Date()));
        showToast(t('settings_saved_toast'), 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('settings-webhook-test').addEventListener('click', async () => {
      const url = document.getElementById('settings-webhook').value.trim();
      if (!url) { showToast(t('webhook_missing'), 'error'); return; }
      try {
        await fetch(url, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'test', source: 'aegis-admin', sentAt: new Date().toISOString() }),
        });
        showToast(t('webhook_sent'), 'success');
      } catch (err) {
        showToast(t('webhook_failed', err.message), 'error');
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
  applyLang(currentLang);
  if (adminKey) {
    tryLogin(adminKey);
  }
})();
