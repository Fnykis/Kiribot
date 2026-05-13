const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const lockFile = require('lockfile');

const lockAsync = promisify(lockFile.lock);
const unlockAsync = promisify(lockFile.unlock);

// Default matches dir_EventsActive from src/core/constants.js
const DEFAULT_ACTIVE_DIR = 'src/events/active';

function createLineupStore({ activeDir = DEFAULT_ACTIVE_DIR } = {}) {
    function findEventFile(concertId) {
        let files;
        try {
            files = fs.readdirSync(activeDir);
        } catch {
            return null;
        }
        const fileName = files.find(f => f.endsWith(`_${concertId}.json`));
        return fileName ? path.join(activeDir, fileName) : null;
    }

    async function loadEvent(concertId) {
        const file = findEventFile(concertId);
        if (!file) return null;
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.lineup)) parsed.lineup = [];
        return parsed;
    }

    async function mutateEvent(concertId, fn) {
        const file = findEventFile(concertId);
        if (!file) throw new Error('event_not_found');
        const lockPath = `${file}.lock`;

        await lockAsync(lockPath, { stale: 5 * 60 * 1000, retries: 50, retryWait: 50 });
        let parsed;
        try {
            parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch {
            throw new Error('event_corrupt');
        }
        try {
            if (!Array.isArray(parsed.lineup)) parsed.lineup = [];
            const patched = fn(parsed) ?? parsed;
            fs.writeFileSync(file, JSON.stringify(patched, null, 2));
            return patched;
        } finally {
            try { await unlockAsync(lockPath); } catch (_) { /* best effort */ }
        }
    }

    return { loadEvent, mutateEvent };
}

const lineupStore = createLineupStore();

module.exports = { createLineupStore, lineupStore };
