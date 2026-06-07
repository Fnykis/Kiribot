// Canvas pan/zoom viewport: shared state + pure math + transform application.
// z is the zoom factor on top of the CSS-fit stage (z=1 = fit-to-height baseline).
//
// Zoom range is dynamic. The CSS sizes the stage to fit-to-height, so z=1 is the
// MAX zoom (canvas height fills the viewport). MIN zoom is fit-to-width (canvas
// width fills the viewport) — z<1 on a portrait phone, computed from live dims.

export const MAX_Z = 1; // fit-to-height baseline (z=1 = stage height fills viewport)

let _state = { panX: 0, panY: 0, z: 1 };

export function getViewport() { return { ..._state }; }
export function getZoom() { return _state.z; }
export function setViewport(s) { _state = { panX: s.panX, panY: s.panY, z: s.z }; }
export function resetViewport() { _state = { panX: 0, panY: 0, z: 1 }; }

// Minimum zoom = z where the rendered stage width equals the viewport width
// (fit-to-width). stageWidthCss = stageEl.clientWidth (untransformed CSS width,
// which the CSS sets to the fit-to-height width). Capped at MAX_Z so a viewport
// wider than the canvas aspect can never yield min > max.
export function minZoom(stageWidthCss, viewWidth) {
    if (!stageWidthCss) return MAX_Z;
    return Math.min(viewWidth / stageWidthCss, MAX_Z);
}

export function clampZoom(z, minZ, maxZ = MAX_Z) {
    return Math.max(minZ, Math.min(maxZ, z));
}

// Live zoom bounds from element dimensions.
export function zoomBounds(stageEl, viewportEl) {
    return { minZ: minZoom(stageEl.clientWidth, viewportEl.clientWidth), maxZ: MAX_Z };
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
// prev.z must be non-zero; MIN_Z = 1 guarantees this in normal use.
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
    _state.panX = panX; // persist clamped values back to state
    _state.panY = panY;
    stageEl.style.transformOrigin = '0 0';
    stageEl.style.transform = `translate(${panX}px, ${panY}px) scale(${_state.z})`;
}

// Open at fit-to-width (whole canvas visible, vertical letterbox auto-centered
// by applyViewport's clampPan). Used for the initial mobile view.
export function fitToWidth(stageEl, viewportEl) {
    const { minZ } = zoomBounds(stageEl, viewportEl);
    _state = { panX: 0, panY: 0, z: minZ };
    applyViewport(stageEl, viewportEl);
}

// Re-clamp z to current bounds and re-apply (after resize / orientation change).
export function refit(stageEl, viewportEl) {
    const { minZ, maxZ } = zoomBounds(stageEl, viewportEl);
    _state.z = clampZoom(_state.z, minZ, maxZ);
    applyViewport(stageEl, viewportEl);
}

// Remove the transform (used when leaving mobile / desktop baseline).
export function clearViewportTransform(stageEl) {
    resetViewport();
    stageEl.style.transform = '';
    stageEl.style.transformOrigin = '';
}
