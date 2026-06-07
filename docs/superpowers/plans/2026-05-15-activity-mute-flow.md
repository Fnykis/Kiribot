# Activity Auto-Mute & In-App Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let harmonians launch the lineup Activity via a Discord URL button; auto-Server-Mute them on voice-channel join; expose an in-Activity round toggle that mutes/unmutes via backend API; auto-unmute on leave; keep the Activity toggle synced with Discord-side mute changes.

**Architecture:** Discord.js v14 bot (`src/`) gains a voice-state listener for the lineup VC + a `/api/voice/mute` route that authenticates via existing Discord OAuth + harmonian gate. Bot generates Embedded App invites via Discord REST (`target_type=2`, `target_application_id`). Frontend Vite Activity gets a fixed round toggle in the top-right that posts to `/api/voice/mute` and subscribes to the Discord Embedded SDK `VOICE_STATE_UPDATE` event for two-way sync.

**Tech Stack:** Node 20+, discord.js v14, express 4, node:test, vitest (frontend), Discord Embedded App SDK.

---

## Constants in play

| Name | ID | Source |
|---|---|---|
| Activity (Embedded App) | `1503873080961794068` | spec |
| Lineup voice channel | `1504053251233021982` | spec |
| Harmonian role | `1139451726114590780` | already `config.json` → `harmonianRoleId` |

`GuildVoiceStates` intent already present in `src/core/client.js:9`. No portal change required.

Bot must hold `MuteMembers` perm in the guild — verify manually before merge.

---

## File Structure

**New:**
- `src/services/activityInvite.js` — wraps Discord REST POST `/channels/:id/invites` for embedded-app target.
- `src/routes/api/voiceMute.js` — POST `/api/voice/mute` { muted:bool }.
- `tests/services/activityInvite.test.js`
- `tests/routes/voiceMute.test.js`
- `frontend/src/muteToggle.js` — round button, subscribes to SDK VOICE_STATE_UPDATE, calls dataSource.
- `frontend/tests/muteToggle.test.js`

**Modified:**
- `src/core/constants.js` — add `ch_LineupVoice`, `activity_Lineup`.
- `src/events/voiceStateUpdate.js` — extend with auto-mute/unmute on `ch_LineupVoice`.
- `src/interactions/buttons/signup.js` — extend `btn_signupverktyg` ephemeral reply with extra button.
- `src/interactions/buttons/lineup.js` — NEW handler file for `btn_lineup_invite` (role-gated → ephemeral URL btn).
- `src/events/interactionCreate.js` — register new button handler.
- `src/core/express.js` — wire `/api/voice/mute` route.
- `frontend/src/dataSource.js` — add `setMute` branch.
- `frontend/src/devData.js` — stub `setMute`.
- `frontend/src/api.js` — already has `post`; reuse.
- `frontend/src/main.js` — mount toggle, expose SDK to it.

---

## Task 1: Constants

**Files:**
- Modify: `src/core/constants.js`

- [ ] **Step 1: Add constants and exports**

In `src/core/constants.js`, after the existing `ch_*` block:

```js
const ch_LineupVoice = '1504053251233021982';      // The voice channel "lineup"
const activity_Lineup = '1503873080961794068';     // Embedded App ID for the lineup Activity
```

Add `ch_LineupVoice` and `activity_Lineup` to the `module.exports = { ... }` list (preserve existing ordering style).

- [ ] **Step 2: Commit**

```bash
git add src/core/constants.js
git commit -m "feat(constants): add lineup voice channel and activity ID"
```

---

## Task 2: Activity invite service (TDD)

Generates an Embedded App invite. Pure function over a `restPost` dependency so tests don't hit Discord.

**Files:**
- Create: `src/services/activityInvite.js`
- Test: `tests/services/activityInvite.test.js`

- [ ] **Step 1: Write the failing test**

`tests/services/activityInvite.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const createActivityInviteService = require('../../src/services/activityInvite');

test('createActivityInvite: posts target_type=2 invite to correct channel', async () => {
    const calls = [];
    const restPost = async (route, body) => {
        calls.push({ route, body });
        return { code: 'abc123', url: 'https://discord.gg/abc123' };
    };
    const svc = createActivityInviteService({
        restPost,
        channelId: 'CHAN',
        applicationId: 'APP'
    });
    const result = await svc.create();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].route, '/channels/CHAN/invites');
    assert.deepEqual(calls[0].body, {
        max_age: 604800,
        max_uses: 0,
        target_type: 2,
        target_application_id: 'APP'
    });
    assert.equal(result.url, 'https://discord.gg/abc123');
});

test('createActivityInvite: propagates rest errors', async () => {
    const restPost = async () => { throw new Error('boom'); };
    const svc = createActivityInviteService({
        restPost, channelId: 'C', applicationId: 'A'
    });
    await assert.rejects(() => svc.create(), /boom/);
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test -- --test-name-pattern="createActivityInvite"
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/services/activityInvite.js`:

