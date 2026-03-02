const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createAuth } = require('./auth');
const logActivity = require('../../core/logger');
const store = require('../../state/store');
const { checkDateFormat, parseSwedishTime } = require('../../utils/dateUtils');
const client = require('../../core/client');
const { ch_FikaList } = require('../../core/constants');

async function postFikaList(update) {
	try {
		// Load the service account credentials
		const auth = createAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);

		// Create the sheets API client
		const sheets = google.sheets({ version: 'v4', auth });

		// Read the config to get spreadsheet ID and tab name
		const config = require('../../../config.json');
		const spreadsheetId = config.spreadsheetId;

		// Get the responsible person from B6
		const responsibleRange = `${config.sheetsTab}!B6`;
		const responsibleResponse = await sheets.spreadsheets.values.get({
			spreadsheetId: spreadsheetId,
			range: responsibleRange,
		});
		const responsiblePerson = responsibleResponse.data.values?.[0]?.[0] || 'Okänt';

		// Get the current period from B5
		const periodRange = `${config.sheetsTab}!B5`;
		const periodResponse = await sheets.spreadsheets.values.get({
			spreadsheetId: spreadsheetId,
			range: periodRange,
		});
		const currentPeriod = periodResponse.data.values?.[0]?.[0] || '';

		// Get the fika data starting from row 7, columns A through H (and potentially more)
		const dataRange = `${config.sheetsTab}!A8:H50`; // Read a large range to get all data
		const response = await sheets.spreadsheets.values.get({
			spreadsheetId: spreadsheetId,
			range: dataRange,
		});

		const rows = response.data.values;

		if (!rows || rows.length === 0) {
			logActivity('No fika data found in the spreadsheet.');
			return;
		}

		// Process the data and extract raw data for comparison
		let fikaEntries = [];
		let currentRawData = []; // Store raw data for comparison
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
		let firstUpcomingDateFound = false; // Track if we've added emojis to the first upcoming date

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const date = row[0]; // Column A

			// Stop if date is empty
			if (!date || date.trim() === '') {
				break;
			}

			// Parse the date and format it
			const dateObj = new Date(date);
			if (isNaN(dateObj.getTime())) {
				continue; // Skip invalid dates
			}

			// Set time to start of day for accurate comparison
			dateObj.setHours(0, 0, 0, 0);

			// Check if date has passed
			const hasPassed = dateObj.getTime() < today.getTime();

			const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}`;

			// Get Storstäd status (Column B)
			const storstad = row[1] === 'TRUE' || row[1] === true;

			// Get extra info (Column C)
			const extraInfo = row[2] || '';

			// Collect names from columns D onwards
			const names = [];
			for (let j = 3; j < row.length; j++) {
				if (row[j] && row[j].trim() !== '') {
					names.push(row[j].trim());
				}
			}

			// Skip if no names AND no extra info
			if (names.length === 0 && !extraInfo) {
				continue;
			}

			// Store raw data for comparison (without formatting)
			currentRawData.push({
				date: date.trim(),
				storstad: storstad,
				extraInfo: extraInfo,
				names: names.slice().sort() // Sort names for consistent comparison
			});

			// Format the entry
			let entryText;
			if (hasPassed) {
				// Past dates: bold without ###
				entryText = `**${formattedDate}**\n`;
			} else {
				// Future dates: normal ### format
				if (!firstUpcomingDateFound) {
					// First upcoming date gets the emojis
					entryText = `### ${formattedDate} <:nasta_1:1414262959479455854><:nasta_2:1414262943339516056><:nasta_3:1414262927053164604>\n`;
					firstUpcomingDateFound = true;
				} else {
					// Other future dates: normal format
					entryText = `### ${formattedDate}\n`;
				}
			}

			// Add Storstäd and extra info if present
			if (storstad || extraInfo) {
				let specialInfo = [];
				if (storstad) {
					specialInfo.push('**Storstäd**');
				}
				if (extraInfo) {
					specialInfo.push(`_${extraInfo}_`);
				}
				entryText += `-# ${specialInfo.join(' - ')}\n`;
			}

			// Add names (only if there are names)
			if (names.length > 0) {
				entryText += names.join(', ');
			}

			// Add "> " prefix to each line if date has passed
			if (hasPassed) {
				entryText = entryText.split('\n').map(line => line.trim() ? `> ${line}` : line).join('\n');
			}

			fikaEntries.push(entryText);
		}

		// Check if raw data has changed (excluding formatting changes)
		const previousFikaData = store.getPreviousFikaData();
		const dataHasChanged = !previousFikaData ||
			JSON.stringify(currentRawData) !== JSON.stringify(previousFikaData);

		// Update the stored raw data
		store.setPreviousFikaData(currentRawData);

		// Create the final message
		let messageContent = `# Fikalista (${currentPeriod})\n-# Ansvarig: ${responsiblePerson}\n`;
		messageContent += fikaEntries.join('\n');

		// Create the fika instructions button
		const fikaButton = new ButtonBuilder()
			.setCustomId('fika_instructions')
			.setLabel('Vad ska jag göra som fikaansvarig?')
			.setStyle(ButtonStyle.Secondary);

		// Create the cleaning instructions button
		const cleaningButton = new ButtonBuilder()
			.setCustomId('cleaning_instructions')
			.setLabel('Vad ska jag storstäda?')
			.setStyle(ButtonStyle.Secondary);


		const row = new ActionRowBuilder().addComponents(fikaButton, cleaningButton);

		// Post or update the message
		const channel = client.channels.cache.get(ch_FikaList);
		if (!channel) {
			logActivity('Could not find the fika list channel');
			return;
		}

		if (update) {
			// Update the most recent message
			const messages = await channel.messages.fetch({ limit: 1 });
			const fikaMessage = messages.first();

			if (fikaMessage) {
				// Always update the message (for formatting changes like dates passing)
				// But only add timestamp and log if raw data has changed
				if (dataHasChanged) {
					// Add timestamp only when raw data changes
					const updateTime = new Intl.DateTimeFormat('sv-SE', {
						dateStyle: 'short',
						timeStyle: 'short',
						hourCycle: 'h24',
						timeZone: 'Europe/Stockholm'
					}).format(new Date());
					messageContent += `\n\n-# Senast uppdaterad: ${updateTime}`;

					await fikaMessage.edit({ content: messageContent, components: [row] });
				} else {
					// Update without new timestamp, but preserve existing timestamp if present
					const existingContent = fikaMessage.content;
					const timestampMatch = existingContent.match(/\n\n-# Senast uppdaterad: .+$/);

					if (timestampMatch) {
						// Preserve existing timestamp
						messageContent += timestampMatch[0];
					}

					await fikaMessage.edit({ content: messageContent, components: [row] });
				}
			} else {
				// If no existing message found, post a new one
				await channel.send({ content: messageContent, components: [row] });
			}
		} else {
			// Post a new message
			await channel.send({ content: messageContent, components: [row] });
		}

	} catch (error) {
		logActivity(`Error posting fika list: ${error.message}`);
	}
}

