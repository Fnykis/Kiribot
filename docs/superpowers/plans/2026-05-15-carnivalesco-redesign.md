# Carnivalesco Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visual redesign of the frontend Discord Activity into a warm, energetic "Carnivalesco" aesthetic — amber-dark base, fire-orange accents, Righteous/Poppins typography, wooden stage floor, gradient instrument dots with coloured glow, and a spring placement-pulse animation.

**Architecture:** All hardcoded colour values replaced with CSS custom properties in `:root`. Typography loaded from Google Fonts. Visual changes isolated to `styles.css` with one targeted addition to `stage.js` (gradient fills, glow CSS var, newly-placed tracking) and a one-line heading addition to `picker.js`. No layout logic or API layer changes.

**Tech Stack:** Vanilla JS, vanilla CSS, Vite 5.4, `interact.js` v1.10, Vitest (testing)

---

## File Structure

| File | Change |
|------|--------|
| `frontend/index.html` | Add Google Fonts `<link>` preconnect + stylesheet |
| `frontend/src/styles.css` | Full redesign: design tokens, all colour/bg/typography/animation rules |
| `frontend/src/canvas/stage.js` | Add `INSTRUMENT_GLOW` map, `_prevUserIds` Set, gradient + glow + newly-placed class |
| `frontend/src/picker.js` | Add `<h1 class="picker-heading">` before the card list |

---

### Task 1: Google Fonts

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Add Google Fonts to `<head>`**

In `frontend/index.html`, replace:
```html
  <link rel="stylesheet" href="/src/styles.css" />
```
With:
```html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Righteous&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/src/styles.css" />
```

- [ ] **Step 2: Run tests**
```bash
cd frontend && npx vitest run
```
Expected: all pass

- [ ] **Step 3: Commit**
```bash
git add frontend/index.html
git commit -m "feat(frontend): add Righteous + Poppins Google Fonts"
```

---

### Task 2: CSS Design Tokens

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Insert `:root` token block as the very first rule in `styles.css`**

Prepend to the top of `frontend/src/styles.css` (before the existing `*, *::before, *::after` reset):
```css
:root {
    /* ── Carnivalesco colour tokens ── */
    --bg-base:        #140b00;
    --bg-raised:      #1f1100;
    --bg-surface:     #2a1800;
    --bg-hover:       #3a2200;
    --bg-stage:       #1c1000;
    --bg-canvas:      #2c1a08;
    --bg-modal-scrim: rgba(0, 0, 0, 0.65);
    --bg-modal-box:   #211300;

    --border:         rgba(255, 160, 60, 0.12);
    --border-strong:  rgba(255, 160, 60, 0.28);

    --text-primary:   #f5e6c8;
    --text-secondary: #c4a86e;
    --text-muted:     #7a6040;

    --accent:         #f97316;
    --accent-dim:     rgba(249, 115, 22, 0.14);
    --accent-glow:    rgba(249, 115, 22, 0.3);
    --accent-text:    #ffb27a;

    --selection-ring: rgba(249, 115, 22, 0.85);

    --font-heading: 'Righteous', sans-serif;
    --font-body:    'Poppins', sans-serif;
}

```

- [ ] **Step 2: Run tests**
```bash
cd frontend && npx vitest run
```
Expected: all pass

- [ ] **Step 3: Commit**
```bash
git add frontend/src/styles.css
git commit -m "feat(frontend): add Carnivalesco CSS design tokens"
```

---

### Task 3: Base layout backgrounds

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Replace `body` rule**

Replace:
```css
body {
    font-family: sans-serif;
    background: #1a1a2e;
    color: #eee;
    height: 100vh;
    overflow: hidden;
}
```
With:
```css
body {
    font-family: var(--font-body);
    background: var(--bg-base);
    color: var(--text-primary);
    height: 100vh;
    overflow: hidden;
}
```

- [ ] **Step 2: Replace `#loading` rule**

Replace:
```css
#loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-size: 1.2rem;
    color: #aaa;
}
```
With:
```css
#loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    font-size: 1.2rem;
    color: var(--text-muted);
}
```

- [ ] **Step 3: Replace `#planner-header` rule**

Replace:
```css
#planner-header {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: #16213e;
    border-bottom: 1px solid #0f3460;
    flex-shrink: 0;
}
```
With:
```css
#planner-header {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.75rem;
    background: var(--bg-raised);
    border-bottom: 1px solid var(--border-strong);
    flex-shrink: 0;
}
```

