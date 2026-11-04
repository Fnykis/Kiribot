const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { stripExpiredNotes, cleanupEventNotes } = require('../../src/services/eventNoteCleanup');

const ARCHIVED_AT = '2026-10-05T03:00:00.000Z';

function makeEvent(overrides = {}) {
    return {
        date: '01/10/26',
        archivedAt: ARCHIVED_AT,
        signups: {
            '1:a': [{ id: '1', name: 'Anna', response: 'ja', note: 'Bortrest' }],
            '2:b': [{ id: '2', name: 'Bo', response: 'nej', note: 'Sjuk' }],
        },
        ...overrides,
    };
}

function singleNoteEvent(overrides = {}) {
    return makeEvent({ signups: { '1:a': [{ id: '1', name: 'Anna', response: 'ja', note: 'Bortrest' }] }, ...overrides });
}

test('keeps notes 29 days after archivedAt', () => {
    const result = stripExpiredNotes(singleNoteEvent(), new Date('2026-11-03T03:00:00.000Z'));
    assert.strictEqual(result.clearedCount, 0);
    assert.strictEqual(result.eventData.signups['1:a'][0].note, 'Bortrest');
});

test('clears notes exactly 30 days after archivedAt', () => {
    const result = stripExpiredNotes(singleNoteEvent(), new Date('2026-11-04T03:00:00.000Z'));
    assert.strictEqual(result.clearedCount, 1);
    assert.strictEqual(result.eventData.signups['1:a'][0].note, '');
    assert.strictEqual(result.dateValid, true);
});

test('clears notes 31 days after archivedAt', () => {
    const result = stripExpiredNotes(singleNoteEvent(), new Date('2026-11-05T03:00:00.000Z'));
    assert.strictEqual(result.clearedCount, 1);
});

test('uses archivedAt when the event date is older', () => {
    const result = stripExpiredNotes(singleNoteEvent({ date: '01/01/25' }), new Date('2026-10-20T03:00:00.000Z'));
    assert.strictEqual(result.clearedCount, 0);
    assert.strictEqual(result.eventData.signups['1:a'][0].note, 'Bortrest');
});

test('uses the event date when archivedAt is missing', () => {
    const event = singleNoteEvent({ date: '01/01/25' });
    delete event.archivedAt;
    const result = stripExpiredNotes(event, new Date('2026-10-20T03:00:00.000Z'));
    assert.strictEqual(result.clearedCount, 1);
    assert.strictEqual(result.dateValid, true);
});

test('clears notes in every section', () => {
    const result = stripExpiredNotes(makeEvent(), new Date('2026-12-01T00:00:00.000Z'));
    assert.strictEqual(result.clearedCount, 2);
    assert.strictEqual(result.eventData.signups['1:a'][0].note, '');
    assert.strictEqual(result.eventData.signups['2:b'][0].note, '');
});

test('keeps other fields and does not add a note key', () => {
    const event = makeEvent({
        signups: { '1:a': [{ id: '1', name: 'Anna', response: 'ja' }, { id: '2', name: 'Bo', response: 'nej', note: 'x' }] },
        title: 'Konsert',
    });
    const result = stripExpiredNotes(event, new Date('2026-12-01T00:00:00.000Z'));
    assert.strictEqual(result.eventData.title, 'Konsert');
    assert.strictEqual(result.eventData.archivedAt, ARCHIVED_AT);
    assert.deepStrictEqual(result.eventData.signups['1:a'][0], { id: '1', name: 'Anna', response: 'ja' });
    assert.deepStrictEqual(result.eventData.signups['1:a'][1], { id: '2', name: 'Bo', response: 'nej', note: '' });
});

test('does not mutate its input', () => {
    const event = makeEvent();
    const copy = JSON.parse(JSON.stringify(event));
    stripExpiredNotes(event, new Date('2026-12-01T00:00:00.000Z'));
    assert.deepStrictEqual(event, copy);
});

test('keeps notes when archivedAt is in the future', () => {
    const result = stripExpiredNotes(singleNoteEvent(), new Date('2026-01-01T00:00:00.000Z'));
    assert.strictEqual(result.clearedCount, 0);
    assert.strictEqual(result.dateValid, true);
});

