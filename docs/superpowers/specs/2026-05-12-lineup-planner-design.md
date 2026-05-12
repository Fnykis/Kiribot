# Concert Line-up Planner — Design Spec

Companion to `docs/lineup-planner-spec.md` (the original project brief). This document records the decisions made during brainstorming and supersedes the brief where they conflict.

## 1. Goal

A private Discord Activity for the Kiriaka music group that lets Harmonian-role members visually arrange stage line-ups for concerts. Drag-drop canvas, shared state, hidden from non-members.

## 2. Resolved decisions

| Topic | Decision |
| :--- | :--- |
| Plan scope | Decompose into 7 milestones (M0–M6). Each = standalone PR. |
| Domain | Register new domain for `lineup-api.<domain>` tunnel. M0 prereq. |
| Discord apps | Two Application records in portal: prod Kiribot + new dev app. URL mappings isolated per app. Same bot codebase. |
| Hosting | Bot + Express + cloudflared run together on Cybrancee via PM2 (per Cybrancee support). **Sidecar setup unverified.** M0 gate. Fallback: Cloudflare Workers + Durable Objects (heavy rewrite). |
| Express port | Bind `127.0.0.1:3000` (localhost only). No inbound port allocated from host. cloudflared outbound tunnel handles ingress. |
| Roster source | Existing event JSON `src/events/active/<event>.json`. Ja + Kanske entries listed; manual-add (server members) also supported. |
| State storage | Add `lineup` array on event JSON. Lazy-created on first write if missing. No separate state file. |
| Authorization | `Harmonian` role required to view and edit. Enforced backend on every request + frontend gate on boot. |
| Realtime model | Polling only. Frontend re-fetches event JSON every 5s when tab visible. No WebSocket v1. |
| Drag sync | Drag motion is local-only. Network only on drop (place / move-end / remove). |
| Stage dimensions | Hardcoded 1000×600 logical units v1. No per-concert override. |

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Discord client (desktop/mobile)                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Activity iframe                                          │   │
│  │  - @discord/embedded-app-sdk handshake                   │   │
│  │  - OAuth code via sdk.commands.authenticate()            │   │
│  │  - HTTP via Discord proxy (URL mappings)                 │   │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
              │ /  → Cloudflare Pages       │ /api/* → tunnel
              ▼                              ▼
   ┌──────────────────────┐      ┌─────────────────────────────┐
   │ Cloudflare Pages     │      │ Cybrancee container         │
   │ frontend/dist        │      │ ┌─────────────────────────┐ │
   │ (static SPA)         │      │ │ Node process (PM2)      │ │
   └──────────────────────┘      │ │ - discord.js bot        │ │
                                 │ │ - Express on 127.0.0.1  │ │
                                 │ └────────────┬────────────┘ │
                                 │ ┌────────────▼────────────┐ │
                                 │ │ cloudflared (PM2)       │ │
                                 │ │ outbound tunnel         │ │
                                 │ └─────────────────────────┘ │
                                 │ FS: src/events/active/*.json│
                                 └─────────────────────────────┘
```

- Single Node process runs bot + Express. Shares `lockUtils`, `features/signup`, `core/logger`, `core/client`.
- cloudflared runs as PM2 sibling. Independent restart.
- All API traffic enters via Discord proxy → cloudflared → Express on `127.0.0.1:3000`.
- Frontend served statically by Cloudflare Pages from `frontend/dist`.

## 4. Data model

Event JSON gains one new array at the root:

```jsonc
// src/events/active/8_mars_278194333.json
{
  "name": "[SOC] Kvinnodagen 8 mars",
  "id": "278194333",
  "date": "08/03/26",
  "signups": { /* unchanged: keyed by instrument */ },
  "lineup": [
    {
      "userId": "987654321098765432",
      "displayName": "Bo K",
      "instrument": "altklarinett",
      "position": { "x": 320, "y": 180 },
      "manuallyAdded": false,
      "placedAt": "2026-05-12T18:30:02Z"
    },
    {
      "userId": "443322110099887766",
      "displayName": "Gäst Sax",
      "instrument": "sax",
      "position": { "x": 500, "y": 200 },
      "manuallyAdded": true,
      "placedAt": "2026-05-12T18:31:00Z"
    }
  ]
}
```

Rules:
- `lineup` missing on read → backend writes `"lineup": []` on first mutation.
- One entry per **placed** dot. Person can only appear once across the array per concert.
- `userId` = real Discord user ID (manual-add picks from guild members; no custom names).
- `instrument` = which instrument this person plays at this concert (chosen at placement time).
- `manuallyAdded: true` = placed without a matching signup entry. Stale-check skipped.
- Stale logic (UI only, not persisted): for `manuallyAdded: false`, walk `signups`; if no entry with this `userId` has `response ∈ {ja, kanske}`, show `!` badge on the dot and on the placed-member representation in the sidebar.

Available-list projection (computed by client):
- For each instrument key in `signups`: list entries with `response ∈ {ja, kanske}` whose `userId` is NOT present in `lineup`.
- Multi-instrument signup → person appears once per instrument until their first placement; first placement removes all their list rows.

## 5. API surface

All routes under `/api`. All require `Authorization: Bearer <discord-access-token>`.

Middleware order (one function chain):
1. Verify access token via Discord `GET /users/@me`. Cache 60s by token hash.
2. Resolve Discord user → fetch guild member via `client.guilds.cache.get(guildId).members.fetch(userId)`.
3. Check `Harmonian` role on member. Cache 60s by userId. Reject `403` if missing.
4. Attach `req.user = { id, displayName, roles }`.

| Method | Path | Body / Query | Returns |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/token` | `{ code }` | `{ access_token, expires_in }` (server-side exchange with `discordClientSecret`) |
| `GET` | `/api/concert/pending` | — | `{ concertId }` for caller, or `404` |
| `GET` | `/api/state/:concertId` | — | full event JSON |
| `POST` | `/api/lineup/place` | `{ concertId, userId, instrument, x, y, manuallyAdded? }` | updated `lineup` |
| `POST` | `/api/lineup/move` | `{ concertId, userId, x, y }` | updated entry |
| `POST` | `/api/lineup/remove` | `{ concertId, userId }` | updated `lineup` |
| `GET` | `/api/guild/members` | `?q=<query>` | up to 25 `{ id, displayName, hasHarmonian }` for manual-add search |