- [ ] **Step 4: Replace `#planner-title` rule**

Replace:
```css
#planner-title {
    font-size: 0.95rem;
    color: #ddd;
    white-space: nowrap;
    text-align: center;
}
```
With:
```css
#planner-title {
    font-family: var(--font-heading);
    font-size: 1.05rem;
    color: var(--text-primary);
    white-space: nowrap;
    text-align: center;
    letter-spacing: 0.03em;
}
```

- [ ] **Step 5: Replace `#stage-container` rule**

Replace:
```css
#stage-container {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f0f1a;
    overflow: hidden;
}
```
With:
```css
#stage-container {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-stage);
    overflow: hidden;
}
```

- [ ] **Step 6: Replace `.status-message` rules**

Replace:
```css
.status-message {
    padding: 2rem;
    font-size: 1rem;
    color: #aaa;
}

.status-message.error { color: #e74c3c; }
```
With:
```css
.status-message {
    padding: 2rem;
    font-size: 1rem;
    color: var(--text-muted);
}

.status-message.error { color: #e74c3c; }
```

- [ ] **Step 7: Run tests**
```bash
cd frontend && npx vitest run
```
Expected: all pass

- [ ] **Step 8: Commit**
```bash
git add frontend/src/styles.css
git commit -m "feat(frontend): carnivalesco base layout backgrounds and title"
```

---

### Task 4: Sidebar — backstage feel

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Replace `#sidebar` rule**

Replace:
```css
#sidebar {
    position: relative;
    width: 220px;
    flex-shrink: 0;
    background: #16213e;
    border-right: 1px solid #0f3460;
}
```
With:
```css
#sidebar {
    position: relative;
    width: 220px;
    flex-shrink: 0;
    background: var(--bg-raised);
    border-right: 1px solid var(--border-strong);
}
```

- [ ] **Step 2: Replace `#sidebar.dot-drag-active::after` rule**

Replace:
```css
#sidebar.dot-drag-active::after {
    content: 'Släpp här för att ta bort';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 1rem;
    font-size: 0.85rem;
    color: #e74c3c;
    border: 1px dashed rgba(192, 57, 43, 0.4);
    border-radius: 4px;
    background: rgba(15, 15, 30, 0.55);
    pointer-events: none;
}
```
With:
```css
#sidebar.dot-drag-active::after {
    content: 'Släpp här för att ta bort';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 1rem;
    font-size: 0.85rem;
    color: #e74c3c;
    border: 1px dashed rgba(231, 76, 60, 0.4);
    border-radius: 4px;
    background: rgba(20, 11, 0, 0.7);
    pointer-events: none;
}
```

- [ ] **Step 3: Replace `.available-section summary` rule**

Replace:
```css
.available-section summary {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8899aa;
    margin-bottom: 0.4rem;
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    user-select: none;
}
```
With:
```css
.available-section summary {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    font-weight: 600;
    margin-bottom: 0.4rem;
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    user-select: none;
}
```

- [ ] **Step 4: Replace `.available-row` rules**

Replace:
```css
.available-row {
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    cursor: grab;
    font-size: 0.9rem;
    background: #1e3050;
    margin-bottom: 0.25rem;
    user-select: none;
}

.available-row:hover { background: #274070; }
#sidebar.dot-drag-active .available-row:hover { background: #1e3050; }
```
With:
```css
.available-row {
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    cursor: grab;
    font-size: 0.875rem;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    margin-bottom: 0.25rem;
    user-select: none;
    color: var(--text-primary);
    transition: background 0.15s, border-color 0.15s;
}

.available-row:hover { background: var(--bg-hover); border-color: var(--border-strong); }
#sidebar.dot-drag-active .available-row:hover { background: var(--bg-surface); border-color: var(--border); }
```

- [ ] **Step 5: Run tests**
```bash
cd frontend && npx vitest run
```
Expected: all pass

- [ ] **Step 6: Commit**
```bash
git add frontend/src/styles.css
git commit -m "feat(frontend): carnivalesco sidebar backstage style"
```

---

### Task 5: Picker — event poster style

**Files:**
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/picker.js`

- [ ] **Step 1: Replace `#picker` rule and add `.picker-heading`**

