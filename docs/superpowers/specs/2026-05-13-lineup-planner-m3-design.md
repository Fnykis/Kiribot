# Lineup Planner — M3 Design (State CRUD + Guild Members)

**Date:** 2026-05-13
**Parent spec:** `docs/lineup-planner-spec.md`
**Predecessor:** M2 (`docs/superpowers/plans/2026-05-13-lineup-planner-m2.md`)

## Goal

Add the backend state layer for the Activity: load merged roster + placement, mutate placement with three explicit operations (place/move/remove), and expose guild membership for displayName resolution. No WebSocket yet — REST only.

## Decisions (locked during brainstorming)

| Topic | Choice |
| :--- | :--- |
| Scope | state + place/move/remove + guild members |
| Roster filter | Include responses `ja` and `kanske`; exclude `nej` and missing |
| Placement model | **Pattern B** — `placed` boolean. Unplaced participants live in a frontend sidebar list. Placed participants render as dots on the canvas. |
| Color source | Frontend-only. Backend returns `instrument`; frontend owns the color map. |
| Realtime sync | **Not in M3.** Deferred to M5 per spec §14 build order. |

## Endpoints

All under `/api`, all require `Authorization: Bearer <token>` (M1 `authMiddleware`).

| Method | Path | Body / Params | Success | Errors |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/state/:concertId` | — | `200 { concertId, name, updatedAt, participants: [...] }` | `404 event_not_found` |
| `POST` | `/api/lineup/place` | `{ concertId, userId, x, y }` | `200 { ok: true }` | `400 invalid_body`, `404 event_not_found`, `404 user_not_in_roster` |
| `POST` | `/api/lineup/move` | `{ concertId, userId, x, y }` | `200 { ok: true }` | as above, plus `404 user_not_placed` |
| `POST` | `/api/lineup/remove` | `{ concertId, userId }` | `200 { ok: true }` | `400 invalid_body`, `404 event_not_found`, `404 user_not_in_roster` |
| `GET` | `/api/guild/members` | — | `200 { members: [{ id, displayName }] }` | `500 guild_fetch_failed` |

`/api/lineup/*` is rate-limited at 30 req/sec per user (key = `req.user.id`). State + members are unlimited.

## Data Model

### Persisted state file: `src/data/lineups/<concertId>.json`

Stores **only placement** — no roster cache. Roster is always rebuilt from current event JSON.

```json
{
  "concertId": "278194333",
  "updatedAt": "2026-05-13T12:00:00Z",
  "participants": {
    "<userId>": { "placed": true, "x": 120, "y": 45 }
  }
}
```

`participants` is a userId-keyed object (O(1) patch). `placed: false` entries may have `x/y: null`.

Missing file → treated as empty state `{ concertId, participants: {}, updatedAt: null }`.

### GET /api/state response

Merge of event JSON + saved placement:

```json
{
  "concertId": "278194333",
  "name": "[SOC] Kvinnodagen 8 mars",
  "updatedAt": "2026-05-13T12:00:00Z",
  "participants": [
    {
      "userId": "692799162265239552",
      "displayName": "Andrea W",
      "instrument": "1:a",
      "response": "kanske",
      "placed": false,
      "x": null,
      "y": null
    }
  ]
}
```

Returned as a list (not a map), already filtered to `ja`+`kanske`. A user signed up to multiple instruments produces one entry per instrument (matches existing signup data shape).

## File Layout

| File | Purpose | Status |
| :--- | :--- | :--- |
| `src/services/lineupStore.js` | `loadState(concertId)`, `mutate(concertId, fn)` — JSON CRUD with `lockfile` serialization | Create |
| `src/features/lineup.js` | Add `mergeRoster(eventJson, savedState)` (alongside existing `pendingConcerts`) | Modify |
| `src/routes/api/state.js` | Factory `createStateRoute({ getEventJSON, lineupStore })` | Create |
| `src/routes/api/lineup.js` | Factories `createPlaceRoute`, `createMoveRoute`, `createRemoveRoute` | Create |
| `src/routes/api/guildMembers.js` | Factory `createGuildMembersRoute({ client, guildId, ttlMs })` with 60 s cache | Create |
| `src/core/express.js` | Mount the 5 routes; wire `express-rate-limit` on `/api/lineup/*` | Modify |
| `tests/services/lineupStore.test.js` | Round-trip, missing file → empty, `mutate` patches correctly | Create |
| `tests/features/lineup-merge.test.js` | `mergeRoster` filters by response, merges placement, drops removed signups | Create |
| `tests/routes/state.test.js` | Happy path + archived event 404 | Create |
| `tests/routes/lineup.test.js` | place/move/remove happy + error paths | Create |
| `tests/routes/guildMembers.test.js` | Cached fetch, cache expiry, fetch failure | Create |
| `scripts/m3-smoke.js` | End-to-end: GET state → POST place → GET state → POST move → POST remove | Create |
| `package.json` | Add `express-rate-limit` dependency | Modify |

## Module Contracts

### `services/lineupStore.js`

```js
async function loadState(concertId)
// → { concertId, participants: {}, updatedAt: null } if file missing
// → parsed JSON otherwise

async function mutate(concertId, fn)
// 1. lockFile.lock("<path>.lock", { stale: 5*60*1000, retries: 3, retryWait: 100 })
// 2. state = loadState(concertId)
// 3. patched = fn(state)  // synchronous; may throw to abort
// 4. patched.updatedAt = new Date().toISOString()
// 5. write file
// 6. lockFile.unlock
// returns patched state
```

Throws `EVENT_NOT_FOUND` etc. propagate to caller; lock is released in `finally`.

### `features/lineup.js — mergeRoster`

```js
function mergeRoster(eventJson, savedState)
// signups = eventJson.signups (instrument → [{ id, name, response, note }])
// for each instrument, for each signup with response ∈ {ja, kanske}:
//   userId = signup.id
//   saved = savedState.participants[userId]
//   push { userId, displayName: signup.name, instrument, response,
//          placed: saved?.placed ?? false,
//          x: saved?.x ?? null, y: saved?.y ?? null }
```

Note: deliberately no de-dup — a user on multiple instruments appears multiple times (matches signup data; frontend renders them as separate dots).

### Route factories

All routes take dependencies via factory args (matches M1/M2 style for testability). Validation rules:

- `place` / `move`: require numeric `x`, `y`. `move` additionally requires existing participant has `placed: true`.
- `remove`: clears `placed`, `x`, `y`.
- All mutation routes: load `getEventJSON(concertId)` first → 404 if null (archived). Then verify userId is in current roster (via `mergeRoster` lookup) → 404 if not.

### `routes/api/guildMembers.js`

In-memory cache: single entry `{ at, members }`. On request: if `now - at < ttlMs`, return cached. Else `client.guilds.cache.get(guildId).members.fetch()` → map → cache → return. `ttlMs` defaulted to 60 000 (overridable for tests).

## Concurrency

Matches existing pattern (`interactions/buttons/signup.js:105`). All writes go through `mutate()` which serializes via `lockfile` on `<concertId>.json.lock`. Read-only `GET /api/state` does not lock — a stale read is acceptable (frontend re-fetches; M5 WS will push updates).

## Auth / CORS

Reuse M1 middleware unchanged. CORS allowlist for the Activity iframe origin (`https://*.discordsays.com`) is deferred to M4 when the frontend exists to test against — M3 verification uses `curl` with a Bearer token from `scripts/m3-smoke.js`.

## Out of Scope (M3)

- WebSocket / realtime broadcast — M5
- Frontend code — M4
- Role-gated mutations (any guild member may mutate) — see spec §8.6
- Multi-stage support, undo, snap-to-grid — v2

## Exit Criteria

1. `npm test` passes (M1 + M2 + new M3 suites).
2. `npm start` brings up bot + Express (unchanged log lines from M2).
3. `scripts/m3-smoke.js` against a real signup + a real OAuth token:
   - `GET /api/state/<id>` returns merged roster, all `placed: false` on first call.
   - `POST /api/lineup/place` → 200; next `GET` shows that user `placed: true` with the sent x/y.
   - `POST /api/lineup/move` → 200; x/y updates.
   - `POST /api/lineup/remove` → 200; user back to `placed: false`, x/y null.
   - `GET /api/guild/members` returns a non-empty list.
4. Archived event (move file out of `src/events/active/`) → mutations return `404 event_not_found`.
