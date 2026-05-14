# Lineup Bug Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Bug 1 — Cannot release sidebar names onto canvas

**Symptom:** Dragging a name from the sidebar works (ghost follows pointer), but releasing over the stage places nothing.

**Cause:** The sidebar-drop handler in `frontend/src/canvas/drag.js` gates placement on `evt.relatedTarget === stageEl`. interact.js sets `relatedTarget` from dropzone *element-rect* overlap. The dragged `.available-row` element never physically moves — only `_sidebarGhost` is repositioned — so it stays inside `#sidebar`, never overlaps `#stage`, and `relatedTarget` stays `null`. The handler returns early before calling `onPlace`.

**Fix:** In the `.available-row` `end` listener, drop the `relatedTarget` check. Instead hit-test the pointer (`evt.client.x` / `evt.client.y`) against `stageEl.getBoundingClientRect()`; if inside, proceed with `clientToStage` + `snapToGrid` + `onPlace`.

### Tasks

- [ ] Replace `if (evt.relatedTarget !== stageEl) return;` with a pointer-in-stage-rect check in `frontend/src/canvas/drag.js`
- [ ] Update / add a synthetic pointer-event test in `frontend/tests/canvas/drag.test.js` covering sidebar-row drop landing inside and outside the stage
- [ ] Manual verify: drag a sidebar name onto the canvas → dot appears at drop point

## Bug 2 — Grid too coarse + not square

**Symptom:** Grid cells are large and rectangular (wider than tall).

**Cause:**
- `GRID_STEP` in `frontend/src/canvas/stage.js` = `Math.round(DOT_SIZE * 1.1)` ≈ 48 stage units → ~20 columns across `STAGE_W` 1000.
- CSS in `frontend/src/styles.css` `#stage` uses one var `--grid-step: 4.8%` for both gradients. `%` resolves against width for the 90deg gradient and against height for the 0deg gradient. Stage is 1000×600 (non-square) → vertical step 48px, horizontal step 28.8px → rectangular cells.

**Fix:**
- Halve `GRID_STEP` to `24` (double the columns → ~41 across).
- Split the CSS var into per-axis values so cells render square: `--grid-step-x: 2.4%` (24/1000) on the 90deg gradient, `--grid-step-y: 4%` (24/600) on the 0deg gradient.
- Keep `GRID_STEP` and the CSS vars in sync — both derive from the same 24-unit step.

**Knock-on:** `snapToGrid` (drag.js) and `computeAutoPositions` (autoPlace.js) both consume `GRID_STEP`; halving it tightens snap granularity and auto-place spacing. Verify auto-place rows still fit `STAGE_W`.

### Tasks

- [ ] Set `GRID_STEP = 24` in `frontend/src/canvas/stage.js`
- [ ] Replace `--grid-step` with `--grid-step-x: 2.4%` / `--grid-step-y: 4%` in `#stage` and apply each to its matching gradient in `frontend/src/styles.css`
- [ ] Verify `computeAutoPositions` still lays out groups within `STAGE_W` at the smaller step; adjust `autoPlace.js` clamp if needed
- [ ] Manual verify: grid shows ~double the columns and cells are visually square

## Bug 3 — "Ställ upp alla" modal shows everyone, one row per instrument

**Symptom:** Modal lists every unplaced participant, and members with N instruments appear in N separate rows.

**Cause:** `frontend/src/sidebar/stallUppAlla.js` builds `userInstruments` for *all* valid+unplaced signups, then loops `for (... instruments) { for (... instrument) }` — emitting one `.stua-row` per (user, instrument) pair. No filter on instrument count.

**Fix:**
- Split `userInstruments` into two groups: `single` (`instruments.size === 1`) and `multi` (`instruments.size > 1`).
- **Single-instrument members:** not rendered. Their selection is pre-filled into `selections` automatically with their only instrument — they still get placed on OK.
- **Multi-instrument members:** rendered one row per user — name on the left, one `.stua-pick` button per instrument on the right (drop the inner per-instrument row loop; buttons live inside a single row).
- `updateOkState` compares `selections.size` against the total user count (single + multi) — single members count as already-selected, so OK enables once every multi member has a pick.
- No multiple instruments case: No modal will show since all members have their only instrument pre-filled into `selections`. Proceed as if the user clicked OK.

Functionality (selection → `onSubmit` payload) stays as-is.

### Tasks

- [ ] In `frontend/src/sidebar/stallUppAlla.js` split `userInstruments` into `single` / `multi` by `instruments.size`
- [ ] Pre-fill `selections` for every single-instrument member with their only instrument
- [ ] Render one `.stua-row` per *multi* user — name label + all instrument buttons on the right
- [ ] Point `updateOkState` at total user count (single pre-filled + multi picked)
- [ ] Update / add test in `frontend/tests/sidebar/stallUppAlla.test.js`: single-instrument members not rendered but present in payload; multi-instrument member appears once with all buttons
- [ ] Manual verify: only multi-instrument members listed (each once, instruments right); OK places single-instrument members too
