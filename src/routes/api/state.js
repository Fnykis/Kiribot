function createStateRoute({ lineupStore }) {
    return async function stateRoute(req, res) {
        const event = await lineupStore.loadEvent(req.params.concertId);
        if (!event) return res.status(404).json({ error: 'event_not_found' });
        return res.json(event);
    };
}

module.exports = createStateRoute;
