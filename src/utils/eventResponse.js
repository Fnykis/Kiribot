// Planner responses never expose signup notes. Returns a copy of the event
// with `note` removed from every signup entry; stored data is untouched.
function withoutSignupNotes(event) {
    if (!event || typeof event.signups !== 'object' || event.signups === null) return { ...event };
    const signups = {};
    for (const [section, list] of Object.entries(event.signups)) {
        signups[section] = Array.isArray(list)
            ? list.map(({ note, ...rest }) => rest)
            : list;
    }
    return { ...event, signups };
}

module.exports = { withoutSignupNotes };
