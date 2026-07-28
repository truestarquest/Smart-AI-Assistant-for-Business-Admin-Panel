'use strict';

const express   = require('express');
const mongoose  = require('mongoose');
const rateLimit = require('express-rate-limit');
const Message   = require('../models/Message');
const User      = require('../models/User');
const { getSettings, saveSettings } = require('../models/Settings');
const { STATUSES, setSessionStatus, getStatusesForSessions, deleteAllStatuses } = require('../models/Session');
const { requireAdminKey } = require('../middleware/adminAuth');
const { sendWebhookRequest } = require('../services/openaiService');

const router = express.Router();

function isDbConnected() { return mongoose.connection.readyState === 1; }

function clampInt(value, { min, max, fallback }) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// The admin key is a single static secret checked on every request (no
// login form, no lockout of its own) — that makes it brute-forceable by
// just hammering any admin endpoint with guesses. This limiter runs
// BEFORE requireAdminKey so failed guesses count against the same budget
// as real traffic: 120 requests/15 min per IP comfortably covers a human
// working the dashboard (History tab included), but still makes guessing
// a secret key impractical.
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many admin requests. Please try again later.' },
});
router.use(adminLimiter);

router.use(requireAdminKey);

// GET /api/admin/messages — пагінація є, все ОК
router.get('/messages', async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database is not connected' });
  try {
    // req.query.sessionId can arrive as a nested object (?sessionId[$ne]=1)
    // since Express parses bracket-notation query strings into objects —
    // that would let a caller smuggle a Mongo operator into the filter.
    // express-mongo-sanitize (server.js) already strips the $ prefix
    // globally, but forcing this to a plain string here is a second,
    // narrow guarantee for this specific query.
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 50 });
    const skip  = clampInt(req.query.skip,  { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
    const filter = sessionId ? { sessionId } : {};
    const [data, total] = await Promise.all([
      Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Message.countDocuments(filter),
    ]);
    res.json({ success: true, data, total });
  } catch (err) {
    console.error('[admin] Failed to fetch messages:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

// DELETE /api/admin/messages — wipes ALL chat history + lead-status docs.
// Destructive, no undo, no filter (clears everything, not a single session)
// — the admin UI confirms before calling this.
router.delete('/messages', async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database is not connected' });
  try {
    const [messagesResult] = await Promise.all([
      Message.deleteMany({}),
      deleteAllStatuses(),
    ]);
    res.json({ success: true, deletedCount: messagesResult.deletedCount });
  } catch (err) {
    console.error('[admin] Failed to clear history:', err.message);
    res.status(500).json({ success: false, message: 'Failed to clear history' });
  }
});

// GET /api/admin/sessions — пагінація додана (limit/skip за патерном clampInt, + total)
router.get('/sessions', async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database is not connected' });
  try {
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 20 });
    const skip  = clampInt(req.query.skip,  { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });

    const [sessions, totalResult] = await Promise.all([
      Message.aggregate([
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$sessionId', count: { $sum: 1 }, lastMessage: { $first: '$$ROOT' } } },
        { $sort: { 'lastMessage.createdAt': -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { _id: 0, sessionId: '$_id', count: 1, lastMessage: { role: '$lastMessage.role', text: '$lastMessage.text', createdAt: '$lastMessage.createdAt' } } },
      ]),
      Message.aggregate([
        { $group: { _id: '$sessionId' } },
        { $count: 'total' },
      ]),
    ]);

    const total = totalResult[0]?.total || 0;
    const statusMap = await getStatusesForSessions(sessions.map((s) => s.sessionId));
    const sessionsWithStatus = sessions.map((s) => ({ ...s, status: statusMap[s.sessionId] || 'new' }));

    res.json({ success: true, data: sessionsWithStatus, total });
  } catch (err) {
    console.error('[admin] Failed to fetch sessions:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch sessions' });
  }
});

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

