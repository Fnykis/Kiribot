const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');
const lockFile = require('lockfile');
const { createAuth } = require('./auth');
const logActivity = require('../../core/logger');
const { dir_EventsActive, dir_EventsArchived, ch_Spelningar } = require('../../core/constants');
const client = require('../../core/client');
const { parseSwedishTime } = require('../../utils/dateUtils');
const { getEventJSON } = require('../../features/signup');
const { findEventThread } = require('../../features/eventThread');

async function findOrCreateYearFolder(driveClient, year) {
	try {
		const parentFolderId = '1vyOe8TZpTbAxpxUQw3t_YPZDSP8Xd_X_';

		// Search for existing year folder
		const response = await driveClient.files.list({
			q: `'${parentFolderId}' in parents and name='${year}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			fields: 'files(id, name)',
		});

		if (response.data.files && response.data.files.length > 0) {
			return response.data.files[0].id;
		}

		// Year folder doesn't exist, create it
		const folderMetadata = {
			name: year,
			mimeType: 'application/vnd.google-apps.folder',
			parents: [parentFolderId]
		};

		const folder = await driveClient.files.create({
			resource: folderMetadata,
			fields: 'id, name'
		});

		return folder.data.id;
	} catch (error) {
		logActivity(`Error in findOrCreateYearFolder: ${error.message}`);
		throw error;
	}
}

// Create Google Drive folder for an event
async function createEventDriveFolder(eventData) {
	try {
		// Authenticate with Google Drive API
		const auth = createAuth(['https://www.googleapis.com/auth/drive']);

		const drive = google.drive({ version: 'v3', auth });

		// Validate and extract year from event date (DD/MM/YY format)
		if (!eventData.date) {
			logActivity(`Error: Event date missing for event '${eventData.name || 'unknown'}'`);
			return null;
		}

		const dateParts = eventData.date.split('/');
		if (dateParts.length !== 3) {
			logActivity(`Error: Invalid date format for event '${eventData.name || 'unknown'}': ${eventData.date}`);
			return null;
		}

		const year = parseInt(dateParts[2]);
		if (isNaN(year) || year < 0 || year > 99) {
			logActivity(`Error: Cannot parse year from date '${eventData.date}' for event '${eventData.name || 'unknown'}'`);
			return null;
		}

		const fullYear = 2000 + year; // Convert YY to YYYY

		// Find or create year folder
		const yearFolderId = await findOrCreateYearFolder(drive, String(fullYear));

		// Format event folder name: YYMMDD Event name
		const day = dateParts[0].padStart(2, '0');
		const month = dateParts[1].padStart(2, '0');
		const yearShort = dateParts[2];
		const folderName = `${yearShort}${month}${day} ${eventData.name}`;

		// Check if folder already exists
		const existingFolders = await drive.files.list({
			q: `'${yearFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			fields: 'files(id, name, webViewLink)',
		});

		if (existingFolders.data.files && existingFolders.data.files.length > 0) {
			// Folder already exists, return existing folder info
			const existingFolder = existingFolders.data.files[0];
			// Construct URL from folder ID if webViewLink is not available
			const folderUrl = existingFolder.webViewLink || `https://drive.google.com/drive/folders/${existingFolder.id}`;
			return { folderId: existingFolder.id, folderUrl: folderUrl, alreadyExists: true };
		}

		// Create event folder inside year folder
		const folderMetadata = {
			name: folderName,
			mimeType: 'application/vnd.google-apps.folder',
			parents: [yearFolderId]
		};

		const folder = await drive.files.create({
			resource: folderMetadata,
			fields: 'id, name, webViewLink'
		});

		const folderId = folder.data.id;
		const folderUrl = folder.data.webViewLink;

		return { folderId, folderUrl, alreadyExists: false };
	} catch (error) {
		logActivity(`Error creating Drive folder for event '${eventData.name || 'unknown'}': ${error.message}`);
		return null;
	}
}

