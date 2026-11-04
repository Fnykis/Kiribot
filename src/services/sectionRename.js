const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const lockFile = require('lockfile');
const logActivity = require('../core/logger');
const { writeJsonAtomic } = require('../utils/eventArchive');

const lockAsync = promisify(lockFile.lock);
const unlockAsync = promisify(lockFile.unlock);

// Defaults match dir_EventsActive from src/core/constants.js and lists.js
const DEFAULT_ACTIVE_DIR = 'src/events/active';
const DEFAULT_INSTRUMENT_LIST_PATH = 'src/data/instrumentList.json';
const LOCK_OPTIONS = { stale: 5 * 60 * 1000, retries: 50, retryWait: 50 };

function isSectionRename(oldRole, newRole, { guildId, sectionColor }) {
    return newRole.guild.id === guildId
        && oldRole.name !== newRole.name
        && (oldRole.hexColor === sectionColor || newRole.hexColor === sectionColor);
}

function renameKey(object, oldName, newName, merge) {
    const renamed = {};
    for (const [key, value] of Object.entries(object)) {
        if (key === newName && oldName in object) continue;
        if (key === oldName) {
            renamed[newName] = newName in object ? merge(object[newName], value) : value;
        } else {
            renamed[key] = value;
        }
    }
    return renamed;
}

function mergeSignups(target, source) {
    const ids = new Set(target.map(entry => entry.id));
    return [...target, ...source.filter(entry => !ids.has(entry.id))];
}

function mergeNames(target, source) {
    return [...new Set([...target, ...source])];
}

function renameSectionInEvent(eventData, oldName, newName) {
    const data = structuredClone(eventData);
    let changed = false;

    if (data.signups && Object.prototype.hasOwnProperty.call(data.signups, oldName)) {
        data.signups = renameKey(data.signups, oldName, newName, mergeSignups);
        changed = true;
    }
    for (const entry of Array.isArray(data.lineup) ? data.lineup : []) {
        if (entry.instrument === oldName) {
            entry.instrument = newName;
            changed = true;
        }
    }

    return { eventData: data, changed };
}

async function renameInEventFile(file, { oldName, newName, activeDir, lockDir }) {
    const filePath = path.join(activeDir, file);
    // Signup buttons and lineupStore lock the same event at different paths.
    const lockPaths = [path.join(lockDir, `${file}.lock`), `${filePath}.lock`];
    const held = [];

    try {
        for (const lockPath of lockPaths) {
            await lockAsync(lockPath, LOCK_OPTIONS);
            held.push(lockPath);
        }
        const { eventData, changed } = renameSectionInEvent(JSON.parse(fs.readFileSync(filePath, 'utf8')), oldName, newName);
        if (changed) writeJsonAtomic(filePath, eventData);
        return changed;
    } finally {
        for (const lockPath of held.reverse()) {
            try { await unlockAsync(lockPath); } catch (_) { /* best effort */ }
        }
    }
}

function renameInInstrumentList({ oldName, newName, instrumentListPath, instrumentList }) {
    if (instrumentList && oldName in instrumentList) {
        const renamed = renameKey(instrumentList, oldName, newName, mergeNames);
        for (const key of Object.keys(instrumentList)) delete instrumentList[key];
        Object.assign(instrumentList, renamed);
    }
    if (!fs.existsSync(instrumentListPath)) return;

    const stored = JSON.parse(fs.readFileSync(instrumentListPath, 'utf8'));
    if (oldName in stored) {
        writeJsonAtomic(instrumentListPath, renameKey(stored, oldName, newName, mergeNames));
    }
}

async function renameSectionInFiles({
    oldName,
    newName,
    activeDir = DEFAULT_ACTIVE_DIR,
    lockDir = '.',
    instrumentListPath = DEFAULT_INSTRUMENT_LIST_PATH,
    instrumentList,
    log = logActivity
}) {
    let files = [];
    try {
        files = fs.readdirSync(activeDir).filter(file => file.endsWith('.json'));
    } catch (error) {
        if (error.code !== 'ENOENT') log(`Section rename: failed to read events (${error.code || error.name})`);
    }

    let changedEvents = 0;
    for (const file of files) {
        try {
            if (await renameInEventFile(file, { oldName, newName, activeDir, lockDir })) changedEvents++;
        } catch (error) {
            log(`Section rename: failed to update ${file} (${error.code || error.name})`);
        }
    }

    try {
        renameInInstrumentList({ oldName, newName, instrumentListPath, instrumentList });
    } catch (error) {
        log(`Section rename: failed to update instrument list (${error.code || error.name})`);
    }

    if (changedEvents > 0) log(`Section rename: ${oldName} -> ${newName} in ${changedEvents} events`);
    return { changedEvents };
}

module.exports = { isSectionRename, renameSectionInEvent, renameSectionInFiles };
