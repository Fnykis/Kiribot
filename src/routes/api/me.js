function createMeRoute() {
    return function meRoute(req, res) {
        return res.json({
            id: req.user.id,
            displayName: req.user.displayName,
            hasHarmonian: req.user.hasHarmonian
        });
    };
}

module.exports = createMeRoute;
