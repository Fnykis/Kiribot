import interact from 'interactjs';
import { Hand } from 'lucide';
import { STAGE_W, STAGE_H, GRID_STEP, instrumentColor, abbreviateInstrument, edgeEndpoints } from './stage.js';
import { getSelectedIds, setSelectedIds, clearSelectedIds, setIsSelecting, getMestres,
         getSelectedGhostIds, setSelectedGhostIds, clearSelectedGhostIds } from '../state.js';

function createLucideIcon(iconData, size = 18) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    for (const [tag, attrs] of iconData) {
        const el = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        svg.appendChild(el);
    }
    return svg;
}

export function snapToGrid(x, y, step) {
    return {
        x: Math.round(x / step) * step,
        y: Math.round(y / step) * step,
    };
}

export function clientToStage(rect, clientX, clientY, pointerOffset = { x: 0, y: 0 }) {
    const offX = (clientX - pointerOffset.x) - rect.left;
    const offY = (clientY - pointerOffset.y) - rect.top;
    const x = Math.round((offX / rect.width) * STAGE_W);
    const y = Math.round((offY / rect.height) * STAGE_H);
    return {
        x: Math.max(0, Math.min(STAGE_W, x)),
        y: Math.max(0, Math.min(STAGE_H, y))
    };
}

export function applySelectionVisual(stageEl) {
    const ids = getSelectedIds();
    stageEl.querySelectorAll('.stage-dot').forEach(dot => {
        dot.classList.toggle('selected', ids.has(dot.dataset.userId));
    });
    const gIds = getSelectedGhostIds();
    stageEl.querySelectorAll('.mestre-ghost').forEach(g => {
        g.classList.toggle('selected', gIds.has(g.getAttribute('data-mestre-user-id')));
    });
}

let _radialMenu = null;
let _radialOutsideHandler = null;

function dismissRadialMenu() {
    if (_radialMenu) { _radialMenu.remove(); _radialMenu = null; }
    if (_radialOutsideHandler) {
        document.removeEventListener('pointerdown', _radialOutsideHandler);
        _radialOutsideHandler = null;
    }
}

function showRadialMenu(userId, cx, cy, stageEl, onMestre) {
    dismissRadialMenu();
    _radialMenu = document.createElement('div');
    _radialMenu.className = 'radial-menu';
    _radialMenu.style.left = `${cx}px`;
    _radialMenu.style.top  = `${cy}px`;

    const mestreBtn = document.createElement('button');
    mestreBtn.className = getMestres().has(String(userId)) ? 'radial-btn active' : 'radial-btn';
    mestreBtn.title = 'Mestre';
    mestreBtn.appendChild(createLucideIcon(Hand));
    mestreBtn.addEventListener('click', () => {
        dismissRadialMenu();
        clearSelectedIds();
        applySelectionVisual(stageEl);
        if (onMestre) onMestre({ userId });
    });
    _radialMenu.appendChild(mestreBtn);
    document.body.appendChild(_radialMenu);

    _radialOutsideHandler = (e) => {
        if (_radialMenu && _radialMenu.contains(e.target)) return;
        dismissRadialMenu();
    };
    setTimeout(() => document.addEventListener('pointerdown', _radialOutsideHandler), 0);
}