test('does not fall back to the date when archivedAt is invalid', () => {
    const result = stripExpiredNotes(singleNoteEvent({ archivedAt: 'garbage', date: '01/01/25' }), new Date('2026-12-01T00:00:00.000Z'));
    assert.strictEqual(result.dateValid, false);
    assert.strictEqual(result.clearedCount, 0);
    assert.strictEqual(result.eventData.signups['1:a'][0].note, 'Bortrest');
});

test('reports dateValid false when the date is invalid and archivedAt is missing', () => {
    const event = singleNoteEvent({ date: 'nope' });
    delete event.archivedAt;
    const result = stripExpiredNotes(event, new Date('2026-12-01T00:00:00.000Z'));
    assert.strictEqual(result.dateValid, false);
    assert.strictEqual(result.clearedCount, 0);
});

test('skips missing signups and non-array sections', () => {
    const now = new Date('2026-12-01T00:00:00.000Z');
    assert.strictEqual(stripExpiredNotes({ archivedAt: ARCHIVED_AT }, now).clearedCount, 0);
    const result = stripExpiredNotes({ archivedAt: ARCHIVED_AT, signups: { a: null, b: 'x', c: [null, { note: 'n' }] } }, now);
    assert.strictEqual(result.clearedCount, 1);
});

test('clears a whitespace-only note', () => {
    const event = makeEvent({ signups: { '1:a': [{ id: '1', note: '   ' }] } });
    const result = stripExpiredNotes(event, new Date('2026-12-01T00:00:00.000Z'));
    assert.strictEqual(result.clearedCount, 1);
    assert.strictEqual(result.eventData.signups['1:a'][0].note, '');
});

// --- cleanupEventNotes ---

const NOW = () => new Date('2026-12-01T00:00:00.000Z');

function setup(files = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eventnotecleanup-test-'));
    const dir = path.join(root, 'archived');
    fs.mkdirSync(dir);
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    }
    const logs = [];
    return { root, dir, logs, log: line => logs.push(line) };
}

test('clears expired notes and logs one summary line', async () => {
    const { dir, logs, log } = setup({ 'a_1.json': makeEvent() });
    const result = await cleanupEventNotes({ dir, now: NOW, log });
    assert.deepStrictEqual(result, { clearedNotes: 2, changedEvents: 1 });
    assert.deepStrictEqual(logs, ['Event note cleanup: cleared 2 notes from 1 events']);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'a_1.json'), 'utf8'));
    assert.strictEqual(saved.signups['1:a'][0].note, '');
    assert.strictEqual(saved.signups['2:b'][0].note, '');
    assert.ok(!logs.join('\n').includes('Bortrest'));
});

test('leaves file bytes and modified time unchanged and logs nothing when no notes expired', async () => {
    const { dir, logs, log } = setup({ 'a_1.json': makeEvent() });
    const file = path.join(dir, 'a_1.json');
    const old = new Date('2020-01-01T00:00:00.000Z');
    fs.utimesSync(file, old, old);
    const before = fs.readFileSync(file);
    const result = await cleanupEventNotes({ dir, now: () => new Date('2026-10-10T00:00:00.000Z'), log });
    assert.deepStrictEqual(result, { clearedNotes: 0, changedEvents: 0 });
    assert.deepStrictEqual(fs.readFileSync(file), before);
    assert.strictEqual(fs.statSync(file).mtimeMs, old.getTime());
    assert.deepStrictEqual(logs, []);
});

test('a second run neither writes nor logs', async () => {
    const { dir, logs, log } = setup({ 'a_1.json': makeEvent() });
    await cleanupEventNotes({ dir, now: NOW, log });
    const file = path.join(dir, 'a_1.json');
    const mtime = fs.statSync(file).mtimeMs;
    const bytes = fs.readFileSync(file);
    logs.length = 0;
    const result = await cleanupEventNotes({ dir, now: NOW, log });
    assert.deepStrictEqual(result, { clearedNotes: 0, changedEvents: 0 });
    assert.deepStrictEqual(logs, []);
    assert.strictEqual(fs.statSync(file).mtimeMs, mtime);
    assert.deepStrictEqual(fs.readFileSync(file), bytes);
});

