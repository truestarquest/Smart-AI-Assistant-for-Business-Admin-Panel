# Lead status tracking — design

Date: 2026-07-27
Status: approved

## Problem

Analytics' "conversion %" is a proxy (session has 4+ messages = "qualified"),
not a real lead status. There's no way for an admin to mark a lead as
booked/qualified/lost, and the "Історія діалогів" tab is entirely mock data
(`MOCK_DIALOGS` in `public/admin.js`), labeled "(демо)" in the UI.

## Goals

- Real per-session lead status: `new` | `qualified` | `booked` | `lost`
  (reusing the 4 values already used by the History tab's mock data).
- Status settable two ways: automatically by the bot (LLM emits a hidden
  marker when it detects a status-worthy signal), and manually by the admin
  (dropdown in the UI).
- Manual edits lock out further auto-tagging for that session — an admin's
  judgment call is never silently overwritten by the next bot reply.
- История tab becomes real (backed by actual sessions, not `MOCK_DIALOGS`),
  its existing search/status-filter/date-filter/CSV export UI stays as-is.
- Analytics conversion % uses real status instead of the message-count proxy.

## Non-goals

- Capturing lead name/phone — the chat widget never collects these; History
  rows show sessionId / first-message preview / date / status instead of
  name/phone, matching what `GET /api/admin/sessions` already returns.
- Per-channel (web vs Telegram) breakdown — separate backlog item.
- Date-range picker for analytics — separate backlog item.

## Data model

New collection, `src/models/Session.js`:

```js
{
  _id: String,        // sessionId
  status: String,      // enum: new | qualified | booked | lost, default 'new'
  statusSetBy: String,  // enum: auto | manual, default 'auto'
  updatedAt: Date,
}
```

Created lazily via upsert — no explicit "session start" event needed, same
pattern as the existing `Settings` singleton-via-upsert.

`getSessionStatus(sessionId)` / `setSessionStatus(sessionId, status, setBy)`
helpers, mirroring `Settings.js`'s `getSettings`/`saveSettings` shape.
`setSessionStatus` is a no-op (returns current doc unchanged) when the
existing doc has `statusSetBy: 'manual'` and the caller is `'auto'` — this is
the lock rule.

## Auto-tagging

`openaiService.js`'s system prompt gets one more instruction: end the reply
with a hidden marker `[[status:qualified]]` / `[[status:booked]]` /
`[[status:lost]]` when (and only when) the conversation clearly indicates
that outcome; otherwise emit nothing extra.

After the LLM completion returns, `getChatReply` strips
`/\[\[status:(qualified|booked|lost)\]\]\s*$/i` from the reply text (the
user never sees the marker) and, if matched, calls
`setSessionStatus(sessionId, match, 'auto')` — fire-and-forget, same as the
webhook call; a failed status write never blocks the chat reply.

## Manual override

`PUT /api/admin/sessions/:sessionId/status` — validates body `{ status }`
against the 4-value enum (400 on anything else, same pattern as
`/admin/settings`), calls `setSessionStatus(sessionId, status, 'manual')`.

## История tab → real data

`GET /api/admin/sessions` (existing aggregation route) additionally looks up
`Session.status` per row (default `'new'` when no `Session` doc exists yet).

`public/admin.js`: `MOCK_DIALOGS` / `filteredMockDialogs()` / the History
render path get pointed at this endpoint instead of the mock array. Existing
search/status-filter/date-filter/CSV-export logic is untouched — it already
operates on a plain array of `{status, date, ...}` objects, only the source
of that array changes. Status column becomes a `<select>` that calls the new
PUT route on change. The "(демо)" wording comes out of `page_sub_history` in
both UA/EN dictionaries.

## Analytics conversion %

`GET /api/admin/analytics`: replace the `sessionSizes.filter(s => s.count >=
4)` proxy with a count of `Session` docs in the 7-day window whose `status`
is `qualified` or `booked`, divided by total sessions in that window.

## Error handling

- Marker regex doesn't match → no status change; conversation unaffected.
- `setSessionStatus` write failure (DB hiccup) → logged, swallowed, same
  degrade-don't-hang contract as the rest of the service layer.
- Manual PUT with invalid status/sessionId → 400, no DB write attempted.
- No DB connected → `isBotOpenNow`-style routes already 503 in that case;
  the new PUT route follows the same `isDbConnected()` guard used elsewhere
  in `admin.js`.

## Testing

No test harness in this repo. Verification is a live local run (server
without real Mongo/OpenAI creds, same approach used for the schedule/webhook
work): exercise the new PUT route's validation paths, and a standalone
regex check for the marker-stripping logic.
