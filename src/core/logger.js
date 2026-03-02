const fs = require('fs');
const path = require('path');

async function logActivity(...args) {
    const activity = args.map(arg => {
        if (arg instanceof Error) {
            return arg.stack ? arg.stack : arg.toString();
        }
        if (typeof arg === 'object' && arg !== null) {
            try {
                // Handle Discord API error objects specifically for better logging
                if (arg.rawError) {
                    return JSON.stringify({
                        message: arg.message,
                        method: arg.method,
                        path: arg.path,
                        code: arg.code,
                        httpStatus: arg.httpStatus,
                        rawError: arg.rawError,
                    }, null, 2);
                }
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return '[Unserializable Object]';
            }
        }
        return String(arg);
    }).join(' ');

	const logTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short', hourCycle: 'h24', timeZone: 'Europe/Stockholm'}).format(new Date());

	// Categorize log messages with emojis
	let emoji = '';
	let logType = '';

	let activityLower = activity.toLowerCase();

	if (activityLower.includes('joined the Discord')) {
		emoji = '🌟'; // Server join
	} else if (activityLower.includes('updated their status') ||
	           activityLower.includes('changed their nickname') ||
	           activityLower.includes(' left the workgroup ') ||
	           activityLower.includes(' joined the workgroup ') ||
	           activityLower.includes(' left the instrument ') ||
	           activityLower.includes(' joined the instrument ') ||
	           activityLower.includes('updated their details') ||
	           activityLower.includes('failed to update details')) {
		emoji = '👤'; // User personal activity
	} else if (activityLower.includes('thread')) {
		emoji = '🧵'; // Thread-related activity
	} else if (activityLower.includes('signup')) {
		emoji = '📝'; // Signup-related activity
	} else if (activityLower.includes('cleanupsignups') ||
	           activityLower.includes('was created by') ||
	           activityLower.includes('was removed by') ||
	           activityLower.includes('was renamed by') ||
	           activityLower.includes('permission')) {
		emoji = '🔧'; // Moderator tools
	} else if (activityLower.includes('archiv') ||
	           activityLower.includes('cleanup') ||
	           activityLower.includes('scheduled') ||
	           activityLower.includes('move') ||
	           activityLower.includes('sync') ||
	           activityLower.includes('post') ||
	           activityLower.includes('update') ||
	           activityLower.includes('remove')) {
		emoji = '🔄'; // Auto features and archiving
	} else {
		emoji = 'ℹ️'; // Emoji for other messages
	}

	if (activityLower.includes('failed') ||
	    activityLower.includes('error') ||
	    activityLower.includes('warning') ||
	    activityLower.includes('missing') ||
	    activityLower.includes('not found') ||
	    activityLower.includes('could not') ||
	    activityLower.includes('unable') ||
	    activityLower.includes('invalid') ||
	    activityLower.includes('fatal') ||
	    activityLower.includes('exception') ||
	    activityLower.includes('rate limited') ||
	    activityLower.includes('invalid request warning') ||
	    activityLower.includes('disconnect') ||
	    activityLower.includes('unhandled rejection') ||
	    activityLower.includes('uncaught exception')) {
		logType = '🔴';
	} else {
		logType = '🟢';
	}

	const logMessage = `${logTime}: ${logType} ${emoji} ${activity}`;

	// Console output
	console.log(logMessage);

	// File output
	try {
		const logsDir = path.join(__dirname, '..', '..', 'logs');
		if (!fs.existsSync(logsDir)) {
			fs.mkdirSync(logsDir, { recursive: true });
		}

		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const logFileName = `kiribot-${year}-${month}.log`;
		const logFilePath = path.join(logsDir, logFileName);

		fs.appendFileSync(logFilePath, logMessage + '\n');
	} catch (error) {
		// Fail silently to avoid cascading errors
		console.error('Failed to write to log file:', error.message);
	}
}

function cleanupOldLogs() {
    try {
        const logsDir = path.join(__dirname, '..', '..', 'logs');
        if (!fs.existsSync(logsDir)) return;

        const files = fs.readdirSync(logsDir);
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        files.forEach(file => {
            const match = file.match(/^kiribot-(\d{4})-(\d{2})\.log$/);
            if (match) {
                const fileYear = parseInt(match[1]);
                const fileMonth = parseInt(match[2]);

                const fileDate = new Date(fileYear, fileMonth - 1);
                const currentDate = new Date(currentYear, currentMonth - 1);
                const monthsDiff = (currentDate.getFullYear() - fileDate.getFullYear()) * 12
                    + (currentDate.getMonth() - fileDate.getMonth());

                if (monthsDiff > 3) {
                    fs.unlinkSync(path.join(logsDir, file));
                    logActivity(`Removed old log file: ${file}`);
                }
            }
        });
    } catch (error) {
        logActivity(`Error cleaning up old logs: ${error.message}`);
    }
}

module.exports = logActivity;
module.exports.cleanupOldLogs = cleanupOldLogs;