test('logs a file error for invalid JSON and still processes other files', async () => {
    const { dir, logs, log } = setup({ 'bad_1.json': 'LEAKMARK not json', 'good_2.json': makeEvent() });
    const result = await cleanupEventNotes({ dir, now: NOW, log });
    assert.deepStrictEqual(result, { clearedNotes: 2, changedEvents: 1 });
    assert.ok(logs.some(l => l.includes('bad_1.json')));
    assert.ok(logs.includes('Event note cleanup: cleared 2 notes from 1 events'));
    for (const line of logs) assert.ok(!line.includes('LEAKMARK'), 'log must not leak file content');
    assert.strictEqual(fs.readFileSync(path.join(dir, 'bad_1.json'), 'utf8'), 'LEAKMARK not json');
});

test('logs a file error for an invalid date only when notes exist', async () => {
    const noDate = singleNoteEvent({ archivedAt: 'garbage' });
    const noNotes = makeEvent({ archivedAt: 'garbage', signups: { '1:a': [{ id: '1', note: '' }, { id: '2' }] } });
    const { dir, logs, log } = setup({ 'withnotes_1.json': noDate, 'nonotes_2.json': noNotes });
    const result = await cleanupEventNotes({ dir, now: NOW, log });
    assert.deepStrictEqual(result, { clearedNotes: 0, changedEvents: 0 });
    assert.strictEqual(logs.length, 1);
    assert.ok(logs[0].includes('withnotes_1.json'));
    assert.ok(!logs[0].includes('Bortrest'));
});

test('does not read active files', async () => {
    const { root, dir, logs, log } = setup();
    const active = path.join(root, 'active');
    fs.mkdirSync(active);
    const activeFile = path.join(active, 'a_1.json');
    fs.writeFileSync(activeFile, JSON.stringify({ date: '01/01/25', signups: { a: [{ note: 'x' }] } }));
    const before = fs.readFileSync(activeFile);
    const result = await cleanupEventNotes({ dir, now: NOW, log });
    assert.deepStrictEqual(result, { clearedNotes: 0, changedEvents: 0 });
    assert.deepStrictEqual(fs.readFileSync(activeFile), before);
    assert.deepStrictEqual(logs, []);
});

test('returns zero counts for a missing directory', async () => {
    const { root, logs, log } = setup();
    const result = await cleanupEventNotes({ dir: path.join(root, 'nope'), now: NOW, log });
    assert.deepStrictEqual(result, { clearedNotes: 0, changedEvents: 0 });
    assert.deepStrictEqual(logs, []);
});

test('ignores .tmp files', async () => {
    const { dir, logs, log } = setup({ 'a_1.json.tmp': makeEvent() });
    const before = fs.readFileSync(path.join(dir, 'a_1.json.tmp'));
    const result = await cleanupEventNotes({ dir, now: NOW, log });
    assert.deepStrictEqual(result, { clearedNotes: 0, changedEvents: 0 });
    assert.deepStrictEqual(fs.readFileSync(path.join(dir, 'a_1.json.tmp')), before);
    assert.deepStrictEqual(logs, []);
});

test('leaves the original valid when the write fails', async () => {
    const { dir, logs, log } = setup({ 'a_1.json': makeEvent() });
    const file = path.join(dir, 'a_1.json');
    const before = fs.readFileSync(file);
    fs.mkdirSync(`${file}.tmp`);
    const result = await cleanupEventNotes({ dir, now: NOW, log });
    assert.deepStrictEqual(result, { clearedNotes: 0, changedEvents: 0 });
    assert.deepStrictEqual(fs.readFileSync(file), before);
    assert.ok(logs.some(l => l.includes('a_1.json')));
    assert.ok(!logs.some(l => l.includes('Bortrest')));
    assert.ok(!logs.some(l => l.startsWith('Event note cleanup: cleared')));
});

test('fails closed on non-ISO archivedAt values', () => {
    const now = new Date('2026-12-01T00:00:00.000Z');
    for (const bad of [null, false, 0, '1', '2026-10-05', 12345, {}]) {
        const result = stripExpiredNotes(singleNoteEvent({ archivedAt: bad, date: '01/01/25' }), now);
        assert.strictEqual(result.dateValid, false, `archivedAt ${JSON.stringify(bad)}`);
        assert.strictEqual(result.clearedCount, 0, `archivedAt ${JSON.stringify(bad)}`);
        assert.strictEqual(result.eventData.signups['1:a'][0].note, 'Bortrest');
    }
});