Replace:
```css
#picker {
    padding: 1.5rem;
    height: 100vh;
    overflow-y: auto;
}
```
With:
```css
#picker {
    padding: 1.5rem;
    height: 100vh;
    overflow-y: auto;
    background: var(--bg-base);
}

.picker-heading {
    font-family: var(--font-heading);
    font-size: 1.6rem;
    color: var(--text-primary);
    text-align: center;
    margin-bottom: 1.5rem;
    letter-spacing: 0.04em;
}
```

- [ ] **Step 2: Replace `.picker-list` rule**

Replace:
```css
.picker-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
    max-width: 960px;
    margin: 0 auto;
}
```
With:
```css
.picker-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
    max-width: 960px;
    margin: 0 auto;
}
```

- [ ] **Step 3: Replace `.picker-card` and hover rules**

Replace:
```css
.picker-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    padding: 1rem;
    background: #1e3050;
    color: #eee;
    border: 1px solid #334;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
}

.picker-card:hover { background: #274070; }
```
With:
```css
.picker-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    padding: 1.25rem 1rem;
    background: var(--bg-surface);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-body);
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.picker-card:hover {
    background: var(--bg-hover);
    border-color: var(--border-strong);
    border-left-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-dim), 0 4px 16px rgba(0, 0, 0, 0.4);
}
```

- [ ] **Step 4: Replace `.picker-name`, `.picker-date`, `.picker-empty` rules**

Replace:
```css
.picker-name {
    font-size: 1rem;
    font-weight: 600;
}

.picker-date {
    font-size: 0.85rem;
    color: #aab;
}

.picker-empty {
    text-align: center;
    color: #aab;
    margin-top: 4rem;
    font-size: 1rem;
}
```
With:
```css
.picker-name {
    font-family: var(--font-heading);
    font-size: 1rem;
    color: var(--text-primary);
    letter-spacing: 0.02em;
}

.picker-date {
    font-size: 0.8rem;
    color: var(--text-secondary);
}

.picker-empty {
    text-align: center;
    color: var(--text-muted);
    margin-top: 4rem;
    font-size: 1rem;
}
```

- [ ] **Step 5: Add heading element in `picker.js`**

In `frontend/src/picker.js`, replace:
```js
export function renderPicker(container, concerts, onSelect) {
    container.replaceChildren();

    if (!concerts || concerts.length === 0) {
```
With:
```js
export function renderPicker(container, concerts, onSelect) {
    container.replaceChildren();

    const heading = document.createElement('h1');
    heading.className = 'picker-heading';
    heading.textContent = 'Välj konsert';
    container.appendChild(heading);

    if (!concerts || concerts.length === 0) {
```

- [ ] **Step 6: Run tests**
```bash
cd frontend && npx vitest run
```
Expected: all pass. If any picker test fails because it checks `container.firstChild` or `container.children[0]`, update that assertion to query by class (`.picker-card`, `.picker-empty`) instead of by index.

- [ ] **Step 7: Commit**
```bash
git add frontend/src/styles.css frontend/src/picker.js
git commit -m "feat(frontend): carnivalesco picker event poster style"
```

---

### Task 6: Stage canvas — wooden floor texture

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Replace `#stage` rule**

Replace:
```css
#stage {
    position: relative;
    width: min(calc(100vw - 220px), calc(100vh * (1000 / 600)));
    aspect-ratio: 1000 / 600;
    background: #1c2940;
    border: 1px solid #334;
    border-radius: 4px;
    --grid-step-x: 3.6%; /* 36/1000 */
    --grid-step-y: 6%;   /* 36/600  */
    background-image:
        repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 1px, transparent 1px var(--grid-step-y)),
        repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px var(--grid-step-x));
}
```
With:
```css
#stage {
    position: relative;
    width: min(calc(100vw - 220px), calc(100vh * (1000 / 600)));
    aspect-ratio: 1000 / 600;
    background-color: var(--bg-canvas);
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    --grid-step-x: 3.6%; /* 36/1000 */
    --grid-step-y: 6%;   /* 36/600  */
    background-image:
        /* Horizontal plank seams every 2 grid steps */
        repeating-linear-gradient(
            0deg,
            rgba(0, 0, 0, 0.28) 0 1px,
            rgba(0, 0, 0, 0.08) 1px 2px,
            transparent 2px calc(var(--grid-step-y) * 2)
        ),
        /* Subtle vertical grain bands */
        repeating-linear-gradient(
            90deg,
            rgba(255, 170, 60, 0.04) 0 calc(var(--grid-step-x) * 3),
            rgba(180, 100, 20, 0.04) calc(var(--grid-step-x) * 3) calc(var(--grid-step-x) * 6)
        ),
        /* Grid overlay — warm amber tint */
        repeating-linear-gradient(180deg, rgba(255, 200, 100, 0.07) 0 1px, transparent 1px var(--grid-step-y)),
        repeating-linear-gradient(90deg, rgba(255, 200, 100, 0.07) 0 1px, transparent 1px var(--grid-step-x));
}
```

