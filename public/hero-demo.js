'use strict';

(function () {
  const DEMO_SCRIPT_UK = [
    { from: 'bot',  text: "Привіт! Я Aegis 👋 Підкажіть, будь ласка, ваше ім'я?" },
    { from: 'user', text: 'Олена' },
    { from: 'bot',  text: 'Приємно познайомитись, Олено! Вам зручно завтра о 14:00?' },
    { from: 'user', text: 'Так, чудово' },
    { from: 'bot',  text: 'Готово ✅ Перенесу нашу розмову в Telegram, щоб надіслати підтвердження.' },
  ];

  const DEMO_SCRIPT_EN = [
    { from: 'bot',  text: "Hi! I'm Aegis 👋 Could you tell me your name?" },
    { from: 'user', text: 'Elena' },
    { from: 'bot',  text: 'Nice to meet you, Elena! Does tomorrow at 2:00 PM work for you?' },
    { from: 'user', text: 'Yes, perfect' },
    { from: 'bot',  text: "Done ✅ I'll move our conversation to Telegram to send the confirmation." },
  ];

  function currentScript() {
    return document.documentElement.lang === 'en' ? DEMO_SCRIPT_EN : DEMO_SCRIPT_UK;
  }

  const TYPE_MS = 18;
  const PAUSE_MS = 1200;
  const RESTART_PAUSE_MS = 2400;

  const container = document.getElementById('hero-demo-messages');
  if (!container) return;

  const section = container.closest('.hero-demo-section');
  let timer = null;
  let running = false;

  function addBubble(from) {
    const msg = document.createElement('div');
    msg.className = `message message--${from}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = from === 'bot' ? '🤖' : '👤';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    const span = document.createElement('span');
    bubble.appendChild(span);

    msg.appendChild(avatar);
    msg.appendChild(bubble);
    container.appendChild(msg);
    return span;
  }

  function typeInto(span, text, onDone) {
    let i = 0;
    (function tick() {
      span.textContent = text.slice(0, i);
      i += 1;
      timer = setTimeout(i <= text.length ? tick : onDone, i <= text.length ? TYPE_MS : PAUSE_MS);
    })();
  }

  function playStep(index, script) {
    if (index >= script.length) {
      timer = setTimeout(() => playStep(0, currentScript()), RESTART_PAUSE_MS);
      return;
    }
    if (index === 0) container.innerHTML = '';
    const step = script[index];
    const span = addBubble(step.from);
    typeInto(span, step.text, () => playStep(index + 1, script));
  }

  function start() {
    if (running) return;
    running = true;
    playStep(0, currentScript());
  }

  function stop() {
    running = false;
    clearTimeout(timer);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? start() : stop()));
  }, { threshold: 0.3 });

  if (section) observer.observe(section);
})();
