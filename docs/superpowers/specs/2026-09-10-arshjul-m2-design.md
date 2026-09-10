# Årshjul Milestone 2 — Editable Entries & Dispatcher — Design

**Date:** 2026-09-10
**Status:** Draft (design) — awaiting review
**Parent spec:** `docs/superpowers/specs/2026-09-09-arshjul-design.md`
**Milestone 1 plan:** `docs/superpowers/plans/2026-09-09-arshjul-milestone-1.md`

## Goal

Members of an instrument section or workgroup create, edit and delete entries on their group's
year wheel from the browser. Each entry carries an annually recurring date. On that date the bot
opens a public thread in the group's Discord channel, mentioning the role, so the group can
discuss the thing there. A cron job the members themselves maintain.

Milestone 1 shipped the read side: OAuth, session cookie, role resolution, `GET /api/web/me`,
`GET /api/web/yearwheel/:roleId` with its resource-level gate, a landing page and a read-only
wheel page. This milestone adds writes and delivery.

## Decisions settled in this milestone

The parent spec left these open. They are now closed.

| Question | Decision |
|---|---|
| Entry fields (parent spec, open question 1) | `title`, `monthDay`, free-text `body`. No structured sub-fields, no checklist, no responsible-person field. |
| Write permission granularity | Flat: anyone holding the role may create, edit and delete **any** entry on that wheel. `role_moderator` may touch any wheel. Audit logging is the accountability mechanism, not per-entry ownership. |
| Rollout gate | Test-channel first. `config.arshjulLive` defaults to `false`; all threads go to `ch_BotTest` with the role mention stripped until it is flipped. |
| Wheel UI | Month-grouped list with editing. No circular SVG — that is a later milestone if it is ever wanted. |
| Group without a Discord channel | Save is allowed. The entry stores `channelId: null`, the page shows a warning banner and marks the entry undeliverable, and the dispatcher skips it until a channel exists. |
| Send time | One tick per day at 08:00 Europe/Stockholm, plus a catch-up tick on bot start when the local hour is already past it. |
| Moderator visibility | A moderator's own groups render exactly like anyone else's. Their access to every other wheel lives in a separate, collapsed **Mod** section — never mixed into their own group list. |

## Non-goals

- **The Discord lineup Activity stays untouched.** No changes to `frontend/`, its build, its
  Cloudflare Pages project, its URL mapping, `config.oauthRedirectUri`, or
  `src/middleware/auth.js`.
- No circular year-wheel rendering.
- No reminder lead times ("ping me 14 days before"). An entry fires on its own date.
- No per-entry ownership or approval workflow.
- **No Drive backup work.** See Risks — it is a known gap handled separately.
- No change to how roles or channels are created; that stays in the `din-profil` and workgroup
  flows.

## Data model

`src/data/arshjul.json`, the shape milestone 1 fixed, with the parent spec's placeholder
`fields: {}` resolved to a single `body` string.

```json
{
  "version": 1,
  "entries": {
    "a1f3c8e2-…": {
      "roleId": "123…",
      "channelId": "456…",
      "monthDay": "01-15",
      "title": "Boka lokal för vårkonsert",
      "body": "Ring Kulturhuset, be om samma pris som förra året.",
      "version": 3,
      "createdBy": "<userId>",
      "updatedBy": "<userId>",
      "updatedAt": "2026-09-10T10:00:00.000Z",
      "sentYears": [2026]
    }
  }
}
```

- `entryId` is `crypto.randomUUID()`.
- `channelId` is nullable. A group with no Discord channel still gets a working wheel; only
  delivery is withheld.
- `version` is the lost-update guard, bumped on every successful write.
- `sentYears` makes an entry fire once per calendar year.

### Re-fire guard

Changing `monthDay` clears the current year from `sentYears` **only when the new date is still
ahead of today**. Moving a date backwards leaves `sentYears` intact. Without this rule, nudging a
date back and forth is a button that re-pings a whole role.

## Store

`src/services/arshjulStore.js` grows write methods. All writes go through one `mutate(fn)` doing a
lockfile read-modify-write, mirroring `src/services/lineupStore.js:33-53` — `stale: 5 * 60 * 1000,
retries: 50, retryWait: 50`, unlock in `finally`.

