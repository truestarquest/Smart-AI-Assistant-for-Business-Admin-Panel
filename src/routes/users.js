'use strict';

const express  = require('express');
const mongoose = require('mongoose');
const User     = require('../models/User');
const { requireAdminKey } = require('../middleware/adminAuth');

const router = express.Router();

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function clampInt(value, { min, max, fallback }) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

router.use(requireAdminKey);

router.use((req, res, next) => {
  if (!isDbConnected()) {
    return res.status(503).json({ success: false, message: 'Database is not connected' });
  }
  next();
});

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const limit = clampInt(req.query.limit, { min: 1, max: 100, fallback: 50 });
    const skip  = clampInt(req.query.skip,  { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });

    const [data, total] = await Promise.all([
      User.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(),
    ]);

    res.json({ success: true, data, total });
  } catch (err) {
    console.error('[users] Failed to fetch users:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid user id' });
  }

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    console.error('[users] Failed to fetch user:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  const { name, email } = req.body || {};

  if (!name && !email) {
    return res.status(400).json({
      success: false,
      message: 'At least one of "name" or "email" is required',
    });
  }

  if (email && !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email format' });
  }

  try {
    const user = await User.create({ name, email });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    console.error('[users] Failed to create user:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
});

// PATCH /api/users/:id
router.patch('/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid user id' });
  }

  const { name, email } = req.body || {};

  if (email !== undefined && !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, message: 'Invalid email format' });
  }

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one of "name" or "email" must be provided',
    });
  }

  try {
    const user = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    console.error('[users] Failed to update user:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid user id' });
  }

  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error('[users] Failed to delete user:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

module.exports = router;