- [ ] **Step 2: Update `.mestre-line` stroke colour**

Replace:
```css
.mestre-line {
    stroke: rgba(255, 255, 255, 0.2);
    stroke-dasharray: 0.8 0.5;
    stroke-width: 0.2;
    stroke-linecap: round;
}
```
With:
```css
.mestre-line {
    stroke: rgba(255, 180, 80, 0.22);
    stroke-dasharray: 0.8 0.5;
    stroke-width: 0.2;
    stroke-linecap: round;
}
```

- [ ] **Step 3: Run tests**
```bash
cd frontend && npx vitest run
```
Expected: all pass

- [ ] **Step 4: Commit**
```bash
git add frontend/src/styles.css
git commit -m "feat(frontend): carnivalesco wooden floor stage canvas texture"
```

---

### Task 7: Dot CSS — glow, labels, stale badge, placement animation

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Replace `.stage-dot` rule**

Replace:
```css
.stage-dot {
    position: absolute;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}
```
With:
```css
.stage-dot {
    position: absolute;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
        0 0 8px 2px var(--dot-glow, rgba(255, 255, 255, 0.2)),
        0 2px 8px rgba(0, 0, 0, 0.6);
    transition: box-shadow 0.2s;
}
```

- [ ] **Step 2: Replace `.stage-dot.selected` rule**

Replace:
```css
.stage-dot.selected {
    box-shadow: 0 0 0 3px rgba(100, 160, 255, 0.85), 0 2px 6px rgba(0, 0, 0, 0.5);
}
```
With:
```css
.stage-dot.selected {
    box-shadow:
        0 0 0 3px var(--selection-ring),
        0 0 12px 4px var(--dot-glow, rgba(255, 255, 255, 0.2)),
        0 2px 8px rgba(0, 0, 0, 0.6);
}
```

- [ ] **Step 3: Replace `.dot-label` rule**

Replace:
```css
.dot-label {
    position: absolute;
    top: 110%;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 0.7rem;
    color: #ddd;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.6);
    padding: 1px 4px;
    border-radius: 3px;
}
```
With:
```css
.dot-label {
    position: absolute;
    top: 110%;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 0.68rem;
    font-family: var(--font-body);
    color: var(--text-primary);
    pointer-events: none;
    background: rgba(20, 11, 0, 0.78);
    padding: 1px 5px;
    border-radius: 3px;
}
```

- [ ] **Step 4: Replace `.stage-dot .dot-instrument` rule**

Replace:
```css
.stage-dot .dot-instrument {
    position: absolute;
    bottom: 2px;
    right: 2px;
    font-size: 0.65rem;
    background: rgba(0,0,0,0.5);
    color: white;
    padding: 0 3px;
    border-radius: 4px;
    pointer-events: none;
}
```
With:
```css
.stage-dot .dot-instrument {
    position: absolute;
    bottom: 2px;
    right: 2px;
    font-size: 0.65rem;
    background: rgba(20, 11, 0, 0.68);
    color: var(--text-secondary);
    padding: 0 3px;
    border-radius: 4px;
    pointer-events: none;
}
```

- [ ] **Step 5: Replace `.stale-badge` rule**

Replace:
```css
.stale-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    background: #e74c3c;
    color: white;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
}
```
With:
```css
.stale-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 16px;
    height: 16px;
    background: #e67e22;
    color: #1a0800;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: stale-pulse 2s ease-in-out infinite;
}

@keyframes stale-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(230, 126, 34, 0.6); }
    50%       { box-shadow: 0 0 0 4px rgba(230, 126, 34, 0); }
}
```

- [ ] **Step 6: Append placement animation rules at the end of `styles.css`**