| Method | Purpose |
|---|---|
| `listByRole(roleId)` | Milestone 1, unchanged |
| `listAll()` | Dispatcher scan |
| `getEntry(id)` | Route lookup before the permission gate |
| `create(roleId, { monthDay, title, body, channelId, userId })` | New entry, `version: 1`, `sentYears: []` |
| `update(id, { monthDay, title, body, version, userId })` | Throws `version_conflict` on a stale version |
| `remove(id, version)` | Version-checked, so a delete cannot race an edit |
| `markSent(id, year)` | Dispatcher only |

`create` and `update` set `updatedBy` and `updatedAt`; `create` also sets `createdBy`.

## API

New routes under `/api/web/`, registered in `src/core/express.js` alongside the milestone 1 ones.
No existing route changes.

| Route | Body | Success | Failure |
|---|---|---|---|
| `POST /api/web/yearwheel/:roleId` | `{ monthDay, title, body }` | `201` + entry | `400 invalid_input`, `403` |
| `PATCH /api/web/yearwheel/entry/:id` | `{ monthDay, title, body, version }` | `200` + entry | `409 version_conflict` (with the current entry), `404`, `400`, `403` |
| `DELETE /api/web/yearwheel/entry/:id` | `{ version }` | `204` | `409 version_conflict`, `404`, `403` |
| `GET /api/web/groups` | — | `200` + all groups | `403 not_moderator`, `403 not_in_guild` |

`GET /api/web/yearwheel/:roleId` gains `role.hasChannel` in its response so the page can render the
no-channel warning. Its entry payload is otherwise unchanged.

### Moderator access

Milestone 1 already lets a moderator read and (in this milestone) write any wheel, but nothing in
the UI exposes that — `GET /api/web/me` does not even return `isModerator`
(`src/routes/api/web/me.js:13-18`), so the only way a moderator reaches another group's wheel today
is by hand-typing a `roleId` into the URL. Two additions fix that without changing what a plain
member receives.

**`GET /api/web/me` gains `isModerator: true | false`.** It is already computed in
`memberGroups.getGroups` (`src/services/memberGroups.js:32`) and simply not forwarded.

**`GET /api/web/groups` is new and moderator-only.** It returns every instrument and workgroup role
in the guild, in the same `{ id, name }` shape:

```json
{ "instruments": [ … ], "workgroups": [ … ] }
```

A caller who is not a moderator gets `403 { error: 'not_moderator' }` — a distinct code from
`missing_role`, because the client's response differs: it is not a revocation, it just means the
Mod section is not for them. A non-member still gets `403 not_in_guild`.

`memberGroups` gains `listAllGroups()`, filtering `guild.roles.cache` by the same two colours
`byColor` already uses, behind the same 60s cache. A workgroup created in Discord appears in the Mod
list within a minute, with no rebuild — the same property the parent spec requires of wheels
generally.

The parent spec's reason for `me` returning only the caller's own groups — keeping the roster of
groups someone is not in out of their browser — still holds. This is a separate, gated endpoint, so
a plain member's browser receives exactly what it received before.

Moderator reach is unchanged and was always enforced server-side. This makes it discoverable, not
broader.

### Channel resolution

One helper resolves a role to its channel by the existing convention — the role name lowercased
with spaces replaced by dashes, inside `cat_Arbetsgrupper` or `cat_Sektioner`
(`src/interactions/modals/workgroups.js:36-38`, `:164-167`) — and is used in three places:

- `POST` stores the result as the entry's `channelId`, or `null` if the group has no channel.
- `GET` calls it to fill `role.hasChannel`.
- The dispatcher calls it as its fallback when a stored `channelId` no longer resolves, or is
  `null`.

Because the dispatcher falls back to it, a group that gains a channel after its entries were
created starts receiving threads without anyone re-saving anything. `channelId` is stored at save
time as an optimisation and as a record of intent, never as the only lookup path.

### Permission gate

Every write runs the same two-level check milestone 1 established, in the same order
(`src/routes/api/web/yearwheel.js:13-20`):

1. `memberGroups.getGroups(req.webUser.id)` → not a guild member gives `403 not_in_guild`.
2. Caller holds the wheel's `roleId`, or `isModerator` → otherwise `403 missing_role`.

