const { isRealMonthDay } = require('./arshjulDates');

// 100 is Discord's thread-name limit, so a validated title never needs truncating at send time.
const MAX_TITLE_LENGTH = 100;
// Discord's message limit is 2000; the rest is headroom for the role mention and the test prefix.
const MAX_BODY_LENGTH = 1500;

function validateEntryInput(input) {
    const src = input && typeof input === 'object' ? input : {};

    if (typeof src.title !== 'string') return { ok: false, field: 'title' };
    const title = src.title.trim();
    if (title.length < 1 || title.length > MAX_TITLE_LENGTH) return { ok: false, field: 'title' };

    const rawBody = src.body === undefined || src.body === null ? '' : src.body;
    if (typeof rawBody !== 'string') return { ok: false, field: 'body' };
    const body = rawBody.trim();
    if (body.length > MAX_BODY_LENGTH) return { ok: false, field: 'body' };

    if (!isRealMonthDay(src.monthDay)) return { ok: false, field: 'monthDay' };

    return { ok: true, value: { title, body, monthDay: src.monthDay } };
}

module.exports = { validateEntryInput, MAX_TITLE_LENGTH, MAX_BODY_LENGTH };
