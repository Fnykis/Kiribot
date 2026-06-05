# Dot Instrument Change — Design

**Date:** 2026-06-05
**Status:** Approved (design)

## Goal

Let a user change the instrument of any placed dot on the lineup planner canvas via a
radial-menu action. Picking a new instrument updates the dot's **color** and **text label**
(the instrument abbreviation), persists the change to the backend, and leaves the **person's
name** untouched. The instrument list is sourced the same way the rest of the bot identifies
instruments: Discord roles whose color equals the instrument role color (`hex_instr`).

## Decisions

- **Persistence:** Persist to backend (new lineup-entry update). Survives reload.
- **List source:** All known instruments, fetched by role color from the backend.
- **Icon:** lucide `Drum`, via the existing `createLucideIcon()` pattern.
- **Picker UI:** Approach A — flyout list inside the existing radial-menu container.
- **Scope of change:** Only the placed **lineup** dot's `instrument` field changes. Signup
  group membership (`event.signups`) is untouched.

## Architecture

### 1. Backend

**New endpoint — `GET /api/instruments`**
- Filter `interaction.guild.roles.cache` by `role.hexColor === hex_instr` (`#e91e63`),
  matching the existing pattern at `src/interactions/buttons/profile.js:144`.
- Return sorted `[{ name, color }]` (color = role `hexColor`).
- Lives under `src/routes/api/` following existing route conventions.

**New endpoint — `POST /api/lineup/instrument`**
- Body: `{ concertId, userId, instrument }`.
- Find the matching entry in the event's `lineup` array and set its `instrument` field.
- Persist the event JSON (same write path as existing `move`/`place` routes).
- Does **not** modify `event.signups`.
- Returns the updated entry (or `{ ok: true }`), matching sibling route shapes.

### 2. Frontend data layer

**`frontend/src/dataSource.js`**
- `fetchInstruments(token)` → `GET /api/instruments` → `[{ name, color }]`.
- `changeInstrument(body, token)` → `POST /api/lineup/instrument`.
- Both branch through dev/prod like existing functions; `main.js` only calls
  `dataSource.*`, never raw `get`/`post`.

**`frontend/src/devData.js`** (mirror API shapes — CLAUDE.md rule)
- `fetchInstruments`: derive from `INSTRUMENT_COLORS` keys (name + hardcoded color).
- `changeInstrument`: mutate the in-memory lineup entry's `instrument`.

### 3. Radial menu — `frontend/src/canvas/drag.js`

- Add a **Drum** button (`createLucideIcon(Drum)`) next to the existing Mestre button in
  `showRadialMenu()`.
- Clicking Drum swaps the radial-menu pill content for a **vertical flyout list**:
  - One row per instrument: color swatch + name.
  - The dot's **current** instrument rendered **bold** ("original instrument").
  - Reuses the existing `.radial-menu` container and its positioning logic.
- Clicking a row:
  - Calls the `onChangeInstrument({ userId, instrument })` callback.
  - Persists via `dataSource.changeInstrument`.
  - Updates the dot live, then closes the menu.

### 4. Live dot update — `frontend/src/canvas/stage.js`

- Set `dot.dataset.instrument` to the new value.
- Recompute and apply dot color via `instrumentColor()`.
- Recompute and apply glow via the `--dot-glow` variable.
- Update `.dot-instrument` text via `abbreviateInstrument()`.
- Leave `.dot-label` (person name) unchanged.
- **Color source of truth:** dot rendering continues to use the `INSTRUMENT_COLORS` map; the
  flyout swatch uses the same `instrumentColor()` for canvas consistency.
- **Edge case:** an instrument role not present in `INSTRUMENT_COLORS` falls back to a default
  color (and a default/identity abbreviation). Acceptable; the 8 current instruments are all
  mapped.

### 5. Wiring — `frontend/src/main.js`

- Add an `onChangeInstrument` callback alongside the existing `onMestre`, passing it into the
  radial-menu setup and calling `dataSource.changeInstrument`.

## Styling — `frontend/src/styles.css`

- Add flyout list styles under the existing `.radial-menu` / `.radial-btn` block: row layout,
  color swatch, bold current-instrument row, scroll for overflow.

## Data shapes

```
GET /api/instruments  -> [ { name: "1:a", color: "#e91e63" }, ... ]
POST /api/lineup/instrument  body: { concertId, userId, instrument }
                              -> updated lineup entry | { ok: true }
```

## Testing

- Frontend: `cd frontend && npx vitest run`. Cover the flyout render (bold = current),
  instrument selection updating the dot dataset/color/abbrev, and `dataSource`/`devData`
  parity for the new functions.
- Manual: test **both** modes (CLAUDE.md rule) — dev mode (`npm run dev`, flag on) for the
  UI flow, and verify the real-API path compiles/works with the flag off. Auth/role-color
  fetching must be sanity-checked against the real server (dev mode fakes instruments).

## Out of scope (YAGNI)

- Moving the person between `signups` groups.
- Editing the person's display name.
- Adding/removing instruments from the Discord role set.