`PATCH` and `DELETE` take an entry id, not a role id, so they load the entry first, read `roleId`
off it, then run the gate. An unknown id returns `404` before the gate — an id that does not exist
leaks nothing.

Roles are re-read per request through the 60s cache, so losing a role removes write access without
any session change, exactly as the parent spec describes for reads.

### Validation

Enforced server-side; mirrored client-side for the error message, never trusted from the client.

| Field | Rule |
|---|---|
| `title` | 1–100 characters after trimming. 100 is Discord's thread-name limit, so no truncation is ever needed at send time. |
| `body` | 0–1500 characters. Leaves room under Discord's 2000-character message limit for the role mention and, in test mode, the prefix line. |
| `monthDay` | Matches `^\d{2}-\d{2}$` **and** is a real calendar day. `02-29` is accepted; `02-30` and `04-31` are not. |

Rejections return `400 { error: 'invalid_input', field: '<name>' }`.

### Security

- **CSRF:** every write checks the `Origin` header against `config.webOrigin`. The årshjul is served
  from the same registrable domain as the rest of the user's site, so a compromised sibling
  subdomain cannot read the host-only cookie but the browser would attach it to a forged same-site
  request. The `Origin` check rejects those.
- **Rate limiting:** `express-rate-limit` on all three write routes, keyed by user ID, following
  the existing limiter pattern in `src/core/express.js`.
- **Mention safety:** the dispatcher sends `allowed_mentions: { parse: [], roles: [roleId] }`, so
  no text a member types in `title` or `body` can produce an `@everyone`, an `@here`, or a mention
  of any other role.
- **Audit:** every write is logged through `src/core/logger.js` with the acting user, the entry id,
  the role, and the before/after values. This is the accountability mechanism that makes the flat
  write model acceptable.

## Dispatcher

A new module, `src/services/arshjulDispatcher.js`, registered from `src/events/ready.js`. Not an
extension of `src/services/scheduler.js`, for the reasons the parent spec gives: that scheduler
drifts across DST, uses server local time, has no catch-up, and records nothing about what it
already sent.

The clock is injected, so every date rule below is unit-testable without waiting for a real date.

### Schedule

One tick per day at **08:00 Europe/Stockholm** (`config.arshjulSendHour`, default `8`).

Scheduling is `setTimeout` to the next occurrence, recomputed after every run via `Intl` — not
`setInterval(24h)`, which drifts an hour twice a year when the clocks change.

**On bot start, run one tick immediately if the local hour is already ≥ the send hour.** A restart
at 11:00 delivers that morning instead of falling through to the catch-up window. A restart at
03:00 does not tick; it just schedules 08:00. Repeated restarts are harmless because `sentYears`
makes the tick idempotent.

### Tick

1. Compute today in Europe/Stockholm via `Intl` (the pattern at `src/core/logger.js:30`) → `year`,
   `monthDay`.
2. Select entries where `year` is not in `sentYears` and `monthDay` falls in today or the two
   preceding days.
3. Resolve the channel: stored `channelId` first; if it no longer resolves, re-resolve by the name
   convention (role name lowercased, spaces to dashes, inside `cat_Arbetsgrupper` or
   `cat_Sektioner`); if that also fails, log and skip, leaving the entry unsent so it retries
   within the window.
4. Post the starter message in the channel: the role mention followed by `body`, with
   `allowed_mentions: { parse: [], roles: [roleId] }`. An empty `body` sends the mention alone.
5. Create a **public thread from that message**, named `title`. This is the deliverable — a place
   the group discusses the thing, not a fire-and-forget notification.
6. `markSent(id, year)` under the file lock.
7. Stagger sends roughly a second apart, so a date carrying many entries does not hit Discord's
   rate limit.

### Rules

- **Send, then mark.** A crash between the two duplicates one thread at worst. The reverse order
  would silently drop a reminder, which is worse.
- **Catch-up window is 2 days.** It covers restarts and short downtime. Anything older is logged
  and skipped, so 1 January does not fire the whole year at once.
