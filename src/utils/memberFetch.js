const logActivity = require('../core/logger');

// GuildMembers intent keeps the cache in sync after one full fetch, so avoid opcode-8 gateway requests when it is already complete
async function fetchAllMembers(guild, label, { maxRetries = 3, retryDelay = 5000, timeout = 60000 } = {}) {
	if (guild.memberCount && guild.members.cache.size >= guild.memberCount) {
		return guild.members.cache;
	}

	let lastError = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await guild.members.fetch({ time: timeout, force: false });
		} catch (err) {
			lastError = err;
			const isRateLimit = err.name === 'GatewayRateLimitError' || err.code === 'GatewayRateLimitError';
			const isTimeout = err.name === 'GuildMembersTimeout';
			if (!isRateLimit && !isTimeout) throw err;
			if (attempt === maxRetries) throw lastError;

			let waitTime = retryDelay * attempt;
			if (isRateLimit) {
				const match = err.message?.match(/Retry after ([\d.]+) seconds?/i);
				waitTime = err.retryAfter || (match ? parseFloat(match[1]) * 1000 : waitTime);
			}
			await logActivity(`${err.name || 'FetchError'} in ${label} (attempt ${attempt}/${maxRetries}). Retrying after ${waitTime / 1000}s...`);
			await new Promise(resolve => setTimeout(resolve, waitTime));
		}
	}
}

module.exports = { fetchAllMembers };