```js
function createActivityInviteService({ restPost, channelId, applicationId }) {
    return {
        async create() {
            return restPost(`/channels/${channelId}/invites`, {
                max_age: 604800,
                max_uses: 0,
                target_type: 2,
                target_application_id: applicationId
            });
        }
    };
}

module.exports = createActivityInviteService;
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- --test-name-pattern="createActivityInvite"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/activityInvite.js tests/services/activityInvite.test.js
git commit -m "feat(services): add activityInvite service for embedded app invites"
```

---

## Task 3: Add "Öppna lineup" button to Signupverktyg ephemeral reply

**Files:**
- Modify: `src/interactions/buttons/signup.js:199-205`

- [ ] **Step 1: Extend the action row**

Locate the block in `src/interactions/buttons/signup.js` around line 199 that builds `btn_newSignup` + `row1_buttons`. Replace the row builder with:

```js
const btn_newSignup = new ButtonBuilder()
    .setCustomId('btn_newSignup')
    .setLabel('Skapa ny signup')
    .setStyle(ButtonStyle.Primary);

const btn_lineupInvite = new ButtonBuilder()
    .setCustomId('btn_lineup_invite')
    .setLabel('Öppna lineup')
    .setStyle(ButtonStyle.Secondary);

const row1_buttons = new ActionRowBuilder()
    .addComponents(btn_newSignup, btn_lineupInvite);
```

- [ ] **Step 2: Smoke-load**

```bash
node -e "require('./src/interactions/buttons/signup.js')"
```
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/interactions/buttons/signup.js
git commit -m "feat(signupverktyg): add Öppna lineup button next to Skapa ny signup"
```

---

## Task 4: Button handler `btn_lineup_invite`

Generates an embedded-app invite and replies ephemerally with a URL button (URL buttons are the only kind that force client navigation).

**Files:**
- Create: `src/interactions/buttons/lineup.js`
- Modify: `src/events/interactionCreate.js`

- [ ] **Step 1: Read existing handler pattern**

Read `src/interactions/buttons/info.js` end-to-end to copy the `matches` / `execute` export shape used by `interactionCreate.js`.

- [ ] **Step 2: Implement the handler**

`src/interactions/buttons/lineup.js`:

```js
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    Routes
} = require('discord.js');
const createActivityInviteService = require('../../services/activityInvite');
const { ch_LineupVoice, activity_Lineup } = require('../../core/constants');
const { harmonianRoleId } = require('../../../config.json');
const logActivity = require('../../core/logger').default || require('../../core/logger');

function matches(customId) {
    return customId === 'btn_lineup_invite';
}

async function execute(interaction) {
    const member = interaction.member;
    const hasHarmonian = member?.roles?.cache?.has(harmonianRoleId);
    if (!hasHarmonian) {
        return interaction.reply({
            content: 'Du behöver rollen Harmonian för att öppna lineup.',
            flags: MessageFlags.Ephemeral
        });
    }

    const svc = createActivityInviteService({
        restPost: (route, body) => interaction.client.rest.post(route, { body }),
        channelId: ch_LineupVoice,
        applicationId: activity_Lineup
    });

    let invite;
    try {
        invite = await svc.create();
    } catch (err) {
        logActivity(`btn_lineup_invite: invite generation failed: ${err.message}`);
        return interaction.reply({
            content: 'Kunde inte skapa lineup-länk. Försök igen.',
            flags: MessageFlags.Ephemeral
        });
    }

    const urlBtn = new ButtonBuilder()
        .setLabel('Öppna lineup')
        .setStyle(ButtonStyle.Link)
        .setURL(invite.url);

    return interaction.reply({
        content: 'Klicka för att starta lineup-aktiviteten:',
        components: [new ActionRowBuilder().addComponents(urlBtn)],
        flags: MessageFlags.Ephemeral
    });
}

