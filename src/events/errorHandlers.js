const client = require('../core/client');
const logActivity = require('../core/logger');

function register() {
	// Add error handlers to prevent crashes
	client.on('error', (error) => {
		logActivity('Discord client error:', error);
	});

	// Handle Gateway rate limit errors specifically to prevent unhandled rejections
	client.on('rateLimit', (rateLimitInfo) => {
		logActivity(`Gateway rate limit: ${rateLimitInfo.method} ${rateLimitInfo.path} - Retry after ${rateLimitInfo.timeout}ms`);
	});

	// Handle REST API errors specifically
	client.rest.on('rateLimited', (rateLimitInfo) => {
		logActivity('Rate limited by Discord API:', rateLimitInfo);
	});

	client.rest.on('invalidRequestWarning', (invalidRequestWarningData) => {
		logActivity('Invalid request warning from Discord API:', invalidRequestWarningData);
	});

	client.on('disconnect', () => {
		logActivity('Discord client disconnected. Will attempt to reconnect.');
	});

	process.on('unhandledRejection', (reason, promise) => {
		let errorDetails = '';
		if (reason instanceof Error) {
			errorDetails = `Error: ${reason.name} - ${reason.message}${reason.code ? ` (code: ${reason.code})` : ''}`;
			if (reason.stack) {
				errorDetails += `\nStack: ${reason.stack.split('\n').slice(0, 5).join('\n')}`;
			}
		} else {
			errorDetails = `Reason: ${String(reason)}`;
		}
		logActivity(`Unhandled Rejection: ${errorDetails}`);
	});

	process.on('uncaughtException', (error) => {
		logActivity('Uncaught Exception:', error);
		logActivity('WARNING: Uncaught exception detected. The application may be in an unstable state.');
	});
}

module.exports = { register };
