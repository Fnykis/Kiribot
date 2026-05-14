import interact from 'interactjs';
import { STAGE_W, STAGE_H, GRID_STEP } from './stage.js';

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

export function wireDrag({ stageEl, sidebarEl, trashEl, getEvent, setDraggingId,
                          setDraggingPosition, setDraggingSidebarUserId,
                          onPlace, onMove, onRemove, onError }) {
    setDraggingPosition = setDraggingPosition || (() => {});
    setDraggingSidebarUserId = setDraggingSidebarUserId || (() => {});
    // ---- Drag a placed dot inside the stage ----
    interact('.stage-dot', { context: stageEl }).draggable({
        listeners: {
            start(evt) {
                const userId = evt.target.dataset.userId;
                setDraggingId(userId);
                const rect = evt.target.getBoundingClientRect();
                evt.target.dataset.pointerOffX = evt.client.x - rect.left;
                evt.target.dataset.pointerOffY = evt.client.y - rect.top;
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;
            },
            move(evt) {
                const x = (parseFloat(evt.target.dataset.dragX) || 0) + evt.dx;
                const y = (parseFloat(evt.target.dataset.dragY) || 0) + evt.dy;
                evt.target.dataset.dragX = x;
                evt.target.dataset.dragY = y;
                evt.target.style.transform = `translate(${x}px, ${y}px)`;
                const pointerOffset = {
                    x: parseFloat(evt.target.dataset.pointerOffX) || 0,
                    y: parseFloat(evt.target.dataset.pointerOffY) || 0,
                };
                const liveRect = stageEl.getBoundingClientRect();
                const live = clientToStage(liveRect, evt.client.x, evt.client.y, pointerOffset);
                setDraggingPosition(live);
            },
            async end(evt) {
                const userId = evt.target.dataset.userId;
                const droppedOnTrash = evt.relatedTarget === trashEl;
                evt.target.style.transform = '';
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;
                try {
                    if (droppedOnTrash) {
                        await onRemove({ userId });
                    } else {
                        const pointerOffset = {
                            x: parseFloat(evt.target.dataset.pointerOffX) || 0,
                            y: parseFloat(evt.target.dataset.pointerOffY) || 0,
                        };
                        const rect = stageEl.getBoundingClientRect();
                        const raw = clientToStage(rect, evt.client.x, evt.client.y, pointerOffset);
                        const { x, y } = snapToGrid(raw.x, raw.y, GRID_STEP);
                        await onMove({ userId, x, y });
                    }
                } catch (err) {
                    if (onError) onError(err);
                } finally {
                    setDraggingId(null);
                    setDraggingPosition(null);
                }
            }
        }
    });

    // ---- Drag a sidebar row onto the stage ----
    let _sidebarGhost = null;

    interact('.available-row', { context: sidebarEl }).draggable({
        listeners: {
            start(evt) {
                evt.target.classList.add('dragging');
                setDraggingSidebarUserId(evt.target.dataset.userId);
                _sidebarGhost = document.createElement('div');
                _sidebarGhost.className = 'drag-ghost';
                _sidebarGhost.textContent = evt.target.textContent.trim();
                _sidebarGhost.style.left = `${evt.client.x}px`;
                _sidebarGhost.style.top = `${evt.client.y}px`;
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
                const insideStage = evt.client.x >= stageRect.left && evt.client.x <= stageRect.right &&
                                    evt.client.y >= stageRect.top  && evt.client.y <= stageRect.bottom;
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

    // ---- Dropzones ----
    interact(stageEl).dropzone({ accept: '.stage-dot, .available-row', overlap: 0.05 });
    interact(trashEl).dropzone({ accept: '.stage-dot', overlap: 0.5 });
}
