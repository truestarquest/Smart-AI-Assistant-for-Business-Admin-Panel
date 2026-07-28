'use strict';

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const STATUSES = ['new', 'qualified', 'booked', 'lost'];

// One doc per chat session, upserted lazily — same "singleton via upsert"
// shape as Settings.js, just keyed by sessionId instead of a fixed id.
const sessionSchema = new Schema(
  {
    _id: { type: String }, // sessionId
    status: { type: String, enum: STATUSES, default: 'new' },
    statusSetBy: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const SessionModel = model('Session', sessionSchema);

const DEFAULT_STATUS = { status: 'new', statusSetBy: 'auto' };

/**
 * The lock rule: once a human has set a status by hand, the bot's
 * auto-tagging must never silently overwrite it. Pure function — no
 * Mongo I/O — so it can be tested without a database connection.
 * @param {{statusSetBy?: string}|null} existingDoc
 * @param {'auto'|'manual'} setBy
 * @returns {boolean}
 */
function shouldApplyStatus(existingDoc, setBy) {
  if (setBy === 'manual') return true;
  return !existingDoc || existingDoc.statusSetBy !== 'manual';
}

async function getSessionStatus(sessionId) {
  if (mongoose.connection.readyState !== 1) return DEFAULT_STATUS;
  try {
    const doc = await SessionModel.findById(sessionId).lean();
    return doc || DEFAULT_STATUS;
  } catch (err) {
    console.error('[Session] Failed to load status:', err.message);
    return DEFAULT_STATUS;
  }
}

async function setSessionStatus(sessionId, status, setBy) {
  if (!STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database is not connected');
  }
  const existing = await SessionModel.findById(sessionId).lean();
  if (!shouldApplyStatus(existing, setBy)) return existing;
  return SessionModel.findByIdAndUpdate(
    sessionId,
    { $set: { status, statusSetBy: setBy, updatedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

/**
 * Bulk status lookup for the sessions list / analytics — sessions with no
 * Session doc yet are simply absent from the returned map (caller treats
 * that as 'new', same default as getSessionStatus).
 * @param {string[]} sessionIds
 * @returns {Promise<Record<string, string>>}
 */
async function getStatusesForSessions(sessionIds) {
  if (mongoose.connection.readyState !== 1 || !sessionIds.length) return {};
  try {
    const docs = await SessionModel.find({ _id: { $in: sessionIds } }).select('status').lean();
    const map = {};
    for (const d of docs) map[d._id] = d.status;
    return map;
  } catch (err) {
    console.error('[Session] Failed to load statuses:', err.message);
    return {};
  }
}

/**
 * Wipes every lead-status doc — paired with clearing Message history so a
 * "clear history" reset doesn't leave stale statuses pointing at sessions
 * that no longer have any messages.
 * @returns {Promise<{deletedCount: number}>}
 */
async function deleteAllStatuses() {
  if (mongoose.connection.readyState !== 1) return { deletedCount: 0 };
  return SessionModel.deleteMany({});
}

module.exports = {
  STATUSES,
  shouldApplyStatus,
  getSessionStatus,
  setSessionStatus,
  getStatusesForSessions,
  deleteAllStatuses,
};