Validation:
- `instrument` must exist in `detailsList.json` instrument list.
- Coordinates clamped to `0..1000` × `0..600`. Not rejected.
- For non-manual placement: `userId` must exist in event's `signups` under that `instrument` with `response ∈ {ja, kanske}`.
- For manual placement: `userId` must be current guild member. Harmonian role not required for the manually-added user (per requirements: any server member can be added).
- Person already in `lineup` → place returns `409`. Caller resyncs.

Concurrency:
- Every mutation goes through `lockUtils.withLock(eventFilePath, async () => { read → mutate → write })`. Serializes with existing signup writes.
- Reads are unlocked. 5s polling tolerates eventual consistency.

Rate limits (`express-rate-limit`, keyed by `req.user.id`):
- Mutations: 30/sec.
- State poll: 6/min (above the 5s client cadence, accommodates focus-refresh).
- Token exchange: 5/min.

Pending-concert map:
- In-memory `Map<userId, { concertId, expiresAt }>`. TTL 10 min. Cleared on first successful read.
- Lost on bot restart — acceptable; user reruns context menu.

Archived events:
- Mutations on a file in `src/events/archived/` return `404`. Reads return `200` (historical view).

Errors:
- `401` invalid/expired token → frontend re-runs OAuth via SDK.
- `403` missing Harmonian role → render lockout page.
- `409` placement conflict → frontend re-syncs.
- `404` concert archived or missing → render "concert closed" message.

## 6. Frontend structure

```
frontend/
├── package.json          # vite, @discord/embedded-app-sdk, interactjs
├── vite.config.js        # base "/", output dist/
├── index.html
└── src/
    ├── main.js           # entry: SDK boot, OAuth, role gate, render
    ├── sdk.js            # embedded-app-sdk wrapper, standalone-refusal
    ├── auth.js           # /api/token exchange, in-memory token
    ├── api.js            # fetch wrappers, auth header, error mapping
    ├── poll.js           # 5s poll loop, visibility-aware
    ├── state.js          # client store + diff/merge from polled JSON
    ├── canvas/
    │   ├── stage.js      # render placed dots, name labels, badges
    │   └── drag.js       # interact.js: list→canvas, canvas→canvas, canvas→trash
    ├── sidebar/
    │   ├── available.js  # ja/kanske grouped by instrument
    │   └── manualAdd.js  # member search → /api/guild/members
    └── styles.css
```

Boot sequence:
1. `DiscordSDK.ready()`. Reject → static "open inside Discord" page; stop.
2. `sdk.commands.authenticate()` → OAuth code.
3. `POST /api/token` → access token (memory only, no localStorage).
4. `GET /api/concert/pending` → concertId. 404 → "no pending concert; use 'Planera lineup' first".
5. `GET /api/state/:concertId` → initial render. 403 → lockout page.
6. Start `poll.js`.

State store:
- `state.event` = last full event JSON.
- `state.draggingId` = currently dragged userId; this entry is excluded from poll-merge to avoid clobbering local motion.

Drag handling:
- Drag start → set `draggingId`, render locally.
- Drag move → local render only. **No network calls.**
- Drag end → POST `/api/lineup/move` (or `/place` if first-time from list, or `/remove` if dropped on trash). On 200 clear `draggingId`. On error revert and toast.

Available-list rendering:
- Walk `state.event.signups`. For each instrument key, filter entries `response ∈ {ja, kanske}` and `userId NOT IN state.event.lineup`. Render rows grouped by instrument.

Placed rendering:
- Canvas dot per `lineup` entry. Color from `instrument → detailsList.json` lookup.
- Display name label below dot.
- Stale badge `!` if `!manuallyAdded` AND no signup entry with that `userId` has `response ∈ {ja, kanske}`.

