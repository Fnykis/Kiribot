const fs = require('fs');
const path = require('path');

const METRICS_ENABLED = true;

function getLogPath(createdAt, jsonFileName) {
    const d = new Date(createdAt);
    const yyyy = d.getFullYear().toString();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const logFileName = jsonFileName.replace(/\.json$/, '.log');
    const dir = path.join(process.cwd(), 'logs', 'events', yyyy, mm);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, logFileName);
}

function ts() {
    return new Date().toISOString();
}

function append(logPath, line) {
    if (!METRICS_ENABLED) return;
    fs.appendFileSync(logPath, line + '\n');
}

function logEventCreated(fileName, eventName, createdAt) {
    try {
        const logPath = getLogPath(createdAt, fileName);
        append(logPath, `[${ts()}] CREATED event="${eventName}"`);
    } catch (err) {
        console.error('eventMetrics logEventCreated error:', err);
    }
}

function logSignup(fileName, createdAt, responseType) {
    try {
        if (!createdAt) return;
        const logPath = getLogPath(createdAt, fileName);
        append(logPath, `[${ts()}] SIGNUP type=${responseType}`);
    } catch (err) {
        console.error('eventMetrics logSignup error:', err);
    }
}

function logSignupEdit(fileName, createdAt, prevType, newType) {
    try {
        if (!createdAt) return;
        const logPath = getLogPath(createdAt, fileName);
        append(logPath, `[${ts()}] SIGNUP_EDIT prev=${prevType} new=${newType}`);
    } catch (err) {
        console.error('eventMetrics logSignupEdit error:', err);
    }
}

function logReminderSent(fileName, createdAt) {
    try {
        if (!createdAt) return;
        const logPath = getLogPath(createdAt, fileName);
        append(logPath, `[${ts()}] REMINDER_SENT`);
    } catch (err) {
        console.error('eventMetrics logReminderSent error:', err);
    }
}

function logCancelled(fileName, createdAt) {
    try {
        if (!createdAt) return;
        const logPath = getLogPath(createdAt, fileName);
        append(logPath, `[${ts()}] CANCELLED`);
    } catch (err) {
        console.error('eventMetrics logCancelled error:', err);
    }
}

function logReopened(fileName, createdAt) {
    try {
        if (!createdAt) return;
        const logPath = getLogPath(createdAt, fileName);
        append(logPath, `[${ts()}] REOPENED`);
    } catch (err) {
        console.error('eventMetrics logReopened error:', err);
    }
}

function logArchived(fileName, createdAt, summaryData) {
    try {
        if (!createdAt) return;
        const logPath = getLogPath(createdAt, fileName);
        const { eventName, eventDate, total, ja, nej, kanske, activeMembers, threadMessages, instruments } = summaryData;

        const jaRatio  = total > 0 ? Math.round((ja      / total) * 100) : 0;
        const nejRatio = total > 0 ? Math.round((nej     / total) * 100) : 0;
        const kRatio   = total > 0 ? Math.round((kanske  / total) * 100) : 0;

        const lines = [
            '',
            `=== ARCHIVED ${ts()} ===`,
            `event_date: ${eventDate}`,
            `total_signups: ${total}`,
            `distribution: ja=${ja} (${jaRatio}%) nej=${nej} (${nejRatio}%) kanske=${kanske} (${kRatio}%)`,
            `active_members: ${activeMembers}`,
            `thread_messages: ${threadMessages}`,
            'instruments:'
        ];

        for (const [instrument, counts] of Object.entries(instruments)) {
            lines.push(`  ${instrument}: ja=${counts.ja} nej=${counts.nej} kanske=${counts.kanske} total=${counts.total}`);
        }

        for (const line of lines) {
            append(logPath, line);
        }
    } catch (err) {
        console.error('eventMetrics logArchived error:', err);
    }
}

function deleteEventLog(fileName, createdAt) {
    try {
        if (!METRICS_ENABLED || !createdAt) return;
        const logPath = getLogPath(createdAt, fileName);
        if (fs.existsSync(logPath)) {
            fs.unlinkSync(logPath);
        }
    } catch (err) {
        console.error('eventMetrics deleteEventLog error:', err);
    }
}

module.exports = {
    logEventCreated,
    logSignup,
    logSignupEdit,
    logReminderSent,
    logCancelled,
    logReopened,
    logArchived,
    deleteEventLog
};
