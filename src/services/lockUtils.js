const fs = require('fs');
const path = require('path');
const logActivity = require('../core/logger');
const { dir_EventsActive } = require('../core/constants');

function cleanupLocks() {

	let directoriesToClean = ['.', dir_EventsActive];

	directoriesToClean.forEach(dir => {
        try {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (file.endsWith('.lock')) {
                    const lockFilePath = path.join(dir, file);
                    try {
                        fs.unlinkSync(lockFilePath);
                        logActivity(`Removed lock file: ${lockFilePath}`);
                    } catch (err) {
                        logActivity(`Error removing lock file ${lockFilePath}:`, err);
                    }
                }
            });
        } catch (err) {
            logActivity(`Error reading directory ${dir} when cleaning up .lock files:`, err);
        }
    });

}

module.exports = { cleanupLocks };
