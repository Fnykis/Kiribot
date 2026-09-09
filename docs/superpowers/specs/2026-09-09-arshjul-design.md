# Årshjul — Web App & User-Editable Reminders — Design

**Date:** 2026-09-09
**Status:** Draft (design) — awaiting review

## Goal

A second web app, separate from the Discord lineup Activity, reachable from a normal browser
via a Link button in Discord. It authenticates the user with Discord OAuth, resolves their
instrument and workgroup roles server-side, and shows them an *årshjul* (year wheel) per group.

In milestone 2, members fill preset fields on årshjul entries. Each entry carries an annually
recurring date. When that date arrives, the bot creates a thread in that role's dedicated
channel containing the entry's information — a cron job that the members themselves edit.

## Non-goals / hard constraints

- **The Discord lineup Activity must not be affected.** No changes to its frontend, its build,
  its Cloudflare Pages project, its Discord URL mapping, its `redirect_uri`, or
  `src/middleware/auth.js`. Everything here is additive.
- No new data store technology in milestone 1.
- The årshjul app does not modify Discord roles. Role membership is still changed through the
  existing `din-profil` flow.

## Decisions

- **Hosting:** `https://kiribot.ollelindberg.se/yearwheel`, on the same web host as the rest of
  the user's site. Not Cloudflare Pages. Separate source directory, separate deploy from
  `frontend/`.
- **Auth:** Discord OAuth authorization-code redirect, `scope=identify` only. The backend mints
  its own signed session and stores it in an `HttpOnly` cookie. Persistent across sessions.
- **Authorization:** roles are always resolved server-side with the bot token. They are never
  carried in the session token or in a URL.
- **Storage:** JSON file + `lockfile`, mirroring `src/services/lineupStore.js`. Per-entry
  `version` field for optimistic concurrency.
- **Recurrence:** entries recur annually. Stored as `MM-DD`.
- **Delivery:** a thread in the role's own channel. One role may own many entries per year.

## Architecture

