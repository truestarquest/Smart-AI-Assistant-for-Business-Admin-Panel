'use strict';

const { Telegraf } = require('telegraf');
const mongoose      = require('mongoose');
const { saveMessage, getChatReply } = require('../services/openaiService');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const DB_STATE_LABELS = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/* ===== ANTI-ABUSE UTILITIES ===== */

/**
 * Перевіряє текст на ASCII-спам («Шрек-атаки») та ліміт довжини.
 * @param {string} text
 * @returns {boolean} true = спам або занадто довго
 */
function isSpamOrAsciiArt(text) {
  if (!text || text.length > 600) return true;

  // Символи Брайля — найпоширеніший матеріал для ASCII-малюнків
  const brailleRegex = /[\u2800-\u28FF]{4,}/;
  // Будь-який не-літерний не-цифровий символ, що повторюється 10+ разів підряд
  const repeatedSymbolsRegex = /([^\p{L}\p{N}\s])\1{9,}/u;

  return brailleRegex.test(text) || repeatedSymbolsRegex.test(text);
}

/**
 * Санітарія нікнейму: залишає тільки кириличні/латинські літери, пробіли, дефіси, апострофи.
 * @param {string} firstName
 * @returns {string}
 */
function getValidUserName(firstName) {
  if (!firstName) return 'Клієнт';

  const validNameRegex = /^[a-zA-Zа-яА-ЯіІїЇєЄґҐ]+(?:[-'\s][a-zA-Zа-яА-ЯіІїЇєЄґҐ]+)*$/u;

  if (
    validNameRegex.test(firstName.trim()) &&
    firstName.trim().length >= 2 &&
    firstName.trim().length <= 15
  ) {
    return firstName.trim();
  }

  return 'Клієнт';
}

/* ===== BOT SETUP ===== */

function startBot() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN is not set — Telegram bot will not start.');
    return null;
  }

  const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

  /* ── команди ── */
  bot.command('start', async (ctx) => {
    const name = getValidUserName(ctx.from?.first_name);
    const greeting = name !== 'Клієнт' ? `, ${name}` : '';
    await ctx.reply(
      `👋 Привіт${greeting}! Я AI-асистент цього сайту.\n\n` +
      'Просто напиши мені будь-яке питання — і я відповім, використовуючи AI.\n\n' +
      'Команди:\n' +
      '/help — список команд\n' +
      '/status — стан сервера'
    );
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      '📋 Доступні команди:\n\n' +
      '/start — привітання і коротке пояснення\n' +
      '/help — цей список команд\n' +
      '/status — перевірити стан сервера і БД\n\n' +
      'Щоб отримати відповідь від AI, просто напиши своє питання звичайним текстом.'
    );
  });

  bot.command('status', async (ctx) => {
    const dbStatus = DB_STATE_LABELS[mongoose.connection.readyState] || 'unknown';
    await ctx.reply(
      `🚀 Сервер: працює\n` +
      `🗄 База даних: ${dbStatus}`
    );
  });

  /* ── Режим «Тільки текст»: перехоплення всіх нетекстових типів ── */
  bot.on(
    ['voice', 'audio', 'document', 'photo', 'sticker', 'video', 'video_note', 'animation'],
    async (ctx) => {
      await ctx.reply(
        'Ой! 🙈 Я поки що вмію працювати лише з текстом.\n' +
        'Напишіть ваше запитання словами — і я з радістю допоможу!'
      );
    }
  );

  /* ── основна обробка тексту ── */
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;

    // Ігноруємо команди — вони вже оброблені вище
    if (text.startsWith('/')) return;

    // Anti-spam: ASCII-арт, простирадла тексту, зациклені символи
    if (isSpamOrAsciiArt(text)) {
      await ctx.reply(
        '⚠️ Повідомлення занадто довге або містить неприйнятний вміст.\n' +
        'Ліміт — 600 символів. Сформулюйте запит коротше, будь ласка.'
      );
      return;
    }

    const sessionId = `tg-${ctx.from.id}`;
    const firstName = ctx.from?.first_name;

    // Вічна імітація набору — оновлюємо кожні 4 секунди (Telegram скидає через 5)
    let typingInterval;
    try {
      await bot.telegram.sendChatAction(ctx.chat.id, 'typing');
      typingInterval = setInterval(
        () => bot.telegram.sendChatAction(ctx.chat.id, 'typing').catch(() => {}),
        4000
      );

      await saveMessage('user', text, sessionId);

      const aiResponse = await getChatReply(text, firstName);

      clearInterval(typingInterval);

      await saveMessage('bot', aiResponse, sessionId);

      // Залізобетонна обробка HTML: якщо LLM повернув битий тег — fallback на plain text
      try {
        await ctx.reply(aiResponse, { parse_mode: 'HTML' });
      } catch (htmlError) {
        console.warn('[bot] HTML parse failed, falling back to plain text:', htmlError.description || htmlError.message);
        await ctx.reply(aiResponse);
      }

    } catch (err) {
      clearInterval(typingInterval);

      const status = err.status || err.response?.status;
      console.error('[bot] Request failed:', err.message);

      if (status === 401) {
        await ctx.reply('❌ API ключ невалідний. Зверніться до адміністратора.');
      } else if (status === 429) {
        await ctx.reply('⏳ Забагато запитів — почекайте хвилинку і спробуйте ще раз.');
      } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        await ctx.reply('🔌 Помилка мережі. Перевірте підключення і спробуйте пізніше.');
      } else {
        await ctx.reply(
          'Ой, мої цифрові нейрони трохи заплутались від навантаження 🤯\n' +
          'Дайте мені хвилинку і спробуйте запитати ще раз!'
        );
      }
    }
  });

  bot.launch()
    .then(() => console.log('🤖 Telegram bot launched (Aegis mode)'))
    .catch((err) => console.error('[bot] Failed to launch:', err.message));

  process.once('SIGINT',  () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}

module.exports = { startBot };
