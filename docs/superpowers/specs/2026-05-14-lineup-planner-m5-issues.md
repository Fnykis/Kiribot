# Lineup Planner M5 — Issues & Design Notes (2026-05-14)

Observed after first live test. To be addressed in M5.1 / M6.

---

## Bug: Poll update yanks dragged dot back to server position

**Priority: Critical**

When dragging a placed dot, the 5s poll fires and merges the server event. The current drag-skip logic in `poll.js` (`mergeDraggingPosition`) preserves the *stored* position from the last event, not the *current cursor position*. So the dot visually snaps back to the server-stored position mid-drag, then jumps to the drop position on release.

**Fix:** During a drag, the dot's visual position is tracked via CSS `transform: translate(dx, dy)`. The poll merge should use the dot's *current rendered position* (computed from the base position + accumulated delta), not the stale stored position.

Concretely: `state.js` must track the live drag position (`draggingPosition: { x, y }` updated on every `interact` `move` event), and `poll.js`'s merge must substitute that instead of `prevEntry.position`.

---

## Bug: Poll update aborts sidebar drag (person returns to sidebar mid-drag)

**Priority: Critical**

Same root cause as above but on the sidebar drag path. When a sidebar row is being dragged, the poll fires, `renderAvailable` is called with the fresh event, and the DOM row being dragged is destroyed and recreated — losing the active drag. The interact.js drag then has no live element.

**Fix:** Skip `renderAvailable` (and `renderStage`) while any drag is in progress. `getDraggingId` already signals an active dot drag; extend the concept to also track sidebar drags (`draggingSidebarUserId`). Poll `onUpdate` checks both — if either is set, defer the render until the drag ends.

---

## Bug: Dot jumps on drag start (top-left anchor instead of pick-up point)

**Priority: High**

On drag start, the dot translates so its top-left corner is at the mouse pointer, then on release it centers at the drop point. Expected: dot stays visually where the user grabbed it (offset preserved throughout), and drops exactly where the user releases.

**Fix:** On `dragstart`, compute the pointer offset within the element (`pointerOffset = { x: evt.clientX - rect.left, y: evt.clientY - rect.top }`). During `move`, apply `transform` relative to that offset. On `end`, subtract the offset when computing the logical drop coordinate via `clientToStage`.

---

## Feature: Grid snap

**Priority: High**

The canvas should display a grid. Dots may only land on grid intersections. If dropped off-grid, snap to the nearest crossing.

**Grid size:** 120% of dot diameter. Read `--dot-size` CSS variable (or hardcode until design tokens are settled) and derive cell size from it.

**Implementation:**
- Draw grid in `canvas/stage.js` (SVG lines or CSS background-image with repeating linear-gradient — CSS approach is cheaper).
- In `drag.js` `end` handler: after `clientToStage`, round `x` and `y` to nearest grid step before calling `onMove` / `onPlace`.
- Same rounding applied in `clientToStage` or as a post-step in the caller.

---

## UX: Delete zone too small

**Priority: Medium**

The trash circle (56×56px, bottom-right) is too small to hit reliably. Increase to at least 80×80px, or change it to a full-width strip at the bottom of the stage.

---

## Feature: "Ställ upp alla" — place all members

**Priority: Medium (defer implementation details)**

Add a button at the top of the sidebar: **"Ställ upp alla"**.

**Flow:**
1. Clicking the button opens a modal/panel listing every signed-up member (ja/kanske).
2. Members with multiple instruments are shown once per instrument combination — name in a row, instrument buttons to the right (one per instrument the member signed up for). Exactly one instrument button must be selected per member before proceeding.
3. When all members have a selected instrument, the **"OK"** button becomes enabled.
4. On OK: place all members on the canvas following a role-based grid pattern (row assignments per instrument group — design TBD separately).

**Note:** Placement pattern / row mapping to be designed in a follow-up spec.

---

## Bug: Events with `active: false` appear in concert list

**Priority: Medium**

Events in `src/events/active/` that have `"active": false` in their JSON are still returned by `GET /api/concerts`. They should be excluded.

**Fix:** In the concerts route (likely `src/routes/api/concerts.js` or similar), filter out events where `event.active === false`. The fix in commit `5b27287` already addressed this for the picker list — verify it covers the route, not just the frontend filter.

---

## Bug: Sidebar drag item is invisible during drag

**Priority: High**

When dragging a member name from the sidebar, the dragged element is invisible until dropped on the canvas. The user has no visual feedback of what they're carrying.

**Fix:** On `dragstart` for `.available-row`, create a drag ghost — either a styled clone appended to `document.body` (moved manually on `pointermove`) or use interact.js's `hold` / clone approach. The ghost should look like a placed dot (circle with name), positioned at the cursor. Destroy ghost on `dragend`.

---

## Bug: Text is selectable — breaks drag UX

**Priority: High**

Member names, instrument labels, and other text in the app become selected during drag operations, causing visual noise and broken drag behavior on some browsers.

**Fix:** Add globally to `styles.css`:
```css
* {
    user-select: none;
    -webkit-user-select: none;
}
```
If any specific element needs selection (e.g. a text input), override with `user-select: text` on that element.

---

## Feature: Show instrument name inside dot

**Priority: Medium**

Each placed dot on the canvas should display the member's instrument (abbreviated if needed) inside or below the dot.

**Implementation:** In `canvas/stage.js`, add a `<span>` or second text node inside the dot element with `dot.dataset.instrument` value. Style to fit within the dot — consider a small font, truncation, or an abbreviation map per instrument key.

---

## Summary Table

| # | Issue | Priority | Area |
|---|-------|----------|------|
| 1 | Poll snaps dot to server position mid-drag | Critical | poll.js + drag.js |
| 2 | Poll aborts sidebar drag mid-drag | Critical | poll.js + main.js |
| 3 | Dot jumps on drag start (offset wrong) | High | drag.js |
| 4 | Grid + snap-to-grid | High | stage.js + drag.js |
| 5 | Delete zone too small | Medium | styles.css |
| 6 | "Ställ upp alla" button + placement flow | Medium | sidebar + api |
| 7 | `active: false` events appear in list | Medium | backend concerts route |
| 8 | Sidebar drag item invisible during drag | High | drag.js |
| 9 | Text selectable during drag | High | styles.css |
| 10 | Instrument name inside dot | Medium | stage.js |