async function hasExistingDriveLinkMessage(thread) {
	try {
		// Fetch all messages in the thread
		const messages = await thread.messages.fetch();

		// Get all messages sent by the bot
		const botMessages = messages.filter(msg => msg.author.id === client.user.id);

		if (botMessages.size <= 1) {
			// Only the starter message exists, no Drive link message yet
			return false;
		}

		// Identify the starter message (oldest bot message)
		let starterMessage = null;
		try {
			starterMessage = await thread.fetchStarterMessage();
		} catch (err) {
			// Fallback: the oldest message is likely the starter
			starterMessage = botMessages.last();
		}

		// Sort messages by timestamp to find the information message (second message)
		const messageArray = Array.from(botMessages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

		// Check the information message (second message) for Google Drive link
		if (messageArray.length >= 2) {
			const informationMessage = messageArray[1];
			if (
				informationMessage.content.startsWith('## ℹ️ Information') ||
				informationMessage.content.startsWith('Information:')
			) {
				const content = informationMessage.content.toLowerCase();
				if (content.includes('google drive')) {
					return true; // Information message already contains Drive link
				}
			}
		}

		// Also check all bot messages except the starter message for "google drive" (case-insensitive)
		// This covers the case where a separate Drive link message was posted (old behavior)
		for (const [messageId, message] of botMessages) {
			// Skip the starter message
			if (starterMessage && messageId === starterMessage.id) {
				continue;
			}

			const content = message.content.toLowerCase();
			if (content.includes('google drive')) {
				return true; // Found an existing Drive link message
			}
		}

		return false; // No Drive link message found
	} catch (error) {
		logActivity(`Error checking for existing Drive link message in thread ${thread.id}: ${error.message}`);
		// If we can't check, assume there's no existing message to be safe
		return false;
	}
}

// Post Drive folder link to event discussion thread
async function postDriveLinkToEventThread(eventId, driveUrl, eventName) {
	try {
		const targetThread = await findEventThread(eventId);

		if (!targetThread) {
			logActivity(`Error: Could not find discussion thread for event ID ${eventId} in active or archived threads`);
			return false;
		}

		// Get event data to access current information text
		const eventData = getEventJSON(eventId);
		if (!eventData) {
			logActivity(`Error: Could not load event data for event ID ${eventId}`);
			return false;
		}

		// Find the information message (second message in thread)
		const messages = await targetThread.messages.fetch({ limit: 20 });
		const messageArray = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

		let informationMessage = null;
		if (messageArray.length >= 2) {
			const potentialInfoMessage = messageArray[1];
			if (
				potentialInfoMessage.content.startsWith('## ℹ️ Information') ||
				potentialInfoMessage.content.startsWith('Information:')
			) {
				informationMessage = potentialInfoMessage;
			}
		}

		// If information message exists, edit it to include the Drive link
		if (informationMessage) {
			// Check if the information message already contains the Google Drive link
			const messageContent = informationMessage.content;
			const hasDriveLink = messageContent.includes('📸✨ Google Drive-länk för');

			if (hasDriveLink) {
				logActivity(`Google Drive link already exists in information message for event ID ${eventId}. Skipping Drive link addition.`);
				return true; // Already added, no need to do anything
			}

			// Get current information text from event data
			const currentText = eventData.information?.text || '';

			// Also check the event data text to be safe
			if (currentText.includes('📸✨ Google Drive-länk för')) {
				logActivity(`Google Drive link already exists in event data for event ID ${eventId}. Skipping Drive link addition.`);
				return true; // Already added, no need to do anything
			}

			// Append Google Drive link to the information text
			const driveLinkText = `\n\n📸✨ Google Drive-länk för **${eventName}:**\n${driveUrl}`;
			const newInformationText = currentText + driveLinkText;

			// Update the information message
			const newContent = `## ℹ️ Information ${newInformationText}`;
			await informationMessage.edit(newContent);

			// Update event data JSON file with the new text
			const files = fs.readdirSync(dir_EventsActive);
			const fileName = files.find(file => file.endsWith('_' + eventId + '.json'));

			if (fileName) {
				const filePath = path.join(dir_EventsActive, fileName);

				// Use lockFile to safely update JSON
				lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
					if (err) {
						logActivity(`Failed to acquire lock for ${fileName} when updating with Drive link: ${err.message}`);
						return;
					}

					try {
						// Re-read the file to ensure we have the latest data
						let eventDataToUpdate = JSON.parse(fs.readFileSync(filePath, 'utf8'));

						// Update information text
						if (eventDataToUpdate.information) {
							eventDataToUpdate.information.text = newInformationText;
							fs.writeFileSync(filePath, JSON.stringify(eventDataToUpdate));
						}
					} catch (updateError) {
						logActivity(`Error updating event data with Drive link for event ID ${eventId}: ${updateError.message}`);
					} finally {
						lockFile.unlock(`${fileName}.lock`, (unlockErr) => {
							if (unlockErr) {
								logActivity(`Failed to unlock ${fileName}: ${unlockErr.message}`);
							}
						});
					}
				});
			}

			// Create link to information message
			const informationMessageLink = `https://discord.com/channels/${targetThread.guild.id}/${targetThread.id}/${informationMessage.id}`;

			// Send a new message saying everyone can add photos/videos to Google Drive
			await targetThread.send(`📸✨ Alla kan nu lägga till bilder och videos i Google Drive för **${eventName}**!\n\nKlicka här för att se informationsmeddelandet: ${informationMessageLink}`);
		} else {
			// Fallback: Information message is missing, send a regular message as previously done
			logActivity(`Information message not found for event ID ${eventId}, posting Drive link as regular message instead`);

			const message = await targetThread.send(`📸✨ Google Drive-länk för **${eventName}:**\n${driveUrl}\n\nLägg in bilder och videos där eller posta dem här i tråden (bilder som läggs i tråden synkar *inte* till Google Drive)!`);

			// Pin the message
			// Note: Bot needs PIN_MESSAGES permission (required starting February 2026)
			try {
				// Verify bot has permission to pin messages
				const botMember = await targetThread.guild.members.fetch(client.user.id);
				const hasPinPermission = targetThread.permissionsFor(botMember).has(PermissionFlagsBits.PinMessages ?? 2251799813685248n);
				if (!hasPinPermission) {
					logActivity(`Warning: Bot does not have PIN_MESSAGES permission in thread for event ID ${eventId}. Pinning will fail after February 2026.`);
				}

				await message.pin();
			} catch (pinError) {
				// Check if it's a permission error related to PIN_MESSAGES
				if (pinError.code === 50013 || pinError.message.includes('permission') || pinError.message.includes('PIN_MESSAGES')) {
					logActivity(`Warning: Could not pin Drive folder link message for event ID ${eventId}. Bot may need PIN_MESSAGES permission (required starting February 2026): ${pinError.message}`);
				} else {
					logActivity(`Warning: Could not pin Drive folder link message for event ID ${eventId}: ${pinError.message}`);
				}
				// Continue even if pinning fails
			}
		}

		return true;

	} catch (error) {
		logActivity(`Error posting Drive link to thread for event ID ${eventId}: ${error.message}`);
		return false;
	}
}