module.exports = { matches, execute };
```

Note: confirm the logger import shape matches other handler files (see `src/interactions/buttons/info.js`). If they use `const logActivity = require('../../core/logger');`, drop the `.default` fallback.

- [ ] **Step 3: Register handler in interactionCreate**

Open `src/events/interactionCreate.js`. Find the array/list of imported button handler modules and add `require('../interactions/buttons/lineup')` alongside the others in the same shape (alphabetical or existing order).

- [ ] **Step 4: Smoke-load**

```bash
node -e "require('./src/interactions/buttons/lineup.js'); require('./src/events/interactionCreate.js')"
```
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/interactions/buttons/lineup.js src/events/interactionCreate.js
git commit -m "feat(interactions): handle btn_lineup_invite with role-gated ephemeral URL button"
```

---

## Task 5: Auto-mute/unmute in voiceStateUpdate

Extend `src/events/voiceStateUpdate.js` — keep the existing 14-day chat-cleanup logic, add a parallel mute branch.

**Files:**
- Modify: `src/events/voiceStateUpdate.js`

- [ ] **Step 1: Read current file**

```bash
sed -n '1,46p' src/events/voiceStateUpdate.js
```

- [ ] **Step 2: Extend execute() with mute branches**

Add to the top of `src/events/voiceStateUpdate.js`:

```js
const { ch_LineupVoice } = require('../core/constants');
const logActivity = require('../core/logger');
```

(If the project's `logger` default-export convention differs, copy what `src/events/ready.js` uses.)

Inside `execute(oldState, newState)`, **before** the existing chat-cleanup block, add:

```js
const joinedLineup = newState.channelId === ch_LineupVoice && oldState.channelId !== ch_LineupVoice;
const leftLineup = oldState.channelId === ch_LineupVoice && newState.channelId !== ch_LineupVoice;

if (joinedLineup) {
    try {
        await newState.setMute(true, 'lineup-activity entry');
    } catch (err) {
        logActivity(`voiceStateUpdate: failed to mute ${newState.id}: ${err.message}`);
    }
}

if (leftLineup) {
    try {
        await oldState.setMute(false, 'lineup-activity exit');
    } catch (err) {
        logActivity(`voiceStateUpdate: failed to unmute ${oldState.id}: ${err.message}`);
    }
}
```

`setMute(false)` on a non-muted member is a no-op — safe even if user wasn't auto-muted.

- [ ] **Step 3: Smoke-load**

```bash
node -e "require('./src/events/voiceStateUpdate.js')"
```
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/events/voiceStateUpdate.js
git commit -m "feat(voice): auto server-mute on lineup VC join, unmute on leave"
```

---

## Task 6: Crash-recovery unmute sweep

If the bot restarts while someone is server-muted-by-bot in a non-lineup channel, they'd stay muted. Add a startup sweep.

**Files:**
- Modify: `src/events/ready.js`

- [ ] **Step 1: Read existing ready handler**

```bash
sed -n '1,60p' src/events/ready.js
```

- [ ] **Step 2: Add sweep**

At the end of `ready.js` `execute()` (or wherever startup tasks fire), add:

```js
try {
    const { ch_LineupVoice } = require('../core/constants');
    const { guildId } = require('../core/constants');
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
        const members = await guild.members.fetch();
        for (const m of members.values()) {
            if (m.voice?.serverMute && m.voice.channelId !== ch_LineupVoice) {
                await m.voice.setMute(false, 'lineup-activity startup sweep').catch(() => {});
            }
        }
    }
} catch (err) {
    console.error('ready: lineup unmute sweep failed', err);
}
```

(Adapt `client`/`guild` access to whatever shape `ready.js` already uses.)

- [ ] **Step 3: Smoke-load**

```bash
node -e "require('./src/events/ready.js')"
```

- [ ] **Step 4: Commit**

```bash
git add src/events/ready.js
git commit -m "feat(voice): clear stale server-mutes outside lineup VC on startup"
```

---

## Task 7: POST /api/voice/mute route (TDD)

Backend toggle endpoint. Verifies the caller is currently in the lineup VC, then `setMute(req.body.muted)`.

**Files:**
- Create: `src/routes/api/voiceMute.js`
- Test: `tests/routes/voiceMute.test.js`

- [ ] **Step 1: Write the failing test**

`tests/routes/voiceMute.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const createVoiceMuteRoute = require('../../src/routes/api/voiceMute');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function makeMember({ channelId, setMute }) {
    return {
        voice: {
            channelId,
            setMute: setMute || (async () => {})
        }
    };
}

