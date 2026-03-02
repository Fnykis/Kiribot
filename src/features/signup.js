const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockFile = require('lockfile');
const client = require('../core/client');
const logActivity = require('../core/logger');
const { dir_EventsActive, dir_EventsArchived, ch_Signup, ch_Verktyg_Signup, ch_Spelningar, guildId } = require('../core/constants');
const { parseEventDate } = require('../utils/dateUtils');
const { syncEventsToSheet } = require('../services/google/sheets');

function getEventJSON(eventId) {
	try {
		const files = fs.readdirSync(dir_EventsActive);
		const fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
		if (!fileName) {
			return null;
		}
		const filePath = path.join(dir_EventsActive, fileName);
		return JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch (error) {
		logActivity(`Error loading event JSON for ID ${eventId}: ${error.message}`);
		return null;
	}
}

async function listaSvar(interaction, eventId) {

	let files = fs.readdirSync(dir_EventsActive);
	let fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
	let data = JSON.parse(fs.readFileSync(dir_EventsActive + '/' + fileName));

	let name = data.name;
	let signups = {};
	let kanskeReplies = {};
	let nejReplies = {};
	let uniqueNames = new Set();

	for (let instrument in data.signups) {
		data.signups[instrument].forEach(signup => {
			uniqueNames.add(signup.name);
			if (signup.response === 'ja') {
				if (signups[signup.name]) {
					signups[signup.name].instruments.push(instrument.charAt(0).toUpperCase() + instrument.slice(1));
				} else {
					signups[signup.name] = {instruments: [instrument.charAt(0).toUpperCase() + instrument.slice(1)], note: signup.note};
				}
			} else if (signup.response === 'kanske') {
				if (kanskeReplies[signup.name]) {
					kanskeReplies[signup.name].instruments.push(instrument.charAt(0).toUpperCase() + instrument.slice(1));
				} else {
					kanskeReplies[signup.name] = {instruments: [instrument.charAt(0).toUpperCase() + instrument.slice(1)], note: signup.note};
				}
			} else if (signup.response === 'nej') {
				if (nejReplies[signup.name]) {
					nejReplies[signup.name].instruments.push(instrument.charAt(0).toUpperCase() + instrument.slice(1));
				} else {
					nejReplies[signup.name] = {instruments: [instrument.charAt(0).toUpperCase() + instrument.slice(1)], note: signup.note};
				}
			}
		});
	}

	const emote_ja = client.emojis.cache.find(emoji => emoji.name === "ja");
	const emote_kanske = client.emojis.cache.find(emoji => emoji.name === "kanske");
	const emote_nej = client.emojis.cache.find(emoji => emoji.name === "nej");

	let message = `**${name}** (${uniqueNames.size} svar)\n\n${emote_ja}\n`;
	for (let signup in signups) {
		message += `**${signup}**: ${signups[signup].instruments.join(', ')}`;
		if (signups[signup].note) {
			message += ` (*${signups[signup].note}*)`;
		}
		message += '\n';
	}

	message += `${emote_kanske}\n` + Object.keys(kanskeReplies).map(name => `**${name}**: ${kanskeReplies[name].instruments.join(', ')}` + (kanskeReplies[name].note ? ` (*${kanskeReplies[name].note}*)` : '')).join('\n');
	message += `\n${emote_nej}\n` + Object.keys(nejReplies).map(name => `**${name}**: ${nejReplies[name].instruments.join(', ')}` + (nejReplies[name].note ? ` (*${nejReplies[name].note}*)` : '')).join('\n');

	await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
};

// Show signup list from instrument
async function listaInstrument(interaction, eventId) {

	let files = fs.readdirSync(dir_EventsActive);
	let fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
	let data = JSON.parse(fs.readFileSync(dir_EventsActive + '/' + fileName));

	// Initialize a Set object to store all unique names
	let allUniqueNames = new Set();

	for (let instrument in data.signups) {
		let names = data.signups[instrument].filter(signup => signup.response === 'ja').map(signup => signup.name);
		// Add each name to the Set object
		names.forEach(name => allUniqueNames.add(name));
	}

	// Now, allUniqueNames.size will give you the total number of unique names that replied with "ja"
	let name = data.name;
	const emote_ja = client.emojis.cache.find(emoji => emoji.name === "ja");
	let message = `**${name}** (${allUniqueNames.size} ja)\n\n${emote_ja}\n`;

	for (let instrument in data.signups) {
		// Capitalize the first letter of the instrument name
		let capitalizedInstrument = instrument.charAt(0).toUpperCase() + instrument.slice(1);
		message += `**${capitalizedInstrument}** `;
		let names = data.signups[instrument].filter(signup => signup.response === 'ja').map(signup => signup.name);
		message += names.length > 0 ? names.join(', ') : '';
		message += '\n';
	}

	await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
};

async function listaDetaljer(interaction, eventId, dataType) {
    const validTypes = ['kost', 'korkort', 'bil'];
    if (!validTypes.includes(dataType)) {
        return interaction.reply({ content: 'Ogiltig datatyp vald', flags: MessageFlags.Ephemeral });
    }

    try {
        // Load event data
        const eventFiles = fs.readdirSync(dir_EventsActive);
        const eventFile = eventFiles.find(file => file.endsWith(`_${eventId}.json`));
        const eventData = JSON.parse(fs.readFileSync(`${dir_EventsActive}/${eventFile}`, 'utf8'));

        // Load user details
        const detailsList = JSON.parse(fs.readFileSync('src/data/detailsList.json', 'utf8'));

        // Process all "ja" responses
        const uniqueNames = new Set();
        const userDetails = [];

        for (const [instrument, signups] of Object.entries(eventData.signups)) {
            signups.filter(s => s.response === 'ja').forEach(({ name }) => {
                if (!uniqueNames.has(name)) {
                    uniqueNames.add(name);

                    // Find user in detailsList
                    const userDetail = [...detailsList.aktiv, ...detailsList.inaktiv]
                        .find(u => u.namn === name);

                    userDetails.push({
                        name,
                        data: userDetail?.[dataType] || '-'
                    });
                }
            });
        }

        // Swedish sorting
        userDetails.sort((a, b) => {
            const customOrder = 'abcdefghijklmnopqrstuvwxyzåäö';
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();

            for (let i = 0; i < Math.min(nameA.length, nameB.length); i++) {
                const charA = customOrder.indexOf(nameA[i]);
                const charB = customOrder.indexOf(nameB[i]);

                if (charA !== charB) return charA - charB;
            }
            return nameA.length - nameB.length;
        });

		let listEmoji = "";
		switch (dataType) {
			case "kost": listEmoji = "🥦 Kost"; break;
			case "korkort": listEmoji = "🪪 Körkort"; break;
			case "bil": listEmoji = "🚗 Bil"; break;
		}

        // Build message
        let message = `**${eventData.name}** (${userDetails.length} ja)\n${listEmoji}\n\n`;
        message += userDetails.map(u => `**${u.name}:** ${u.data}`).join('\n');

        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });

    } catch (error) {
        console.error('Error:', error);
        await interaction.reply({ content: 'Ett fel uppstod', flags: MessageFlags.Ephemeral });
    }
};