async function processPassedEvent(eventData, fileName) {
	try {
		// Check if Drive folder creation is requested for this event
		if (eventData.createDriveDir === false || typeof eventData.createDriveDir === 'undefined') {
			logActivity(`Skipping Drive folder creation for event '${eventData.name}' as per event settings.`);
			return;
		}

		// First, verify we can find the thread before creating the Drive folder
		const targetThread = await findEventThread(eventData.id);

		if (!targetThread) {
			logActivity(`Error: Could not find discussion thread for event ID ${eventData.id}. Skipping Drive folder creation.`);
			return;
		}

		// Check if bot has already posted a Google Drive link message in this thread
		const alreadyPosted = await hasExistingDriveLinkMessage(targetThread);
		if (alreadyPosted) {
			logActivity(`Google Drive link already posted for event '${eventData.name}' (ID: ${eventData.id}). Skipping Drive folder creation and link posting.`);
			return;
		}

		// Only proceed with Drive folder creation if thread exists and no Drive link was found
		// Create or check for existing Drive folder
		const driveResult = await createEventDriveFolder(eventData);
		if (!driveResult || !driveResult.folderUrl) {
			logActivity(`Error: Failed to create or find Drive folder for event '${eventData.name}'`);
			return;
		}

		// Only post Drive link to thread if folder was just created (not if it already existed)
		if (!driveResult.alreadyExists) {
			const success = await postDriveLinkToEventThread(eventData.id, driveResult.folderUrl, eventData.name);
			if (!success) {
				logActivity(`Warning: Drive folder created for event '${eventData.name}' but failed to post link to thread.`);
			}
		}

		// Note: Archiving logic can be added here or in checkAndProcessPassedEvents() later
		// Existing moveToArchived() function at line 4146 should remain untouched for now
		// Function continues even if folder already exists, allowing archiving to proceed

	} catch (error) {
		logActivity(`Error processing passed event '${eventData.name || fileName}': ${error.message}`);
	}
}