- **29 February fires on 28 February** in non-leap years.
- **An entry whose channel resolves to nothing** — no stored `channelId`, and the name convention
  finds none either — is skipped in both modes, logged once per tick, and marked undeliverable in
  the UI. It is not marked sent, so it delivers on the next tick inside the window if a channel
  appears. Test mode is a faithful rehearsal of live behaviour, not a way to deliver what live
  would not.
- **Missing role** is logged and skipped, never retried indefinitely.

### Test-channel gate

`config.arshjulLive` defaults to `false`.

| `arshjulLive` | Behaviour |
|---|---|
| `false` | Every thread goes to `ch_BotTest` (`src/core/constants.js:22`). The role mention is stripped — `allowed_mentions: { parse: [], roles: [] }` — and the starter message is prefixed with the real target, `[TEST → #tarol]`. |
| `true` | Threads go to each entry's own channel with a real role mention. |

`sentYears` is marked in both modes, so a rehearsed entry does not fire a second time on go-live.
Everything else — date selection, catch-up, channel resolution, skipping — behaves identically, so
what is watched in the test channel is what will happen live.

Flipping `arshjulLive` to `true` is the entire go-live step. No code change, no redeploy of the
frontend.

## Frontend

`yearwheel/wheel.html` and `yearwheel/src/wheel.js` grow; the entry form lives in a new
`yearwheel/src/entryForm.js` so neither file sprawls. `api.js` gains `apiPost`, `apiPatch` and
`apiDelete` beside the existing `apiGet`. `landing.js`, `auth.js` and `callback.js` are untouched.

### Layout

Entries are grouped under Swedish month headings and sorted by `monthDay` within each month.
Months with no entries are not rendered.

```
← Tillbaka                          [+ Ny post]

tarol

⚠ Gruppen saknar en egen kanal i Discord — inga påminnelser skickas
   förrän en kanal finns.

JANUARI
  15  Boka lokal för vårkonsert      [✎] [✕]
MARS
  01  Beställ noter                  [✎] [✕]
SEPTEMBER
  20  Terminsstart                   [✎] [✕]
```

### Landing page — Mod section

`landing.js` renders the caller's own **Instrument** and **Arbetsgrupper** sections exactly as it
does today. When `me.isModerator` is true, one collapsed section is appended below them:

```
Olle L

Instrument
  tarol

Arbetsgrupper
  transportgruppen
  fikagruppen

▸ Mod — alla gruppers årshjul
```

Opening it fetches `GET /api/web/groups` — **lazily, on first open**, not on page load, so a
moderator's normal visit costs exactly what it costs everyone else. It then lists every instrument
and workgroup under the same two headings, linking to the same `wheel.html?role=<id>`.

It is a `<details>` element, closed by default, and it lists **all** groups including the
moderator's own — "alla grupper" that quietly omits three is worse than a short duplicate. A load
failure inside the section renders an error line inside it and leaves the rest of the page alone.

A moderator who is in no group at all still gets the `no_groups` message *and* the Mod section — the
message explains why their own list is empty, which is true, while the section still works.

### Wheel page — moderator context

When a moderator opens a wheel for a group they do not belong to, the page shows a line under the
heading: `Du visar den här gruppens årshjul som moderator.` The API already distinguishes the two
cases — the existing read route sets `role.name` from the caller's own groups and falls back to the
raw id otherwise (`src/routes/api/web/yearwheel.js:35`) — so this milestone has the route return the
role name for moderators too, plus an explicit `role.viaModerator: true`. Editing works normally;
the line exists so nobody edits another group's wheel thinking it is their own.

### Entry form

Fields: **Titel** (text), **Datum**, **Beskrivning** (textarea). Buttons: **Spara**, **Avbryt**.

The date is a month `<select>` plus a day `<select>`, never a native date input — an årshjul entry
has no year, and a date picker would force the user to pick one and then imply it means something.
The day list re-renders when the month changes; February offers 29.

### Behaviour

- **No channel.** `role.hasChannel === false` renders the banner above the list, and every entry
  row is marked `(skickas ej)`. Saving still works.
- **Version conflict.** A `409` refetches the wheel and reopens the form on the current server
  values, showing `Någon annan hann före — posten laddades om.` Nothing the user typed is written
  over someone else's edit.
