// Canvas pan/zoom viewport: shared state + pure math + transform application.
// z is the zoom factor on top of the CSS-fit stage (z=1 = fit-to-height baseline).

export const MIN_Z = 1;
export const MAX_Z = 3;

let _state = { panX: 0, panY: 0, z: 1 };

export function getViewport() { return { ..._state }; }
export function getZoom() { return _state.z; }
export function setViewport(s) { _state = { panX: s.panX, panY: s.panY, z: s.z }; }
export function resetViewport() { _state = { panX: 0, panY: 0, z: 1 }; }

export function clampZoom(z) {
    return Math.max(MIN_Z, Math.min(MAX_Z, z));
}

// Clamp pan so the stage edges cannot pass the viewport interior.
// If rendered content is smaller than the viewport on an axis, center it.
function clampAxis(pan, rendered, view) {
    if (rendered <= view) return (view - rendered) / 2;
    return Math.min(0, Math.max(view - rendered, pan));
}

export function clampPan(panX, panY, renderedW, renderedH, viewW, viewH) {
    return {
        panX: clampAxis(panX, renderedW, viewW),
        panY: clampAxis(panY, renderedH, viewH),
    };
}

// Given a new zoom, recompute pan so the focal screen point (relative to the
// viewport top-left) stays over the same canvas point. transform-origin is 0 0.
export function focalZoom(prev, focalX, focalY, nextZ) {
    const ratio = nextZ / prev.z;
    return {
        z: nextZ,
        panX: focalX - (focalX - prev.panX) * ratio,
        panY: focalY - (focalY - prev.panY) * ratio,
    };
}

// Apply the current (clamped) viewport to the stage element.
// viewportEl = the clipping container (#stage-container).
export function applyViewport(stageEl, viewportEl) {
    const vw = viewportEl.clientWidth;
    const vh = viewportEl.clientHeight;
    const renderedW = stageEl.clientWidth * _state.z;
    const renderedH = stageEl.clientHeight * _state.z;
    const { panX, panY } = clampPan(_state.panX, _state.panY, renderedW, renderedH, vw, vh);
    _state.panX = panX;
    _state.panY = panY;
    stageEl.style.transformOrigin = '0 0';
    stageEl.style.transform = `translate(${panX}px, ${panY}px) scale(${_state.z})`;
}

// Remove the transform (used when leaving mobile / desktop baseline).
export function clearViewportTransform(stageEl) {
    resetViewport();
    stageEl.style.transform = '';
    stageEl.style.transformOrigin = '';
}