// GET /api/admin/stats — все ОК, не чіпай
router.get('/stats', async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database is not connected' });
  try {
    const [totalMessages, totalUsers, sessionIds, roleCounts] = await Promise.all([
      Message.countDocuments(),
      User.countDocuments(),
      Message.distinct('sessionId'),
      Message.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    ]);
    const messagesByRole = { user: 0, bot: 0 };
    for (const entry of roleCounts) {
      if (entry._id === 'user' || entry._id === 'bot') messagesByRole[entry._id] = entry.count;
    }
    res.json({ success: true, data: { totalMessages, totalUsers, totalSessions: sessionIds.length, messagesByRole } });
  } catch (err) {
    console.error('[admin] Failed to fetch stats:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// GET /api/admin/settings — база знань + тон для системного промпту бота
router.get('/settings', async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database is not connected' });
  try {
    const settings = await getSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error('[admin] Failed to fetch settings:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// PUT /api/admin/settings
router.put('/settings', async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database is not connected' });
  const { knowledgeBase, tone, schedule, webhookUrl } = req.body || {};
  if (typeof knowledgeBase !== 'undefined' && typeof knowledgeBase !== 'string') {
    return res.status(400).json({ success: false, message: 'knowledgeBase must be a string' });
  }
  if (typeof tone !== 'undefined' && !['business', 'friendly', 'sales'].includes(tone)) {
    return res.status(400).json({ success: false, message: 'tone must be one of: business, friendly, sales' });
  }
  if (typeof webhookUrl !== 'undefined') {
    if (typeof webhookUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'webhookUrl must be a string' });
    }
    if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
      return res.status(400).json({ success: false, message: 'webhookUrl must start with http:// or https://' });
    }
  }
  if (typeof schedule !== 'undefined') {
    if (typeof schedule !== 'object' || schedule === null || Array.isArray(schedule)) {
      return res.status(400).json({ success: false, message: 'schedule must be an object' });
    }
    const { enabled, from, to, weekdays } = schedule;
    if (typeof enabled !== 'undefined' && typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'schedule.enabled must be a boolean' });
    }
    if (typeof from !== 'undefined' && !TIME_RE.test(from)) {
      return res.status(400).json({ success: false, message: 'schedule.from must be in HH:MM format' });
    }
    if (typeof to !== 'undefined' && !TIME_RE.test(to)) {
      return res.status(400).json({ success: false, message: 'schedule.to must be in HH:MM format' });
    }
    if (typeof weekdays !== 'undefined' &&
        (!Array.isArray(weekdays) || !weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) {
      return res.status(400).json({ success: false, message: 'schedule.weekdays must be an array of integers 0-6' });
    }
  }
  try {
    const updated = await saveSettings({ knowledgeBase, tone, schedule, webhookUrl });
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[admin] Failed to save settings:', err.message);
    res.status(500).json({ success: false, message: 'Failed to save settings' });
  }
});

// POST /api/admin/settings/webhook-test — реальний server-side POST на CRM
// webhook (не client-side no-cors fetch, який завжди звітує "успіх"
// незалежно від фактичної доставки).
router.post('/settings/webhook-test', async (req, res) => {
  const bodyUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const targetUrl = bodyUrl || (await getSettings()).webhookUrl;
  if (!targetUrl) {
    return res.status(400).json({ success: false, message: 'Webhook URL is not configured' });
  }
  if (!/^https?:\/\//i.test(targetUrl)) {
    return res.status(400).json({ success: false, message: 'webhookUrl must start with http:// or https://' });
  }
  try {
    const result = await sendWebhookRequest(targetUrl, {
      event: 'test',
      source: 'aegis-admin',
      sentAt: new Date().toISOString(),
    });
    if (!result.ok) {
      return res.status(502).json({ success: false, message: `CRM responded with status ${result.status}` });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[admin] Webhook test failed:', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

// GET /api/admin/analytics — KPI-картки + активність за 7 днів для вкладки "Аналітика"
router.get('/analytics', async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database is not connected' });
  try {
    // UTC throughout — $dateToString below buckets in UTC by default, and
    // the server's local TZ (e.g. Europe/Kyiv, UTC+3) would otherwise shift
    // every day's bucket by one relative to the JS-side "today" cutoff,
    // silently misattributing a session to the wrong day of the chart.
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6); // 7-day window incl. today

    const [dialogsTodaySessions, dayGroups, sessionSizes, recentMessages] = await Promise.all([
      Message.distinct('sessionId', { createdAt: { $gte: startOfToday } }),
      Message.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, sessionId: '$sessionId' } } },
        { $group: { _id: '$_id.day', count: { $sum: 1 } } },
      ]),
      Message.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo } } },
        { $group: { _id: '$sessionId', count: { $sum: 1 } } },
      ]),
      Message.find({ createdAt: { $gte: sevenDaysAgo } })
        .sort({ sessionId: 1, createdAt: 1 })
        .select('role sessionId createdAt')
        .lean(),
    ]);

    const dayCounts = new Map(dayGroups.map((g) => [g._id, g.count]));
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setUTCDate(d.getUTCDate() - i);
      week.push(dayCounts.get(d.toISOString().slice(0, 10)) || 0);
    }

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

    // Середній час відповіді бота: дельта між user-повідомленням і наступним
    // одразу за ним bot-повідомленням у тій самій сесії. Дельти понад 2 хв
    // відкидаємо — це означає, що користувач повернувся пізніше, а не що
    // бот довго думав.
    const bySession = new Map();
    for (const m of recentMessages) {
      if (!bySession.has(m.sessionId)) bySession.set(m.sessionId, []);
      bySession.get(m.sessionId).push(m);
    }
    const deltas = [];
    for (const msgs of bySession.values()) {
      for (let i = 0; i < msgs.length - 1; i++) {
        if (msgs[i].role === 'user' && msgs[i + 1].role === 'bot') {
          const deltaSec = (new Date(msgs[i + 1].createdAt) - new Date(msgs[i].createdAt)) / 1000;
          if (deltaSec >= 0 && deltaSec < 120) deltas.push(deltaSec);
        }
      }
    }
    const avgResponseSeconds = deltas.length
      ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10
      : 0;

    res.json({
      success: true,
      data: {
        dialogsToday: dialogsTodaySessions.length,
        conversionRate,
        avgResponseSeconds,
        activeBots: 1, // одна Telegram-бот-інстанція — множинні боти не підтримуються
        week,
      },
    });
  } catch (err) {
    console.error('[admin] Failed to compute analytics:', err.message);
    res.status(500).json({ success: false, message: 'Failed to compute analytics' });
  }
});

module.exports = router;
