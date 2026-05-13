const { mergeRoster } = require('../../features/lineup');

function createStateRoute({ getEventJSON, lineupStore }) {
    return async function stateRoute(req, res) {
        const concertId = req.params.concertId;
        const eventJson = getEventJSON(concertId);
        if (!eventJson) {
            return res.status(404).json({ error: 'event_not_found' });
        }
        const saved = await lineupStore.loadState(concertId);
        return res.json({
            concertId,
            name: eventJson.name,
            updatedAt: saved.updatedAt,
            participants: mergeRoster(eventJson, saved)
        });
    };
}

module.exports = createStateRoute;
