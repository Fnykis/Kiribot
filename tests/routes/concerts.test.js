const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const createConcertsRoute = require('../../src/routes/api/concerts');
const { parseEventDate } = require('../../src/utils/dateUtils');

function mockRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; }
    };
}

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'concerts-test-'));
}

function writeEvent(dir, fileName, payload) {
    fs.writeFileSync(path.join(dir, fileName), JSON.stringify(payload));
}

test('returns events sorted by date ascending (soonest first)', () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'a_111.json', { name: 'Senare',    id: '111', date: '01/06/26' });
        writeEvent(dir, 'b_222.json', { name: 'Tidigare',  id: '222', date: '08/03/26' });
        writeEvent(dir, 'c_333.json', { name: 'Mitten',    id: '333', date: '23/05/26' });

        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);

        assert.strictEqual(res.statusCode, 200);
        assert.deepStrictEqual(res.body, [
            { concertId: '222', name: 'Tidigare', date: '08/03/26' },
            { concertId: '333', name: 'Mitten',   date: '23/05/26' },
            { concertId: '111', name: 'Senare',   date: '01/06/26' }
        ]);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('returns empty array when directory is empty', () => {
    const dir = makeTmpDir();
    try {
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.deepStrictEqual(res.body, []);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('returns empty array when directory does not exist', () => {
    const handler = createConcertsRoute({ activeDir: '/nonexistent/path/xyz', parseEventDate });
    const res = mockRes();
    handler({}, res);
    assert.deepStrictEqual(res.body, []);
});

test('skips non-JSON files', () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'real_111.json', { name: 'Konsert', id: '111', date: '08/03/26' });
        fs.writeFileSync(path.join(dir, 'README.txt'), 'ignore me');
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.strictEqual(res.body.length, 1);
        assert.strictEqual(res.body[0].concertId, '111');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('skips malformed JSON without crashing', () => {
    const dir = makeTmpDir();
    try {
        fs.writeFileSync(path.join(dir, 'broken.json'), '{not json');
        writeEvent(dir, 'good_222.json', { name: 'OK', id: '222', date: '08/03/26' });
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.strictEqual(res.body.length, 1);
        assert.strictEqual(res.body[0].concertId, '222');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('skips events missing id, name, or date', () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'no_id.json',   { name: 'X',  date: '08/03/26' });
        writeEvent(dir, 'no_name.json', { id: '111', date: '08/03/26' });
        writeEvent(dir, 'no_date.json', { id: '222', name: 'Y' });
        writeEvent(dir, 'good.json',    { id: '333', name: 'OK', date: '08/03/26' });
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.strictEqual(res.body.length, 1);
        assert.strictEqual(res.body[0].concertId, '333');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('skips events with active === false', () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'inactive.json', { id: '111', name: 'Hidden', date: '08/03/26', active: false });
        writeEvent(dir, 'active.json',   { id: '222', name: 'Visible', date: '08/03/26', active: true });
        writeEvent(dir, 'nofield.json',  { id: '333', name: 'NoField', date: '08/03/26' });
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.strictEqual(res.body.length, 2);
        assert.ok(res.body.every(c => c.concertId !== '111'));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('events with unparseable date sort to the end (stable)', () => {
    const dir = makeTmpDir();
    try {
        writeEvent(dir, 'bad_111.json',  { id: '111', name: 'Bad',     date: 'TBD' });
        writeEvent(dir, 'good_222.json', { id: '222', name: 'Good',    date: '08/03/26' });
        const handler = createConcertsRoute({ activeDir: dir, parseEventDate });
        const res = mockRes();
        handler({}, res);
        assert.strictEqual(res.body[0].concertId, '222');
        assert.strictEqual(res.body[1].concertId, '111');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
