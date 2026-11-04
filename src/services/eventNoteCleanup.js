const fs = require('fs');
const path = require('path');
const logActivity = require('../core/logger');
const { parseEventDate } = require('../utils/dateUtils');
const { writeJsonAtomic } = require('../utils/eventArchive');

// Default matches dir_EventsArchived from src/core/constants.js
const DEFAULT_ARCHIVED_DIR = 'src/events/archived';
const NOTE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function hasNote(entry) {
    return !!entry && typeof entry.note === 'string' && entry.note.length > 0;
}

function sections(eventData) {
    if (!eventData || typeof eventData.signups !== 'object' || eventData.signups === null) return [];
    return Object.values(eventData.signups).filter(Array.isArray);
}

function countNotes(eventData) {
    return sections(eventData).reduce((sum, list) => sum + list.filter(hasNote).length, 0);
}

// archivedAt must be an ISO string written by toISOString(); anything else is invalid.
function parseArchivedAt(value) {
    if (typeof value !== 'string') return null;
    const d = new Date(value);
    if (isNaN(d.getTime()) || d.toISOString() !== value) return null;
    return d;
}

// Clears notes once 30 days have passed since archivedAt (or the event date when
// archivedAt is missing). An invalid archivedAt never falls back to the date.
// Returns a copy; the input is not mutated.
function stripExpiredNotes(eventData, now) {
    const copy = structuredClone(eventData);
    const reference = eventData.archivedAt === undefined
        ? parseEventDate(eventData.date)
        : parseArchivedAt(eventData.archivedAt);
    if (!reference || isNaN(reference.getTime())) {
        return { eventData: copy, clearedCount: 0, dateValid: false };
    }
    if (now.getTime() - reference.getTime() < NOTE_RETENTION_MS) {
        return { eventData: copy, clearedCount: 0, dateValid: true };
    }
    let clearedCount = 0;
    for (const list of sections(copy)) {
        for (const entry of list) {
            if (hasNote(entry)) {
                entry.note = '';
                clearedCount++;
            }
        }
    }
    return { eventData: copy, clearedCount, dateValid: true };
}

// Scans archived events only. Read, change and rename are synchronous (no await)
// so nothing can interleave with the archivedAt stamp. Logs never include file
// content: error.message is skipped because JSON.parse messages can quote it.
async function cleanupEventNotes({ dir = DEFAULT_ARCHIVED_DIR, now = () => new Date(), log = logActivity } = {}) {
    let files;
    try {
        files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch (error) {
        if (error.code !== 'ENOENT') log(`Event note cleanup: cannot read archive directory (${error.code || error.name})`);
        return { clearedNotes: 0, changedEvents: 0 };
    }

    let clearedNotes = 0;
    let changedEvents = 0;
    for (const file of files) {
        const filePath = path.join(dir, file);
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            const result = stripExpiredNotes(data, now());
            if (!result.dateValid) {
                if (countNotes(data) > 0) log(`Event note cleanup: invalid archive date in ${file}`);
                continue;
            }
            if (result.clearedCount === 0) continue;
            writeJsonAtomic(filePath, result.eventData);
            clearedNotes += result.clearedCount;
            changedEvents++;
        } catch (error) {
            log(`Event note cleanup failed for ${file} (${error.code || error.name})`);
        }
    }

    if (clearedNotes > 0) {
        log(`Event note cleanup: cleared ${clearedNotes} notes from ${changedEvents} events`);
    }
    return { clearedNotes, changedEvents };
}

module.exports = { stripExpiredNotes, cleanupEventNotes };
