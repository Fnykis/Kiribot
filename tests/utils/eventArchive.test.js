const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { archiveEventFile, stampArchivedAt, writeJsonAtomic } = require('../../src/utils/eventArchive');

const NOW = () => new Date('2026-11-04T03:00:00.000Z');

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'eventarchive-test-'));
}

function setup(content) {
    const root = makeTmpDir();
    const active = path.join(root, 'active');
    const archived = path.join(root, 'archived');
    fs.mkdirSync(active);
    const oldPath = path.join(active, 'a_1.json');
    fs.writeFileSync(oldPath, content ?? JSON.stringify({ id: '1', signups: {} }, null, 2));
    return { root, archived, oldPath, newPath: path.join(archived, 'a_1.json') };
}

test('archiveEventFile moves the event and saves archivedAt', () => {
    const { root, oldPath, newPath } = setup();
    try {
        const log = () => {};
        archiveEventFile(oldPath, newPath, { now: NOW, log });
        assert.strictEqual(fs.existsSync(oldPath), false);
        assert.strictEqual(JSON.parse(fs.readFileSync(newPath, 'utf8')).archivedAt, '2026-11-04T03:00:00.000Z');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('stampArchivedAt keeps an existing archivedAt', () => {
    const { root, oldPath } = setup(JSON.stringify({ id: '1', archivedAt: '2026-01-01T00:00:00.000Z' }));
    try {
        stampArchivedAt(oldPath, { now: NOW, log: () => {} });
        assert.strictEqual(JSON.parse(fs.readFileSync(oldPath, 'utf8')).archivedAt, '2026-01-01T00:00:00.000Z');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('archiveEventFile creates a missing archive directory', () => {
    const { root, archived, oldPath, newPath } = setup();
    try {
        assert.strictEqual(fs.existsSync(archived), false);
        archiveEventFile(oldPath, newPath, { now: NOW, log: () => {} });
        assert.strictEqual(fs.existsSync(newPath), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('archiveEventFile throws when the rename fails', () => {
    const { root, newPath } = setup();
    try {
        const missing = path.join(root, 'active', 'missing_9.json');
        assert.throws(() => archiveEventFile(missing, newPath, { now: NOW, log: () => {} }));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('a failed archivedAt write logs an error and leaves the event archived', () => {
    const marker = 'LEAKMARK';
    const { root, oldPath, newPath } = setup(`${marker} not json`);
    try {
        const lines = [];
        archiveEventFile(oldPath, newPath, { now: NOW, log: (m) => lines.push(m) });
        assert.strictEqual(fs.existsSync(newPath), true);
        assert.strictEqual(lines.length, 1);
        assert.ok(lines[0].includes('a_1.json'));
        assert.ok(!lines[0].includes(marker), 'log line must not leak file content');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

function failingWrite(realWrite) {
    // Writes half the bytes, then fails like ENOSPC.
    return (fd, data, ...rest) => {
        if (typeof fd !== 'number') return realWrite(fd, data, ...rest);
        realWrite(fd, String(data).slice(0, 10));
        throw Object.assign(new Error('no space SECRETMSG'), { code: 'ENOSPC' });
    };
}

test('writeJsonAtomic writes pretty JSON and leaves no tmp file', () => {
    const root = makeTmpDir();
    try {
        const file = path.join(root, 'x.json');
        writeJsonAtomic(file, { a: 1 });
        assert.strictEqual(fs.readFileSync(file, 'utf8'), JSON.stringify({ a: 1 }, null, 2));
        assert.strictEqual(fs.existsSync(`${file}.tmp`), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('writeJsonAtomic failure leaves the original byte-identical', () => {
    const root = makeTmpDir();
    const file = path.join(root, 'x.json');
    fs.writeFileSync(file, JSON.stringify({ keep: 'me' }, null, 2));
    const before = fs.readFileSync(file);
    const real = fs.writeFileSync;
    const m = test.mock.method(fs, 'writeFileSync', failingWrite(real));
    try {
        assert.throws(() => writeJsonAtomic(file, { replaced: 'x'.repeat(100) }));
    } finally {
        m.mock.restore();
    }
    try {
        assert.deepStrictEqual(fs.readFileSync(file), before);
        assert.strictEqual(fs.existsSync(`${file}.tmp`), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('stampArchivedAt write failure leaves the original valid and logs code only', () => {
    const { root, oldPath } = setup();
    const before = fs.readFileSync(oldPath);
    const real = fs.writeFileSync;
    const m = test.mock.method(fs, 'writeFileSync', failingWrite(real));
    const lines = [];
    try {
        stampArchivedAt(oldPath, { now: NOW, log: l => lines.push(l) });
    } finally {
        m.mock.restore();
    }
    try {
        assert.deepStrictEqual(fs.readFileSync(oldPath), before);
        assert.strictEqual(lines.length, 1);
        assert.ok(lines[0].includes('a_1.json'));
        assert.ok(lines[0].includes('ENOSPC'));
        assert.ok(!lines[0].includes('SECRETMSG'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