// Check and process events that have just passed
async function checkAndProcessPassedEvents(update = null) {
	try {
		// Read all JSON files from active directory
		const files = fs.readdirSync(dir_EventsActive).filter(file => file.endsWith('.json'));

		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

		for (const file of files) {
			try {
				const filePath = path.join(dir_EventsActive, file);
				const eventData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

				// Parse event date (DD/MM/YY format)
				if (!eventData.date) {
					continue;
				}

				const dateParts = eventData.date.split('/');
				if (dateParts.length !== 3) {
					continue;
				}

				const day = parseInt(dateParts[0]);
				const month = parseInt(dateParts[1]);
				const year = parseInt(dateParts[2]);

				if (isNaN(day) || isNaN(month) || isNaN(year)) {
					continue;
				}

				const fullYear = 2000 + year;
				const eventDate = new Date(fullYear, month - 1, day);
				eventDate.setHours(0, 0, 0, 0);

				// Check if event date is today
				if (eventDate.getTime() !== today.getTime()) {
					continue;
				}

				// Parse event time
				let eventTime = null;
				if (eventData.time) {
					const parsedTime = parseSwedishTime(eventData.time);
					if (parsedTime) {
						eventTime = new Date(fullYear, month - 1, day, parsedTime.hours, parsedTime.minutes);
					}
				}

				// If no valid time, skip (we can't determine if event has passed)
				if (!eventTime) {
					continue;
				}

				// Check if current time is after event time
				if (now.getTime() > eventTime.getTime()) {
					// Event has passed, process it
					await processPassedEvent(eventData, file);
				}

			} catch (error) {
				logActivity(`Error checking event file ${file}: ${error.message}`);
			}
		}
	} catch (error) {
		logActivity(`Error in checkAndProcessPassedEvents: ${error.message}`);
	}
}