| Component | Host | Role |
|---|---|---|
| Årshjul frontend | `kiribot.ollelindberg.se/yearwheel` (user's web host) | Static pages, OAuth start/callback, årshjul UI |
| Bot API | Cybrancee container, `localhost:3000` | OAuth exchange, session issue, role lookup, årshjul CRUD, dispatcher |
| Public API hostname | Cloudflare Tunnel (`config.yml`) | Carries browser → bot traffic |
| Årshjul data | `src/data/arshjul.json` on the bot host | Entries and sent-markers |
| Lineup Activity | Cloudflare Pages | **Unchanged** |

### Cloudflare Tunnel

`config.yml` gains a second hostname pointing at the same service:

```yaml
ingress:
  - hostname: lineup-api.ollelindberg.se     # keep — Discord Activity URL mapping depends on it
    service: http://localhost:3000
  - hostname: kiribot-api.ollelindberg.se    # new — used by the årshjul frontend
    service: http://localhost:3000
  - service: http_status:404
```

The old hostname is **added to, never replaced**. The lineup frontend calls relative `/api/...`
paths (`frontend/src/api.js`); inside the Activity those are rewritten by Discord's proxy using
the URL mapping in the Discord Developer Portal. Renaming the tunnel hostname would require
editing that mapping, which breaks the Activity for clients with cached configuration.
Retiring `lineup-api` is a separate, deliberate change.

### Why cookies work here

`kiribot.ollelindberg.se` and `kiribot-api.ollelindberg.se` share the registrable domain
`ollelindberg.se`, so they are *same-site* even though they are different origins.

- The API sets a **host-only** cookie (no `Domain` attribute), so it belongs to the API
  hostname alone and no sibling subdomain can read it.
- `HttpOnly; Secure; SameSite=Lax` — JavaScript cannot read it, so XSS cannot exfiltrate it.
- The frontend sends it with `credentials: 'include'`; CORS supplies the cross-origin
  permission, `SameSite=Lax` permits it because the request is same-site.

This was not possible on `*.pages.dev`: `pages.dev` is on the Public Suffix List, making it a
different site, so the cookie would have been third-party and blocked by Safari and Firefox.

## Authentication flow

1. Permanent panel message in Discord holds a Link button → `https://kiribot.ollelindberg.se/yearwheel/`.
2. The landing page calls `GET /api/web/me`. On `401` it shows "Logga in med Discord".
3. That link goes to Discord's authorize URL with `scope=identify`,
   `redirect_uri=https://kiribot.ollelindberg.se/yearwheel/callback.html`, and a random `state`
   stored in `sessionStorage` for CSRF protection.
4. `callback.html` verifies `state` matches, then `POST`s `{ code }` to `/api/web/token` with
   `credentials: 'include'`.
5. The backend exchanges the code — **passing the web `redirect_uri` explicitly**, so
   `config.oauthRedirectUri` used by the Activity is untouched — reads the Discord user ID,
   and sets the session cookie. Session payload is the user ID and an expiry (~30 days),
   HMAC-signed with `config.sessionSecret`.
6. Subsequent requests carry the cookie. `webAuth` middleware verifies the signature locally —
   no Discord round-trip per request, unlike `oauth.verifyToken` (`src/services/oauth.js:26-44`).
7. Roles are re-read per request through `createGuildMemberService`, so a role change takes
   effect within its 60s cache (`src/core/express.js:48`). No permissions are baked into the
30-day session.
8. `401` → frontend clears local state and returns to login.

### Discord Developer Portal

`https://kiribot.ollelindberg.se/yearwheel/callback.html` must be **added** as a second
registered redirect URI. The existing Activity URI stays.

## Role resolution

The bot already identifies instrument and workgroup roles by color
(`src/core/constants.js:3-4`), a pattern used throughout, e.g.
`src/interactions/buttons/profile.js:383-384`:

```js
guild.roles.cache.filter(r => r.hexColor === hex_instr)
guild.roles.cache.filter(r => r.hexColor === hex_arbet)
```

Intersecting those with `member.roles.cache` yields the user's instruments and workgroups. A member
may hold several of each; both are returned as arrays.

### One year wheel per role

There is one wheel per instrument role (~8) and per workgroup role (~18), keyed by `roleId`. A
wheel is simply every entry carrying that `roleId`. Roles are created and removed at runtime
(`src/interactions/modals/workgroups.js`), so nothing about the wheels may be hardcoded — no static
per-group page, no build-time list. A new workgroup gets a working wheel with no rebuild and no
redeploy.

Wheels are addressed by **role ID**, never role name: renaming a role keeps existing links working,
and an instrument and a workgroup can never collide on a name.

### Session states

A session cookie is issued to **any** Discord user who completes OAuth, including someone who is
not in the guild. Refusing them a session would leave them with nothing to log out of and no
explanation of why they were rejected. Authorization happens per endpoint instead, and
`GET /api/web/me` reports which state the caller is in:

| State | `me` response | Page |
|---|---|---|
| No cookie / expired | `401` | "Logga in med Discord" |
| Authenticated, not in the guild | `{ member: false }` | Not-a-member message, logout only |
| In guild, no instrument or workgroup role | `{ member: true, instruments: [], workgroups: [] }` | Join-a-group message, logout only |
| In guild, holds groups | groups listed | The group list |

Non-member text (Swedish, to be confirmed):

> Du är inte medlem i Kiriakas Discord-server, så årshjulet är inte tillgängligt för dig.

Member without groups:

> Du måste ansluta till ett instrument eller en arbetsgrupp för att använda årshjulet. Har du
> nyligen ändrat din profil? Vänta då i några minuter och prova igen.

(The real wait is the 60s role cache, so the message is deliberately conservative.)

In every state below the last, wheel endpoints return `403` regardless of what the page renders.

### Two levels of access control

These are distinct and both are enforced server-side.

**1. Session level — may you use the årshjul at all?** Guild member holding at least one instrument
or workgroup role, per the table above.

**2. Resource level — may you open *this* wheel?** Every request naming a `roleId` verifies that
the caller currently holds that role, `role_moderator` excepted. Failure returns `403` and the page
renders an access-denied message.

This check runs inside the endpoint on every request, for reads as well as writes. The landing page
lists only the caller's own groups, but that is presentation, not enforcement — hand-typing another
group's `roleId` into the URL hits the same check and is refused. Roles are re-read per request
(60s cache), so leaving a workgroup removes access without any session change.

### Revocation while a page is open

A user may be holding a wheel page open when their role is removed, or when they are kicked from the
server entirely. The session cookie lasts ~30 days and carries no roles, so nothing needs to be
invalidated — but the open page must stop being usable.

**Enforcement is unconditional and immediate.** Every request re-checks membership and role, so a
stale page's edit fails with `403` and writes nothing. Whatever the browser is displaying has no
bearing on what the server accepts. The client-side handling below is user experience, not security.

**Detection** uses two triggers:

- **Polling.** Milestone 2 polls the wheel anyway so concurrent editors see each other's changes;
  that poll doubles as the revocation check. Milestone 1 polls on a slower interval.
- **`visibilitychange`.** Re-check when the tab regains focus, so a laptop reopened after an hour
  reacts at once instead of waiting out the interval.

**Response depends on the error code,** so the API distinguishes three cases rather than returning a
generic `403`:

| Response | Meaning | Client action |
|---|---|---|
| `401` | No valid session | Redirect to login |
| `403 not_in_guild` | Removed from the Discord server | Redirect to landing, show the non-member message |
| `403 missing_role` | No longer in that group, still in the server | Redirect to landing, explain the group is no longer available |

Any `403` also immediately disables editing controls, so the user cannot keep typing into a form
whose save will be rejected.

**Worst-case lag** is the 60s role cache plus the poll interval — roughly two minutes at a 60s poll.
Only the redirect lags; the ability to write ends when the cache expires.

### Role → channel mapping

Channels are matched to roles by convention today: channel name is the role name lowercased with
spaces replaced by dashes, inside `cat_Arbetsgrupper` or `cat_Sektioner`
(`src/interactions/modals/workgroups.js:36-38` and `:164-167`). Channel creation there is
**optional**, so some roles have no channel.

Therefore `channelId` is resolved and stored **when an entry is saved**, not at send time. A role
with no channel fails the save with a clear error the user sees immediately, rather than a
reminder that silently never arrives months later. At dispatch, a missing stored channel falls
back to re-resolving by name, then logs an error.

## Data model

`src/data/arshjul.json`.

**`.gitignore` needs a new line for it.** `.gitignore:21-24` lists the data files *individually*
(`detailsList.json`, `groupList.json`, `instrumentList.json`, `permissions.json`) — there is no
`src/data/*.json` glob. Only `src/events/active/*.json` is wildcarded (`.gitignore:27`). Without an
explicit entry, `arshjul.json` would be committed and a deploy could overwrite live data. This is
a required task in milestone 1, not an assumption.

```json
{
  "version": 1,
  "entries": {
    "<entryId>": {
      "roleId": "…",
      "channelId": "…",
      "monthDay": "01-15",
      "title": "…",
      "fields": {},
      "version": 7,
      "createdBy": "<userId>",
      "updatedBy": "<userId>",
      "updatedAt": "2026-09-09T10:00:00.000Z",
      "sentYears": [2026]
    }
  }
}
```

- Keyed by entry with `roleId` inside, so one role holds many entries naturally.
- "What is due today" is a scan over a few hundred entries — negligible.
- `sentYears` is the idempotency marker; it makes the entry fire once per calendar year.
- `version` is the lost-update guard. A `PATCH` carrying a stale `version` returns `409`.
- Reads and writes go through a `lockfile` read-modify-write, mirroring
  `src/services/lineupStore.js:34-40`.

`node:sqlite` is built into Node 26 and needs no native dependency, so migrating is cheap if
entries grow into the thousands or edit history is wanted. JSON is the milestone-1 choice for
consistency with every other store in the repo.

## Dispatcher

A new module, **not** an extension of `src/services/scheduler.js`. The existing scheduler uses
`setTimeout` → `setInterval(24h)` (`src/services/scheduler.js:22-26`), which drifts across DST,
schedules on server local time rather than `Europe/Stockholm`, has no catch-up after downtime,
and records nothing about what it already sent. Acceptable for fixed internal jobs, not for
member-entered dates.

The dispatcher ticks every 15 minutes:

1. Compute today's date in `Europe/Stockholm` via `Intl`, as `src/core/logger.js:30` does.
2. Select entries whose `monthDay` is today **or up to 2 days past**, where the current year is
   not in `sentYears`.
3. Post a starter message in the entry's channel mentioning the role, with `allowed_mentions`
   restricted to that single role ID.
4. Create a thread from that message (pattern at `src/features/eventThread.js:165`). Thread name
   is `title`, truncated to Discord's 100-character limit. The body renders the entry's fields.
5. On success, add the current year to `sentYears` and persist under the file lock.
6. Stagger sends about a second apart so a busy date does not hit Discord's rate limit.

### Rules

- **29 Feb** fires on 28 Feb in non-leap years.
- **Catch-up window is 2 days.** It covers restarts and short downtime. Anything older is logged
  and skipped, so 1 January does not fire the entire year at once.
- **Send-then-mark.** A crash between the two can at worst duplicate one thread; the reverse
  order could silently drop a reminder. Optional hardening: before sending, search the channel's
  recent threads for a matching name.
- **Editing a fired entry.** Changing `monthDay` clears the current year from `sentYears` only if
  the new date is still ahead. Otherwise a user could re-trigger a role ping by nudging the date
  back and forth.
- **Missing role or channel** is logged once and surfaced in the UI, not retried indefinitely.

## API

New routes under `/api/web/`, registered in `src/core/express.js`. No existing route is modified.

| Route | Milestone | Purpose |
|---|---|---|
| `POST /api/web/token` | 1 | Exchange OAuth code, set session cookie — succeeds for any Discord user, guild membership is not checked here |
| `POST /api/web/logout` | 1 | Clear cookie |
| `GET /api/web/me` | 1 | The caller's groups (below) |
| `GET /api/web/yearwheel/:roleId` | 1 | Entries for one group; `403` unless the caller holds the role |
| `POST /api/web/yearwheel/:roleId` | 2 | Create entry |
| `PATCH /api/web/yearwheel/entry/:id` | 2 | Update; requires `version`, `409` on stale |
| `DELETE /api/web/yearwheel/entry/:id` | 2 | Remove entry |

`GET /api/web/me` reports the caller's session state and every group they belong to — a member may
hold several of each:

```json
{
  "member": true,
  "displayName": "Olle L",
  "instruments": [{ "id": "1234…", "name": "tarol" }],
  "workgroups":  [{ "id": "5678…", "name": "transportgruppen" },
                  { "id": "9012…", "name": "fikagruppen" }]
}
```

A caller who authenticated but is not in the guild gets `{ "member": false }` and nothing else —
no display name, no roster information. `401` means no valid session at all.

Role IDs come straight from Discord and are what the landing page links to. It returns only the
caller's own groups, never the full roster of ~26 — the client has no use for the rest, and not
sending it keeps the list of groups someone isn't in out of the browser.

Entry routes take `roleId` (or resolve it from the entry) and enforce the resource-level check
described under Role resolution: hold the role, or be `role_moderator`, or get `403`. This applies
to `GET` as much as to writes, which is why the read route is milestone 1 — the gate ships with the
first page that can reach a wheel, not later.

A new `webAuth` middleware handles the cookie session. `src/middleware/auth.js` keeps serving the
Activity unchanged — two middlewares, no shared edits.

### CORS

A second entry alongside the existing Discord regex in `src/core/express.js:63-66`: the exact
origin string `https://kiribot.ollelindberg.se` with `credentials: true`. Wildcards are illegal
with credentials. The Activity's `/\.discordsays\.com$/` entry is untouched.

## Permissions & security

- **Session:** guild member holding at least one instrument or workgroup role.
- **Read a wheel:** the member must hold that wheel's role; `role_moderator` may read any. Enforced
  in the endpoint, never by which links the UI renders.
- **Write:** same rule as read — hold the role that owns the entry, or be `role_moderator`. Reuses
  `src/services/permissions.js` rather than introducing a second permission model.
- **CSRF:** every write checks the `Origin` header against an allowlist. This matters because the
  årshjul is served from the same host as the rest of the user's website: a compromised page on a
  sibling subdomain cannot read the host-only cookie, but the browser would attach it to forged
  same-site requests. The `Origin` check rejects those.
- **Mention safety:** `allowed_mentions` is restricted to the entry's own role ID, so no text
  field can smuggle `@everyone`.
- **Rate limiting:** `express-rate-limit` on all write routes, keyed by user ID, following the
  existing limiter pattern.
- **Input validation:** field keys are an allowlist, values are length-capped, `monthDay` is
  format-checked, and dates cannot be set arbitrarily far ahead.
- **Audit:** every write is logged with user, entry, and before/after values via
  `src/core/logger.js`.
- **Spam surface:** a user-editable cron that pings a whole role is inherently a spam vector.
  The combination of role-scoped write permission, rate limiting, restricted mentions, and audit
  logging is the mitigation.

## Frontend

A top-level `yearwheel/` directory with its own `package.json`, so it installs, builds, and tests
independently of `frontend/`. No shared build config exists that could break the lineup, and no
module is imported across the boundary. Cost is a second `npm install`.

**Two pages, not one per group.** `/yearwheel/` (`index.html`) handles login and, once signed in,
calls `GET /api/web/me` and renders the caller's instruments and workgroups as clickable links to
`wheel.html?role=<roleId>` — typically under two headings, *Instrument* and *Arbetsgrupper*.
`wheel.html` reads that query parameter and fetches the wheel, rendering an access-denied message on
`403`. Groups are created and removed in Discord at runtime, so the page count stays fixed at three
regardless of how many wheels exist; a new workgroup needs no rebuild and no upload.

**The subdomain root is not part of this deliverable.** `kiribot.ollelindberg.se/` is a hub page
carrying an "Årshjul" button that links to `/yearwheel/`, with room for further apps later. It is
maintained separately from `yearwheel/dist/`, which deploys only into `/yearwheel`. The Discord
panel button may point at either the hub or straight at `/yearwheel/`.

```
Kiribot/
├── frontend/              # lineup Activity — untouched
├── yearwheel/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html         # landing: the caller's instruments + workgroups
│   ├── wheel.html         # one year wheel, ?role=<roleId>
│   ├── callback.html
│   ├── src/
│   │   ├── api.js         # fetch wrapper, credentials: 'include'
│   │   ├── auth.js        # OAuth start, state check, session state
│   │   ├── landing.js
│   │   ├── wheel.js
│   │   └── styles.css
│   ├── tests/
│   └── dist/              # build output — deploy artifact
└── src/                   # bot
    ├── middleware/webAuth.js
    ├── routes/api/web/{token,me,yearwheel}.js
    ├── services/{webSession,arshjulStore,arshjulDispatcher}.js
    └── data/arshjul.json
```

**Deploy is a single directory upload over FTP:** `cd yearwheel && npm run build`, then upload the
contents of `yearwheel/dist/` to `/yearwheel` on the web host. Nothing else is copied, and the bot
host is not involved.

Three consequences of a manual FTP deploy:

- **Upload `assets/` before the HTML files.** Vite fingerprints asset filenames but not the HTML.
  Uploading HTML first leaves a window where a page references files that are not there yet.
- **The HTML files are not fingerprinted**, so a browser may serve a stale `index.html` that points
  at deleted asset hashes. If the host allows it, serve `*.html` with `Cache-Control: no-cache`;
  otherwise a hard refresh is the fallback after a deploy.
- **Old `assets/` files are not removed by an upload.** Occasionally clear the directory, and never
  delete assets immediately after a deploy while old HTML may still be cached.

Plain FTP transmits credentials in cleartext. Use FTPS or SFTP if the host offers either.

Vite uses `base: './'` rather than an absolute base, so asset URLs are relative and the same build
works at `/yearwheel`, at another subpath, or at a subdomain root without rebuilding. All three
pages are flat in one directory, so relative paths resolve cleanly. The three HTML files must be
listed in `build.rollupOptions.input`; Vite only auto-detects `index.html`.

Vanilla JS in the style of the lineup app, with its own fetch wrapper setting
`credentials: 'include'`. Milestone 2 polls the entry list so concurrent editors see each
other's changes; a `409` prompts a reload of the affected entry.

`.gitignore` gains `yearwheel/node_modules` and `yearwheel/dist` alongside the
`src/data/arshjul.json` entry.

## Testing

- Backend with `node --test`, following `tests/`.
- The dispatcher takes an injected clock so DST transitions, 29 Feb, year rollover, the 2-day
  catch-up window, and re-tick idempotency are unit-testable without waiting for real dates.
- Store tests cover concurrent writes, `version` conflicts, and lock behaviour.
- Auth tests cover signature verification, expiry, missing cookie, and each of the four session
  states — including that a non-member receives a working session and a `{ member: false }`
  response rather than an error, while still getting `403` from every wheel endpoint.
- Authorization tests cover the resource-level gate specifically: a member of one workgroup
  requesting another workgroup's `roleId` gets `403` on read and on write, a member of several
  groups reaches all of theirs, a moderator reaches any, and losing a role removes access once the
  60s cache expires.
- Revocation tests assert the distinct error codes — `403 not_in_guild` after a kick,
  `403 missing_role` after losing one role while remaining in the guild — and that a write attempted
  with a revoked role changes nothing on disk.
- Frontend with vitest, as `frontend/` does.

## Configuration

`config.json` gains:

| Key | Purpose |
|---|---|
| `webOrigin` | `https://kiribot.ollelindberg.se` — CORS and `Origin` allowlist |
| `webRedirectUri` | `https://kiribot.ollelindberg.se/yearwheel/callback.html` |
| `sessionSecret` | HMAC key for session cookies |

`config.example.json` is updated with placeholders. Outside the repo: the new tunnel hostname and
its DNS record, and the second redirect URI in the Discord Developer Portal.

## Milestones

**Milestone 1 — read-only.** Domain, tunnel hostname, OAuth flow, session cookie, `GET
/api/web/me`, `GET /api/web/yearwheel/:roleId` with its resource-level gate, landing page listing
the caller's groups, wheel page rendering one group's entries read-only, Discord panel button.
Proves auth, hosting, and deploy end to end, and ships the per-wheel gate before any page can
reach a wheel.

**Milestone 2 — editable entries and dispatcher.** Årshjul CRUD, optimistic concurrency, the
dispatcher, thread delivery, write permissions, audit logging.

The storage shape is decided in milestone 1 because it is the expensive thing to change later.

## Open questions

1. **Preset fields.** The exact field list, types, and validation rules for an årshjul entry are
   not yet defined. Needed before milestone 2 planning.
2. **Non-member wording.** The Swedish text shown to someone who signs in but is not in the guild
   is a placeholder awaiting the user's own phrasing.

**Closed:** backups exist. `backupJsonFiles` (`src/services/google/drive.js:488`) copies data files to
Google Drive twice daily via `scheduleTwiceDailyTask` in `src/events/ready.js`. It uses an explicit
per-file `backupConfig` array rather than a directory scan, so `arshjul.json` must be registered
there — a task in the milestone 1 plan, not an open question.

**Closed:** deploy is a manual FTP upload of `yearwheel/dist/` (see Frontend). The bot has the
thread permissions it needs in the role channels — confirmed 2026-09-09 — so the dispatcher can
create threads in channels that deny `@everyone` `ViewChannel`
(`src/interactions/modals/workgroups.js:39-47`).

## Risks

| Risk | Mitigation |
|---|---|
| Renaming the tunnel hostname breaks the Activity | Add the new hostname, never replace the old one |
| Repointing `config.oauthRedirectUri` breaks Activity login | Pass the web redirect URI per-flow; register it as a second URI |
| Year rollover fires every past entry at once | 2-day catch-up window; older entries logged and skipped |
| Concurrent editors overwrite each other silently | Per-entry `version`, `409` on stale writes |
| Compromised sibling subdomain forges writes | `Origin` allowlist on write routes; host-only `HttpOnly` cookie |
| Role renamed, channel no longer resolvable | `channelId` stored at save time, name fallback, error surfaced in UI |
| User reads another group's wheel by editing the URL | Resource-level `roleId` check inside every wheel endpoint, reads included; UI link-hiding is not treated as access control |
| Role removed or user kicked while a page is open | Every request re-checks, so writes fail regardless of page state; polling plus `visibilitychange` redirect the stale page within ~2 minutes |