async function cleanupOutdatedSignups(nickname) {
    let filesMoved = 0;
    let messagesCleaned = 0;
    let errors = 0;

    // Check if date has passed
    function isDatePassed(dateString) {
        const eventDate = parseEventDate(dateString);
        if (!eventDate) return false;

        const today = new Date();
        eventDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return eventDate.getTime() < today.getTime();
    }

    // Extract date from embed fields
    function extractDateFromEmbed(embed) {
        if (!embed || !embed.fields) return null;

        const dateField = embed.fields.find(field =>
            field.name && field.name.toLowerCase().includes('datum')
        );

        if (!dateField || !dateField.value) return null;

        // Extract just the date part (before the pipe character if present)
        const dateValue = dateField.value.split(' | ')[0];
        return dateValue;
    }

    try {
        // Get the signup channel
        const signupChannel = client.channels.cache.get(ch_Signup);
        if (!signupChannel) {
            logActivity(`${nickname} - Signup channel not found`);
            return { filesMoved: 0, messagesCleaned: 0, errors: 1 };
        }

        // Fetch all messages from the signup channel
        const messages = await signupChannel.messages.fetch({ limit: 100 });
        logActivity(`${nickname} started cleanup of ${messages.size} messages in signup channel`);

        for (const [messageId, message] of messages) {
            try {
                // Check if message has embeds and is a signup message
                if (!message.embeds || message.embeds.length === 0) continue;

                const embed = message.embeds[0];
                if (!embed.title || !embed.fields) continue;

                // Check if this is a signup message by looking for Ja/Nej/Kanske buttons
                const hasSignupButtons = message.components && message.components.length > 0 &&
                    message.components.some(row =>
                        row.components && row.components.length > 0 &&
                        row.components.some(button =>
                            ['ja', 'nej', 'kanske'].includes(button.customId)
                        )
                    );

                // Skip if no signup buttons (already cleaned or not a signup message)
                if (!hasSignupButtons) continue;

                // Extract date from embed
                const eventDate = extractDateFromEmbed(embed);
                if (!eventDate) continue;

                // Check if event is outdated
                if (!isDatePassed(eventDate)) {
                    continue; // Skip if not outdated
                }

                // Try to find and move corresponding JSON file
                try {
                    // Extract event ID from embed footer
                    const eventId = embed.footer?.text?.split(': ')[1];
                    if (eventId) {
                        // Look for the file in active directory
                        const activeFiles = fs.existsSync(dir_EventsActive) ? fs.readdirSync(dir_EventsActive) : [];
                        const fileName = activeFiles.find(file => file.endsWith('_' + eventId + '.json'));

                        if (fileName) {
                            const oldPath = path.join(dir_EventsActive, fileName);
                            const newPath = path.join(dir_EventsArchived, fileName);

                            // Create the archive directory if it doesn't exist
                            if (!fs.existsSync(dir_EventsArchived)) {
                                fs.mkdirSync(dir_EventsArchived, { recursive: true });
                            }

                            // Move the file
                            fs.renameSync(oldPath, newPath);
                            filesMoved++;
                        }
                    }
                } catch (fileError) {
                    errors++;
                }

                // Remove buttons from the Discord message
                try {
                    await message.edit({
                        content: message.content,
                        embeds: message.embeds,
                        components: [] // Remove all buttons
                    });
                    messagesCleaned++;
                } catch (messageError) {
                    errors++;
                }

            } catch (messageError) {
                errors++;
            }
        }

        logActivity(`${nickname} completed cleanup: ${filesMoved} files moved, ${messagesCleaned} messages cleaned, ${errors} errors`);

    } catch (error) {
        logActivity(`${nickname} - Cleanup fatal error: ${error}`);
        errors++;
    }

    return { filesMoved, messagesCleaned, errors };
}

