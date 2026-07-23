'use strict';

const express   = require('express');
const mongoose  = require('mongoose');
const rateLimit = require('express-rate-limit');
const Message   = require('../models/Message');
const User      = require('../models/User');
const { requireAdminKey } = require('../middleware/adminAuth');

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
// as real traffic: 30 requests/15 min per IP is plenty for a human using
// the dashboard, but makes guessing a secret key impractical.
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
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

    res.json({ success: true, data: sessions, total });
  } catch (err) {
    console.error('[admin] Failed to fetch sessions:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch sessions' });
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

module.exports = router;
