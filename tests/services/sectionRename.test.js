const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    isSectionRename,
    renameSectionInEvent,
    renameSectionInFiles
} = require('../../src/services/sectionRename');

function setup(files = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sectionrename-test-'));
    const activeDir = path.join(root, 'active');
    fs.mkdirSync(activeDir);
    for (const [name, value] of Object.entries(files)) {
        const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        fs.writeFileSync(path.join(activeDir, name), content);
    }
    const instrumentListPath = path.join(root, 'instrumentList.json');
    return { root, activeDir, lockDir: root, instrumentListPath };
}

function read(dir, name) {
    return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
}

const event = () => ({
    id: '1',
    signups: {
        '1:a': [{ id: 'a', name: 'A', response: 'ja', note: '' }],
        repenique: [{ id: 'b', name: 'B', response: 'ja', note: 'Hej' }],
        tarol: []
    },
    lineup: [
        { userId: 'b', instrument: 'repenique', position: { x: 1, y: 2 } },
        { userId: 'a', instrument: '1:a', position: { x: 3, y: 4 } }
    ]
});

test('renames the section key and keeps its position and entries', () => {
    const { eventData, changed } = renameSectionInEvent(event(), 'repenique', 'repinique');
    assert.strictEqual(changed, true);
    assert.deepStrictEqual(Object.keys(eventData.signups), ['1:a', 'repinique', 'tarol']);
    assert.deepStrictEqual(eventData.signups.repinique, event().signups.repenique);
});

test('renames lineup instruments', () => {
    const { eventData } = renameSectionInEvent(event(), 'repenique', 'repinique');
    assert.strictEqual(eventData.lineup[0].instrument, 'repinique');
    assert.strictEqual(eventData.lineup[1].instrument, '1:a');
});

test('renames a lineup instrument when the signup section is missing', () => {
    const input = { signups: {}, lineup: [{ userId: 'b', instrument: 'repenique' }] };
    const { eventData, changed } = renameSectionInEvent(input, 'repenique', 'repinique');
    assert.strictEqual(changed, true);
    assert.strictEqual(eventData.lineup[0].instrument, 'repinique');
});

test('merges into an existing section without duplicate members', () => {
    const input = event();
    input.signups.repinique = [
        { id: 'b', name: 'B', response: 'nej', note: '' },
        { id: 'c', name: 'C', response: 'ja', note: '' }
    ];
    const { eventData } = renameSectionInEvent(input, 'repenique', 'repinique');
    assert.strictEqual(eventData.signups.repenique, undefined);
    assert.deepStrictEqual(eventData.signups.repinique.map(e => [e.id, e.response]), [['b', 'nej'], ['c', 'ja']]);
});

test('reports no change when the old section is absent', () => {
    const input = { signups: { tarol: [] }, lineup: [{ userId: 'a', instrument: 'tarol' }] };
    const { eventData, changed } = renameSectionInEvent(input, 'repenique', 'repinique');
    assert.strictEqual(changed, false);
    assert.deepStrictEqual(eventData, input);
});

test('does not mutate its input', () => {
    const input = event();
    renameSectionInEvent(input, 'repenique', 'repinique');
    assert.deepStrictEqual(input, event());
});

test('updates only events that use the old name, and logs one line', async () => {
    const paths = setup({ 'a_1.json': event(), 'b_2.json': { signups: { tarol: [] }, lineup: [] } });
    const before = fs.readFileSync(path.join(paths.activeDir, 'b_2.json'));
    const logs = [];

    const result = await renameSectionInFiles({ oldName: 'repenique', newName: 'repinique', ...paths, log: m => logs.push(m) });

    assert.deepStrictEqual(result, { changedEvents: 1 });
    assert.ok(read(paths.activeDir, 'a_1.json').signups.repinique);
    assert.deepStrictEqual(fs.readFileSync(path.join(paths.activeDir, 'b_2.json')), before);
    assert.deepStrictEqual(logs, ['Section rename: repenique -> repinique in 1 events']);
});

test('logs nothing when no event or list uses the old name', async () => {
    const paths = setup({ 'b_2.json': { signups: { tarol: [] }, lineup: [] } });
    const logs = [];
    await renameSectionInFiles({ oldName: 'repenique', newName: 'repinique', ...paths, log: m => logs.push(m) });
    assert.deepStrictEqual(logs, []);
});

test('updates the instrument list file and cached list', async () => {
    const paths = setup();
    fs.writeFileSync(paths.instrumentListPath, JSON.stringify({ repenique: ['B'], tarol: ['C'] }));
    const instrumentList = { repenique: ['B'], tarol: ['C'] };

    await renameSectionInFiles({ oldName: 'repenique', newName: 'repinique', ...paths, instrumentList, log: () => {} });

    assert.deepStrictEqual(instrumentList, { repinique: ['B'], tarol: ['C'] });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(paths.instrumentListPath, 'utf8')), { repinique: ['B'], tarol: ['C'] });
});

test('logs a safe file error and still processes other files', async () => {
    const paths = setup({ 'a_1.json': 'LEAKMARK not json', 'b_2.json': event() });
    const logs = [];

    const result = await renameSectionInFiles({ oldName: 'repenique', newName: 'repinique', ...paths, log: m => logs.push(m) });

    assert.deepStrictEqual(result, { changedEvents: 1 });
    assert.ok(read(paths.activeDir, 'b_2.json').signups.repinique);
    assert.strictEqual(fs.readFileSync(path.join(paths.activeDir, 'a_1.json'), 'utf8'), 'LEAKMARK not json');
    assert.ok(logs.some(l => l.includes('a_1.json')));
    assert.ok(logs.every(l => !l.includes('LEAKMARK')));
});

test('releases both locks after each file', async () => {
    const paths = setup({ 'a_1.json': event() });
    await renameSectionInFiles({ oldName: 'repenique', newName: 'repinique', ...paths, log: () => {} });
    assert.deepStrictEqual(fs.readdirSync(paths.activeDir), ['a_1.json']);
    assert.ok(!fs.readdirSync(paths.lockDir).some(f => f.endsWith('.lock')));
});

test('returns zero for a missing active directory', async () => {
    const paths = setup();
    fs.rmSync(paths.activeDir, { recursive: true });
    const result = await renameSectionInFiles({ oldName: 'repenique', newName: 'repinique', ...paths, log: () => {} });
    assert.deepStrictEqual(result, { changedEvents: 0 });
});

test('isSectionRename matches instrument roles with a changed name only', () => {
    const role = (name, hexColor = '#e91e63', guildId = 'g') => ({ name, hexColor, guild: { id: guildId } });
    const opts = { guildId: 'g', sectionColor: '#e91e63' };
    assert.strictEqual(isSectionRename(role('repenique'), role('repinique'), opts), true);
    assert.strictEqual(isSectionRename(role('repenique'), role('repenique'), opts), false);
    assert.strictEqual(isSectionRename(role('a', '#000000'), role('b', '#000000'), opts), false);
    assert.strictEqual(isSectionRename(role('a', '#e91e63', 'x'), role('b', '#e91e63', 'x'), opts), false);
});
