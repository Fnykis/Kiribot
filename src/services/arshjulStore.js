const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const lockFile = require('lockfile');
const { randomUUID } = require('crypto');

const lockAsync = promisify(lockFile.lock);
const unlockAsync = promisify(lockFile.unlock);

const DEFAULT_FILE = 'src/data/arshjul.json';

function createArshjulStore({ filePath = DEFAULT_FILE } = {}) {
    function readFile() {
        let raw;
        try {
            raw = fs.readFileSync(filePath, 'utf8');
        } catch (err) {
            if (err.code === 'ENOENT') return { version: 1, entries: {} };
            throw err;
        }
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.entries !== 'object' || parsed.entries === null) {
                throw new Error('bad shape');
            }
            return parsed;
        } catch {
            throw new Error('arshjul_file_corrupt');
        }
    }

    // Same lock options as src/services/lineupStore.js:33-53.
    async function mutate(fn) {
        const lockPath = `${filePath}.lock`;
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        await lockAsync(lockPath, { stale: 5 * 60 * 1000, retries: 50, retryWait: 50 });
        try {
            const data = readFile();
            const result = fn(data);
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            return result;
        } finally {
            try { await unlockAsync(lockPath); } catch (_) { /* best effort */ }
        }
    }

    async function listByRole(roleId) {
        const data = readFile();
        return Object.entries(data.entries)
            .filter(([, e]) => e.roleId === roleId)
            .map(([id, e]) => ({ id, ...e }))
            .sort((a, b) => a.monthDay.localeCompare(b.monthDay));
    }

    async function listAll() {
        const data = readFile();
        return Object.entries(data.entries).map(([id, e]) => ({ id, ...e }));
    }

    async function getEntry(id) {
        const data = readFile();
        const entry = data.entries[id];
        return entry ? { id, ...entry } : null;
    }

    async function create(roleId, { monthDay, title, body, channelId, userId, id = randomUUID(), now = new Date() }) {
        return mutate(data => {
            const entry = {
                roleId,
                channelId: channelId ?? null,
                monthDay,
                title,
                body,
                version: 1,
                createdBy: userId,
                updatedBy: userId,
                updatedAt: now.toISOString(),
                sentYears: []
            };
            data.entries[id] = entry;
            return { id, ...entry };
        });
    }

    return { listByRole, listAll, getEntry, create };
}

module.exports = createArshjulStore;
module.exports.DEFAULT_FILE = DEFAULT_FILE;