test('flushes the temp file to disk before rename and leaves a valid file', async () => {
    const { mock } = test;
    const { dir, log } = setup({ 'a_1.json': makeEvent() });
    const calls = [];
    const realFsync = fs.fsyncSync;
    const realRename = fs.renameSync;
    const m1 = mock.method(fs, 'fsyncSync', fd => { calls.push('fsync'); return realFsync(fd); });
    const m2 = mock.method(fs, 'renameSync', (a, b) => { calls.push('rename'); return realRename(a, b); });
    try {
        await cleanupEventNotes({ dir, now: NOW, log });
    } finally {
        m1.mock.restore();
        m2.mock.restore();
    }
    assert.deepStrictEqual(calls, ['fsync', 'rename']);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'a_1.json'), 'utf8'));
    assert.strictEqual(saved.signups['1:a'][0].note, '');
    assert.ok(!fs.existsSync(path.join(dir, 'a_1.json.tmp')));
});

test('a failed or short write leaves the original byte-identical and logs no success', async () => {
    const { dir, logs, log } = setup({ 'a_1.json': makeEvent() });
    const file = path.join(dir, 'a_1.json');
    const before = fs.readFileSync(file);
    const realWriteFile = fs.writeFileSync;
    const realWriteSync = fs.writeSync;
    const m1 = test.mock.method(fs, 'writeFileSync', (fd, data, ...rest) => {
        if (typeof fd !== 'number') return realWriteFile(fd, data, ...rest);
        realWriteFile(fd, String(data).slice(0, 10));
        throw Object.assign(new Error('no space SECRETMSG'), { code: 'ENOSPC' });
    });
    // Short write that reports success: must never be renamed over the original.
    const m2 = test.mock.method(fs, 'writeSync', (fd, data, ...rest) => {
        const half = typeof data === 'string' ? data.slice(0, 10) : data;
        return realWriteSync(fd, half, ...rest);
    });
    let result;
    try {
        result = await cleanupEventNotes({ dir, now: NOW, log });
    } finally {
        m1.mock.restore();
        m2.mock.restore();
    }
    assert.deepStrictEqual(result, { clearedNotes: 0, changedEvents: 0 });
    assert.deepStrictEqual(fs.readFileSync(file), before);
    assert.ok(!fs.existsSync(`${file}.tmp`));
    assert.ok(!logs.some(l => l.startsWith('Event note cleanup: cleared')));
    assert.ok(logs.some(l => l.includes('a_1.json') && l.includes('ENOSPC')));
    assert.ok(!logs.some(l => l.includes('SECRETMSG') || l.includes('Bortrest')));
});

test('a short write that reports success never replaces the original', async () => {
    const { dir, logs, log } = setup({ 'a_1.json': makeEvent() });
    const file = path.join(dir, 'a_1.json');
    const before = fs.readFileSync(file);
    const realWriteSync = fs.writeSync;
    const m = test.mock.method(fs, 'writeSync', (fd, data, ...rest) =>
        realWriteSync(fd, typeof data === 'string' ? data.slice(0, 10) : data.subarray(0, 10), ...rest));
    try {
        await cleanupEventNotes({ dir, now: NOW, log });
    } finally {
        m.mock.restore();
    }
    const after = fs.readFileSync(file);
    assert.doesNotThrow(() => JSON.parse(after.toString('utf8')));
    assert.ok(after.equals(before) || JSON.parse(after.toString('utf8')).signups['1:a'][0].note === '');
});

test('logs the error code when readdir fails for a reason other than ENOENT', async () => {
    const { root, logs, log } = setup();
    const notDir = path.join(root, 'file.txt');
    fs.writeFileSync(notDir, 'x');
    const result = await cleanupEventNotes({ dir: notDir, now: NOW, log });
    assert.deepStrictEqual(result, { clearedNotes: 0, changedEvents: 0 });
    assert.strictEqual(logs.length, 1);
    assert.ok(logs[0].includes('ENOTDIR'));
    assert.ok(!logs[0].includes(notDir));
});

test('log lines never contain error.message', async () => {
    const { dir, logs, log } = setup({ 'a_1.json': 'LEAKMARK not json' });
    await cleanupEventNotes({ dir, now: NOW, log });
    assert.strictEqual(logs.length, 1);
    assert.ok(logs[0].includes('a_1.json'));
    assert.ok(logs[0].includes('SyntaxError'));
    assert.ok(!logs[0].includes('LEAKMARK'));
});
