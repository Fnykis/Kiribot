const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const client = require('../core/client');
const logActivity = require('../core/logger');
const store = require('../state/store');
const { ch_Medlemsdetaljer, guildId } = require('../core/constants');

async function updateDetails(requiredDetails) {
	const maxRetries = 3;
	const retryDelay = 5000; // 5 seconds
	let lastError = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			store.setRequiredFields(["kost", "körkort", "bil", "nyckel"]); // TODO: Make dynamic (right click message to change what fields should be in the details)
			const requiredFieldsObject = store.getRequiredFields().reduce((acc, field) => {
				const sanitizedField = field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
				acc[sanitizedField] = "-";
				return acc;
			}, {});

			const guild = client.guilds.cache.get(guildId);
			if (!guild) {
				throw new Error(`Guild with ID ${guildId} not found in cache`);
			}

			// Fetch members with increased timeout and retry handling
			let members;
			try {
				members = await guild.members.fetch({
					time: 60000, // 60 second timeout instead of default 15
					force: false // Use cache when possible
				});
			} catch (fetchError) {
				// Handle specific error types
				if (fetchError.name === 'GuildMembersTimeout') {
					lastError = fetchError;
					if (attempt < maxRetries) {
						const waitTime = retryDelay * attempt;
						await logActivity(`GuildMembersTimeout in updateDetails (attempt ${attempt}/${maxRetries}). Retrying in ${waitTime/1000}s...`);
						await new Promise(resolve => setTimeout(resolve, waitTime));
						continue;
					} else {
						throw new Error(`GuildMembersTimeout: Failed to fetch members after ${maxRetries} attempts. Guild: ${guild.name} (${guild.id}), Member count: ${guild.memberCount || 'unknown'}`);
					}
				} else if (fetchError.name === 'GatewayRateLimitError' || fetchError.code === 'GatewayRateLimitError') {
					lastError = fetchError;
					// Extract retry time from error message if retryAfter property doesn't exist
					let retryAfter = fetchError.retryAfter;
					if (!retryAfter && fetchError.message) {
						const retryMatch = fetchError.message.match(/Retry after ([\d.]+) seconds?/i);
						if (retryMatch) {
							retryAfter = parseFloat(retryMatch[1]) * 1000; // Convert to milliseconds
						}
					}
					// Fallback to exponential backoff if we can't extract the time
					if (!retryAfter) {
						retryAfter = retryDelay * attempt;
					}

					if (attempt < maxRetries) {
						await logActivity(`GatewayRateLimitError in updateDetails (attempt ${attempt}/${maxRetries}). Retrying after ${retryAfter/1000}s...`);
						await new Promise(resolve => setTimeout(resolve, retryAfter));
						continue;
					} else {
						// Don't throw - log and return gracefully
						await logActivity(`GatewayRateLimitError: Rate limited after ${maxRetries} attempts. Guild: ${guild.name} (${guild.id}). Will retry on next scheduled run.`);
						return;
					}
				} else {
					throw fetchError;
				}
			}

			const aktivRole = guild.roles.cache.find(role => role.name === 'aktiv');
			const inaktivRole = guild.roles.cache.find(role => role.name === 'inaktiv');

			let detailsData = { aktiv: {}, inaktiv: {} };

			// Load existing data if the file exists
			const detailsFilePath = 'src/data/detailsList.json';
			if (fs.existsSync(detailsFilePath)) detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
			detailsData.aktiv = detailsData.aktiv || [];
			detailsData.inaktiv = detailsData.inaktiv || [];

			// Helper function to find a user in a role array
			function findUser(array, userId) {
				if (Array.isArray(array)) {
					return array.find(user => user.id === userId);
				}
				return null; // Return null if array is not valid
			}

			members.forEach(member => {
				const userId = member.id;
				const nickname = member.nickname ? member.nickname : member.user.username;
				let userData = findUser(detailsData.aktiv, userId) || findUser(detailsData.inaktiv, userId) || {};
				if (userData == null) userData = {};

				// Set common user properties
				userData.id = userId;
				userData.namn = nickname;

				// Add or update required fields
				Object.keys(requiredFieldsObject).forEach(field => {
					if (!(field in userData)) {
						userData[field] = "-";
					}
				});

				// Move user data to the correct role-based array
				if (member.roles.cache.has(aktivRole.id)) {
					if (!findUser(detailsData.aktiv, userId)) {
						detailsData.aktiv.push(userData);
					}
					detailsData.inaktiv = detailsData.inaktiv.filter(user => user.id !== userId);
				} else if (member.roles.cache.has(inaktivRole.id)) {
					if (!findUser(detailsData.inaktiv, userId)) {
						detailsData.inaktiv.push(userData);
					}
					detailsData.aktiv = detailsData.aktiv.filter(user => user.id !== userId);
				}

			});

			// Write updated data back to the file
			fs.writeFileSync(detailsFilePath, JSON.stringify(detailsData, null, 2), 'utf8');

			// Success - log if it was a retry
			if (attempt > 1) {
				await logActivity(`updateDetails succeeded on attempt ${attempt}/${maxRetries}`);
			}
			return; // Success, exit function

		} catch (error) {
			lastError = error;
			const guild = client.guilds.cache.get(guildId);
			const guildInfo = guild ? `Guild: ${guild.name} (${guild.id}), Members: ${guild.memberCount || 'unknown'}` : `Guild ID: ${guildId} (not in cache)`;

			if (attempt === maxRetries) {
				// Final attempt failed
				await logActivity(`Error in updateDetails function after ${maxRetries} attempts. ${guildInfo}. Error: ${error.message}${error.code ? ` (code: ${error.code})` : ''}`);
				// Don't re-throw - log and return gracefully to prevent unhandled rejections
				return;
			}
			// Will retry on next iteration
		}
	}
}

async function postDetailsButtons(update) {

    let guild = client.guilds.cache.get(guildId);
    let channel = guild.channels.cache.get(ch_Medlemsdetaljer);

	// Dynamically create buttons based on requiredFields
    const row_buttons = new ActionRowBuilder();
    store.getRequiredFields().forEach(field => {
        const sanitizedId = field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
        const button = new ButtonBuilder()
            .setCustomId(sanitizedId)
            .setLabel(field.charAt(0).toUpperCase() + field.slice(1)) // Capitalize first letter
            .setStyle(ButtonStyle.Secondary);
        row_buttons.addComponents(button);
    });

	if (update) {
        try {
			// Fetch the last message in the channel
			const messages = await channel.messages.fetch({ limit: 1 });
			const lastMessage = messages.first();

			// Update the last message
			lastMessage.edit({
				content: `Tryck på knapparna för att visa medlemsdetaljer`,
				components: [row_buttons],
			 });
		} catch (error) {
            logActivity(`Failed to update details buttons: ${error}`);
        }
    } else {
        try {
			channel.send({
				content: `Tryck på knapparna för att visa medlemsdetaljer`,
				components: [row_buttons],
			});
		} catch (error) {
            logActivity(`Failed to post details buttons: ${error}`);
        }
	}
}

module.exports = { updateDetails, postDetailsButtons };
