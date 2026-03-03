const fs = require('fs');
const path = require('path');
const { MessageFlags } = require('discord.js');
const logActivity = require('../../core/logger');
const { dir_EventsActive, ch_Signup, guildId } = require('../../core/constants');
const { parseEventDate } = require('../../utils/dateUtils');
const { getNickname } = require('../../utils/interactionUtils');

function formatEventDate(dateObj, rawDate, time, onlyDate) {
	const datePart = dateObj
		? dateObj.toLocaleDateString('sv-SE', {
			day: '2-digit',
			month: '2-digit',
			year: '2-digit'
		})
		: (rawDate || 'okänt datum');

	if (!time || typeof time !== 'string' || time.trim().length === 0) {
		return datePart;
	}

	if (onlyDate) {
		return `${datePart}`;
	} else {
		return `${datePart} | ${time.trim()}`;
	}
}

function getSignupMessageLink(messageId) {
	if (!messageId) {
		return null;
	}

	return `https://discord.com/channels/${guildId}/${ch_Signup}/${messageId}`;
}

function getResponseLabels(interaction) {
	const emoteJa = interaction.client.emojis.cache.find(emoji => emoji.name === 'ja');
	const emoteNej = interaction.client.emojis.cache.find(emoji => emoji.name === 'nej');
	const emoteKanske = interaction.client.emojis.cache.find(emoji => emoji.name === 'kanske');

	return {
		ja: `${emoteJa || '✅'} Ja`,
		nej: `${emoteNej || '❌'} Nej`,
		kanske: `${emoteKanske || '❔'} Kanske`
	};
}

function getUserReplyFromEvent(eventData, userId, responseLabels) {
	const replies = new Set();

	if (!eventData.signups || typeof eventData.signups !== 'object') {
		return null;
	}

	for (const signups of Object.values(eventData.signups)) {
		if (!Array.isArray(signups)) {
			continue;
		}

		for (const signup of signups) {
			if (String(signup.id) === userId && signup.response) {
				replies.add(String(signup.response).toLowerCase());
			}
		}
	}

	if (replies.size === 0) {
		return null;
	}

	return Array.from(replies)
		.map(reply => responseLabels[reply] || reply)
		.join(' / ');
}

module.exports = {
	matches(customId) {
		return customId === 'btn_showSignups';
	},

	async execute(interaction) {
		try {
			const responseLabels = getResponseLabels(interaction);
			const eventFiles = fs.readdirSync(dir_EventsActive).filter(file => file.endsWith('.json'));

			if (eventFiles.length === 0) {
				await interaction.reply({
					content: 'Hittade inga signups i listan just nu.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			const events = [];

			for (const file of eventFiles) {
				const filePath = path.join(dir_EventsActive, file);
				const eventData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

				if (eventData.active === false) {
					continue;
				}

				const eventDate = parseEventDate(eventData.date);
				const userReply = getUserReplyFromEvent(eventData, interaction.user.id, responseLabels);

				events.push({
					name: eventData.name || file.replace('.json', ''),
					date: eventDate,
					rawDate: eventData.date,
					time: eventData.time,
					userReply,
					signupLink: getSignupMessageLink(eventData.link)
				});
			}

			if (events.length === 0) {
				await interaction.reply({
					content: 'Hittade inga aktiva signups just nu.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			events.sort((a, b) => {
				if (a.date && b.date) return a.date - b.date;
				if (a.date && !b.date) return -1;
				if (!a.date && b.date) return 1;
				return a.name.localeCompare(b.name, 'sv');
			});

			const unanswered = events.filter(event => !event.userReply);
			const answered = events.filter(event => !!event.userReply);

			let message = `## Dina signups\nAktiva events: **${events.length}**\nEj svarat: **${unanswered.length}**\n\n`;

			if (unanswered.length > 0) {
				message += '**⚠️ Du har inte svarat på:**\n';
				message += unanswered
					.map(event => {
						const eventName = event.signupLink
							? `**[${event.name}](${event.signupLink})**`
							: `**${event.name}**`;
						return `- ${formatEventDate(event.date, event.rawDate, event.time, true)} ${eventName}`;
					})
					.join('\n');
				message += '\n\n';
			}

			message += '**Dina svar:**\n';
			message += answered.length > 0
				? answered
					.map(event => {
						const eventName = event.signupLink
							? `**[${event.name}](${event.signupLink})**`
							: `**${event.name}**`;
						return `- ${formatEventDate(event.date, event.rawDate, event.time, true)} ${eventName} ${event.userReply}`;
					})
					.join('\n')
				: 'Du har inte svarat på några aktiva events ännu.';

			if (message.length > 2000) {
				message = message.slice(0, 1950) + '\n\n...Listan är för lång och har trunkerats.';
				logActivity(`Truncated show-signups message for ${getNickname(interaction)} (${interaction.user.id})`);
			}

			await interaction.reply({
				content: message,
				flags: MessageFlags.Ephemeral
			});
		} catch (error) {
			logActivity(`Error in showsignups button for ${getNickname(interaction)} (${interaction.user.id}): ${error.message}`);
			await interaction.reply({
				content: 'Ett fel uppstod när dina signups skulle hämtas.',
				flags: MessageFlags.Ephemeral
			}).catch(() => {});
		}
	}
};
