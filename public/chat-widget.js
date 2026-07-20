'use strict';

const API_BASE   = '';
const API_STATUS = `${API_BASE}/api/status`;
const API_CHAT   = `${API_BASE}/api/chat`;

const fab           = document.getElementById('chat-fab');
const widget        = document.getElementById('chat-widget');
const closeBtn      = document.getElementById('chat-close-btn');
const messagesEl    = document.getElementById('chat-messages');
const inputEl       = document.getElementById('chat-input');
const sendBtn       = document.getElementById('chat-send-btn');
const suggestionsEl = document.getElementById('chat-suggestions');
const statusDot     = document.querySelector('.chat-status .status-dot');

let isOpen    = false;
let isLoading = false;
let sessionId = sessionStorage.getItem('chat_session_id') || null;
let greeted   = false; // has the opening bot message been shown yet

// =========================================================
// i18n (Language Switcher) — Stage 11: animated pill
// =========================================================
const translations = {
  uk: {
    logo: "AEGIS AI",
    badge: "• AEGIS AI — AUTOMATED BOOKING & LEAD CAPTURE",
    hero_title: "Інтелект, що перетворює трафік на клієнтів.",
    hero_subtitle: "Aegis — це не просто чат. Це автономна система, яка миттєво вступає в діалог, природно кваліфікує потреби відвідувачів, збирає контакти та бронює зустрічі. Поки ви відпочиваєте, Aegis працює на ваш бізнес.",
    btn_primary: "Інтегрувати Aegis",
    btn_secondary: "Дивитись демо",

    feature1_title: "Автоматичне бронювання",
    feature1_desc: "Інтелектуальний підбір слотів. Aegis аналізує ваш розклад, пропонує клієнту зручний час та автоматично фіксує запис без участі менеджера.",
    feature2_title: "Кваліфікація лідів",
    feature2_desc: "Жодних \"мертвих\" діалогів. Бот майстерно та природно вплітає запитання в розмову, отримуючи ім'я, телефон/Telegram та суть задачі клієнта.",
    feature3_title: "Безпечна синхронізація",
    feature3_desc: "One-Time Deep Links. Інноваційна технологія одноразових токенів для безшовного та захищеного перенесення розмови з вебсайту прямо в Telegram клієнта.",
    feature4_title: "Миттєвий сервіс",
    feature4_desc: "Нуль очікувань. Блискавична реакція за 0.5 секунди в будь-який час доби. Ваші клієнти завжди отримують увагу першими.",

    hiw_title: "Автономність у 3 кроки.",
    step1_title: "Швидка інтеграція",
    step1_desc: "Додайте один рядок коду на ваш сайт — і віджет із преміальним дизайном Glassmorphism готовий до роботи за 2 хвилини.",
    step2_title: "Налаштування нейронів",
    step2_desc: "Завантажте ваші прайси, FAQ або правила запису. Aegis швидко адаптується під специфіку та Tone of Voice вашого бізнесу.",
    step3_title: "Перехоплення лідів",
    step3_desc: "Aegis бере на себе всю рутину. Ви отримуєте \"гарячі\" ліди, готові контакти та записи прямо у вашу CRM чи закритий Telegram-канал.",

    pricing_title: "Прозора архітектура цін.",
    mo: "/ міс",
    pricing_pro_badge: "Рекомендований",
    custom: "Custom",
    price_starter_f1: "Базовий віджет для 1 сайту",
    price_starter_f2: "До 500 діалогів на місяць",
    price_starter_f3: "Стандартна база знань",
    price_starter_f4: "Email сповіщення про лідів",
    price_pro_f1: "Сайт + інтеграція з Telegram-ботом",
    price_pro_f2: "Необмежені діалоги",
    price_pro_f3: "Авто-синхронізація (One-Time Deep Links)",
    price_pro_f4: "Пряма CRM-інтеграція та Webhooks",
    price_ent_f1: "Виділений сервер (Dedicated Instance)",
    price_ent_f2: "Індивідуальні складні сценарії",
    price_ent_f3: "Повний аудит безпеки",
    price_ent_f4: "Персональний менеджер 24/7",

    testi_title: "Системи перевірені в бойових умовах.",
    testi_1_text: "\"Aegis повністю закрив нам питання з нічними клієнтами. 30% запитів прилітає після опівночі. Бот сам кваліфікує ліда, бере номер і записує в CRM. Зранку менеджери просто дзвонять гарячим клієнтам.\"",
    testi_1_author: "— Олександр, Власник AutoParts UA",
    testi_2_text: "\"Інтеграція справді зайняла 2 хвилини. Найбільше вразило те, як бот переводить клієнта в Telegram (One-Time Links) — жодних втрат контактів, навіть якщо людина закрила вкладку браузера.\"",
    testi_2_author: "— Марина, СЕО BeautyHub",

    faq_title: "Декодування невідомого.",
    faq_1_q: "Q: Чи потрібні навички програмування для налаштування?",
    faq_1_a: "A: Жодних. Ви просто додаєте скрипт на сайт, а базу знань (FAQ, прайси) заповнюєте звичайним текстом у зручній адмін-панелі.",
    faq_2_q: "Q: Чи розуміє Aegis сленг та помилки в тексті?",
    faq_2_a: "A: Так. Нейромережа розпізнає контекст, ігнорує граматичні помилки та може спілкуватися як діловою мовою, так і більш вільно, дзеркалячи емоції вашого клієнта.",
    faq_3_q: "Q: Що відбувається, якщо бот не знає відповіді?",
    faq_3_a: "A: Бот має вбудований запобіжник (Failsafe). Він ввічливо повідомить, що це питання краще обговорити зі спеціалістом, візьме контакти і миттєво відправить сповіщення вам у Telegram.",

    footer_slogan: "AEGIS AI. Цифровий інтелект на варті вашого бізнесу.",
    footer_status: "All Systems Operational",
    footer_copy: "© 2026 Aegis Systems. Всі права захищено.",

    chat_greeting: "Вітаю! Я Aegis AI. Чим можу допомогти?",
    demo_greeting: "Це демо-режим 👋 Спробуйте запитати мене про тарифи, інтеграцію або можливості Aegis — я відповім так само, як відповідав би реальному клієнту."
  },
  en: {
    logo: "AEGIS AI",
    badge: "• AEGIS AI — AUTOMATED BOOKING & LEAD CAPTURE",
    hero_title: "Intelligence that turns traffic into clients.",
    hero_subtitle: "Aegis is more than a chat widget. It’s an autonomous system that engages visitors instantly, naturally qualifies their needs, captures contact info, and books appointments. While you rest, Aegis works for your business.",
    btn_primary: "Integrate Aegis",
    btn_secondary: "Watch Demo",

    feature1_title: "Automated Booking",
    feature1_desc: "Intelligent slot matching. Aegis analyzes your schedule, proposes convenient times, and securely registers the appointment without human intervention.",
    feature2_title: "Lead Qualification",
    feature2_desc: "No more dead-end chats. The bot naturally weaves questions into the conversation, effortlessly capturing names, contact details, and project specifics.",
    feature3_title: "Secure Synchronization",
    feature3_desc: "One-Time Deep Links. Innovative single-use token technology for a seamless and secure transition from web chat directly to the user's Telegram.",
    feature4_title: "Instant Service",
    feature4_desc: "Zero wait time. Lightning-fast 0.5-second reaction speed, 24/7. Your clients always receive priority attention.",

    hiw_title: "Autonomy in 3 Steps.",
    step1_title: "Rapid Integration",
    step1_desc: "Embed a single line of code on your site, and the premium Glassmorphism widget is live in under 2 minutes.",
    step2_title: "Neural Setup",
    step2_desc: "Upload your pricing, FAQs, or booking rules. Aegis quickly adapts to your business logic and Tone of Voice.",
    step3_title: "Lead Interception",
    step3_desc: "Aegis handles the routine. You receive red-hot leads, captured contacts, and booked appointments straight to your CRM or private Telegram channel.",

    pricing_title: "Transparent Pricing Architecture.",
    mo: "/ mo",
    pricing_pro_badge: "Recommended",
    custom: "Custom",
    price_starter_f1: "Base widget for 1 website",
    price_starter_f2: "Up to 500 conversations/month",
    price_starter_f3: "Standard knowledge base",
    price_starter_f4: "Email lead notifications",
    price_pro_f1: "Website + Telegram Bot integration",
    price_pro_f2: "Unlimited conversations",
    price_pro_f3: "Chat auto-sync (One-Time Deep Links)",
    price_pro_f4: "Direct CRM integration & Webhooks",
    price_ent_f1: "Dedicated server instance",
    price_ent_f2: "Custom complex scenarios",
    price_ent_f3: "Full security audit",
    price_ent_f4: "Dedicated account manager 24/7",

    testi_title: "Systems tested in combat conditions.",
    testi_1_text: "\"Aegis completely solved our after-hours support. 30% of inquiries hit after midnight. The bot qualifies the lead, takes the number, and logs it into our CRM. In the morning, our reps just call hot leads.\"",
    testi_1_author: "— Alexander, Owner of AutoParts UA",
    testi_2_text: "\"Integration really took 2 minutes. The most impressive part is how the bot transitions the client to Telegram via One-Time Links — zero lost contacts even if the user closes the browser tab.\"",
    testi_2_author: "— Marina, CEO of BeautyHub",

    faq_title: "Decoding the Unknown.",
    faq_1_q: "Q: Do I need coding skills to set this up?",
    faq_1_a: "A: None at all. You simply paste a script onto your site and fill the knowledge base with plain text via a user-friendly admin panel.",
    faq_2_q: "Q: Does Aegis understand slang and typos?",
    faq_2_a: "A: Yes. The neural network recognizes context, ignores grammatical errors, and adapts its Tone of Voice to emotionally mirror your client perfectly.",
    faq_3_q: "Q: What happens if the bot doesn't know the answer?",
    faq_3_a: "A: The bot has a built-in failsafe protocol. It will politely inform the user that a human specialist is better suited for this specific question, capture their contact details, and ping you directly on Telegram.",

    footer_slogan: "AEGIS AI. Digital intelligence guarding your business.",
    footer_status: "All Systems Operational",
    footer_copy: "© 2026 Aegis Systems. All rights reserved.",

    chat_greeting: "Hi! I'm Aegis AI. How can I help?",
    demo_greeting: "This is demo mode 👋 Try asking about pricing, integration, or what Aegis can do — I'll answer just like I would for a real client."
  }
};

