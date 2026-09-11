const test = require('node:test');
const assert = require('node:assert');
const { getNickname, getMemberNickname } = require('../../src/utils/interactionUtils');

test('getMemberNickname prefers the guild nickname', () => {
    const member = { nickname: 'Olle', user: { username: 'olle123' } };
    assert.strictEqual(getMemberNickname(member), 'Olle');
});

test('getMemberNickname falls back to the username when no nickname is set', () => {
    const member = { nickname: null, user: { username: 'olle123' } };
    assert.strictEqual(getMemberNickname(member), 'olle123');
});

test('getNickname uses the member nickname when the interaction has a member', () => {
    const interaction = { member: { nickname: 'Olle', user: { username: 'olle123' } }, user: { username: 'olle123' } };
    assert.strictEqual(getNickname(interaction), 'Olle');
});

test('getNickname falls back to the user username outside a guild', () => {
    const interaction = { member: null, user: { username: 'olle123' } };
    assert.strictEqual(getNickname(interaction), 'olle123');
});
