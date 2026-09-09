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
const createWebSession = require('../services/webSession');
const createWebAuthMiddleware = require('../middleware/webAuth');
const createMemberGroupsService = require('../services/memberGroups');
const createArshjulStore = require('../services/arshjulStore');
const createWebTokenRoute = require('../routes/api/web/token');
const createWebLogoutRoute = require('../routes/api/web/logout');
const createWebMeRoute = require('../routes/api/web/me');
const createWebYearwheelRoute = require('../routes/api/web/yearwheel');
const { dir_EventsActive, hex_instr, hex_arbet, role_moderator } = require('./constants');
const { parseEventDate } = require('../utils/dateUtils');
const {
    createPlaceRoute,
    createMoveRoute,
    createMestreRoute,
    createRemoveRoute,
    createInstrumentsRoute,
    createChangeInstrumentRoute
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

// A generated secret (crypto.randomBytes(32).toString('base64url')) is 43+ chars. Anything
// shorter is either unset, a placeholder left over from config.example.json, or otherwise too
// weak to trust — treat it as absent rather than using it to sign session cookies.
const MIN_SESSION_SECRET_LENGTH = 32;
const isUsableSessionSecret = secret =>
    typeof secret === 'string' && secret.length >= MIN_SESSION_SECRET_LENGTH;

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

    // The /api/web/* routes are additive to the Activity API below. A missing or obviously
    // invalid config.sessionSecret must never take down the Activity's own routes, so this
    // fails soft: log and skip mounting the web routes rather than throwing during buildApp.
    const sessionSecretUsable = isUsableSessionSecret(config.sessionSecret);
    if (!sessionSecretUsable) {
        logger(config.sessionSecret
            ? 'config.sessionSecret looks invalid or is a placeholder (too short) — /api/web routes not mounted'
            : 'config.sessionSecret missing — /api/web routes not mounted');
    }
    const webSession = sessionSecretUsable ? createWebSession({ secret: config.sessionSecret }) : null;
    const webAuth = webSession ? createWebAuthMiddleware({ webSession }) : null;

    const memberGroups = createMemberGroupsService({
        client,
        guildId: config.guildId,
        hexInstr: hex_instr,
        hexArbet: hex_arbet,
        moderatorRoleId: role_moderator,
        cache: createTtlCache({ ttlMs: 60_000 })
    });

    const arshjulStore = createArshjulStore({ filePath: 'src/data/arshjul.json' });

    const lineupLimiter = rateLimit({
        windowMs: 1000,
        limit: 30,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        keyGenerator: req => req.user?.id || req.ip,
        message: { error: 'rate_limited' }
    });

    const app = express();
    // The Discord Activity origin (*.discordsays.com) never needs credentialed requests, and the
    // årshjul site origin always does (it relies on the kiribot_session cookie). Rather than a
    // static `credentials: true` that would apply to every allowed origin, decide both the origin
    // match and the credentials flag per-request so a lookalike or the Activity origin can never
    // pick up Access-Control-Allow-Credentials.
    app.use(cors((req, callback) => {
        const origin = req.headers.origin;
        const isDiscordActivity = typeof origin === 'string' && /\.discordsays\.com$/.test(origin);
        const isWebOrigin = typeof origin === 'string' && origin === config.webOrigin;
        callback(null, {
            origin: isDiscordActivity || isWebOrigin,
            methods: ['GET', 'POST'],
            credentials: isWebOrigin,
        });
    }));
    app.use(express.json({ limit: '64kb' }));

    app.post('/api/token', asyncRoute(createTokenRoute({ oauth, logger })));
    app.get('/api/me', authMiddleware, createMeRoute());
    app.get('/api/concerts', authMiddleware,
        createConcertsRoute({ activeDir: dir_EventsActive, parseEventDate, logger }));

    if (webSession) {
        app.post('/api/web/token', asyncRoute(createWebTokenRoute({
            oauth, webSession, redirectUri: config.webRedirectUri, logger
        })));
        app.post('/api/web/logout', asyncRoute(createWebLogoutRoute()));
        app.get('/api/web/me', webAuth, asyncRoute(createWebMeRoute({ memberGroups, logger })));
        app.get('/api/web/yearwheel/:roleId', webAuth,
            asyncRoute(createWebYearwheelRoute({ memberGroups, arshjulStore, logger })));
    }

    app.get('/api/state/:concertId', authMiddleware,
        asyncRoute(createStateRoute({ lineupStore })));

    app.get('/api/instruments', authMiddleware,
        createInstrumentsRoute({ instrumentList }));

    app.post('/api/lineup/place', authMiddleware, lineupLimiter,
        asyncRoute(createPlaceRoute({
            lineupStore,
            instrumentList,
            isGuildMember: (userId) => guildMember.getMember(userId).then(m => m.found)
        })));
    app.post('/api/lineup/move', authMiddleware, lineupLimiter,
        asyncRoute(createMoveRoute({ lineupStore })));
    app.post('/api/lineup/mestre', authMiddleware, lineupLimiter,
        asyncRoute(createMestreRoute({ lineupStore })));
    app.post('/api/lineup/remove', authMiddleware, lineupLimiter,
        asyncRoute(createRemoveRoute({ lineupStore })));

    app.post('/api/lineup/instrument', authMiddleware, lineupLimiter,
        asyncRoute(createChangeInstrumentRoute({ lineupStore, instrumentList })));

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