let currentLang = 'uk';

function applyLang(lang) {
  currentLang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang][key]) el.textContent = translations[lang][key];
  });
}

const langSwitcher = document.querySelector('.lang-switcher');
const langBtns = document.querySelectorAll('.lang-btn');
langBtns.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    langBtns.forEach((b) => b.classList.remove('active'));
    e.target.classList.add('active');
    const lang = e.target.getAttribute('data-lang');
    if (langSwitcher) langSwitcher.setAttribute('data-active', lang);
    applyLang(lang);
  });
});

// Apply default language immediately — previously this only ran on click,
// so the page showed raw fallback text until the user touched the switcher.
applyLang('uk');

// =========================================================
// Stage 11: Smooth scroll to #pricing + Pro card pulse
// =========================================================
const integrateBtn = document.getElementById('integrate-btn');
const proCard = document.getElementById('pro-card');

function pulseProCard() {
  if (!proCard) return;
  proCard.classList.remove('pulse-highlight');
  // force reflow so the animation can restart if triggered again
  void proCard.offsetWidth;
  proCard.classList.add('pulse-highlight');
  setTimeout(() => proCard.classList.remove('pulse-highlight'), 3200);
}

if (integrateBtn) {
  integrateBtn.addEventListener('click', () => {
    const pricingSection = document.getElementById('pricing');
    if (!pricingSection) return;
    pricingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(pulseProCard, 650);
  });
}

