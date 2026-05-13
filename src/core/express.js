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
const createConcertsRoute = require('../routes/api/concerts');
const createStateRoute = require('../routes/api/state');
const { dir_EventsActive } = require('./constants');
const { parseEventDate } = require('../utils/dateUtils');
const {
    createPlaceRoute,
    createMoveRoute,
    createRemoveRoute
} = require('../routes/api/lineup');
const createGuildMembersRoute = require('../routes/api/guildMembers');
const { lineupStore } = require('../services/lineupStore');
let instrumentList;
try { instrumentList = require('../data/instrumentList.json'); } catch { instrumentList = {}; }

function buildApp({ client, config }) {
    const oauth = createOAuthService({
        fetch: globalThis.fetch,
        clientId: config.clientId,
        clientSecret: config.discordClientSecret,
        redirectUri: config.oauthRedirectUri,
        verifyCache: createTtlCache({ ttlMs: 60_000 }),
        logger
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
    app.get('/api/concerts', authMiddleware,
        createConcertsRoute({ activeDir: dir_EventsActive, parseEventDate, logger }));

    app.get('/api/state/:concertId', authMiddleware, createStateRoute({ lineupStore }));

    app.post('/api/lineup/place', authMiddleware, lineupLimiter,
        createPlaceRoute({
            lineupStore,
            instrumentList,
            isGuildMember: (userId) => guildMember.getMember(userId).then(m => m.found)
        }));
    app.post('/api/lineup/move', authMiddleware, lineupLimiter,
        createMoveRoute({ lineupStore }));
    app.post('/api/lineup/remove', authMiddleware, lineupLimiter,
        createRemoveRoute({ lineupStore }));

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
