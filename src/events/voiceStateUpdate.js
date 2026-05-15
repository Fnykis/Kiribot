const { Events } = require('discord.js');
const { ch_LineupVoice } = require('../core/constants');
const logActivity = require('../core/logger');

const WATCHED_CHANNELS = new Set(['1139442250913419284', '1141127436818456597']);
const DELAY_MS = 15 * 60 * 1000;
const pendingClears = new Map();

module.exports = {
	name: Events.VoiceStateUpdate,
	async execute(oldState, newState) {
		const joinedLineup = newState.channelId === ch_LineupVoice && oldState.channelId !== ch_LineupVoice;
		const leftLineup = oldState.channelId === ch_LineupVoice && newState.channelId !== ch_LineupVoice;

		if (joinedLineup) {
			try {
				await newState.setMute(true, 'lineup-activity entry');
			} catch (err) {
				logActivity(`voiceStateUpdate: failed to mute ${newState.id}: ${err.message}`);
			}
		}

		if (leftLineup) {
			try {
				await oldState.setMute(false, 'lineup-activity exit');
			} catch (err) {
				logActivity(`voiceStateUpdate: failed to unmute ${oldState.id}: ${err.message}`);
			}
		}

		const leftChannel = oldState.channel;
		const joinedChannel = newState.channel;

		if (joinedChannel && WATCHED_CHANNELS.has(joinedChannel.id)) {
			const pending = pendingClears.get(joinedChannel.id);
			if (pending) {
				clearTimeout(pending);
				pendingClears.delete(joinedChannel.id);
			}
		}

		if (!leftChannel) return;
		if (!WATCHED_CHANNELS.has(leftChannel.id)) return;
		if (newState.channelId === oldState.channelId) return;
		if (leftChannel.members.size > 0) return;

		const timeout = setTimeout(async () => {
			pendingClears.delete(leftChannel.id);

			const fresh = leftChannel.guild.channels.cache.get(leftChannel.id);
			if (!fresh || fresh.members.size > 0) return;

			try {
				const messages = await fresh.messages.fetch({ limit: 100 });
				const recent = messages.filter(
					m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
				);
				if (recent.size > 0) await fresh.bulkDelete(recent);
			} catch (err) {
				console.error('voiceStateUpdate: failed to clear chat', err);
			}
		}, DELAY_MS);

		pendingClears.set(leftChannel.id, timeout);
	}
};
