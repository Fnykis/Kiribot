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
