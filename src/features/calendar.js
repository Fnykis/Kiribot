const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const client = require('../core/client');
const logActivity = require('../core/logger');
const { ch_Calendar, ch_Signup, ch_Verktyg_Signup, guildId, dir_EventsActive } = require('../core/constants');
const { parseEventDate } = require('../utils/dateUtils');
const { moveToArchived } = require('./signup');

async function postCalendar(update) {

	try {
		let guild = client.guilds.cache.get(guildId);
		let channel = guild.channels.cache.get(ch_Calendar);

		// Define the folder path
		const folderPath = dir_EventsActive;

		// Initialize an array to store collected data
		let collectedData = [];

		// Read the files in the folder
		fs.readdirSync(folderPath).forEach(file => {
            // Check if the file has a .json extension
			if (path.extname(file) === '.json') {
				// Parse the JSON data
				let data = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));

				// Collect the required fields
				let { name, date, active, link, time } = data;

				// Extract ID from filename (e.g., "avenyn_for_varldens_barn_545106982.json" -> "545106982")
				const idMatch = file.match(/_(\d+)\.json$/);
				const id = idMatch ? idMatch[1] : null;

				collectedData.push({ name, date, active, link, time, id, file });
			}
		});

		collectedData.sort((a, b) => {
            const da = parseEventDate(a.date);
            const db = parseEventDate(b.date);

			// Place invalid dates at the beginning
            if (da === null && db === null) return 0;
            if (da === null) return -1;
            if (db === null) return 1;

            return da - db;
		});

        // 2) Filter out past events and group by year, then by month
        //    We'll store valid future events in a nested structure: year -> month -> events
        const monthNames = [
            "Januari", "Februari", "Mars", "April", "Maj", "Juni",
            "Juli", "Augusti", "September", "Oktober", "November", "December"
        ];

        let groupedByYear = {};
        let invalidDateEvents = [];

		collectedData.forEach(event => {
            let eventDate = parseEventDate(event.date);
            if (eventDate) {
                // Check if the event is in the future
                const today = new Date();
                eventDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);
                if (eventDate.getTime() < today.getTime()) {
                    // Skip if not in the future
					moveToArchived(event);
                    return;
                }

                // Valid date, group by year and month
                const year = eventDate.getFullYear();
                const monthIndex = eventDate.getMonth();
                const monthName = monthNames[monthIndex];

                if (!groupedByYear[year]) {
                    groupedByYear[year] = {};
                }
                if (!groupedByYear[year][monthName]) {
                    groupedByYear[year][monthName] = [];
                }
                groupedByYear[year][monthName].push({ event, eventDate });
            } else {
                // Invalid date => place in a special group at the beginning
                invalidDateEvents.push({ event, eventDate: null });
            }
        });

        // 3) Build the calendar string with year and monthly subtitles
        let description = '';

        // First, handle invalid date events if any
        if (invalidDateEvents.length > 0) {
            description += `\n__**Ogiltigt datum**__\n`;
            invalidDateEvents.forEach(({ event, eventDate }) => {
                description += `${event.name}\n`;
                description += `**Okänd datum**\n`;
            });
        }

        // Sort years in chronological order
        let yearKeys = Object.keys(groupedByYear).map(Number).sort((a, b) => a - b);

        // Iterate through each year
        yearKeys.forEach(year => {
            // Add the year as a bold header (no underline)
            description += `\n### ${year}\n`;

            // Get months for this year and sort them chronologically
            let monthKeys = Object.keys(groupedByYear[year]);
            monthKeys.sort((a, b) => {
                let ai = monthNames.indexOf(a);
                let bi = monthNames.indexOf(b);
                return ai - bi;
            });

            // Iterate through each month in this year
            monthKeys.forEach(month => {
                // Add the month subtitle as underlined bold
                description += `__**${month}**__\n`;

                // For each event in this month
                groupedByYear[year][month].forEach(({ event, eventDate }) => {
                    // Format date
			let eventDateString = eventDate.toLocaleDateString('en-GB', {
				month: 'numeric',
				day: 'numeric'
			});
			let eventDayString = eventDate.toLocaleDateString('sv-SE', {
				weekday: 'long'
			});

			// Check link
			if (event.link) {
				let messageLink = `https://discord.com/channels/${guildId}/${ch_Signup}/${event.link}`;
				// Append event details to the string
				if (event.active) {
					description += `[${event.name}](${messageLink})\n`;
					description += `**${eventDateString}**  ${eventDayString}  -  ${event.time ?? 'Okänt'}\n`;
				} else {
					description += `~~[${event.name}](${messageLink})~~\n`;
					description += `~~**${eventDateString}**~~  ${eventDayString}  (avböjd)\n`;
				}
			} else {
				// Append event details to the string
				if (event.active) {
					description += `${event.name}\n`;
					description += `**${eventDateString}**  ${eventDayString}  -  ${event.time ?? 'Okänt'}\n`;
				} else {
					description += `~~${event.name}~~\n`;
					description += `~~**${eventDateString}**  ${eventDayString}~~  (avböjd)\n`;
				}
			}
                });
            });
        });

		let date = new Date();
		let embed = {
			title: '📅 Kommande spelningar',
			description: description,
			color: 7419530,
			footer: {
				text: `Senast uppdaterad: ${new Intl.DateTimeFormat('sv-SE', {
					dateStyle: 'medium',
					timeStyle: 'short',
					hourCycle: 'h24',
					timeZone: 'Europe/Stockholm'
				}).format(date)}`
			}
		};

		if (update) {
			try {
				// Fetch the last message in the channel
				let messages = await channel.messages.fetch({ limit: 1 });
				let lastMessage = messages.first();

				// Update the last message
                await lastMessage.edit({ embeds: [embed] });
			} catch (error) {
				logActivity(`Failed to update calendar: ${error}`);
			}
		} else {
			try {
                await channel.send({ embeds: [embed] });
			} catch (error) {
				logActivity(`Failed to post calendar: ${error}`);
			}
		}
	} catch (error) {
		logActivity(`Failed to post calendar: ${error}`);
	}

}

async function postSignupButtons() {

	const btn_signupverktyg = new ButtonBuilder()
		.setCustomId('btn_signupverktyg')
		.setLabel('Signupverktyg')
		.setStyle(ButtonStyle.Primary);

	const row1_buttons = new ActionRowBuilder()
		.addComponents(btn_signupverktyg);

	client.channels.cache.get(ch_Verktyg_Signup).send({
		components: [row1_buttons],
	});

}

module.exports = { postCalendar, postSignupButtons };