async function findSubfolder(driveClient, parentFolderId, folderName) {
	try {
		// Search for existing subfolder
		const response = await driveClient.files.list({
			q: `'${parentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			fields: 'files(id, name)',
			supportsAllDrives: true,
			includeItemsFromAllDrives: true
		});

		if (response.data.files && response.data.files.length > 0) {
			// logActivity(`Found existing subfolder: ${folderName} (ID: ${response.data.files[0].id})`);
			return response.data.files[0].id;
		}

		// Subfolder doesn't exist - return null (don't create, as service account can't own folders)
		// logActivity(`Warning: Subfolder '${folderName}' not found. Please create it manually in Google Drive.`);
		return null;
	} catch (error) {
		// logActivity(`Error in findSubfolder for '${folderName}': ${error.message}`);
		throw error;
	}
}

// Main backup function that uploads JSON files to Google Drive
async function backupJsonFiles() {
	try {

		// Authenticate with Google Drive API
		const auth = createAuth(['https://www.googleapis.com/auth/drive']);

		const drive = google.drive({ version: 'v3', auth });

		// Backup folder ID (Discord Backup folder)
		const backupFolderId = '18og58SathrgEcHd9lyTSiropfRgcltlH';

		// Get current date in YYYY-MM-DD format
		const now = new Date();
		const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

		// Define backup configuration
		const backupConfig = [
			{
				subfolderName: 'permissions',
				localPath: path.join(__dirname, '../../data', 'permissions.json'),
				backupFileName: `${dateString}.json`
			},
			{
				subfolderName: 'detailsList',
				localPath: path.join(__dirname, '../../data/detailsList.json'),
				backupFileName: `${dateString}.json`
			},
			{
				subfolderName: 'groupList',
				localPath: path.join(__dirname, '../../data/groupList.json'),
				backupFileName: `${dateString}.json`
			},
			{
				subfolderName: 'instrumentList',
				localPath: path.join(__dirname, '../../data/instrumentList.json'),
				backupFileName: `${dateString}.json`
			}
		];

		// Backup single files
		for (const config of backupConfig) {
			try {
				// Check if local file exists
				if (!fs.existsSync(config.localPath)) {
					// logActivity(`Error when backing up ${config.subfolderName}: file does not exist`);
					continue;
				}

				// Find existing subfolder (must be created manually by user)
				const subfolderId = await findSubfolder(drive, backupFolderId, config.subfolderName);

				if (!subfolderId) {
					// logActivity(`Skipping backup of ${config.subfolderName}: subfolder does not exist in Google Drive`);
					continue;
				}

				// Read local file
				const fileContent = fs.readFileSync(config.localPath, 'utf8');

				// Check if file with same name already exists in Drive
				const existingFiles = await drive.files.list({
					q: `'${subfolderId}' in parents and name='${config.backupFileName}' and trashed=false`,
					fields: 'files(id, name)',
					supportsAllDrives: true,
					includeItemsFromAllDrives: true
				});

				// Upload file (will overwrite if exists)
				const fileMetadata = {
					name: config.backupFileName,
					parents: [subfolderId]
				};

				const media = {
					mimeType: 'application/json',
					body: fileContent
				};

				if (existingFiles.data.files && existingFiles.data.files.length > 0) {
					// Update existing file
					const updateResult = await drive.files.update({
						fileId: existingFiles.data.files[0].id,
						media: media,
						supportsAllDrives: true
					});
					// logActivity(`Successfully updated backup: ${config.subfolderName}/${config.backupFileName}`);
				} else {
					// Create new file
					const createResult = await drive.files.create({
						resource: fileMetadata,
						media: media,
						supportsAllDrives: true
					});
					// logActivity(`Successfully created backup: ${config.subfolderName}/${config.backupFileName} (ID: ${createResult.data.id})`);
				}
			} catch (error) {
				// logActivity(`Error backing up ${config.subfolderName}: ${error.message}`);
				// logActivity(`Full error details: ${JSON.stringify(error)}`);
				// Continue with other files
			}
		}

		// Backup active events files
		try {
			const activeEventsDir = path.join(__dirname, '../../events/active');
			if (!fs.existsSync(activeEventsDir)) {
				// logActivity('Error: Active events directory does not exist, skipping backup');
			} else {
				// Find existing active events subfolder (must be created manually by user)
				const activeEventsSubfolderId = await findSubfolder(drive, backupFolderId, 'active events');

				if (!activeEventsSubfolderId) {
					// logActivity('Skipping active events backup: subfolder does not exist in Google Drive');
					return;
				}

				// Get all JSON files in active directory
				const activeFiles = fs.readdirSync(activeEventsDir).filter(file => file.endsWith('.json'));

				for (const fileName of activeFiles) {
					try {
						const filePath = path.join(activeEventsDir, fileName);
						const fileContent = fs.readFileSync(filePath, 'utf8');

						// Format: originalFilename_YYYY-MM-DD.json
						const backupFileName = `${fileName.replace('.json', '')}_${dateString}.json`;

						// Check if file with same name already exists
						const existingFiles = await drive.files.list({
							q: `'${activeEventsSubfolderId}' in parents and name='${backupFileName}' and trashed=false`,
							fields: 'files(id, name)',
							supportsAllDrives: true,
							includeItemsFromAllDrives: true
						});

						const fileMetadata = {
							name: backupFileName,
							parents: [activeEventsSubfolderId]
						};

						const media = {
							mimeType: 'application/json',
							body: fileContent
						};

						if (existingFiles.data.files && existingFiles.data.files.length > 0) {
							// Update existing file
							const updateResult = await drive.files.update({
								fileId: existingFiles.data.files[0].id,
								media: media,
								supportsAllDrives: true
							});
							// logActivity(`Successfully updated active event backup: ${backupFileName}`);
						} else {
							// Create new file
							const createResult = await drive.files.create({
								resource: fileMetadata,
								media: media,
								supportsAllDrives: true
							});
							// logActivity(`Successfully created active event backup: ${backupFileName} (ID: ${createResult.data.id})`);
						}
					} catch (error) {
						// logActivity(`Error backing up active event ${fileName}: ${error.message}`);
						// logActivity(`Full error details: ${JSON.stringify(error)}`);
						// Continue with other files
					}
				}
			}
		} catch (error) {
			// logActivity(`Error backing up active events: ${error.message}`);
		}

	} catch (error) {
		// logActivity(`Error in backupJsonFiles: ${error.message}`);
	}
}

// Cleanup function for archived active events (removes backups of files that no longer exist locally)
async function cleanupArchivedActiveEvents(drive, activeEventsSubfolderId) {
	try {
		// Get current local active files (without .json extension for comparison)
		const activeEventsDir = path.join(__dirname, '../../events/active');
		if (!fs.existsSync(activeEventsDir)) {
			return; // Nothing to clean if directory doesn't exist
		}

		const localFiles = fs.readdirSync(activeEventsDir)
			.filter(file => file.endsWith('.json'))
			.map(file => file.replace('.json', ''));

		// Get all backup files in active events subfolder
		let allBackups = [];
		let nextPageToken = null;

		do {
			const response = await drive.files.list({
				q: `'${activeEventsSubfolderId}' in parents and trashed=false`,
				fields: 'nextPageToken, files(id, name)',
				pageSize: 1000,
				pageToken: nextPageToken,
				supportsAllDrives: true,
				includeItemsFromAllDrives: true
			});

			if (response.data.files) {
				allBackups = allBackups.concat(response.data.files);
			}

			nextPageToken = response.data.nextPageToken || null;
		} while (nextPageToken);

		// For each backup file, extract original filename and check if it exists locally
		let deletedCount = 0;
		for (const backupFile of allBackups) {
			try {
				// Extract original filename: remove the _YYYY-MM-DD.json suffix
				const fileNameMatch = backupFile.name.match(/^(.+)_\d{4}-\d{2}-\d{2}\.json$/);
				if (fileNameMatch) {
					const originalFileName = fileNameMatch[1];

					// If original file doesn't exist locally, delete the backup
					if (!localFiles.includes(originalFileName)) {
						await drive.files.delete({
							fileId: backupFile.id,
							supportsAllDrives: true
						});
						deletedCount++;
						// logActivity(`Deleted archived event backup: ${backupFile.name}`);
					}
				}
			} catch (error) {
				// logActivity(`Error checking/deleting backup file ${backupFile.name}: ${error.message}`);
			}
		}

	} catch (error) {
		// logActivity(`Error in cleanupArchivedActiveEvents: ${error.message}`);
	}
}

// Cleanup function that removes backups older than 14 days
async function cleanupOldBackups() {
	try {

		// Authenticate with Google Drive API
		const auth = createAuth(['https://www.googleapis.com/auth/drive']);

		const drive = google.drive({ version: 'v3', auth });

		// Backup folder ID (Discord Backup folder)
		const backupFolderId = '18og58SathrgEcHd9lyTSiropfRgcltlH';

		// Calculate cutoff date (14 days ago at midnight local time)
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - 14);
		cutoffDate.setHours(0, 0, 0, 0);

		// List all subfolders in backup folder
		const subfolders = await drive.files.list({
			q: `'${backupFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			fields: 'files(id, name)',
			supportsAllDrives: true,
			includeItemsFromAllDrives: true
		});

		if (!subfolders.data.files) {
			return;
		}

		let totalDeleted = 0;

		// Process each subfolder
		for (const subfolder of subfolders.data.files) {
			try {
				// Get all files in subfolder (with pagination)
				let allFiles = [];
				let nextPageToken = null;

				do {
					const response = await drive.files.list({
						q: `'${subfolder.id}' in parents and trashed=false`,
						fields: 'nextPageToken, files(id, name)',
						pageSize: 1000,
						pageToken: nextPageToken,
						supportsAllDrives: true,
						includeItemsFromAllDrives: true
					});

					if (response.data.files) {
						allFiles = allFiles.concat(response.data.files);
					}

					nextPageToken = response.data.nextPageToken || null;
				} while (nextPageToken);

				// Process each file
				for (const file of allFiles) {
					try {
						let fileDate = null;

						// Extract date from filename
						// Format 1: YYYY-MM-DD.json (for single files)
						const dateMatch1 = file.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
						// Format 2: originalFilename_YYYY-MM-DD.json (for active events)
						const dateMatch2 = file.name.match(/.+_(\d{4}-\d{2}-\d{2})\.json$/);

						if (dateMatch1) {
							// Parse date string and create date at local midnight
							const dateParts = dateMatch1[1].split('-');
							fileDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
							fileDate.setHours(0, 0, 0, 0);
						} else if (dateMatch2) {
							// Parse date string and create date at local midnight
							const dateParts = dateMatch2[1].split('-');
							fileDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
							fileDate.setHours(0, 0, 0, 0);
						}

						// If we found a date and it's older than 14 days, delete it
						if (fileDate && fileDate < cutoffDate) {
							await drive.files.delete({
								fileId: file.id,
								supportsAllDrives: true
							});
							totalDeleted++;
							// logActivity(`Deleted old backup: ${subfolder.name}/${file.name}`);
						}
					} catch (error) {
						// logActivity(`Error processing file ${file.name} in ${subfolder.name}: ${error.message}`);
					}
				}

				// Special cleanup for active events subfolder
				if (subfolder.name === 'active events') {
					await cleanupArchivedActiveEvents(drive, subfolder.id);
				}
			} catch (error) {
				// logActivity(`Error processing subfolder ${subfolder.name}: ${error.message}`);
			}
		}

	} catch (error) {
		// logActivity(`Error in cleanupOldBackups: ${error.message}`);
	}
}

module.exports = { findOrCreateYearFolder, createEventDriveFolder, hasExistingDriveLinkMessage, postDriveLinkToEventThread, processPassedEvent, checkAndProcessPassedEvents, findSubfolder, backupJsonFiles, cleanupArchivedActiveEvents, cleanupOldBackups };