async function getCleaningInstructions() {
	try {
		// Load the service account credentials
		const auth = createAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);

		// Create the sheets API client
		const sheets = google.sheets({ version: 'v4', auth });

		// Read the config to get spreadsheet ID
		const config = require('../../../config.json');
		const spreadsheetId = config.spreadsheetId;

		// Get the cleaning instructions from Checklista sheet, cell A2
		const cleaningRange = 'Checklista!A2';
		const response = await sheets.spreadsheets.values.get({
			spreadsheetId: spreadsheetId,
			range: cleaningRange,
		});

		const cleaningData = response.data.values?.[0]?.[0] || '';

		if (!cleaningData || cleaningData.trim() === '') {
			return 'Inga städinstruktioner hittades.';
		}

		return cleaningData;

	} catch (error) {
		logActivity(`Error fetching cleaning instructions: ${error.message}`);
		return 'Kunde inte hämta städinstruktioner.';
	}
}

async function getFikaInstructions() {
	try {
		// Load the service account credentials
		const auth = createAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);

		// Create the sheets API client
		const sheets = google.sheets({ version: 'v4', auth });

		// Read the config to get spreadsheet ID
		const config = require('../../../config.json');
		const spreadsheetId = config.spreadsheetId;

		// Get the fika instructions from Instruktioner sheet, cell A2
		const fikaRange = 'Instruktioner!A2';
		const response = await sheets.spreadsheets.values.get({
			spreadsheetId: spreadsheetId,
			range: fikaRange,
		});

		const fikaData = response.data.values?.[0]?.[0] || '';

		if (!fikaData || fikaData.trim() === '') {
			return 'Inga fikainstruktioner hittades.';
		}

		return fikaData;

	} catch (error) {
		logActivity(`Error fetching fika instructions: ${error.message}`);
		return 'Kunde inte hämta fikainstruktioner.';
	}
}

