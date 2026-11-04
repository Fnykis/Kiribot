const test = require('node:test');
const assert = require('node:assert');
const { maskedLinkLabel } = require('../../src/utils/stringUtils');

test('maskedLinkLabel removes an emoji and the space before it', () => {
    assert.strictEqual(
        maskedLinkLabel('[BET] Nätverkstans jubileumsfest 5 november 💫'),
        '[BET] Nätverkstans jubileumsfest 5 november'
    );
});

test('maskedLinkLabel collapses the gap left by an emoji mid-title', () => {
    assert.strictEqual(maskedLinkLabel('[SOC] Fest 🎉 på Scen 46'), '[SOC] Fest på Scen 46');
});

test('maskedLinkLabel removes multi-codepoint emoji completely', () => {
    assert.strictEqual(maskedLinkLabel('Fest ❤️ 👩‍🎤 👍🏽 🇸🇪'), 'Fest');
});

test('maskedLinkLabel keeps digits and Swedish letters', () => {
    assert.strictEqual(maskedLinkLabel('[PRV] Åsas 50 årsfest 6 juni'), '[PRV] Åsas 50 årsfest 6 juni');
});

test('maskedLinkLabel falls back when the title is only emoji', () => {
    assert.strictEqual(maskedLinkLabel('💫 🎉'), 'Signup');
});