// =========================================================
// Stage 11: Scroll Reveal via IntersectionObserver
// =========================================================
const revealTargets = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && revealTargets.length) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );
  revealTargets.forEach((el) => revealObserver.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add('is-visible'));
}

// =========================================================
// Chat Logic
// =========================================================
function formatTime(date = new Date()) {
  return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Escape everything first, then selectively re-open only a whitelist of
// simple tags with no attributes. This is safe against prompt-injected HTML
// from the model, unlike a raw innerHTML pass-through would be.
function sanitizeBotHtml(str) {
  const escaped = escapeHtml(str);
  return escaped.replace(/&lt;(\/?)(b|i|code|pre)&gt;/gi, '<$1$2>');
}

function scrollToBottom(smooth = true) {
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
}

function addMessage(role, text, isTyping = false) {
  const msg = document.createElement('div');
  msg.className = `message message--${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'bot' ? '🤖' : '👤';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (isTyping) {
    bubble.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  } else {
    const content = role === 'bot' ? sanitizeBotHtml(text) : escapeHtml(text);
    bubble.innerHTML = `<span>${content}</span><div class="message-time">${formatTime()}</div>`;
  }

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  scrollToBottom();
  return msg;
}

function ensureGreeting() {
  if (greeted) return;
  greeted = true;
  addMessage('bot', translations[currentLang].chat_greeting);
}

function openChat() {
  isOpen = true;
  widget.classList.add('is-open');
  fab.classList.add('is-open');
  ensureGreeting();
  setTimeout(() => inputEl.focus(), 300);
  scrollToBottom(false);
}

function closeChat() {
  isOpen = false;
  widget.classList.remove('is-open');
  fab.classList.remove('is-open');
  fab.focus();
}

function toggleChat() { isOpen ? closeChat() : openChat(); }

// Stage 11: "Дивитись демо" — opens the widget and simulates a live demo
// message instead of just greeting the user like a normal open.
function startDemo() {
  openChat();
  setTimeout(() => {
    addMessage('bot', translations[currentLang].demo_greeting);
  }, 500);
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
    addMessage('bot', 'Помилка підключення до сервера. Спробуйте пізніше.');
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
  if (!statusDot) return;
  try {
    const res = await fetch(API_STATUS);
    const data = await res.json();
    statusDot.className = data.success ? 'status-dot online pulse' : 'status-dot offline';
  } catch {
    statusDot.className = 'status-dot offline';
  }
}

fab.addEventListener('click', toggleChat);
closeBtn.addEventListener('click', closeChat);
inputEl.addEventListener('input', autoResize);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener('click', sendMessage);
if (suggestionsEl) suggestionsEl.addEventListener('click', handleSuggestion);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) closeChat(); });
document.addEventListener('click', (e) => {
  if (isOpen && !widget.contains(e.target) && !fab.contains(e.target)) closeChat();
});

// CTA buttons
const demoBtn = document.getElementById('demo-cta-btn');
if (demoBtn) demoBtn.addEventListener('click', startDemo);

(function init() {
  checkServerStatus();
  setInterval(checkServerStatus, 30_000);
})();
