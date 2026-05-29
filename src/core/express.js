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
const createVoiceMuteRoute = require('../routes/api/voiceMute');
const createVoiceLeaveRoute = require('../routes/api/voiceLeave');
const createShareLineupImageRoute = require('../routes/api/shareLineupImage');
const { lineupStore } = require('../services/lineupStore');
const { ch_LineupVoice } = require('./constants');
let instrumentList;
try { instrumentList = require('../data/instrumentList.json'); } catch { instrumentList = {}; }

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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

    app.post('/api/token', asyncRoute(createTokenRoute({ oauth, logger })));
    app.get('/api/me', authMiddleware, createMeRoute());
    app.get('/api/concerts', authMiddleware,
        createConcertsRoute({ activeDir: dir_EventsActive, parseEventDate, logger }));

    app.get('/api/state/:concertId', authMiddleware,
        asyncRoute(createStateRoute({ lineupStore })));

    app.post('/api/lineup/place', authMiddleware, lineupLimiter,
        asyncRoute(createPlaceRoute({
            lineupStore,
            instrumentList,
            isGuildMember: (userId) => guildMember.getMember(userId).then(m => m.found)
        })));
    app.post('/api/lineup/move', authMiddleware, lineupLimiter,
        asyncRoute(createMoveRoute({ lineupStore })));
    app.post('/api/lineup/remove', authMiddleware, lineupLimiter,
        asyncRoute(createRemoveRoute({ lineupStore })));

    const voiceMuteLimiter = rateLimit({
        windowMs: 1000,
        limit: 5,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        keyGenerator: req => req.user?.id || req.ip,
        message: { error: 'rate_limited' }
    });

    const getVoiceMember = async (userId) => {
        const guild = await client.guilds.fetch(config.guildId);
        return guild.members.fetch(userId);
    };

    app.post('/api/voice/mute', authMiddleware, voiceMuteLimiter,
        asyncRoute(createVoiceMuteRoute({
            getMember: getVoiceMember,
            lineupChannelId: ch_LineupVoice,
            logger
        })));

    app.post('/api/voice/leave', authMiddleware, voiceMuteLimiter,
        asyncRoute(createVoiceLeaveRoute({
            getMember: getVoiceMember,
            lineupChannelId: ch_LineupVoice,
            logger
        })));

    app.get('/api/guild/members', authMiddleware,
        asyncRoute(createGuildMembersRoute({
            client,
            guildId: config.guildId,
            harmonianRoleId: config.harmonianRoleId
        })));

    const shareImageLimiter = rateLimit({
        windowMs: 60_000,
        limit: 10,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        keyGenerator: req => req.user?.id || req.ip,
        message: { error: 'rate_limited' }
    });

    app.post('/api/lineup/share-image',
        authMiddleware,
        shareImageLimiter,
        express.raw({ type: 'image/png', limit: '8mb' }),
        asyncRoute(createShareLineupImageRoute({ client, lineupStore, logger })));

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
