const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const lockFile = require('lockfile');

const lockAsync = promisify(lockFile.lock);
const unlockAsync = promisify(lockFile.unlock);

function createLineupStore({ baseDir } = {}) {
    if (!baseDir) {
        throw new Error('createLineupStore requires baseDir');
    }

    function filePath(concertId) {
        return path.join(baseDir, `${concertId}.json`);
    }

    async function loadState(concertId) {
        const file = filePath(concertId);
        if (!fs.existsSync(file)) {
            return { concertId, participants: {}, updatedAt: null };
        }
        const raw = fs.readFileSync(file, 'utf8');
        return JSON.parse(raw);
    }

    async function mutate(concertId, fn) {
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        const file = filePath(concertId);
        const lockPath = `${file}.lock`;

        await lockAsync(lockPath, { stale: 5 * 60 * 1000, retries: 3, retryWait: 100 });
        try {
            const state = await loadState(concertId);
            const patched = fn(state) || state;
            patched.concertId = concertId;
            patched.updatedAt = new Date().toISOString();
            fs.writeFileSync(file, JSON.stringify(patched, null, 2));
            return patched;
        } finally {
            try { await unlockAsync(lockPath); } catch (_) { /* best-effort */ }
        }
    }

    return { loadState, mutate };
}

const lineupStore = createLineupStore({
    baseDir: path.join(__dirname, '..', 'data', 'lineups')
});

module.exports = { createLineupStore, lineupStore };
