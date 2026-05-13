const DEFAULT_INTERVAL_MS = 5000;

export function startPoll({
    fetchState,
    intervalMs = DEFAULT_INTERVAL_MS,
    getDraggingId,
    onUpdate,
    onError,
    visibilityRef = (typeof document !== 'undefined' ? document : { hidden: false })
}) {
    let lastEvent = null;
    let stopped = false;

    async function tick() {
        if (stopped) return;
        if (visibilityRef.hidden) return;
        try {
            const next = await fetchState();
            if (stopped) return;
            const merged = mergeDraggingPosition(lastEvent, next, getDraggingId());
            lastEvent = merged;
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

function mergeDraggingPosition(prev, next, draggingId) {
    if (!draggingId || !prev || !next || !Array.isArray(next.lineup)) return next;
    const prevEntry = (prev.lineup || []).find(e => e.userId === draggingId);
    if (!prevEntry) return next;
    return {
        ...next,
        lineup: next.lineup.map(e => e.userId === draggingId ? { ...e, position: prevEntry.position } : e)
    };
}
