import interact from 'interactjs';
import { STAGE_W, STAGE_H } from './stage.js';

export function clientToStage(rect, clientX, clientY) {
    const offX = clientX - rect.left;
    const offY = clientY - rect.top;
    const x = Math.round((offX / rect.width) * STAGE_W);
    const y = Math.round((offY / rect.height) * STAGE_H);
    return {
        x: Math.max(0, Math.min(STAGE_W, x)),
        y: Math.max(0, Math.min(STAGE_H, y))
    };
}

export function wireDrag({ stageEl, sidebarEl, trashEl, getEvent, setDraggingId,
                          onPlace, onMove, onRemove, onError }) {
    // ---- Drag a placed dot inside the stage ----
    interact('.stage-dot', { context: stageEl }).draggable({
        listeners: {
            start(evt) {
                const userId = evt.target.dataset.userId;
                setDraggingId(userId);
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;
            },
            move(evt) {
                const x = (parseFloat(evt.target.dataset.dragX) || 0) + evt.dx;
                const y = (parseFloat(evt.target.dataset.dragY) || 0) + evt.dy;
                evt.target.dataset.dragX = x;
                evt.target.dataset.dragY = y;
                evt.target.style.transform = `translate(${x}px, ${y}px)`;
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
                        const rect = stageEl.getBoundingClientRect();
                        const { x, y } = clientToStage(rect, evt.client.x, evt.client.y);
                        await onMove({ userId, x, y });
                    }
                } catch (err) {
                    if (onError) onError(err);
                } finally {
                    setDraggingId(null);
                }
            }
        }
    });

    // ---- Drag a sidebar row onto the stage ----
    interact('.available-row', { context: sidebarEl }).draggable({
        listeners: {
            start(evt) {
                evt.target.classList.add('dragging');
            },
            move(evt) {
                const x = (parseFloat(evt.target.dataset.dragX) || 0) + evt.dx;
                const y = (parseFloat(evt.target.dataset.dragY) || 0) + evt.dy;
                evt.target.dataset.dragX = x;
                evt.target.dataset.dragY = y;
                evt.target.style.transform = `translate(${x}px, ${y}px)`;
            },
            async end(evt) {
                evt.target.classList.remove('dragging');
                evt.target.style.transform = '';
                evt.target.dataset.dragX = 0;
                evt.target.dataset.dragY = 0;

                if (evt.relatedTarget !== stageEl) return; // only commit on stage drop
                const userId = evt.target.dataset.userId;
                const instrument = evt.target.dataset.instrument;
                const displayName = evt.target.textContent.trim();
                const rect = stageEl.getBoundingClientRect();
                const { x, y } = clientToStage(rect, evt.client.x, evt.client.y);
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
