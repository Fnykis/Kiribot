const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const createArshjulStore = require('../../src/services/arshjulStore');

function tmpFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arshjul-test-'));
    return path.join(dir, 'arshjul.json');
}

function write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data));
}

test('returns an empty array when the file does not exist', async () => {
    const store = createArshjulStore({ filePath: tmpFile() });
    assert.deepStrictEqual(await store.listByRole('r1'), []);
});

test('returns only the entries for the requested role', async () => {
    const file = tmpFile();
    write(file, {
        version: 1,
        entries: {
            e1: { roleId: 'r1', monthDay: '03-01', title: 'A', fields: {}, version: 1, sentYears: [] },
            e2: { roleId: 'r2', monthDay: '04-01', title: 'B', fields: {}, version: 1, sentYears: [] }
        }
    });
    const store = createArshjulStore({ filePath: file });
    const out = await store.listByRole('r1');
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].title, 'A');
});

test('includes the entry id on each returned entry', async () => {
    const file = tmpFile();
    write(file, { version: 1, entries: { e1: { roleId: 'r1', monthDay: '03-01', title: 'A', fields: {}, version: 1, sentYears: [] } } });
    const store = createArshjulStore({ filePath: file });
    assert.strictEqual((await store.listByRole('r1'))[0].id, 'e1');
});

test('sorts entries by monthDay ascending', async () => {
    const file = tmpFile();
    write(file, {
        version: 1,
        entries: {
            e1: { roleId: 'r1', monthDay: '12-24', title: 'Jul', fields: {}, version: 1, sentYears: [] },
            e2: { roleId: 'r1', monthDay: '01-15', title: 'Januari', fields: {}, version: 1, sentYears: [] },
            e3: { roleId: 'r1', monthDay: '06-06', title: 'Juni', fields: {}, version: 1, sentYears: [] }
        }
    });
    const store = createArshjulStore({ filePath: file });
    assert.deepStrictEqual((await store.listByRole('r1')).map(e => e.monthDay), ['01-15', '06-06', '12-24']);
});

test('returns an empty array for a role with no entries', async () => {
    const file = tmpFile();
    write(file, { version: 1, entries: { e1: { roleId: 'r1', monthDay: '03-01', title: 'A', fields: {}, version: 1, sentYears: [] } } });
    const store = createArshjulStore({ filePath: file });
    assert.deepStrictEqual(await store.listByRole('nope'), []);
});

test('throws a clear error when the file is corrupt', async () => {
    const file = tmpFile();
    fs.writeFileSync(file, 'not json at all');
    const store = createArshjulStore({ filePath: file });
    await assert.rejects(() => store.listByRole('r1'), /arshjul_file_corrupt/);
});

test('listAll returns every entry with its id', async () => {
    const file = tmpFile();
    write(file, {
        version: 1,
        entries: {
            e1: { roleId: 'r1', monthDay: '03-01', title: 'A', body: '', version: 1, sentYears: [] },
            e2: { roleId: 'r2', monthDay: '04-01', title: 'B', body: '', version: 1, sentYears: [] }
        }
    });
    const store = createArshjulStore({ filePath: file });
    assert.deepStrictEqual((await store.listAll()).map(e => e.id).sort(), ['e1', 'e2']);
});

test('getEntry returns the entry with its id, or null', async () => {
    const file = tmpFile();
    write(file, { version: 1, entries: { e1: { roleId: 'r1', monthDay: '03-01', title: 'A', body: '', version: 1, sentYears: [] } } });
    const store = createArshjulStore({ filePath: file });
    assert.strictEqual((await store.getEntry('e1')).title, 'A');
    assert.strictEqual((await store.getEntry('e1')).id, 'e1');
    assert.strictEqual(await store.getEntry('nope'), null);
});

test('create writes a complete entry and returns it', async () => {
    const file = tmpFile();
    const store = createArshjulStore({ filePath: file });
    const created = await store.create('r1', {
        monthDay: '01-15', title: 'Boka lokal', body: 'Ring dem',
        channelId: 'c1', userId: 'u1', id: 'fixed-id', now: new Date('2026-09-10T10:00:00Z')
    });
    assert.deepStrictEqual(created, {
        id: 'fixed-id',
        roleId: 'r1',
        channelId: 'c1',
        monthDay: '01-15',
        title: 'Boka lokal',
        body: 'Ring dem',
        version: 1,
        createdBy: 'u1',
        updatedBy: 'u1',
        updatedAt: '2026-09-10T10:00:00.000Z',
        sentYears: []
    });
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(onDisk.entries['fixed-id'].title, 'Boka lokal');
});

test('create stores a null channelId for a group with no channel', async () => {
    const store = createArshjulStore({ filePath: tmpFile() });
    const created = await store.create('r1', { monthDay: '01-15', title: 'A', body: '', channelId: null, userId: 'u1' });
    assert.strictEqual(created.channelId, null);
});

test('create generates a distinct id when none is supplied', async () => {
    const store = createArshjulStore({ filePath: tmpFile() });
    const a = await store.create('r1', { monthDay: '01-15', title: 'A', body: '', channelId: null, userId: 'u1' });
    const b = await store.create('r1', { monthDay: '01-16', title: 'B', body: '', channelId: null, userId: 'u1' });
    assert.notStrictEqual(a.id, b.id);
    assert.strictEqual((await store.listAll()).length, 2);
});

test('concurrent creates all land — no write is lost under the lock', async () => {
    const file = tmpFile();
    const store = createArshjulStore({ filePath: file });
    await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
            store.create('r1', { monthDay: '01-15', title: `T${i}`, body: '', channelId: null, userId: 'u1' }))
    );
    assert.strictEqual((await store.listAll()).length, 10);
});
