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

async function seeded(entry = {}) {
    const file = tmpFile();
    const store = createArshjulStore({ filePath: file });
    const created = await store.create('r1', {
        monthDay: '01-15', title: 'A', body: 'b', channelId: 'c1', userId: 'u1', id: 'e1',
        ...entry
    });
    return { file, store, created };
}

test('update changes the fields, bumps the version and records the editor', async () => {
    const { store } = await seeded();
    const out = await store.update('e1', {
        monthDay: '02-01', title: 'B', body: 'c', version: 1, userId: 'u2',
        now: new Date('2026-09-10T11:00:00Z')
    });
    assert.strictEqual(out.title, 'B');
    assert.strictEqual(out.monthDay, '02-01');
    assert.strictEqual(out.version, 2);
    assert.strictEqual(out.updatedBy, 'u2');
    assert.strictEqual(out.createdBy, 'u1');
    assert.strictEqual(out.updatedAt, '2026-09-10T11:00:00.000Z');
});

test('update throws version_conflict on a stale version and writes nothing', async () => {
    const { store, file } = await seeded();
    await assert.rejects(
        () => store.update('e1', { monthDay: '02-01', title: 'B', body: '', version: 99, userId: 'u2' }),
        /version_conflict/
    );
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(onDisk.entries.e1.title, 'A');
    assert.strictEqual(onDisk.entries.e1.version, 1);
});

test('update throws entry_not_found for an unknown id', async () => {
    const { store } = await seeded();
    await assert.rejects(
        () => store.update('nope', { monthDay: '02-01', title: 'B', body: '', version: 1, userId: 'u2' }),
        /entry_not_found/
    );
});

test('moving the date forward clears this year from sentYears', async () => {
    const { store } = await seeded();
    await store.markSent('e1', 2026);
    const out = await store.update('e1', {
        monthDay: '12-01', title: 'A', body: 'b', version: 1, userId: 'u1',
        now: new Date('2026-06-01T09:00:00Z')
    });
    assert.deepStrictEqual(out.sentYears, []);
});

test('moving the date backward leaves sentYears alone', async () => {
    const { store } = await seeded({ monthDay: '05-01' });
    await store.markSent('e1', 2026);
    const out = await store.update('e1', {
        monthDay: '03-01', title: 'A', body: 'b', version: 1, userId: 'u1',
        now: new Date('2026-06-01T09:00:00Z')
    });
    assert.deepStrictEqual(out.sentYears, [2026]);
});

test('an unchanged date leaves sentYears alone even when it is ahead', async () => {
    const { store } = await seeded({ monthDay: '12-01' });
    await store.markSent('e1', 2026);
    const out = await store.update('e1', {
        monthDay: '12-01', title: 'Ny titel', body: 'b', version: 1, userId: 'u1',
        now: new Date('2026-06-01T09:00:00Z')
    });
    assert.deepStrictEqual(out.sentYears, [2026]);
});

test('remove deletes the entry when the version matches', async () => {
    const { store } = await seeded();
    await store.remove('e1', 1);
    assert.strictEqual(await store.getEntry('e1'), null);
});

test('remove throws version_conflict on a stale version and keeps the entry', async () => {
    const { store } = await seeded();
    await assert.rejects(() => store.remove('e1', 99), /version_conflict/);
    assert.notStrictEqual(await store.getEntry('e1'), null);
});

test('remove throws entry_not_found for an unknown id', async () => {
    const { store } = await seeded();
    await assert.rejects(() => store.remove('nope', 1), /entry_not_found/);
});

test('markSent adds the year once and is idempotent', async () => {
    const { store } = await seeded();
    await store.markSent('e1', 2026);
    await store.markSent('e1', 2026);
    assert.deepStrictEqual((await store.getEntry('e1')).sentYears, [2026]);
    await store.markSent('e1', 2027);
    assert.deepStrictEqual((await store.getEntry('e1')).sentYears, [2026, 2027]);
});

test('markSent does not bump the version — it is not a user edit', async () => {
    const { store } = await seeded();
    await store.markSent('e1', 2026);
    assert.strictEqual((await store.getEntry('e1')).version, 1);
});
