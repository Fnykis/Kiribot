const test = require('node:test');
const assert = require('node:assert');
const { mock } = require('node:test');
const {
    scheduleRevoke,
    cancelRevoke,
    scheduleReplyDeletion,
    REVOKE_DELAY_MS,
} = require('../../src/services/lineupAccess');

// Flush pending microtasks/macrotasks after ticking faked timers, so the async
// timer callbacks (which await channel/interaction calls) settle before asserting.
const flush = () => new Promise(r => setImmediate(r));

test('REVOKE_DELAY_MS is 1 minute', () => {
    assert.equal(REVOKE_DELAY_MS, 60 * 1000);
});

test('scheduleRevoke deletes the user overwrite after the delay', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const deleted = [];
        const channel = { permissionOverwrites: { delete: async (id) => { deleted.push(id); } } };
        scheduleRevoke('U1', channel);
        assert.deepEqual(deleted, [], 'should not revoke before the delay');
        mock.timers.tick(REVOKE_DELAY_MS);
        await flush();
        assert.deepEqual(deleted, ['U1']);
    } finally {
        mock.timers.reset();
    }
});

test('cancelRevoke prevents the scheduled revoke', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const deleted = [];
        const channel = { permissionOverwrites: { delete: async (id) => { deleted.push(id); } } };
        scheduleRevoke('U2', channel);
        cancelRevoke('U2');
        mock.timers.tick(REVOKE_DELAY_MS);
        await flush();
        assert.deepEqual(deleted, []);
    } finally {
        mock.timers.reset();
    }
});

test('scheduleReplyDeletion deletes the ephemeral reply after the delay', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        let deletedReply = 0;
        const interaction = { deleteReply: async () => { deletedReply++; } };
        scheduleReplyDeletion(interaction, 'U3');
        assert.equal(deletedReply, 0, 'should not delete before the delay');
        mock.timers.tick(REVOKE_DELAY_MS);
        await flush();
        assert.equal(deletedReply, 1);
    } finally {
        mock.timers.reset();
    }
});

test('scheduleReplyDeletion swallows a deleteReply rejection', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const interaction = { deleteReply: async () => { throw new Error('already dismissed'); } };
        scheduleReplyDeletion(interaction, 'U4');
        mock.timers.tick(REVOKE_DELAY_MS);
        await flush(); // .catch must run without throwing / unhandled rejection
        assert.ok(true);
    } finally {
        mock.timers.reset();
    }
});