- **Polling.** The 60s poll from milestone 1 (`yearwheel/src/wheel.js:64`) pauses while a form is
  open and dirty, and resumes on save or cancel — otherwise a poll redraws the DOM under an active
  cursor. The `visibilitychange` re-check stays as it is.
- **Delete.** Confirmed with `Ta bort posten «{title}»? Det går inte att ångra.` — anyone in the
  group can delete anything, so the confirm step is the only friction.
- **Revocation.** `destinationFor` is unchanged. Any `403` mid-edit also disables the form
  controls, so the user cannot keep typing into a form whose save will be refused.

### Swedish copy

| Where | Text |
|---|---|
| New entry button | `+ Ny post` |
| Mod section heading | `Mod — alla gruppers årshjul` |
| Mod section load error | `Kunde inte hämta grupplistan.` |
| Moderator viewing a foreign wheel | `Du visar den här gruppens årshjul som moderator.` |
| No-channel banner | `Gruppen saknar en egen kanal i Discord — inga påminnelser skickas förrän en kanal finns.` |
| Undeliverable entry marker | `(skickas ej)` |
| Version conflict | `Någon annan hann före — posten laddades om.` |
| Delete confirm | `Ta bort posten «{title}»? Det går inte att ångra.` |
| Title too long | `Titeln får vara högst 100 tecken.` |
| Body too long | `Beskrivningen får vara högst 1500 tecken.` |
| Invalid date | `Välj ett giltigt datum.` |
| Save failed | `Kunde inte spara. Försök igen.` |

## Configuration

| Key | Required | Default | Purpose |
|---|---|---|---|
| `arshjulLive` | no | `false` | `false` routes all threads to `ch_BotTest` with the mention stripped |
| `arshjulSendHour` | no | `8` | Hour in Europe/Stockholm at which the daily tick runs |

`config.example.json` documents both. No existing key changes. The bot-test channel id is already
in `src/core/constants.js:22` as `ch_BotTest` and is not duplicated into config.

## Files

**Created**
- `src/services/arshjulDispatcher.js`
- `src/routes/api/web/groups.js` — moderator-only group roster
- `yearwheel/src/entryForm.js`

**Modified**
- `src/services/arshjulStore.js` — write methods and the lockfile mutate
- `src/routes/api/web/yearwheel.js` — create, update, delete handlers; `hasChannel` and
  `viaModerator` on the read
- `src/routes/api/web/me.js` — forward `isModerator`
- `src/services/memberGroups.js` — `listAllGroups()`
- `src/core/express.js` — mount the write routes and `/api/web/groups`, write rate limiter
- `src/events/ready.js` — register the dispatcher
- `yearwheel/src/landing.js` — Mod section
- `config.example.json` — the two new keys
- `yearwheel/src/wheel.js`, `yearwheel/wheel.html`, `yearwheel/src/api.js`, `yearwheel/src/styles.css`

**Untouched, deliberately:** `src/middleware/auth.js`, `frontend/`, everything the Activity depends
on.

## Testing

Backend with `node --test`, frontend with `cd yearwheel && npx vitest run`.

**Store**
- Concurrent writes serialise under the lock.
- A stale `version` on `update` and on `remove` throws `version_conflict` and changes nothing on
  disk.
- The re-fire guard both directions: a date moved forward clears the current year from
  `sentYears`; a date moved backwards does not.

**Dispatcher** (injected clock)
- DST spring-forward and fall-back days both tick exactly once, at 08:00 local.
- `02-29` fires on `02-28` in a non-leap year, and on `02-29` in a leap year.
- Year rollover: an entry sent in 2026 sends again in 2027, once.
- The 2-day catch-up window at both edges — 2 days late sends, 3 days late is logged and skipped.
- A second tick the same day sends nothing.
- The startup rule: constructed at 03:00 → no immediate tick; at 11:00 → immediate tick.
- `arshjulLive: false` posts to `ch_BotTest`, strips the role mention, prefixes the target, and
  still marks `sentYears`.
- A `channelId: null` entry is skipped in both modes.

**Routes**
- A write by someone who does not hold the role → `403 missing_role`; by a non-member →
  `403 not_in_guild`; by a moderator on someone else's wheel → allowed.
