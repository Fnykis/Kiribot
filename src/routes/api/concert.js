function createConcertPendingRoute({ pendingConcerts }) {
    return function concertPendingRoute(req, res) {
        const concertId = pendingConcerts.pop(req.user.id);
        if (!concertId) {
            return res.status(404).json({ error: 'no_pending_concert' });
        }
        return res.json({ concertId });
    };
}

module.exports = createConcertPendingRoute;