async function moveToArchived(event) {

    // Move the file from active to archived
    try {
        const oldPath = path.join(dir_EventsActive, event.file);
        const newPath = path.join(dir_EventsArchived, event.file);

        // Create the archive directory if it doesn't exist
        if (!fs.existsSync(dir_EventsArchived)) {
            fs.mkdirSync(dir_EventsArchived, { recursive: true });
        }

        // Move the file
        fs.renameSync(oldPath, newPath);
    } catch (err) {
        logActivity(`Failed to move file to archived: ${err}`);
        // You might want to throw an error or handle it differently
        return;
    }

    // Remove the buttons from the corresponding message
    try {
        // Build the link (optional if you just need the ID)
        const messageLink = `https://discord.com/channels/${guildId}/${ch_Signup}/${event.link}`;
        logActivity(`Archiving event. Message link: ${messageLink}`);

        // Fetch the channel and message
        const channel = client.channels.cache.get(ch_Signup);
        if (!channel) throw new Error('Channel not found');

        const archivedMessage = await channel.messages.fetch(event.link);
        if (!archivedMessage) throw new Error('Message not found');

        // Edit the message to remove buttons (keep other content/embeds)
        await archivedMessage.edit({
            content: archivedMessage.content,
            embeds: archivedMessage.embeds,
            components: [] // <-- removing the buttons
        });
    } catch (err) {
        logActivity(`Failed to edit archived message: ${err}`);
        // Handle error (e.g., log it, rethrow, etc.)
    }

    // Thread title is not changed when archiving
    // (Removed checkmark addition to allow findEventThread to work correctly)
}

