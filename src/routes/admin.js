'use strict';

const express  = require('express');
const mongoose = require('mongoose');
const Message  = require('../models/Message');
const User     = require('../models/User');
const { requireAdminKey } = require('../middleware/adminAuth');

const router = express.Router();

function isDbConnected() { return mongoose.connection.readyState === 1; }

function clampInt(value, { min, max, fallback }) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

router.use(requireAdminKey);

// GET /api/admin/messages — пагінація є, все ОК
router.get('/messages', async (req, res) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, message: 'Database is not connected' });
  try {
    const { sessionId } = req.query;
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