Manual-add UX:
- Button "Lägg till annan medlem" → modal with text input.
- Debounced search to `/api/guild/members?q=...` (250ms).
- Result click → instrument picker → `POST /api/lineup/place` with `manuallyAdded: true`.

Mobile:
- `interact.js` Pointer Events handles touch + mouse uniformly.
- Dots ≥ 44 px tap target. Manual-add modal full-screen on small viewports.

## 7. Security

1. Discord OAuth — short-lived access token verified server-side per request (60s cache).
2. Guild + Harmonian role check — required for every endpoint.
3. Manual-added user — must be current guild member (verified via bot's `members.fetch`).
4. CORS — Express allow-list matches `*.discordsays.com` (Discord activity proxy host).
5. CSRF — N/A (bearer token, no cookies).
6. Rate limits per `req.user.id` (see §5).
7. Standalone-URL refusal — frontend renders static refusal page if `DiscordSDK.ready()` rejects; API independently rejects without valid Discord OAuth token.
8. Client secret — `discordClientSecret` lives in `config.json` on Cybrancee. Never sent to frontend.

## 8. Milestones

| # | Name | Scope | Exit gate |
| :- | :-- | :--- | :--- |
| **M0** | Prereqs (no code) | Register domain. Create dev Discord app. Open Cybrancee ticket: confirm PM2 + cloudflared sidecar works. Set up Cloudflare account + empty Pages project. | Dev domain resolves via cloudflared to `localhost:3000` returning `200 OK` end-to-end. |
| **M1** | Bot Express + OAuth + role gate | `core/express.js`, `POST /api/token`, auth middleware (token verify + Harmonian role check), trivial `GET /api/me`. | Local script with a valid OAuth code identifies user and returns role gate result. |
| **M2** | Context menu + concert resolution | `interactions/contextMenus/planLineup.js`, `features/lineup.js` (concert ID resolve via `getEventJSON`), pendingConcerts map, `GET /api/concert/pending`, ephemeral reply with launch instructions. | Right-click signup message → ephemeral reply; `/api/concert/pending` returns the concertId. |
| **M3** | Lineup state CRUD | `services/lineupStore.js` (read/merge/write event JSON via `lockUtils`). Endpoints `GET /api/state/:concertId`, `POST /api/lineup/{place,move,remove}`, `GET /api/guild/members`. Add lazy `"lineup": []` write. | curl creates, places, moves, removes; JSON file matches; locks observed under load. |
| **M4** | Frontend scaffold + SDK handshake | `frontend/` Vite project. Embedded SDK boot, OAuth via `/api/token`, role gate, static render (sidebar + canvas, no drag). Cloudflare Pages deploy from `main` with root = `frontend`. | Activity launched from voice channel shelf renders the lists for a real concert. |
| **M5** | Drag-drop + place + poll | `interact.js` bindings. Drag-end commits to API. 5s polling loop with visibility-pause. Stale-badge calculation. Manual-add modal. | Two devices each see the other's changes within ~5s. Manual-add a guest works. Stale badges appear on signup flip. |
| **M6** | Mobile + polish + prod cutover | Mobile pointer-event verification (iOS/Android). Tap-target sizing. Switch URL mappings to prod Kiribot app + prod cloudflared tunnel. Verify with 2-3 Harmonians. | Announced to group. |

Rough estimate: ~1 working week solo. Riskiest day is M0 sidecar verification + M1 OAuth handshake.

## 9. Out of scope (v1)

- Multiple stages / multi-page concerts
- Stage background image / shape upload
- Snap-to-grid
- Undo / history
- Export to image
- WebSocket realtime (collapsed into polling)
- Activity launch from message context menu (Discord platform limitation)
- Per-concert stage dimensions
- Refresh-token flow (re-auth on 401 is enough)

## 10. Risks

| Risk | Mitigation |
| :--- | :--- |
| Cybrancee PM2 + cloudflared sidecar not actually supported | M0 verify with Cybrancee before any frontend work. Fallback: relocate Express to Cloudflare Workers + Durable Objects (heavy rewrite, splits monorepo benefit). |
| Discord Activities mobile reliability | Test mobile end-to-end early in M4. Known historical: iOS Safari + Activities OAuth quirks. |
| 5s polling cadence too slow under multi-user editing | Drop to 2s if real-world tested as laggy; only add WebSocket if still bad. |
| Bot restart drops pending-concert map | User reruns the context menu. Logged via `core/logger`. |
| OAuth token expires mid-session | Frontend catches 401 and re-runs SDK auth + `/api/token` transparently. |
| Multi-instrument person placed under wrong instrument | User removes and replaces from the correct instrument row. No undo v1. |
| Stage 1000×600 cramped for big lineups | Acceptable v1; per-concert `lineupStage` is v2 candidate. |
| `Harmonian` role lookup by name breaks if role renamed | Acceptable v1 (small group, rename rare). Switch to role ID stored in `config.json` if rename happens. |
| Display name drift after placement (member renames in Discord) | `displayName` is snapshotted at placement time. Refresh on next move or re-placement. No background sync. |
