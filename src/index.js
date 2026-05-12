const fs = require('fs');
const path = require('path');
const client = require('./core/client');
const config = require('../config.json');
const logActivity = require('./core/logger');
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

// Start Express after bot is ready (needs client.guilds.cache populated)
client.once('ready', () => {
	startExpress({ client, config }).catch(err =>
		logActivity('Failed to start Express:', err)
	);
});

// Log in to Discord
client.login(config.token).catch(err => logActivity('Failed to login:', err));