test('voiceMute: 400 if muted not boolean', async () => {
    const handler = createVoiceMuteRoute({
        getMember: async () => makeMember({ channelId: 'LU' }),
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: 'yes' } }, res);
    assert.equal(res.statusCode, 400);
});

test('voiceMute: 409 if user not in lineup VC', async () => {
    const handler = createVoiceMuteRoute({
        getMember: async () => makeMember({ channelId: 'OTHER' }),
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: true } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.error, 'not_in_lineup_vc');
});

test('voiceMute: 200 + calls setMute(true)', async () => {
    const calls = [];
    const handler = createVoiceMuteRoute({
        getMember: async () => makeMember({
            channelId: 'LU',
            setMute: async (m, reason) => { calls.push({ m, reason }); }
        }),
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: true } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { muted: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].m, true);
});

test('voiceMute: 200 + setMute(false)', async () => {
    const calls = [];
    const handler = createVoiceMuteRoute({
        getMember: async () => makeMember({
            channelId: 'LU',
            setMute: async (m) => { calls.push(m); }
        }),
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: false } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [false]);
});

test('voiceMute: 500 if setMute throws', async () => {
    const handler = createVoiceMuteRoute({
        getMember: async () => makeMember({
            channelId: 'LU',
            setMute: async () => { throw new Error('discord_down'); }
        }),
        lineupChannelId: 'LU'
    });
    const res = mockRes();
    await handler({ user: { id: 'u1' }, body: { muted: true } }, res);
    assert.equal(res.statusCode, 500);
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test -- --test-name-pattern="voiceMute"
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/routes/api/voiceMute.js`:

```js
function createVoiceMuteRoute({ getMember, lineupChannelId, logger }) {
    return async function voiceMuteRoute(req, res) {
        const { muted } = req.body || {};
        if (typeof muted !== 'boolean') {
            return res.status(400).json({ error: 'invalid_body' });
        }
        let member;
        try {
            member = await getMember(req.user.id);
        } catch (err) {
            if (logger) logger('voiceMute: getMember failed', err);
            return res.status(500).json({ error: 'member_lookup_failed' });
        }
        if (!member || !member.voice || member.voice.channelId !== lineupChannelId) {
            return res.status(409).json({ error: 'not_in_lineup_vc' });
        }
        try {
            await member.voice.setMute(muted, 'activity toggle');
        } catch (err) {
            if (logger) logger('voiceMute: setMute failed', err);
            return res.status(500).json({ error: 'mute_failed' });
        }
        return res.json({ muted });
    };
}

module.exports = createVoiceMuteRoute;
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- --test-name-pattern="voiceMute"
```
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/voiceMute.js tests/routes/voiceMute.test.js
git commit -m "feat(api): POST /api/voice/mute toggles server mute in lineup VC"
```

---

## Task 8: Wire route into express

**Files:**
- Modify: `src/core/express.js`

- [ ] **Step 1: Add import + route**

In `src/core/express.js`:

After existing route imports, add:

```js
const createVoiceMuteRoute = require('../routes/api/voiceMute');
const { ch_LineupVoice } = require('./constants');
```

Inside `buildApp`, after the existing `/api/lineup/*` route registrations, add:

```js
const voiceMuteLimiter = rateLimit({
    windowMs: 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: req => req.user?.id || req.ip,
    message: { error: 'rate_limited' }
});

app.post('/api/voice/mute', authMiddleware, voiceMuteLimiter,
    asyncRoute(createVoiceMuteRoute({
        getMember: async (userId) => {
            const guild = await client.guilds.fetch(config.guildId);
            return guild.members.fetch(userId);
        },
        lineupChannelId: ch_LineupVoice,
        logger
    })));
```

- [ ] **Step 2: Smoke-build**

```bash
node -e "require('./src/core/express.js').buildApp({ client: { guilds: { fetch: async()=>({members:{fetch:async()=>null}}) } }, config: require('./config.json') })"
```
Expected: no throw.

- [ ] **Step 3: Commit**

```bash
git add src/core/express.js
git commit -m "feat(api): wire /api/voice/mute with rate limiter and auth gate"
```

---

## Task 9: dataSource + devData branch

**Files:**
- Modify: `frontend/src/dataSource.js`
- Modify: `frontend/src/devData.js`

- [ ] **Step 1: Add setMute to dataSource**

In `frontend/src/dataSource.js`, append after `removeMember`:

```js
export async function setMute(muted, token) {
    return isDevMode ? dev().setMute(muted) : post('/api/voice/mute', { muted }, token);
}
```

- [ ] **Step 2: Stub in devData**

In `frontend/src/devData.js`, locate the object returned by `createDevData` and add:

```js
setMute: async (muted) => {
    console.log('[dev] setMute', muted);
    return { muted };
},
```

- [ ] **Step 3: Smoke-test the import**

```bash
cd frontend && npx vitest run tests/devData.test.js
```
Expected: existing tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/dataSource.js frontend/src/devData.js
git commit -m "feat(frontend): add setMute to dataSource with dev-mode stub"
```

---

## Task 10: Frontend mute toggle component (TDD)

Round button, top-right, fixed position. Owns local UI state. Accepts SDK + dataSource via constructor → testable without DOM/Discord SDK.

**Files:**
- Create: `frontend/src/muteToggle.js`
- Test: `frontend/tests/muteToggle.test.js`

- [ ] **Step 1: Write the failing test**

`frontend/tests/muteToggle.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createMuteToggle } from '../src/muteToggle.js';

function makeSdk() {
    const subs = {};
    return {
        subscribe: vi.fn((evt, cb) => { subs[evt] = cb; }),
        _fire: (evt, payload) => subs[evt]?.(payload),
    };
}

describe('muteToggle', () => {
    it('mounts a button into a container', () => {
        const root = document.createElement('div');
        createMuteToggle({
            root,
            sdk: makeSdk(),
            userId: 'u1',
            setMute: async () => ({ muted: true }),
            getToken: () => 't',
        });
        expect(root.querySelector('button.mute-toggle')).toBeTruthy();
    });

    it('calls setMute(true) when clicking from unmuted state', async () => {
        const root = document.createElement('div');
        const calls = [];
        createMuteToggle({
            root,
            sdk: makeSdk(),
            userId: 'u1',
            setMute: async (m) => { calls.push(m); return { muted: m }; },
            getToken: () => 't',
        });
        const btn = root.querySelector('button.mute-toggle');
        btn.click();
        await Promise.resolve();
        expect(calls).toEqual([true]);
    });

    it('reflects external Discord-side mute via SDK VOICE_STATE_UPDATE', () => {
        const root = document.createElement('div');
        const sdk = makeSdk();
        createMuteToggle({
            root,
            sdk,
            userId: 'u1',
            setMute: async () => ({}),
            getToken: () => 't',
        });
        sdk._fire('VOICE_STATE_UPDATE', { user: { id: 'u1' }, mute: true });
        const btn = root.querySelector('button.mute-toggle');
        expect(btn.dataset.muted).toBe('true');
    });

    it('ignores VOICE_STATE_UPDATE for other users', () => {
        const root = document.createElement('div');
        const sdk = makeSdk();
        createMuteToggle({
            root,
            sdk,
            userId: 'u1',
            setMute: async () => ({}),
            getToken: () => 't',
        });
        sdk._fire('VOICE_STATE_UPDATE', { user: { id: 'someone-else' }, mute: true });
        const btn = root.querySelector('button.mute-toggle');
        expect(btn.dataset.muted).toBe('false');
    });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd frontend && npx vitest run tests/muteToggle.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`frontend/src/muteToggle.js`:

```js
export function createMuteToggle({ root, sdk, userId, setMute, getToken }) {
    const btn = document.createElement('button');
    btn.className = 'mute-toggle';
    btn.dataset.muted = 'false';
    btn.setAttribute('aria-label', 'Toggle mute');
    btn.textContent = '🎙';
    root.appendChild(btn);

    let muted = false;
    let inFlight = false;

    function render() {
        btn.dataset.muted = String(muted);
        btn.textContent = muted ? '🔇' : '🎙';
    }

    btn.addEventListener('click', async () => {
        if (inFlight) return;
        inFlight = true;
        const next = !muted;
        try {
            await setMute(next, getToken());
            muted = next;
            render();
        } catch (err) {
            console.error('mute toggle failed', err);
        } finally {
            inFlight = false;
        }
    });

    sdk.subscribe('VOICE_STATE_UPDATE', (payload) => {
        if (!payload || !payload.user || payload.user.id !== userId) return;
        if (typeof payload.mute === 'boolean') {
            muted = payload.mute;
            render();
        }
    });

    return { destroy: () => btn.remove() };
}
```

- [ ] **Step 4: Run, verify pass**

```bash
cd frontend && npx vitest run tests/muteToggle.test.js
```
Expected: 4 passing.

- [ ] **Step 5: Add CSS**

In `frontend/src/styles.css`, append:

```css
.mute-toggle {
    position: fixed;
    top: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 20px;
    cursor: pointer;
    z-index: 1000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.mute-toggle[data-muted="true"] {
    background: #b04848;
}
.mute-toggle:hover {
    filter: brightness(1.15);
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/muteToggle.js frontend/tests/muteToggle.test.js frontend/src/styles.css
git commit -m "feat(frontend): round top-right mute toggle with SDK voice-state sync"
```

---

## Task 11: Mount toggle in main.js

**Files:**
- Modify: `frontend/src/main.js`

- [ ] **Step 1: Locate SDK + auth state**

```bash
grep -n "sdk\|bootSdk\|setToken\|user" frontend/src/main.js | head -30
```

Confirm where `sdk` instance and current user ID land.

- [ ] **Step 2: Mount the toggle after auth completes**

In `frontend/src/main.js`, after the post-auth `/api/me` call resolves (giving `user.id`), add:

```js
import { createMuteToggle } from './muteToggle.js';
import { setMute } from './dataSource.js';
import { getToken } from './auth.js';

// ...after sdk + user.id are available:
createMuteToggle({
    root: document.body,
    sdk,
    userId: user.id,
    setMute,
    getToken,
});
```

(Adapt to the exact variable names in `main.js`. The `import` statements go at the top.)

- [ ] **Step 3: Dev-mode check**

```bash
cd frontend && npm run dev
```
Open in browser (or check console). Expected: toggle appears in top-right corner; clicking it logs `[dev] setMute true` / `[dev] setMute false`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.js
git commit -m "feat(frontend): mount lineup mute toggle after activity auth"
```

---

## Task 12: Manual end-to-end verification

**Cannot be tested without a live guild + Activity registration.** Do these manually before merging:

- [ ] Bot has `MuteMembers` perm in the guild.
- [ ] Activity (`1503873080961794068`) settings allow Kiribot to launch it.
- [ ] Click "Signupverktyg" in `ch_Verktyg_Signup` → see two buttons including "Öppna lineup".
- [ ] Click "Öppna lineup" as a non-harmonian → ephemeral refusal message.
- [ ] Click "Öppna lineup" as a harmonian → ephemeral message with URL button.
- [ ] Click URL button → Discord launches the Activity and connects to lineup VC.
- [ ] On VC connect, user is server-muted automatically.
- [ ] Click the round top-right toggle in the Activity → user is unmuted server-side (verify in Discord member list).
- [ ] Discord-side mute change (right-click → server mute) propagates into the toggle UI (icon flips).
- [ ] Leave the VC → server-mute is removed.
- [ ] Switch from lineup VC to another VC → server-mute removed.
- [ ] Restart the bot while a user is in lineup VC server-muted, then they switch out → confirm no lingering mute.

---

## Self-Review Notes

Coverage map (spec § → task):
- §1 entry point button + role check → Tasks 3, 4
- §2 native launch via embedded app invite → Tasks 2, 4
- §3 auto server-mute on VC connect → Task 5
- §4 in-activity toggle button (top-right round) → Tasks 9, 10, 11
- §5 auto-unmute on leave / switch → Task 5
- Tech §1 Entry Generator → Tasks 2, 4
- Tech §2 State Manager (join + leave listeners) → Task 5; failsafe → Task 6
- Tech §3 Communication Bridge → Tasks 7, 8, 9, 10
- Discord-side mute reflected in toggle → Task 10 (VOICE_STATE_UPDATE subscription)

No placeholders. No `TODO`. Types/names consistent: `setMute` everywhere in JS, `/api/voice/mute` everywhere as path, `ch_LineupVoice` + `activity_Lineup` constants reused across tasks.

Known assumption: Discord Embedded SDK exposes a `VOICE_STATE_UPDATE` event with `{ user: { id }, mute }` shape. If the real payload differs, adjust the subscription in Task 10 — the test asserts the contract, not Discord's wire format. Verify against `@discord/embedded-app-sdk` docs during Task 10 Step 3.