Add these rules at the very end of `frontend/src/styles.css`:
```css
@keyframes dot-place {
    0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 0.3; }
    65%  { transform: translate(-50%, -50%) scale(1.18); }
    100% { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
}

.stage-dot.newly-placed {
    animation: dot-place 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

@media (prefers-reduced-motion: reduce) {
    .stage-dot.newly-placed { animation: none; }
    .stale-badge            { animation: none; }
}
```

- [ ] **Step 7: Run tests**
```bash
cd frontend && npx vitest run
```
Expected: all pass

- [ ] **Step 8: Commit**
```bash
git add frontend/src/styles.css
git commit -m "feat(frontend): carnivalesco dot glow, labels, stale badge, placement animation"
```

---

### Task 8: Buttons, modals, radial menu, drag ghost

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Replace header button rules**

Replace:
```css
.back-btn {
    background: #1e3050;
    color: #eee;
    border: 1px solid #334;
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
}

.back-btn:hover { background: #274070; }

.sidebar-toggle-btn {
    background: #1e3050;
    color: #eee;
    border: 1px solid #334;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 1rem;
    cursor: pointer;
    line-height: 1;
}
.sidebar-toggle-btn:hover { background: #274070; }
```
With:
```css
.back-btn {
    background: var(--bg-surface);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
    font-family: var(--font-body);
    transition: background 0.15s, border-color 0.15s;
}

.back-btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }

.sidebar-toggle-btn {
    background: var(--bg-surface);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 1rem;
    cursor: pointer;
    line-height: 1;
    transition: background 0.15s, border-color 0.15s;
}
.sidebar-toggle-btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }
```

- [ ] **Step 2: Replace `.manual-add-btn` rules (fire-orange accent buttons)**

Replace:
```css
.manual-add-btn {
    background: #1e3050;
    color: #eee;
    border: 1px solid #334;
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
}
.manual-add-btn:hover { background: #274070; }
```
With:
```css
.manual-add-btn {
    background: var(--accent);
    color: #1a0800;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-body);
    transition: background 0.15s, box-shadow 0.15s;
}
.manual-add-btn:hover {
    background: #fb923c;
    box-shadow: 0 0 10px var(--accent-glow);
}
```

- [ ] **Step 3: Replace modal and modal-box rules**

Replace:
```css
.modal {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    align-items: center;
    justify-content: center;
    z-index: 100;
}
.manual-box {
    background: #16213e;
    color: #eee;
    padding: 1rem;
    border-radius: 8px;
    width: min(90vw, 360px);
    max-height: 80vh;
    overflow-y: auto;
    position: relative;
}
.manual-close {
    position: absolute;
    top: 0.25rem;
    right: 0.5rem;
    background: transparent;
    border: 0;
    color: #aab;
    font-size: 1.4rem;
    cursor: pointer;
}
.manual-search {
    width: 100%;
    padding: 0.5rem;
    background: #0f3460;
    color: #eee;
    border: 1px solid #334;
    border-radius: 6px;
    margin-top: 0.5rem;
}
.manual-results {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.5rem;
}
.manual-result, .manual-instrument {
    background: #1e3050;
    color: #eee;
    border: 1px solid #334;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
}
.manual-result:hover, .manual-instrument:hover { background: #274070; }
.manual-empty, .manual-instrument-heading {
    color: #aab;
    font-size: 0.85rem;
    margin: 0.25rem 0;
}
```
With:
```css
.modal {
    position: fixed;
    inset: 0;
    background: var(--bg-modal-scrim);
    align-items: center;
    justify-content: center;
    z-index: 100;
}
.manual-box {
    background: var(--bg-modal-box);
    color: var(--text-primary);
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    width: min(90vw, 360px);
    max-height: 80vh;
    overflow-y: auto;
    position: relative;
}
.manual-close {
    position: absolute;
    top: 0.25rem;
    right: 0.5rem;
    background: transparent;
    border: 0;
    color: var(--text-muted);
    font-size: 1.4rem;
    cursor: pointer;
}
.manual-search {
    width: 100%;
    padding: 0.5rem;
    background: var(--bg-surface);
    color: var(--text-primary);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    margin-top: 0.5rem;
    font-family: var(--font-body);
}
.manual-results {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.5rem;
}
.manual-result, .manual-instrument {
    background: var(--bg-surface);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    text-align: left;
    cursor: pointer;
    font-family: var(--font-body);
    transition: background 0.15s;
}
.manual-result:hover, .manual-instrument:hover { background: var(--bg-hover); }
.manual-empty, .manual-instrument-heading {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin: 0.25rem 0;
}
```

