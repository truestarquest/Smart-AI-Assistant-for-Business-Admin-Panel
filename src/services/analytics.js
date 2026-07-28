'use strict';

/* ============================================================
   Pure helpers behind GET /api/admin/analytics.
   ------------------------------------------------------------
   No Mongo I/O here on purpose — the date-window maths and the
   channel split are the only parts of that route worth testing,
   and keeping them pure means test/analytics.test.js can run
   without a database. See src/routes/admin.js for the queries.
   ============================================================ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 7;
// Upper bound on the custom range: the route pulls every message in the
// window to compute the average response time, so an unbounded range is a
// trivial way to make one admin request read the whole collection.
const MAX_RANGE_DAYS = 90;

/** 'YYYY-MM-DD' → UTC midnight Date, or null if it isn't a real date. */
function parseDay(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Rejects things like 2026-02-31, which Date happily rolls over to March.
  return d.toISOString().slice(0, 10) === value ? d : null;
}

function toDayString(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves the ?from / ?to query pair into a concrete UTC day window.
 * Everything is UTC: the $dateToString buckets in the route are UTC too,
 * and mixing in the server's local TZ would shift bucket boundaries.
 *
 * Bad or missing input never errors — it falls back to the default
 * trailing 7-day window, so the dashboard always renders something.
 *
 * @param {string} [from] - 'YYYY-MM-DD'
 * @param {string} [to] - 'YYYY-MM-DD'
 * @returns {{start: Date, endExclusive: Date, days: number, from: string, to: string}}
 */
function parseDateRange(from, to) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let end = parseDay(to) || today;
  let start = parseDay(from) || new Date(end.getTime() - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);

  if (start > end) [start, end] = [end, start];

  let days = Math.round((end - start) / DAY_MS) + 1;
  if (days > MAX_RANGE_DAYS) {
    days = MAX_RANGE_DAYS;
    start = new Date(end.getTime() - (days - 1) * DAY_MS);
  }

  return {
    start,
    endExclusive: new Date(end.getTime() + DAY_MS),
    days,
    from: toDayString(start),
    to: toDayString(end),
  };
}

/**
 * Fills every day of the window, including the ones with no traffic —
 * the chart needs a value per day, not just the days Mongo grouped.
 * @param {Array<{_id: string, count: number}>} dayGroups - $group output keyed by 'YYYY-MM-DD'
 * @param {{start: Date, days: number}} range
 * @returns {Array<{date: string, count: number}>}
 */
function buildDaySeries(dayGroups, range) {
  const counts = new Map(dayGroups.map((g) => [g._id, g.count]));
  const series = [];
  for (let i = 0; i < range.days; i++) {
    const date = toDayString(new Date(range.start.getTime() + i * DAY_MS));
    series.push({ date, count: counts.get(date) || 0 });
  }
  return series;
}

/**
 * Which channel a session came from. The sessionId itself already carries
 * this: the Telegram bot mints `tg-${chatId}` (src/bot/index.js) while the
 * web widget mints a UUID (public/chat-widget.js). Deriving it beats adding
 * a `channel` field to Message — no schema change, and it classifies the
 * history that's already in the database.
 * @param {string} sessionId
 * @returns {'telegram'|'web'}
 */
function channelOf(sessionId) {
  return String(sessionId).startsWith('tg-') ? 'telegram' : 'web';
}

/**
 * Sessions + messages per channel.
 * @param {Array<{_id: string, count: number}>} sessionSizes - $group by sessionId
 * @returns {{web: {sessions: number, messages: number}, telegram: {sessions: number, messages: number}}}
 */
function splitByChannel(sessionSizes) {
  const channels = {
    web: { sessions: 0, messages: 0 },
    telegram: { sessions: 0, messages: 0 },
  };
  for (const s of sessionSizes) {
    const bucket = channels[channelOf(s._id)];
    bucket.sessions += 1;
    bucket.messages += s.count;
  }
  return channels;
}

module.exports = {
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_DAYS,
  parseDateRange,
  buildDaySeries,
  channelOf,
  splitByChannel,
};
