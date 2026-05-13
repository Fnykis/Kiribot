const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { createLineupStore } = require('../../src/services/lineupStore');

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lineupstore-test-'));
}

function writeEvent(dir, fileName, payload) {
    fs.writeFileSync(path.join(dir, fileName), JSON.stringify(payload, null, 2));
    return path.join(dir, fileName);
}

function findFile(dir, concertId) {
    return path.join(dir, fs.readdirSync(dir).find(f => f.endsWith(`_${concertId}.json`)));
}

test('loadEvent returns parsed event JSON', async () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'a_111.json', { id: '111', name: 'X', date: '08/03/26', signups: {} });
        const store = createLineupStore({ activeDir: dir });
        const ev = await store.loadEvent('111');
        assert.strictEqual(ev.id, '111');
        assert.strictEqual(ev.name, 'X');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('loadEvent returns null when event not found', async () => {
    const dir = makeTmpDir();
    try {
        const store = createLineupStore({ activeDir: dir });
        assert.strictEqual(await store.loadEvent('missing'), null);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('mutateEvent lazy-creates lineup array on first call', async () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'a_111.json', { id: '111', name: 'X', date: '08/03/26', signups: {} });
        const store = createLineupStore({ activeDir: dir });
        const result = await store.mutateEvent('111', ev => {
            assert.ok(Array.isArray(ev.lineup));
            assert.strictEqual(ev.lineup.length, 0);
            ev.lineup.push({ userId: 'u1', displayName: 'A', instrument: '1:a',
                position: { x: 10, y: 20 }, manuallyAdded: false, placedAt: 'now' });
            return ev;
        });
        assert.strictEqual(result.lineup.length, 1);
        const onDisk = JSON.parse(fs.readFileSync(findFile(dir, '111'), 'utf8'));
        assert.strictEqual(onDisk.lineup.length, 1);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('mutateEvent serializes concurrent writers (no lost updates)', async () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'a_111.json', { id: '111', name: 'X', date: '08/03/26', signups: {} });
        const store = createLineupStore({ activeDir: dir });
        const pushes = [];
        for (let i = 0; i < 5; i++) {
            pushes.push(store.mutateEvent('111', ev => {
                ev.lineup.push({ userId: `u${i}`, displayName: `U${i}`, instrument: '1:a',
                    position: { x: i, y: i }, manuallyAdded: false, placedAt: 'now' });
                return ev;
            }));
        }
        await Promise.all(pushes);
        const onDisk = JSON.parse(fs.readFileSync(findFile(dir, '111'), 'utf8'));
        assert.strictEqual(onDisk.lineup.length, 5);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('mutateEvent rejects when event not found', async () => {
    const dir = makeTmpDir();
    try {
        const store = createLineupStore({ activeDir: dir });
        await assert.rejects(
            () => store.mutateEvent('missing', ev => ev),
            /event_not_found/
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
