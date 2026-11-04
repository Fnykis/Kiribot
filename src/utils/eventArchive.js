const fs = require('fs');
const path = require('path');
const logActivity = require('../core/logger');

// Writes JSON to `${filePath}.tmp`, fsyncs, then renames over filePath.
// writeFileSync(fd, ...) loops until all bytes are written or throws, so a short
// write can never be renamed over the original. Any failure removes the tmp file.
function writeJsonAtomic(filePath, data) {
    const tmpPath = `${filePath}.tmp`;
    const json = JSON.stringify(data, null, 2);
    try {
        const fd = fs.openSync(tmpPath, 'w');
        try {
            fs.writeFileSync(fd, json);
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
        fs.renameSync(tmpPath, filePath);
    } catch (error) {
        try { fs.rmSync(tmpPath, { force: true, recursive: true }); } catch { /* ignore */ }
        throw error;
    }
}

// Saves archivedAt on an archived event file. Keeps an existing value.
// Never throws: a failure is logged and the event stays archived.
function stampArchivedAt(filePath, { now = () => new Date(), log = logActivity } = {}) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.archivedAt) return;
        data.archivedAt = now().toISOString();
        writeJsonAtomic(filePath, data);
    } catch (error) {
        log(`Failed to save archivedAt for ${path.basename(filePath)} (${error.code || error.name})`);
    }
}

// Moves an event file to the archive dir, then stamps archivedAt. Rename failures throw.
function archiveEventFile(oldPath, newPath, { now, log } = {}) {
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.renameSync(oldPath, newPath);
    stampArchivedAt(newPath, { now, log });
}

module.exports = { archiveEventFile, stampArchivedAt, writeJsonAtomic };