export function wireDrag({ stageEl, sidebarEl, sidebarContentEl, getEvent, setDraggingId,
                          setDraggingPosition, setDraggingSidebarUserId,
                          onPlace, onMove, onMoveMany, onRemove, onMestre, onMestreMove, onError }) {
    setDraggingPosition = setDraggingPosition || (() => {});
    setDraggingSidebarUserId = setDraggingSidebarUserId || (() => {});

    function setMestreLine(svgLine, cx1, cy1, cx2, cy2, r) {
        const ep = edgeEndpoints(cx1, cy1, cx2, cy2, r);
        svgLine.setAttribute('x1', String(ep.x1));
        svgLine.setAttribute('y1', String(ep.y1));
        svgLine.setAttribute('x2', String(ep.x2));
        svgLine.setAttribute('y2', String(ep.y2));
    }

    // Update the origin endpoint (x1/y1) of the mestre line while dragging a real dot
    function updateMestreVisual(userId, dx, dy, dotEl) {
        const svgLine = stageEl.querySelector(`.mestre-line[data-mestre-user-id="${userId}"]`);
        if (!svgLine) return;
        const r = stageEl.getBoundingClientRect();
        const cx1 = parseFloat(dotEl.style.left) + (dx / r.width) * 100;
        const cy1 = parseFloat(dotEl.style.top)  + (dy / r.height) * 100;
        const cx2 = parseFloat(svgLine.getAttribute('data-cx2'));
        const cy2 = parseFloat(svgLine.getAttribute('data-cy2'));
        setMestreLine(svgLine, cx1, cy1, cx2, cy2, r);
        svgLine.setAttribute('data-cx1', String(cx1));
        svgLine.setAttribute('data-cy1', String(cy1));
    }

    let _groupDrag = false;
    let _ghostGroupDrag = false;

    // ---- Drag a placed dot inside the stage ----
    interact('.stage-dot', { context: stageEl }).draggable({
        listeners: {
            start(evt) {
                const userId = evt.target.dataset.userId;
                const selected = getSelectedIds();
                if (selected.size > 0 && !selected.has(userId)) {
                    clearSelectedIds();
                    applySelectionVisual(stageEl);
                }
                _groupDrag = getSelectedIds().size > 1 && getSelectedIds().has(userId);
                setDraggingId(userId);
                sidebarEl.classList.add('dot-drag-active');
                if (_groupDrag) {
                    stageEl.querySelectorAll('.stage-dot').forEach(dot => {
                        if (getSelectedIds().has(dot.dataset.userId)) {
                            dot.dataset.groupStartLeft = dot.style.left;
                            dot.dataset.groupStartTop  = dot.style.top;
                        }
                    });
                } else {
                    const rect = evt.target.getBoundingClientRect();
                    evt.target.dataset.pointerOffX = evt.client.x - rect.left;
                    evt.target.dataset.pointerOffY = evt.client.y - rect.top;
                }
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;
            },
            move(evt) {
                const x = (parseFloat(evt.target.dataset.dragX) || 0) + evt.dx;
                const y = (parseFloat(evt.target.dataset.dragY) || 0) + evt.dy;
                evt.target.dataset.dragX = x;
                evt.target.dataset.dragY = y;
                if (_groupDrag) {
                    stageEl.querySelectorAll('.stage-dot').forEach(dot => {
                        if (getSelectedIds().has(dot.dataset.userId)) {
                            dot.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
                            updateMestreVisual(dot.dataset.userId, x, y, dot);
                        }
                    });
                } else {
                    evt.target.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
                    updateMestreVisual(evt.target.dataset.userId, x, y, evt.target);
                }
                const liveRect = stageEl.getBoundingClientRect();
                const live = clientToStage(liveRect, evt.client.x, evt.client.y);
                setDraggingPosition(live);
            },
            async end(evt) {
                const userId = evt.target.dataset.userId;
                const totalDx = parseFloat(evt.target.dataset.dragX) || 0;
                const totalDy = parseFloat(evt.target.dataset.dragY) || 0;
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;
                const sidebarRect = sidebarEl.getBoundingClientRect();
                const droppedOnSidebar = evt.client.x >= sidebarRect.left && evt.client.x < sidebarRect.right &&
                                         evt.client.y >= sidebarRect.top  && evt.client.y < sidebarRect.bottom;
                try {
                    if (droppedOnSidebar) {
                        dismissRadialMenu();
                        if (_groupDrag) {
                            const userIds = [...getSelectedIds()];
                            stageEl.querySelectorAll('.stage-dot').forEach(dot => {
                                if (getSelectedIds().has(dot.dataset.userId)) dot.style.transform = '';
                            });
                            clearSelectedIds();
                            for (const uid of userIds) await onRemove({ userId: uid });
                        } else {
                            evt.target.style.transform = '';
                            await onRemove({ userId });
                        }
                    } else if (_groupDrag) {
                        const stageRect = stageEl.getBoundingClientRect();
                        const dxStage = (totalDx / stageRect.width)  * STAGE_W;
                        const dyStage = (totalDy / stageRect.height) * STAGE_H;
                        const moves = [];
                        stageEl.querySelectorAll('.stage-dot').forEach(dot => {
                            if (getSelectedIds().has(dot.dataset.userId)) {
                                const sx = parseFloat(dot.dataset.groupStartLeft) / 100 * STAGE_W;
                                const sy = parseFloat(dot.dataset.groupStartTop)  / 100 * STAGE_H;
                                const { x, y } = snapToGrid(sx + dxStage, sy + dyStage, GRID_STEP);
                                dot.style.left = `${(x / STAGE_W) * 100}%`;
                                dot.style.top  = `${(y / STAGE_H) * 100}%`;
                                dot.style.transform = '';
                                moves.push({ userId: dot.dataset.userId, x, y });
                            }
                        });
                        await onMoveMany(moves);
                    } else {
                        evt.target.style.transform = '';
                        const rect = stageEl.getBoundingClientRect();
                        const raw = clientToStage(rect, evt.client.x, evt.client.y);
                        const { x, y } = snapToGrid(raw.x, raw.y, GRID_STEP);
                        evt.target.style.left = `${(x / STAGE_W) * 100}%`;
                        evt.target.style.top  = `${(y / STAGE_H) * 100}%`;
                        await onMove({ userId, x, y });
                    }
                } catch (err) {
                    if (onError) onError(err);
                } finally {
                    _groupDrag = false;
                    setDraggingId(null);
                    setDraggingPosition(null);
                    sidebarEl.classList.remove('dot-drag-active');
                }
            }
        }
    });

    // ---- Drag a sidebar row onto the stage ----
    let _sidebarGhost = null;

    interact('.available-row', { context: sidebarContentEl }).draggable({
        listeners: {
            start(evt) {
                evt.target.classList.add('dragging');
                setDraggingSidebarUserId(evt.target.dataset.userId);
                const instrument = evt.target.dataset.instrument;
                const displayName = evt.target.textContent.trim();
                _sidebarGhost = document.createElement('div');
                _sidebarGhost.className = 'stage-dot ghost';
                _sidebarGhost.style.position = 'fixed';
                _sidebarGhost.style.pointerEvents = 'none';
                _sidebarGhost.style.zIndex = '1000';
                _sidebarGhost.style.left = `${evt.client.x}px`;
                _sidebarGhost.style.top = `${evt.client.y}px`;
                _sidebarGhost.style.backgroundColor = instrumentColor(instrument);
                const label = document.createElement('span');
                label.className = 'dot-label';
                label.textContent = displayName;
                _sidebarGhost.appendChild(label);
                const instLabel = document.createElement('span');
                instLabel.className = 'dot-instrument';
                instLabel.textContent = abbreviateInstrument(instrument);
                _sidebarGhost.appendChild(instLabel);
                document.body.appendChild(_sidebarGhost);
            },
            move(evt) {
                if (_sidebarGhost) {
                    _sidebarGhost.style.left = `${evt.client.x}px`;
                    _sidebarGhost.style.top = `${evt.client.y}px`;
                }
            },
            async end(evt) {
                evt.target.classList.remove('dragging');
                if (_sidebarGhost) { _sidebarGhost.remove(); _sidebarGhost = null; }
                setDraggingSidebarUserId(null);
                const stageRect = stageEl.getBoundingClientRect();
                const insideStage = evt.client.x >= stageRect.left && evt.client.x < stageRect.right &&
                                    evt.client.y >= stageRect.top  && evt.client.y < stageRect.bottom;
                if (!insideStage) return;
                const userId = evt.target.dataset.userId;
                const instrument = evt.target.dataset.instrument;
                const displayName = evt.target.textContent.trim();
                const raw = clientToStage(stageRect, evt.client.x, evt.client.y);
                const { x, y } = snapToGrid(raw.x, raw.y, GRID_STEP);
                try {
                    await onPlace({ userId, displayName, instrument, x, y, manuallyAdded: false });
                } catch (err) {
                    if (onError) onError(err);
                }
            }
        }
    });

    // ---- Drag a mestre ghost dot ----
    interact('.mestre-ghost', { context: stageEl }).draggable({
        listeners: {
            start(evt) {
                const userId = evt.target.getAttribute('data-mestre-user-id');
                const selGhosts = getSelectedGhostIds();
                _ghostGroupDrag = selGhosts.size > 1 && selGhosts.has(userId);
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;
                if (_ghostGroupDrag) {
                    stageEl.querySelectorAll('.mestre-ghost').forEach(g => {
                        if (selGhosts.has(g.getAttribute('data-mestre-user-id'))) {
                            g.dataset.ghostStartLeft = g.style.left;
                            g.dataset.ghostStartTop  = g.style.top;
                        }
                    });
                }
                setDraggingId(userId);
            },
            move(evt) {
                const x = (parseFloat(evt.target.dataset.dragX) || 0) + evt.dx;
                const y = (parseFloat(evt.target.dataset.dragY) || 0) + evt.dy;
                evt.target.dataset.dragX = x;
                evt.target.dataset.dragY = y;
                const r = stageEl.getBoundingClientRect();
                const selGhosts = getSelectedGhostIds();
                stageEl.querySelectorAll('.mestre-ghost').forEach(g => {
                    const gId = g.getAttribute('data-mestre-user-id');
                    if (!_ghostGroupDrag && g !== evt.target) return;
                    if (_ghostGroupDrag && !selGhosts.has(gId)) return;
                    g.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
                    const svgLine = stageEl.querySelector(`.mestre-line[data-mestre-user-id="${gId}"]`);
                    if (svgLine) {
                        const cx2 = parseFloat(g.style.left) + (x / r.width) * 100;
                        const cy2 = parseFloat(g.style.top)  + (y / r.height) * 100;
                        setMestreLine(svgLine,
                            parseFloat(svgLine.getAttribute('data-cx1')),
                            parseFloat(svgLine.getAttribute('data-cy1')),
                            cx2, cy2, r);
                    }
                });
            },
            async end(evt) {
                const totalDx = parseFloat(evt.target.dataset.dragX) || 0;
                const totalDy = parseFloat(evt.target.dataset.dragY) || 0;
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;
                const stageRect = stageEl.getBoundingClientRect();
                const selGhosts = getSelectedGhostIds();
                const ghosts = _ghostGroupDrag
                    ? [...stageEl.querySelectorAll('.mestre-ghost')].filter(g => selGhosts.has(g.getAttribute('data-mestre-user-id')))
                    : [evt.target];
                try {
                    for (const g of ghosts) {
                        const gId = g.getAttribute('data-mestre-user-id');
                        g.style.transform = '';
                        let x, y;
                        if (_ghostGroupDrag) {
                            const sx = parseFloat(g.dataset.ghostStartLeft) / 100 * STAGE_W;
                            const sy = parseFloat(g.dataset.ghostStartTop)  / 100 * STAGE_H;
                            ({ x, y } = snapToGrid(sx + (totalDx / stageRect.width) * STAGE_W,
                                                    sy + (totalDy / stageRect.height) * STAGE_H, GRID_STEP));
                        } else {
                            const raw = clientToStage(stageRect, evt.client.x, evt.client.y);
                            ({ x, y } = snapToGrid(raw.x, raw.y, GRID_STEP));
                        }
                        g.style.left = `${(x / STAGE_W) * 100}%`;
                        g.style.top  = `${(y / STAGE_H) * 100}%`;
                        const svgLine = stageEl.querySelector(`.mestre-line[data-mestre-user-id="${gId}"]`);
                        if (svgLine) {
                            const cx2 = (x / STAGE_W) * 100, cy2 = (y / STAGE_H) * 100;
                            setMestreLine(svgLine, parseFloat(svgLine.getAttribute('data-cx1')),
                                parseFloat(svgLine.getAttribute('data-cy1')), cx2, cy2, stageRect);
                            svgLine.setAttribute('data-cx2', String(cx2));
                            svgLine.setAttribute('data-cy2', String(cy2));
                        }
                        if (onMestreMove) await onMestreMove({ userId: gId, x, y });
                    }
                } catch (err) {
                    if (onError) onError(err);
                } finally {
                    _ghostGroupDrag = false;
                    setDraggingId(null);
                }
            }
        }
    });

    function selectAndMenu(userId) {
        clearSelectedIds(); clearSelectedGhostIds();
        setSelectedIds(new Set([userId]));
        applySelectionVisual(stageEl);
        const el = stageEl.querySelector(`.stage-dot[data-user-id="${userId}"]`);
        if (!el) return;
        const dr = el.getBoundingClientRect();
        setTimeout(() => {
            showRadialMenu(userId, dr.left + dr.width / 2, dr.top, stageEl, onMestre);
        }, 300);
    }

    // ---- Selection rectangle ----
    let _selStart = null;
    let _selRect  = null;
    let _selMoved = false;
    let _dotClickStart = null;

    stageEl.addEventListener('pointerdown', (evt) => {
        if (evt.button !== 0) return;
        const dot = evt.target.closest('.stage-dot');
        if (dot) {
            _dotClickStart = { userId: dot.dataset.userId, x: evt.clientX, y: evt.clientY };
            return;
        }
        if (evt.target.closest('.mestre-ghost')) return;
        dismissRadialMenu();
        _selMoved = false;
        _selStart = { x: evt.clientX, y: evt.clientY };
        setIsSelecting(true);
        _selRect = document.createElement('div');
        _selRect.className = 'selection-rect';
        _selRect.style.position = 'fixed';
        document.body.appendChild(_selRect);
        stageEl.setPointerCapture(evt.pointerId);
    });

    stageEl.addEventListener('pointermove', (evt) => {
        if (!_selStart) return;
        const dx = evt.clientX - _selStart.x;
        const dy = evt.clientY - _selStart.y;
        if (!_selMoved && Math.hypot(dx, dy) < 4) return;
        _selMoved = true;
        if (_selRect) {
            _selRect.style.left   = `${Math.min(_selStart.x, evt.clientX)}px`;
            _selRect.style.top    = `${Math.min(_selStart.y, evt.clientY)}px`;
            _selRect.style.width  = `${Math.abs(dx)}px`;
            _selRect.style.height = `${Math.abs(evt.clientY - _selStart.y)}px`;
        }
    });

    stageEl.addEventListener('pointerup', (evt) => {
        if (_dotClickStart) {
            const { userId, x: sx, y: sy } = _dotClickStart;
            _dotClickStart = null;
            if (Math.hypot(evt.clientX - sx, evt.clientY - sy) < 4) {
                selectAndMenu(userId);
            }
            return;
        }
        if (!_selStart) return;
        if (_selRect) { _selRect.remove(); _selRect = null; }
        setIsSelecting(false);
        if (!_selMoved) {
            clearSelectedIds(); clearSelectedGhostIds();
            applySelectionVisual(stageEl);
        } else {
            const selLeft   = Math.min(_selStart.x, evt.clientX);
            const selTop    = Math.min(_selStart.y, evt.clientY);
            const selRight  = Math.max(_selStart.x, evt.clientX);
            const selBottom = Math.max(_selStart.y, evt.clientY);
            const newIds = new Set();
            stageEl.querySelectorAll('.stage-dot').forEach(dot => {
                const dr = dot.getBoundingClientRect();
                if (dr.right >= selLeft && dr.left <= selRight &&
                    dr.bottom >= selTop  && dr.top  <= selBottom) {
                    newIds.add(dot.dataset.userId);
                }
            });
            const newGhostIds = new Set();
            stageEl.querySelectorAll('.mestre-ghost').forEach(g => {
                const dr = g.getBoundingClientRect();
                if (dr.right >= selLeft && dr.left <= selRight &&
                    dr.bottom >= selTop  && dr.top  <= selBottom) {
                    newGhostIds.add(g.getAttribute('data-mestre-user-id'));
                }
            });
            setSelectedIds(newIds);
            setSelectedGhostIds(newGhostIds);
            applySelectionVisual(stageEl);
            if (newIds.size === 1 && newGhostIds.size === 0) selectAndMenu([...newIds][0]);
        }
        _selStart = null;
        _selMoved = false;
    });

    // ---- Keyboard delete ----
    document.addEventListener('keydown', async (evt) => {
        if (evt.key !== 'Backspace' && evt.key !== 'Delete') return;
        if (evt.target.matches('input, textarea, select, [contenteditable]')) return;
        const ids = [...getSelectedIds()];
        if (ids.length === 0) return;
        dismissRadialMenu();
        clearSelectedIds();
        applySelectionVisual(stageEl);
        for (const userId of ids) {
            try { await onRemove({ userId }); } catch (err) { if (onError) onError(err); }
        }
    });

    // ---- Dropzones ----
    interact(stageEl).dropzone({ accept: '.stage-dot, .available-row', overlap: 0.05 });
}
