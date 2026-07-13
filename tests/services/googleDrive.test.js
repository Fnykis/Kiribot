const test = require('node:test');
const assert = require('node:assert');

function loadDriveWithStubs() {
    const eventThreadPath = require.resolve('../../src/features/eventThread');
    const drivePath = require.resolve('../../src/services/google/drive');

    delete require.cache[drivePath];
    delete require.cache[eventThreadPath];

    const state = { findEventThreadCalled: false };

    require.cache[eventThreadPath] = {
        id: eventThreadPath,
        filename: eventThreadPath,
        loaded: true,
        exports: {
            findEventThread: async () => {
                state.findEventThreadCalled = true;
                return null;
            }
        }
    };

    const drive = require('../../src/services/google/drive');

    delete require.cache[drivePath];
    delete require.cache[eventThreadPath];

    return { drive, state };
}

test('processPassedEvent: skips inactive (active:false) events without looking up the thread', async () => {
    const { drive, state } = loadDriveWithStubs();
    const eventData = {
        name: 'Test Event',
        id: '470381385',
        date: '01/08/26',
        time: '15:00',
        active: false,
        createDriveDir: true
    };

    await drive.processPassedEvent(eventData, 'test.json');

    assert.equal(state.findEventThreadCalled, false, 'findEventThread should not be called for an inactive event');
});

test('processPassedEvent: still processes active events (active:true)', async () => {
    const { drive, state } = loadDriveWithStubs();
    const eventData = {
        name: 'Test Event',
        id: '470381386',
        date: '01/08/26',
        time: '15:00',
        active: true,
        createDriveDir: true
    };

    await drive.processPassedEvent(eventData, 'test.json');

    assert.equal(state.findEventThreadCalled, true, 'findEventThread should still be called for an active event');
});

test('processPassedEvent: skips already-completed events (driveLinkPosted:true) without any thread lookup', async () => {
    // Regression test: previously, processPassedEvent re-derived "already handled"
    // status via live Discord API calls on every hourly run, which was fragile and
    // caused "already posted" log spam every hour for the rest of the day. Once
    // driveLinkPosted is persisted, later runs must bail out before any API call.
    const { drive, state } = loadDriveWithStubs();
    const eventData = {
        name: 'Test Event',
        id: '470381387',
        date: '01/08/26',
        time: '15:00',
        active: true,
        createDriveDir: true,
        driveLinkPosted: true
    };

    await drive.processPassedEvent(eventData, 'test.json');

    assert.equal(state.findEventThreadCalled, false, 'findEventThread should not be called once driveLinkPosted is true');
});
