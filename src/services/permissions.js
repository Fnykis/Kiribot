const fs = require('fs');
const path = require('path');
const lockFile = require('lockfile');
const logActivity = require('../core/logger');
const store = require('../state/store');

function loadPermissions() {
	try {
		const permissionsPath = path.join(__dirname, '..', 'data', 'permissions.json');

		// Ensure directory exists
		const dataDir = path.dirname(permissionsPath);
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}

		if (fs.existsSync(permissionsPath)) {
			const data = fs.readFileSync(permissionsPath, 'utf8');
			const loaded = JSON.parse(data);
			store.setPermissionSettings({ ...store.getPermissionSettings(), ...loaded });
		} else {
			// Create default permissions file
			fs.writeFileSync(permissionsPath, JSON.stringify(store.getPermissionSettings(), null, 2));
			logActivity('Created default permissions file');
		}
	} catch (error) {
		logActivity(`Error loading permissions: ${error.message}`);
	}
}

function savePermissions() {
	return new Promise((resolve, reject) => {
		const permissionsPath = path.join(__dirname, '..', 'data', 'permissions.json');
		const lockPath = permissionsPath + '.lock';

		lockFile.lock(lockPath, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, (err) => {
			if (err) {
				logActivity(`Error acquiring lock for permissions file: ${err.message}`);
				reject(err);
				return;
			}

			try {
				fs.writeFileSync(permissionsPath, JSON.stringify(store.getPermissionSettings(), null, 2));
				resolve();
			} catch (writeErr) {
				logActivity(`Error writing permissions file: ${writeErr.message}`);
				reject(writeErr);
			} finally {
				lockFile.unlock(lockPath, (unlockErr) => {
					if (unlockErr) {
						logActivity(`Error unlocking permissions file: ${unlockErr.message}`);
					}
				});
			}
		});
	});
}

module.exports = { loadPermissions, savePermissions };
