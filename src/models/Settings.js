'use strict';

const mongoose = require('mongoose');
const { Schema, model } = mongoose;

// Singleton document (fixed _id) — there is exactly one bot configuration,
// not a collection of them, so upserts always target the same _id instead
// of juggling a "find the one row" query.
const SETTINGS_ID = 'bot-settings';

const settingsSchema = new Schema(
  {
    _id: { type: String, default: SETTINGS_ID },
    knowledgeBase: { type: String, default: '', maxlength: 8000 },
    tone: { type: String, enum: ['business', 'friendly', 'sales'], default: 'business' },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const SettingsModel = model('Settings', settingsSchema);

const DEFAULT_SETTINGS = { knowledgeBase: '', tone: 'business' };

// Called on every chat turn (openaiService.getChatReply) — same "degrade,
// don't hang" contract as loadHistory()/saveMessage(): if Mongo isn't
// connected, mongoose would otherwise buffer this call until its default
// ~10s timeout and then reject, stalling every reply. Fail fast to the
// default prompt instead.
async function getSettings() {
  if (mongoose.connection.readyState !== 1) return DEFAULT_SETTINGS;
  try {
    const doc = await SettingsModel.findById(SETTINGS_ID).lean();
    return doc || DEFAULT_SETTINGS;
  } catch (err) {
    console.error('[Settings] Failed to load settings:', err.message);
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings({ knowledgeBase, tone }) {
  const update = { updatedAt: new Date() };
  if (typeof knowledgeBase === 'string') update.knowledgeBase = knowledgeBase.slice(0, 8000);
  if (tone === 'business' || tone === 'friendly' || tone === 'sales') update.tone = tone;

  return SettingsModel.findByIdAndUpdate(
    SETTINGS_ID,
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

module.exports = { getSettings, saveSettings, SETTINGS_ID };