async function syncEventsToSheet() {
	try {
		// Load the service account credentials with write permissions
		const auth = createAuth(['https://www.googleapis.com/auth/spreadsheets']);

		// Create the sheets API client
		const sheets = google.sheets({ version: 'v4', auth });

		// Read the config to get calendar spreadsheet ID and tab name
		const configContent = fs.readFileSync('./config.json', 'utf8');
		const config = JSON.parse(configContent);

		const spreadsheetId = config.calendarSpreadsheetId;
		const tabName = config.calendarTab;

		// Validate required config values
		if (!spreadsheetId) {
			throw new Error('calendarSpreadsheetId not found in config.json');
		}
		if (!tabName) {
			throw new Error('calendarTab not found in config.json');
		}

		// Read all JSON files from both active and archived directories
		const events = [];
		const directories = ['./src/events/active', './src/events/archived'];

		for (const dir of directories) {
			try {
				const files = fs.readdirSync(dir);
				const jsonFiles = files.filter(file => file.endsWith('.json') && file !== '.gitkeep');

				for (const file of jsonFiles) {
					try {
						const filePath = path.join(dir, file);
						const fileContent = fs.readFileSync(filePath, 'utf8');
						const eventData = JSON.parse(fileContent);

						// Extract required fields
						const name = eventData.name || '';
						const date = eventData.date || '';
						const time = eventData.time || '';
						const location = eventData.location || '';
						const id = eventData.id || '';
						const link = eventData.link || '';
						const active = eventData.active;

						// Skip if event is not active
						if (active === false) {
							continue;
						}

						// Skip if essential fields are missing
						if (!name || !date || !id) {
							continue;
						}

						// Validate date format (DD/MM/YY)
						const validatedDate = checkDateFormat(date);
						if (!validatedDate) {
							// Skipping event: Invalid date format
							continue;
						}

						// Parse date and time for sorting
						const [day, month, year] = validatedDate.split('/');
						const fullYear = 2000 + parseInt(year);
						const eventDate = new Date(fullYear, parseInt(month) - 1, parseInt(day));

						// Parse time for sorting (handle various Swedish time formats)
						let eventTime = new Date();
						const parsedTime = parseSwedishTime(time);

						if (parsedTime) {
							eventTime = new Date(fullYear, parseInt(month) - 1, parseInt(day), parsedTime.hours, parsedTime.minutes);
						} else {
							// If no valid time found, use start of day
							eventTime = new Date(fullYear, parseInt(month) - 1, parseInt(day), 0, 0);
						}

						// Create standardized time string for the sheet
						const standardizedTime = parsedTime ?
							`${String(parsedTime.hours).padStart(2, '0')}:${String(parsedTime.minutes).padStart(2, '0')}` :
							'00:00';

						events.push({
							name,
							date: validatedDate,
							time: standardizedTime,
							location,
							id,
							link,
							sortDate: eventDate,
							sortTime: eventTime
						});

					} catch (parseError) {
						logActivity(`Error parsing event file ${file}: ${parseError.message}`);
						continue;
					}
				}
			} catch (dirError) {
				logActivity(`Error reading directory ${dir}: ${dirError.message}`);
				continue;
			}
		}

		// Sort events by date, then by time (limit to 50 events)
		events.sort((a, b) => {
			const dateCompare = a.sortDate.getTime() - b.sortDate.getTime();
			if (dateCompare !== 0) return dateCompare;
			return a.sortTime.getTime() - b.sortTime.getTime();
		});

		const limitedEvents = events.slice(0, 50);

		// Prepare data for the sheet - ensure all values are strings to prevent apostrophe issues
		const sheetData = limitedEvents.map(event => [
			String(event.name || ''),                    // Column A: Title
			'',                                         // Column B: Description (ignored)
			String(event.location || ''),                // Column C: Location
			String(event.date || ''),                   // Column D: Start Date
			String(event.time || ''),                   // Column E: Start Time
			String(event.date || ''),                   // Column F: End Date (same as start)
			String(event.time || ''),                   // Column G: End Time (same as start)
			String(event.id || ''),                     // Column H: UID
			`https://discord.com/channels/1139435626211590236/1228238682394333265/${event.link}` // Column I: Discord URL
		]);

		// Clear existing data from row 3 onwards (keep header rows 1-2)
		const clearRange = `${tabName}!A3:Z1000`;
		await sheets.spreadsheets.values.clear({
			spreadsheetId: spreadsheetId,
			range: clearRange,
		});

		// Write new data starting from row 3
		if (sheetData.length > 0) {
			const writeRange = `${tabName}!A3:I${2 + sheetData.length}`;
			await sheets.spreadsheets.values.update({
				spreadsheetId: spreadsheetId,
				range: writeRange,
				valueInputOption: 'RAW',
				resource: {
					values: sheetData
				}
			});
		}

	} catch (error) {
		logActivity(`Error syncing events to sheet: ${error.message}`);
	}
}

module.exports = { postFikaList, getCleaningInstructions, getFikaInstructions, syncEventsToSheet };