// Function to update ch_Verktyg_Signup
async function updateVerktygSignup(id, startsWith, message) {
    try {

        const files = fs.readdirSync(dir_EventsActive).filter(file => file.endsWith('.json'));

        // Read and parse all event files
        const events = [];
        for (const file of files) {
            const filePath = path.join(dir_EventsActive, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            events.push({
                id: data.id,
                name: data.name,
                date: parseEventDate(data.date),
                rawDate: data.date // Keep original for display
            });
        }

        // Sort events with invalid dates first
        events.sort((a, b) => {
            const da = a.date;
            const db = b.date;

            // Invalid dates first
            if (da === null && db === null) return 0;
            if (da === null) return -1;
            if (db === null) return 1;

            // Newest first for valid dates
            return da - db;
        });

        // Create dropdown options
        const select = new StringSelectMenuBuilder()
            .setCustomId('signupDropdown_' + id)
            .setPlaceholder('Välj en spelning')
            .addOptions(
                events.map(event => {
                    const eventDateString = event.date
                        ? event.date.toLocaleDateString('en-GB', {
                            month: 'numeric',
                            day: 'numeric'
                          })
                        : 'Ogiltigt datum';

                    return new StringSelectMenuOptionBuilder()
                        .setLabel(event.name)
                        .setValue(event.id)
                        .setDescription(`${eventDateString}`);
                })
            );

        const row = new ActionRowBuilder().addComponents(select);

        // Get and update message
        const channel = client.channels.cache.get(ch_Verktyg_Signup);
        const messages = await channel.messages.fetch();
        const targetMessage = messages.find(msg =>
			msg.content.startsWith(startsWith)
		);

        if (targetMessage) {
            await targetMessage.edit({
                content: message,
                components: [row]
            });
        } else {
			logActivity(`Failed to update menu ${id} Verktyg - Signups`);
		}

    } catch (error) {
        logActivity(`Failed to update menu ${id} Verktyg - Signups: `, error);
    }
}

function verktygSignup() {
	try {
		updateVerktygSignup("listaSvar", '📋', '📋 Lista samtliga svar');
		updateVerktygSignup("listaInstrument", '🥁', '🥁 Lista "ja" per instrument');
		updateVerktygSignup("listaKost", '🥦', '🥦 Lista kost för uppsignade');
		updateVerktygSignup("listaKorkort", '🪪', '🪪 Lista körkort för uppsignade');
		updateVerktygSignup("listaBil", '🚗', '🚗 Lista bil för uppsignade');
		syncEventsToSheet();
	} catch (error) {
		logActivity(`Error in verktygSignup function: ${error.message}`);
		throw error; // Re-throw the error so calling code can handle it if needed
	}
}

async function updateSignupButtonMessage() {
	try {

		const channel = client.channels.cache.get(ch_Verktyg_Signup);
		if (!channel) {
			logActivity(`Channel with ID ${ch_Verktyg_Signup} not found`);
			return;
		}

		// Add a small delay to avoid rate limits
		await new Promise(resolve => setTimeout(resolve, 2000));

		const messages = await channel.messages.fetch();

		// Find the message that contains a button with customId 'btn_signupverktyg'
		const targetMessage = messages.find(msg => {
			if (!msg.components || msg.components.length === 0) return false;

			// Check if any component in any action row has the btn_signupverktyg customId
			return msg.components.some(row =>
				row.components.some(component =>
					component.data && component.data.custom_id === 'btn_signupverktyg'
				)
			);
		});

		if (targetMessage) {

			// Add another delay before editing to avoid rate limits
			await new Promise(resolve => setTimeout(resolve, 1000));

			// Create the new "Signupverktyg" button
			const btn_signupverktyg = new ButtonBuilder()
				.setCustomId('btn_signupverktyg')
				.setLabel('Signupverktyg')
				.setStyle(ButtonStyle.Primary);

			// Create the "Hur gör jag?" button in grey
			const btn_signupHowTo = new ButtonBuilder()
				.setCustomId('btn_signupHowTo')
				.setLabel('Hur gör jag?')
				.setStyle(ButtonStyle.Secondary);

			const row1_buttons = new ActionRowBuilder()
				.addComponents(btn_signupverktyg, btn_signupHowTo);

			await targetMessage.edit({
				components: [row1_buttons]
			});

		} else {
			logActivity(`Could not find message with 'btn_newSignup' button in verktyg channel`);
			// Log all messages for debugging
			messages.forEach((msg, key) => {
				logActivity(`Message ${key}: ${msg.id} - Components: ${msg.components?.length || 0}`);
			});
		}
	} catch (error) {
		logActivity(`Failed to update signup button message. Error type: ${error.constructor.name}`);
		logActivity(`Error message: ${error.message}`);
		if (error.code) {
			logActivity(`Error code: ${error.code}`);
		}
		if (error.retryAfter) {
			logActivity(`Retry after: ${error.retryAfter}ms`);
		}
		logActivity(`Full error: ${JSON.stringify(error, null, 2)}`);
	}
}

module.exports = { getEventJSON, listaSvar, listaInstrument, listaDetaljer, cleanupOutdatedSignups, moveToArchived, updateVerktygSignup, verktygSignup, updateSignupButtonMessage };
