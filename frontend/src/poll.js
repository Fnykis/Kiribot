const DEFAULT_INTERVAL_MS = 5000;

export function startPoll({
    fetchState,
    intervalMs = DEFAULT_INTERVAL_MS,
    getDraggingId,
    getDraggingPosition = () => null,
    getDraggingSidebarUserId = () => null,
    getIsSelecting = () => false,
    onUpdate,
    onError,
    visibilityRef = (typeof document !== 'undefined' ? document : { hidden: false })
}) {
    let stopped = false;

    async function tick() {
        if (stopped) return;
        if (visibilityRef.hidden) return;
        if (getDraggingSidebarUserId()) return;
        if (getDraggingId()) return;
        if (getIsSelecting()) return;
        try {
            const next = await fetchState();
            if (stopped) return;
            if (getDraggingSidebarUserId()) return;
            if (getDraggingId()) return;
            if (getIsSelecting()) return;
            const merged = mergeLivePosition(next, getDraggingId(), getDraggingPosition());
            onUpdate(merged);
        } catch (err) {
            if (onError) onError(err);
        }
    }

    const id = setInterval(tick, intervalMs);
    return { id, stop() { stopped = true; clearInterval(id); } };
}

export function stopPoll(handle) {
    if (handle) handle.stop();
}

function mergeLivePosition(next, draggingId, livePos) {
    if (!draggingId || !livePos || !next || !Array.isArray(next.lineup)) return next;
    return {
        ...next,
        lineup: next.lineup.map(e => e.userId === draggingId ? { ...e, position: livePos } : e)
    };
}
