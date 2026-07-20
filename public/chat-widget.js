'use strict';

const API_BASE   = '';
const API_STATUS = `${API_BASE}/api/status`;
const API_CHAT   = `${API_BASE}/api/chat`;
const BOT_NAME   = 'Aegis AI';

const fab           = document.getElementById('chat-fab');
const widget        = document.getElementById('chat-widget');
const closeBtn       = document.getElementById('chat-close-btn');
const messagesEl    = document.getElementById('chat-messages');
const inputEl       = document.getElementById('chat-input');
const sendBtn       = document.getElementById('chat-send-btn');
const suggestionsEl = document.getElementById('chat-suggestions');
const fabBadge      = document.getElementById('fab-badge');
const statusDot     = document.querySelector('.status-dot');
const statusText    = document.getElementById('status-text');
const heroCtaBtn    = document.getElementById('demo-cta-btn');

let isOpen      = false;
let isLoading   = false;
let unreadCount = 0;
let sessionId   = sessionStorage.getItem('chat_session_id') || null;

function formatTime(date = new Date()) {
  return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function sanitizeBotHtml(str) {
  const escaped = escapeHtml(str);
  return escaped.replace(/&lt;(\/?)(b|i|code|pre)&gt;/gi, '<$1$2>');
}

function scrollToBottom(smooth = true) {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
}

function openChat() {
  isOpen = true;
  widget.classList.add('is-open');
  widget.setAttribute('aria-hidden', 'false');
  fab.classList.add('is-open');
  fab.setAttribute('aria-expanded', 'true');
  unreadCount = 0;
  fabBadge.hidden = true;
  setTimeout(() => inputEl.focus(), 300);
  scrollToBottom(false);
}

function closeChat() {
  isOpen = false;
  widget.classList.remove('is-open');
  widget.setAttribute('aria-hidden', 'true');
  fab.classList.remove('is-open');
  fab.setAttribute('aria-expanded', 'false');
  fab.focus();
}

function toggleChat() { isOpen ? closeChat() : openChat(); }

function addMessage(role, text, isTyping = false) {
  const msg     = document.createElement('div');
  msg.className = `message message--${role}`;
  const avatar  = document.createElement('div');
  avatar.className   = 'message-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = role === 'bot' ? '🤖' : '👤';
  const bubble  = document.createElement('div');
  bubble.className   = 'message-bubble';

  if (isTyping) {
    bubble.innerHTML = `<div class="typing-dots" aria-label="Асистент друкує"><span></span><span></span><span></span></div>`;
  } else {
    const content = role === 'bot' ? sanitizeBotHtml(text) : escapeHtml(text);
    bubble.innerHTML = `<span>${content}</span><div class="message-time">${formatTime()}</div>`;
  }

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  scrollToBottom();

  if (!isOpen && role === 'bot' && !isTyping) {
    unreadCount += 1;
    fabBadge.textContent = unreadCount;
    fabBadge.hidden = false;
  }
  return msg;
}

async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isLoading) return;

  if (suggestionsEl) suggestionsEl.style.display = 'none';

  addMessage('user', text);
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;
  isLoading = true;

  const typingMsg = addMessage('bot', '', true);

  try {
    const response = await fetch(API_CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId }),
    });

    typingMsg.remove();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.sessionId) {
      sessionId = data.sessionId;
      sessionStorage.setItem('chat_session_id', sessionId);
    }

    const reply = data.reply || data.message || 'Відповідь отримана.';
    addMessage('bot', reply);

  } catch (err) {
    typingMsg.remove();
    if (err.message.includes('404') || err.message.includes('Failed to fetch')) {
      addMessage('bot', 'Помилка підключення до сервера. Спробуйте пізніше.');
    } else {
      addMessage('bot', `Помилка: ${err.message}`);
    }
  } finally {
    isLoading = false;
    sendBtn.disabled = !inputEl.value.trim();
    inputEl.focus();
  }
}

function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 110) + 'px';
  sendBtn.disabled = !inputEl.value.trim();
}

function handleSuggestion(e) {
  const chip = e.target.closest('.suggestion-chip');
  if (!chip) return;
  inputEl.value = chip.dataset.text;
  autoResize();
  sendMessage();
}

async function checkServerStatus() {
  if (!statusDot || !statusText) return;
  try {
    const res  = await fetch(API_STATUS);
    const data = await res.json();
    if (data.success) {
      statusDot.className    = 'status-dot online';
      statusText.textContent = `Сервер онлайн v${data.version} | БД: ${data.database?.status || '?'}`;
    } else { throw new Error('bad'); }
  } catch {
    statusDot.className    = 'status-dot offline';
    statusText.textContent = 'Сервер недоступний';
  }
}

fab.addEventListener('click', toggleChat);
closeBtn.addEventListener('click', closeChat);
inputEl.addEventListener('input', autoResize);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', sendMessage);
suggestionsEl.addEventListener('click', handleSuggestion);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) closeChat(); });
document.addEventListener('click', (e) => {
  if (isOpen && !widget.contains(e.target) && !fab.contains(e.target)) closeChat();
});

// Нова кнопка "Почати діалог" у Hero-секції — просто відкриває той самий чат-віджет
if (heroCtaBtn) {
  heroCtaBtn.addEventListener('click', () => {
    if (!isOpen) openChat();
  });
}

(function init() {
  checkServerStatus();
  setInterval(checkServerStatus, 30_000);
  widget.setAttribute('aria-hidden', 'true');
  fab.setAttribute('aria-expanded', 'false');
  console.log(`%c${BOT_NAME} Widget v2.0 (Glassmorphism) initialized`, 'color:#45c7c2;font-weight:bold;');
})();
