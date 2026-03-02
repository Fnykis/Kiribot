const fs = require('fs');
const path = require('path');
const client = require('./core/client');
const { token } = require('../config.json');
const logActivity = require('./core/logger');
const { register: registerErrorHandlers } = require('./events/errorHandlers');

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

// Log in to Discord
client.login(token).catch(err => logActivity('Failed to login:', err));
