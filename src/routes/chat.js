'use strict';

const express   = require('express');
const rateLimit = require('express-rate-limit');
const xss       = require('xss');
const { saveMessage, getChatReply } = require('../services/openaiService');

const router = express.Router();

const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || '1000', 10);

// This route is the one that actually spends money (every request is an
// OpenAI call), so it gets a tighter limit than the general /api backstop
// in server.js: 10 messages/minute per IP. A real user typing a
// conversation never hits this; a script hammering the endpoint does.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many messages. Please wait a moment before sending more.' },
});

// Cheap, best-effort pre-filter for the most common copy-pasted jailbreak
// phrasing ("ignore your instructions", "reveal your system prompt", "you
// are now X"), in Ukrainian and English. This is NOT the real defense —
// the hardened system prompt in openaiService.js is — regex can't reliably
// judge intent, and a determined attacker will phrase around this easily.
// Its only job is to save a paid OpenAI call on the laziest, most
// copy-pasted attempts, so it's deliberately narrow (multi-word phrases,
// not single trigger words) to avoid false-positiving on real customer
// questions.
const INJECTION_RE = new RegExp(
  [
    '(ignore|forget|disregard)\\s+(all|your|the|previous|prior|above)\\s+(instructions|rules|prompt)',
    'reveal\\s+(your\\s+)?(system\\s+)?prompt',
    'you\\s+are\\s+now\\s+a',
    '(забудь|ігноруй)\\s+(усі\\s+|всі\\s+)?(попередні\\s+|минулі\\s+)?(інструкці|правил)',
    'покажи\\s+(мені\\s+)?(свій\\s+)?системн\\w*\\s+промпт',
    'тепер\\s+ти\\s+(інший|злий|не)',
  ].join('|'),
  'i'
);

router.post('/', chatLimiter, async (req, res) => {
  const { message, sessionId } = req.body || {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Field "message" is required and must be a non-empty string' });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` });
  }

  // Never trust the client: the widget's own escapeHtml only protects
  // rendering in that specific browser. A request sent straight to this
  // endpoint (Postman, curl, a script) skips the widget entirely, so
  // whatever gets stored here is what the admin dashboard will later
  // render. Stripping any HTML/script content before it's saved or sent
  // to the model means there's nothing dangerous in the database even if
  // some future render path forgets to escape it.
  const trimmedMessage = xss(message.trim(), { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script'] });
  const resolvedSessionId = (typeof sessionId === 'string' && sessionId.trim())
    ? sessionId.trim().slice(0, 200)
    : `anon-${req.ip}`;

  await saveMessage('user', trimmedMessage, resolvedSessionId);

  if (INJECTION_RE.test(trimmedMessage)) {
    const reply = 'Я можу допомогти лише з питаннями про наш магазин електроніки та Aegis AI — товари, ціни, доставку чи інтеграцію. З цим питанням, будь ласка, зверніться до спеціаліста.';
    await saveMessage('bot', reply, resolvedSessionId);
    return res.json({ success: true, reply, sessionId: resolvedSessionId });
  }

  try {
    // Єдине джерело правди — те саме, що використовує Telegram-бот (Aegis).
    const reply = await getChatReply(trimmedMessage, null);

    await saveMessage('bot', reply, resolvedSessionId);

    return res.json({ success: true, reply, sessionId: resolvedSessionId });

  } catch (err) {
    const status = err.status || err.response?.status;
    console.error('[chat] OpenAI request failed:', err.message);
    if (status === 401) return res.status(500).json({ success: false, message: 'Invalid OpenAI API key' });
    if (status === 429) return res.status(429).json({ success: false, message: 'Rate limit exceeded. Please try again in a moment.' });
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      return res.status(503).json({ success: false, message: 'Network error while contacting OpenAI. Please try again later.' });
    }
    return res.status(500).json({ success: false, message: 'Failed to get a response from the AI assistant' });
  }
});

module.exports = router;
