const fs = require('fs');
const path = require('path');
const client = require('./core/client');
const config = require('../config.json');
const logActivity = require('./core/logger');
const { spawn } = require('child_process');
const { register: registerErrorHandlers } = require('./events/errorHandlers');
const { start: startExpress } = require('./core/express');

// Register error handlers before anything else
registerErrorHandlers();

// Auto-load all event handlers
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js') && file !== 'errorHandlers.js');

for (const file of eventFiles) {
	const event = require(path.join(eventsPath, file));
	if (event.name) {
		if (event.once) {
			client.once(event.name, (...args) => event.execute(...args));
		} else {
			client.on(event.name, (...args) => event.execute(...args));
		}
	}
}

// Start cloudflared tunnel as sidecar process
const cloudflaredBin = path.join('/home/container', 'cloudflared');
try { fs.chmodSync(cloudflaredBin, 0o755); } catch (_) {}
const cloudflared = spawn(
    cloudflaredBin,
    ['tunnel', '--config', '/home/container/config.yml', 'run'],
    { stdio: 'inherit' }
);
cloudflared.on('error', err => logActivity('cloudflared failed to start:', err));
cloudflared.on('exit', code => logActivity(`cloudflared exited with code ${code}`));

// Start Express after bot is ready (needs client.guilds.cache populated)
client.once('ready', () => {
	startExpress({ client, config }).catch(err =>
		logActivity('Failed to start Express:', err)
	);
});

// Log in to Discord
client.login(config.token).catch(err => logActivity('Failed to login:', err));
