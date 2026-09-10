const TZ = 'Europe/Stockholm';

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// sv-SE formats as YYYY-MM-DD, which is why it is used here rather than the
// user's locale — see src/core/logger.js:30 for the same trick.
const dayFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
});
const clockFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

function todayInStockholm(now = new Date()) {
    const [year, month, day] = dayFormatter.format(now).split('-');
    return { year: Number(year), monthDay: `${month}-${day}` };
}

function clockInStockholm(now = new Date()) {
    const [hour, minute, second] = clockFormatter.format(now).split(':').map(Number);
    return { hour, minute, second };
}

function hourInStockholm(now = new Date()) {
    return clockInStockholm(now).hour;
}

function isRealMonthDay(md) {
    if (typeof md !== 'string' || !/^\d{2}-\d{2}$/.test(md)) return false;
    const month = Number(md.slice(0, 2));
    const day = Number(md.slice(3, 5));
    if (month < 1 || month > 12) return false;
    return day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function effectiveMonthDay(md, year) {
    return md === '02-29' && !isLeapYear(year) ? '02-28' : md;
}

function pad(n) {
    return String(n).padStart(2, '0');
}

function dueWindow(year, monthDay, days = 2) {
    const month = Number(monthDay.slice(0, 2));
    const day = Number(monthDay.slice(3, 5));
    const out = [];
    for (let back = 0; back <= days; back++) {
        // UTC arithmetic only — this is calendar maths on a MM-DD, not a wall clock.
        const dt = new Date(Date.UTC(year, month - 1, day - back));
        if (dt.getUTCFullYear() !== year) continue; // clamp at 1 January
        out.push(`${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`);
    }
    return out;
}

function isAheadOfToday(md, now = new Date()) {
    const today = todayInStockholm(now);
    // MM-DD strings sort correctly as text.
    return effectiveMonthDay(md, today.year) > today.monthDay;
}

function msUntilNextSendHour(now = new Date(), sendHour = 8) {
    const { hour, minute, second } = clockInStockholm(now);
    let hoursAhead = sendHour - hour;
    if (hoursAhead < 0 || (hoursAhead === 0 && (minute > 0 || second > 0))) hoursAhead += 24;
    return ((hoursAhead * 60 - minute) * 60 - second) * 1000;
}

function shouldTickOnStart(now = new Date(), sendHour = 8) {
    return hourInStockholm(now) >= sendHour;
}

module.exports = {
    todayInStockholm, clockInStockholm, hourInStockholm, isRealMonthDay, isLeapYear,
    effectiveMonthDay, dueWindow, isAheadOfToday, msUntilNextSendHour, shouldTickOnStart
};
