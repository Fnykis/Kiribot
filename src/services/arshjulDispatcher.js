const {
    todayInStockholm, dueWindow, effectiveMonthDay, msUntilNextSendHour, shouldTickOnStart
} = require('../utils/arshjulDates');

const CATCH_UP_DAYS = 2;
const SEND_STAGGER_MS = 1000;

// Posts to the live Discord server. While isLive() is false every thread goes to the
// bot-test channel with the role mention stripped — see config.arshjulLive.
function createArshjulDispatcher({
    client, store, resolveChannelId, testChannelId, isLive, sendHour = 8,
    logger = () => {}, now = () => new Date(), sleep = ms => new Promise(r => setTimeout(r, ms))
}) {
    let timer = null;
    let started = false;
    let inFlight = null;

    async function fetchChannel(id) {
        if (!id) return null;
        try {
            return await client.channels.fetch(id);
        } catch {
            return null;
        }
    }

    async function channelFor(entry) {
        const stored = await fetchChannel(entry.channelId);
        if (stored) return stored;
        // The stored id is an optimisation, not the only lookup path: a group that gains a
        // channel after its entries were created starts delivering with no re-save.
        let resolvedId = null;
        try {
            resolvedId = await resolveChannelId(entry.roleId);
        } catch (err) {
            logger(`arshjul: channel lookup failed for role ${entry.roleId}:`, err.message);
        }
        return fetchChannel(resolvedId);
    }

    async function send(entry, year) {
        const target = await channelFor(entry);
        if (!target) {
            logger(`arshjul: entry ${entry.id} (role ${entry.roleId}) has no channel — skipped`);
            return;
        }

        const live = isLive() === true;
        const destination = live ? target : await fetchChannel(testChannelId);
        if (!destination) {
            logger(`arshjul: test channel ${testChannelId} unavailable — entry ${entry.id} skipped`);
            return;
        }

        // A channel mention renders as #name without another fetch just to read the name.
        const header = live ? `<@&${entry.roleId}>` : `[TEST → <#${target.id}>]`;
        const content = entry.body ? `${header}\n${entry.body}` : header;

        const message = await destination.send({
            content,
            allowedMentions: { parse: [], roles: live ? [entry.roleId] : [] }
        });
        // The thread is the deliverable — a place the group discusses the thing.
        await message.startThread({ name: entry.title });

        // Send, then mark. A crash between the two duplicates one visible thread; the
        // reverse order would silently drop a reminder.
        await store.markSent(entry.id, year);
        logger(`arshjul: sent entry ${entry.id} "${entry.title}" to ${destination.id}${live ? '' : ' (test mode)'}`);
    }

    // tick() is check-then-act: it reads listAll(), decides what's due, THEN marks sent —
    // markSent's dedupe only protects the file write, not this window. Two overlapping
    // ticks (a manual tick() while a scheduled one is still mid-flight, or a doubled
    // start()) would both see "not sent yet" and both post — a live double-ping, not a
    // crash. The guard below serializes tick(): a call made while one is running returns
    // the SAME in-flight promise instead of starting a second pass.
    function tick() {
        if (inFlight) return inFlight;
        inFlight = runTick().finally(() => { inFlight = null; });
        return inFlight;
    }

    async function runTick() {
        const { year, monthDay } = todayInStockholm(now());
        const window = new Set(dueWindow(year, monthDay, CATCH_UP_DAYS));
        // The day that has just fallen out of the window — logged once, then never again.
        const justMissed = dueWindow(year, monthDay, CATCH_UP_DAYS + 1).at(-1);

        let entries;
        try {
            entries = await store.listAll();
        } catch (err) {
            logger('arshjul: dispatcher could not read the store:', err.message);
            return;
        }

        const pending = entries.filter(e => !(e.sentYears || []).includes(year));

        for (const entry of pending) {
            const dueDay = effectiveMonthDay(entry.monthDay, year);
            if (dueDay === justMissed && !window.has(dueDay)) {
                logger(`arshjul: entry ${entry.id} "${entry.title}" missed its date ${entry.monthDay} — skipped`);
            }
        }

        const due = pending.filter(e => window.has(effectiveMonthDay(e.monthDay, year)));

        for (const entry of due) {
            try {
                await send(entry, year);
            } catch (err) {
                logger(`arshjul: failed to send entry ${entry.id}:`, err.message);
            }
            // Stagger, so a busy date does not hit Discord's rate limit.
            await sleep(SEND_STAGGER_MS);
        }
    }

    async function safeTick() {
        try {
            await tick();
        } catch (err) {
            logger('arshjul: dispatcher tick failed:', err.message);
        }
    }

    function scheduleNext() {
        // Recomputed after every run rather than setInterval(24h), which drifts an hour
        // twice a year when the clocks change.
        timer = setTimeout(async () => {
            // If a DST shift made the timer fire early, reschedule instead of sending.
            if (shouldTickOnStart(now(), sendHour)) await safeTick();
            scheduleNext();
        }, msUntilNextSendHour(now(), sendHour));
        if (timer.unref) timer.unref();
    }

    function start() {
        // A second start() must not spin up a second competing setTimeout chain — the
        // tick() guard above bounds concurrent sends, but two live timer chains would
        // still double up every future day's stagger/log noise for no reason.
        if (started) return;
        started = true;
        // A restart after the send hour delivers that same morning rather than falling
        // through to the catch-up window.
        if (shouldTickOnStart(now(), sendHour)) safeTick();
        scheduleNext();
    }

    function stop() {
        if (timer) clearTimeout(timer);
        timer = null;
        started = false;
    }

    return { tick, start, stop };
}

module.exports = createArshjulDispatcher;