- [ ] **Step 4: Replace stall-upp-alla modal rules**

Replace:
```css
#stall-upp-alla-modal:not([hidden]) {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
}
.stua-wrap {
    background: #222;
    color: white;
    padding: 16px;
    border-radius: 8px;
    min-width: 320px;
    max-height: 80vh;
    overflow: auto;
}
.stua-row { display: flex; justify-content: space-between; padding: 4px 0; }
.stua-pick.selected { background: #2ecc71; color: black; }
.stua-ok:disabled { opacity: 0.5; cursor: not-allowed; }
```
With:
```css
#stall-upp-alla-modal:not([hidden]) {
    position: fixed;
    inset: 0;
    background: var(--bg-modal-scrim);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
}
.stua-wrap {
    background: var(--bg-modal-box);
    color: var(--text-primary);
    border: 1px solid var(--border-strong);
    padding: 16px;
    border-radius: 8px;
    min-width: 320px;
    max-height: 80vh;
    overflow: auto;
}
.stua-row { display: flex; justify-content: space-between; padding: 4px 0; }
.stua-pick.selected { background: var(--accent); color: #1a0800; font-weight: 600; }
.stua-ok:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 5: Replace radial menu rules**

Replace:
```css
.radial-menu {
    position: fixed;
    transform: translate(-50%, calc(-100% - 12px));
    display: flex;
    gap: 4px;
    background: rgba(25, 25, 35, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 999px;
    padding: 4px;
    z-index: 2000;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}
```
With:
```css
.radial-menu {
    position: fixed;
    transform: translate(-50%, calc(-100% - 12px));
    display: flex;
    gap: 4px;
    background: rgba(31, 17, 0, 0.96);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    padding: 4px;
    z-index: 2000;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 0 0 1px var(--border);
}
```

Replace:
```css
.radial-btn.active {
    color: #64a0ff;
    background: rgba(100, 160, 255, 0.15);
}
```
With:
```css
.radial-btn.active {
    color: var(--accent-text);
    background: var(--accent-dim);
}
```

Replace:
```css
.selection-rect {
    position: absolute;
    border: 1px dashed rgba(100, 160, 255, 0.8);
    background: rgba(100, 160, 255, 0.08);
    pointer-events: none;
    z-index: 10;
}
```
With:
```css
.selection-rect {
    position: absolute;
    border: 1px dashed rgba(249, 115, 22, 0.7);
    background: rgba(249, 115, 22, 0.06);
    pointer-events: none;
    z-index: 10;
}
```

Replace:
```css
.drag-ghost {
    position: fixed;
    pointer-events: none;
    z-index: 1000;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(40, 40, 40, 0.85);
    color: white;
    font-size: 0.9rem;
    white-space: nowrap;
    transform: translate(-50%, -50%);
}
```
With:
```css
.drag-ghost {
    position: fixed;
    pointer-events: none;
    z-index: 1000;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(42, 24, 0, 0.92);
    border: 1px solid var(--border-strong);
    color: var(--text-primary);
    font-size: 0.9rem;
    font-family: var(--font-body);
    white-space: nowrap;
    transform: translate(-50%, -50%);
}
```

- [ ] **Step 6: Run tests**
```bash
cd frontend && npx vitest run
```
Expected: all pass

- [ ] **Step 7: Commit**
```bash
git add frontend/src/styles.css
git commit -m "feat(frontend): carnivalesco buttons, modals, radial menu, drag ghost"
```

---

### Task 9: JS stage.js — gradient fills, glow CSS var, placement tracking

**Files:**
- Modify: `frontend/src/canvas/stage.js`

- [ ] **Step 1: Add `INSTRUMENT_GLOW` map and helper after `DEFAULT_COLOR`**

In `frontend/src/canvas/stage.js`, after:
```js
const DEFAULT_COLOR = '#95a5a6';
```
Add:
```js
const INSTRUMENT_GLOW = {
    '1:a':        'rgba(231, 76, 60, 0.55)',
    '2:a':        'rgba(230, 126, 34, 0.55)',
    '3:a':        'rgba(241, 196, 15, 0.55)',
    '4:a':        'rgba(46, 204, 113, 0.55)',
    'repenique':  'rgba(52, 152, 219, 0.55)',
    'skak/agogo': 'rgba(155, 89, 182, 0.55)',
    'tarol':      'rgba(26, 188, 156, 0.55)',
    'timbal':     'rgba(233, 30, 99, 0.55)',
};
const DEFAULT_GLOW = 'rgba(149, 165, 166, 0.45)';

function instrumentGlow(instrument) {
    return INSTRUMENT_GLOW[instrument] ?? DEFAULT_GLOW;
}

const _prevUserIds = new Set();
```

- [ ] **Step 2: Add `currentIds` and `newlyPlaced` at the top of `renderStage`**

In `renderStage`, after:
```js
    const lineup = event.lineup || [];
    stageEl.replaceChildren();
```
Add:
```js
    const currentIds = new Set(lineup.map(e => String(e.userId)));
    const newlyPlaced = new Set([...currentIds].filter(id => !_prevUserIds.has(id)));
```

- [ ] **Step 3: Replace flat `backgroundColor` with gradient fill + glow var in the real-dots loop**

In the "Real dots" section of `renderStage`, replace:
```js
        dot.style.backgroundColor = instrumentColor(entry.instrument);
```
With:
```js
        dot.style.backgroundColor = instrumentColor(entry.instrument);
        dot.style.backgroundImage = 'radial-gradient(circle at 35% 32%, rgba(255,255,255,0.32), rgba(0,0,0,0.18))';
        dot.style.setProperty('--dot-glow', instrumentGlow(entry.instrument));
```

- [ ] **Step 4: Add `newly-placed` class to new dots**

After `dot.dataset.displayName = entry.displayName;`, add:
```js
        if (newlyPlaced.has(String(entry.userId))) {
            dot.classList.add('newly-placed');
        }
```

- [ ] **Step 5: Update `_prevUserIds` at end of `renderStage`**

Just before the closing `}` of `renderStage` (after the last `stageEl.appendChild(dot)` call), add:
```js
    _prevUserIds.clear();
    for (const id of currentIds) _prevUserIds.add(id);
