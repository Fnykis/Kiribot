const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createLineupStore } = require('../../src/services/lineupStore');

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'lineup-store-'));
}

test('loadState returns empty state when file is missing', async () => {
    const baseDir = tmpDir();
    const store = createLineupStore({ baseDir });
    const state = await store.loadState('c1');
    assert.deepStrictEqual(state, { concertId: 'c1', participants: {}, updatedAt: null });
});

test('mutate writes file then loadState round-trips it', async () => {
    const baseDir = tmpDir();
    const store = createLineupStore({ baseDir });

    await store.mutate('c1', state => {
        state.participants['u1'] = { placed: true, x: 10, y: 20 };
        return state;
    });

    const reloaded = await store.loadState('c1');
    assert.strictEqual(reloaded.concertId, 'c1');
    assert.deepStrictEqual(reloaded.participants['u1'], { placed: true, x: 10, y: 20 });
    assert.ok(reloaded.updatedAt, 'updatedAt should be set');
});

test('mutate stamps a fresh updatedAt on every write', async () => {
    const baseDir = tmpDir();
    const store = createLineupStore({ baseDir });

    const first = await store.mutate('c1', s => { s.participants['u1'] = { placed: true, x: 1, y: 2 }; return s; });
    await new Promise(r => setTimeout(r, 5));
    const second = await store.mutate('c1', s => { s.participants['u1'].x = 99; return s; });

    assert.notStrictEqual(first.updatedAt, second.updatedAt);
});

test('mutate releases lock when fn throws', async () => {
    const baseDir = tmpDir();
    const store = createLineupStore({ baseDir });

    await assert.rejects(() => store.mutate('c1', () => { throw new Error('boom'); }), /boom/);

    // A subsequent mutate must succeed (lock was released).
    const state = await store.mutate('c1', s => { s.participants['u1'] = { placed: false, x: null, y: null }; return s; });
    assert.deepStrictEqual(state.participants['u1'], { placed: false, x: null, y: null });
});

test('default baseDir resolves under src/data/lineups (smoke)', () => {
    const { lineupStore } = require('../../src/services/lineupStore');
    assert.strictEqual(typeof lineupStore.loadState, 'function');
    assert.strictEqual(typeof lineupStore.mutate, 'function');
});