- Unknown entry id → `404`, before any permission work.
- Stale version → `409`, with the current entry in the body.
- Each validation rule, including `02-30` rejected and `02-29` accepted.
- A missing or foreign `Origin` on a write → rejected.
- Rate limit trips after the configured burst.
- `GET /api/web/groups` returns every instrument and workgroup for a moderator,
  `403 not_moderator` for an ordinary member holding groups, and `403 not_in_guild` for a
  non-member. A role created after the cache expires appears in the result.
- `GET /api/web/me` returns `isModerator: true` for a moderator and `false` otherwise, and still
  returns only the caller's own groups in both cases.

**Frontend** (vitest)
- Month grouping and within-month ordering; empty months absent.
- The day list changes with the selected month; February offers 29.
- The no-channel banner and the `(skickas ej)` markers render from `hasChannel: false`.
- A `409` triggers a refetch and re-renders the form with server values.
- Polling pauses while a form is dirty and resumes after save or cancel.
- The Mod section renders only when `isModerator` is true, is closed on first render, and fetches
  `/api/web/groups` on first open rather than on page load.
- A failed group fetch renders its error inside the Mod section, leaving the caller's own group
  sections intact.
- A moderator in no groups sees both the `no_groups` message and a working Mod section.
- `role.viaModerator` renders the moderator line on the wheel page; a member's own wheel does not.

## Manual steps

Ordinary implementation cannot do these; they are the human's.

1. Nothing is required before or during implementation. `arshjulLive` defaults to `false`, so a
   deploy is safe on its own.
2. **Before go-live:** watch the bot-test channel across a few real ticks, with a few entries dated
   for the next couple of days.
3. **Go-live:** set `arshjulLive: true` in `config.json` on the bot host and restart.
4. **Separately:** decide when to post the milestone 1 Discord panel button, which is what puts the
   app in front of members. It is still held unposted and is an independent decision from
   `arshjulLive`.

Bot thread permissions in the role channels are confirmed (2026-09-09, reconfirmed 2026-09-10), so
no permission change is needed.

## Live Discord impact

Every visible effect on Kiriaka's live server is behind a human step:

| Action | What members see | Trigger |
|---|---|---|
| Deploy and restart with `arshjulLive: false` | Threads in `#bot-test` only, no role pings | First restart after deploy |
| Set `arshjulLive: true` | A public thread in the group's own channel, `@role` mentioned, on each entry's date at 08:00 | The human flips the key |
| Post the milestone 1 panel button | A permanent message with a Link button to the årshjul site | The human runs it |

Nothing posts during implementation.

## Risks

| Risk | Mitigation |
|---|---|
| A member-editable cron that pings a whole role is a spam vector | Role-scoped write permission, per-user rate limit, `allowed_mentions` restricted to the entry's own role, audit log of every write |
| An entry re-fires because a date was nudged | `sentYears` is cleared only when the new date is ahead of today |
| Year rollover fires every past entry at once | 2-day catch-up window; older entries logged and skipped |
| Concurrent editors overwrite each other | Per-entry `version`, `409` on stale writes, form reopened on server values |
| Compromised sibling subdomain forges writes | `Origin` allowlist on every write route |
| A crash between send and mark duplicates a thread | Accepted — a duplicate is visible and recoverable, a silent miss is not |
| Role renamed, channel no longer resolvable | `channelId` stored at save, name-convention fallback, skip and log, `(skickas ej)` in the UI |
| **`arshjul.json` exists only on the bot host** | Known gap, deliberately out of scope. Drive backup currently produces no dated files for any subfolder and the årshjul entry in `src/services/google/drive.js` is commented out. Verify Drive backup, or arrange another copy, before `arshjulLive` is set to `true`. Tracked as a separate spike. |

## Out of scope, worth doing later

- **Fix Drive backup.** Its own investigation — `findSubfolder` returns `null` for every subfolder
  and no dated files appear anywhere, which affects `permissions.json`, `detailsList.json`,
  `groupList.json` and `instrumentList.json` as much as årshjul. Re-enable the commented-out
  `arshjul` entry in `backupConfig` once it works.
- A circular year-wheel view.
- Reminder lead times.
- Migrating the store to `node:sqlite` if entries reach the thousands or edit history is wanted.
