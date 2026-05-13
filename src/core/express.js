const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const logger = require('./logger');
const createTtlCache = require('../utils/ttlCache');
const createOAuthService = require('../services/oauth');
const createGuildMemberService = require('../services/guildMember');
const createAuthMiddleware = require('../middleware/auth');
const createTokenRoute = require('../routes/api/token');
const createMeRoute = require('../routes/api/me');
const createConcertPendingRoute = require('../routes/api/concert');
const createStateRoute = require('../routes/api/state');
const {
    createPlaceRoute,
    createMoveRoute,
    createRemoveRoute
} = require('../routes/api/lineup');
const createGuildMembersRoute = require('../routes/api/guildMembers');
const { pendingConcerts } = require('../features/lineup');
const { lineupStore } = require('../services/lineupStore');
const { getEventJSON } = require('../features/signup');

function buildApp({ client, config }) {
    const oauth = createOAuthService({
        fetch: globalThis.fetch,
        clientId: config.clientId,
        clientSecret: config.discordClientSecret,
        redirectUri: config.oauthRedirectUri,
        verifyCache: createTtlCache({ ttlMs: 60_000 })
    });

    const guildMember = createGuildMemberService({
        client,
        guildId: config.guildId,
        harmonianRoleId: config.harmonianRoleId,
        cache: createTtlCache({ ttlMs: 60_000 })
    });

    const authMiddleware = createAuthMiddleware({ oauth, guildMember, logger });

    const lineupLimiter = rateLimit({
        windowMs: 1000,
        limit: 30,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        keyGenerator: req => req.user?.id || req.ip,
        message: { error: 'rate_limited' }
    });

    const app = express();
    app.use(cors({
        origin: /\.discordsays\.com$/,
        methods: ['GET', 'POST'],
    }));
    app.use(express.json({ limit: '64kb' }));

    app.post('/api/token', createTokenRoute({ oauth, logger }));
    app.get('/api/me', authMiddleware, createMeRoute());
    app.get('/api/concert/pending', authMiddleware, createConcertPendingRoute({ pendingConcerts }));

    app.get('/api/state/:concertId', authMiddleware,
        createStateRoute({ getEventJSON, lineupStore }));

    app.post('/api/lineup/place', authMiddleware, lineupLimiter,
        createPlaceRoute({ getEventJSON, lineupStore }));
    app.post('/api/lineup/move', authMiddleware, lineupLimiter,
        createMoveRoute({ getEventJSON, lineupStore }));
    app.post('/api/lineup/remove', authMiddleware, lineupLimiter,
        createRemoveRoute({ getEventJSON, lineupStore }));

    app.get('/api/guild/members', authMiddleware,
        createGuildMembersRoute({ client, guildId: config.guildId }));

    app.use((err, req, res, _next) => {
        logger('express unhandled error:', err);
        res.status(500).json({ error: 'internal' });
    });

    return app;
}

function start({ client, config }) {
    const app = buildApp({ client, config });
    const port = config.expressPort || 3000;
    return new Promise((resolve, reject) => {
        const server = app.listen(port, '127.0.0.1', () => {
            logger(`Express listening on 127.0.0.1:${port}`);
            resolve(server);
        });
        server.on('error', reject);
    });
}

module.exports = { buildApp, start };
