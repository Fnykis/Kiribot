const fs = require('fs');

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

    async function listByRole(roleId) {
        const data = readFile();
        return Object.entries(data.entries)
            .filter(([, e]) => e.roleId === roleId)
            .map(([id, e]) => ({ id, ...e }))
            .sort((a, b) => a.monthDay.localeCompare(b.monthDay));
    }

    return { listByRole };
}

module.exports = createArshjulStore;
module.exports.DEFAULT_FILE = DEFAULT_FILE;
