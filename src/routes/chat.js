'use strict';

const express = require('express');
const { saveMessage, getChatReply } = require('../services/openaiService');

const router = express.Router();

const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || '1000', 10);

router.post('/', async (req, res) => {
  const { message, sessionId } = req.body || {};

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Field "message" is required and must be a non-empty string' });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` });
  }

  const trimmedMessage = message.trim();
  const resolvedSessionId = (typeof sessionId === 'string' && sessionId.trim())
    ? sessionId.trim()
    : `anon-${req.ip}`;

  await saveMessage('user', trimmedMessage, resolvedSessionId);

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