```

- [ ] **Step 6: Run tests**
```bash
cd frontend && npx vitest run
```
Expected: all pass. The existing stage.js tests cover `instrumentColor`, `isStale`, `edgeEndpoints`, and `abbreviateInstrument` — none touch `renderStage` rendering directly, so the new module-level state (`_prevUserIds`) does not break them.

- [ ] **Step 7: Commit**
```bash
git add frontend/src/canvas/stage.js
git commit -m "feat(frontend): carnivalesco dot gradients, glow, and placement pulse"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|-------------|------|
| Deep amber/brown dark base | Task 2 (tokens `--bg-base` → `#140b00`) |
| Fire-orange accents | Task 2 (`--accent: #f97316`), Task 8 (buttons) |
| Instrument dots keep colours + gradient fills | Task 9 Step 3 |
| Instrument dots glow | Task 7 (CSS `--dot-glow` var), Task 9 (JS sets var) |
| Righteous headings + Poppins body | Task 1 (fonts), Task 2 (tokens) |
| Concert picker → event poster cards | Task 5 |
| Stage canvas → wooden floor texture | Task 6 |
| Placed dots pulse on add | Task 7 (keyframes + `.newly-placed`), Task 9 (tracking Set + class) |
| Header shows concert name prominently | Task 3 (`#planner-title` Righteous font) |
| Sidebar backstage feel | Task 4 |
| `prefers-reduced-motion` respected | Task 7 Step 6 (`@media` block) |

### No placeholders — verified
All steps contain exact code. No TBD, TODO, or "similar to above" references.

### Type consistency — verified
- `instrumentGlow()` defined Task 9 Step 1, called Task 9 Step 3 ✅
- `_prevUserIds` defined Task 9 Step 1, written Task 9 Steps 2+5 ✅
- `newlyPlaced` defined Task 9 Step 2, read Task 9 Step 4 ✅
- `--dot-glow` CSS var consumed in `.stage-dot` box-shadow (Task 7 Step 1), set via JS (Task 9 Step 3) ✅
- `var(--accent)` defined Task 2, used Tasks 4, 5, 7, 8 ✅
