const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const client = require('../core/client');
const logActivity = require('../core/logger');
const { ch_Spelningar, ch_Signup, dir_EventsActive, guildId } = require('../core/constants');
const { getEventJSON } = require('./signup');

async function eventThreadUpdate(targetEventId = null, updateContext = null) {
	let eventName = 'unknown';
	let eventId = targetEventId || 'unknown';
	let threadId = 'unknown';
	let threadName = 'unknown';

	try {
		const result = await findEventThread(targetEventId);
		if (!result) {
			logActivity(`No matching thread found for event ID: ${targetEventId}. Searched active and archived threads.`);
			return;
		}

		const targetThread = result;
		threadId = targetThread.id;
		threadName = targetThread.name || 'unnamed thread';
		const isArchived = targetThread.archived;

		// Check if thread is archived and unarchive it if needed
		if (isArchived) {
			try {
				await targetThread.setArchived(false);
				logActivity(`Unarchived thread "${threadName}" (${threadId}) for event update`);
			} catch (unarchiveError) {
				logActivity(`Error unarchiving thread "${threadName}" (${threadId}) for event ID ${targetEventId}: ${unarchiveError.message}. Cannot update thread.`);
				return;
			}
		}

		// Since findEventThread returns the thread, we need to get the message to extract content.
		// Let's fetch the starter message or the oldest bot message again briefly.
		const channel = client.channels.cache.get(ch_Spelningar);
		let targetBotMessage = null;
		if (channel.type === ChannelType.GuildForum) {
			targetBotMessage = await result.fetchStarterMessage().catch(() => null);
		}
		if (!targetBotMessage) {
			const messages = await result.messages.fetch();
			targetBotMessage = messages.filter(msg => msg.author.id === client.user.id).last();
		}

		if (!targetBotMessage) {
			logActivity(`Found thread "${threadName}" (${threadId}) for event ${targetEventId} but could not find the key bot message.`);
			return;
		}

		// Extract event ID from the message
		const currentContent = targetBotMessage.content;
		const eventIdMatch = currentContent.match(/-#\s*(\d+)\s*$/m);

		if (!eventIdMatch) {
			logActivity(`No event ID found at the end of the message in thread "${threadName}" (${threadId}), message ID: ${targetBotMessage.id}`);
			return;
		}

		eventId = eventIdMatch[1];

		// Fetch event data from server
		let files = fs.readdirSync(dir_EventsActive);
		let fileName = files.find(file => file.endsWith('_' + eventId + '.json'));

		if (!fileName) {
			logActivity(`No event file found for ID: ${eventId} (thread: "${threadName}", ${threadId})`);
			return;
		}

		let data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));
		eventName = data.name || 'unknown';

		// Reconstruct the base content from data to prevent parsing errors from corrupted messages.
		// This makes the update process robust and also repairs previously corrupted messages.
		const baseContent = `## ${data.name}\n**Signup: https://discord.com/channels/${targetThread.guild.id}/${ch_Signup}/${data.link}**`;

		// Collect users who replied "ja" and "kanske" with their IDs
		let jaUsers = new Map();
		let kanskeUsers = new Map();

		for (const instrument in data.signups) {
			for (const signup of data.signups[instrument]) {
				if (signup.response === 'ja') {
					if (!jaUsers.has(signup.id)) {
						jaUsers.set(signup.id, { name: signup.name, id: signup.id });
					}
				} else if (signup.response === 'kanske') {
					if (!kanskeUsers.has(signup.id)) {
						kanskeUsers.set(signup.id, { name: signup.name, id: signup.id });
					}
				}
			}
		}

		// Get emojis
		const emote_ja = client.emojis.cache.find(emoji => emoji.name === "ja");
		const emote_kanske = client.emojis.cache.find(emoji => emoji.name === "kanske");

		// Create user lists with mentions (if ID available) or names
		const createUserList = (userMap) => {
			const users = Array.from(userMap.values());
			if (users.length === 0) return 'Ingen';
			return users.map(user => {
				return user.id ? `<@${user.id}>` : user.name;
			}).join(', ');
		};

		const jaList = jaUsers.size > 0 ? `${emote_ja} ${jaUsers.size}: ${createUserList(jaUsers)}` : `${emote_ja} 0: Ingen`;
		const kanskeList = kanskeUsers.size > 0 ? `${emote_kanske} ${kanskeUsers.size}: ${createUserList(kanskeUsers)}` : `${emote_kanske} 0: Ingen`;

		// Create the new content with updated lists, using the freshly generated and always-correct baseContent.
		const newContent = `${baseContent}\n\n${jaList}\n\n${kanskeList}\n\n-# ${eventId}`;

		// Create a button for listaInstrument
		const btn_listaInstrument = new ButtonBuilder()
			.setCustomId(`listaInstrument_${eventId}`)
			.setLabel('Instrumentlista (endast ja)')
			.setStyle(ButtonStyle.Secondary);

		const row = new ActionRowBuilder()
			.addComponents(btn_listaInstrument);

		await targetBotMessage.edit({
			content: newContent,
			components: [row]
		});

		// Only log successful thread updates when they were triggered by a user action.
		if (updateContext && updateContext.updatedById) {
			const actorName =
				updateContext.updatedByNickname ||
				updateContext.updatedByName ||
				updateContext.updatedByTag ||
				'Unknown user';
			const updatedByDisplay = `${actorName} (${updateContext.updatedById})`;
			logActivity(`Updated event thread for: ${data.name} by ${updatedByDisplay}`);
		}
	} catch (error) {
		// Enhanced error logging with context
		const errorDetails = {
			eventName: eventName,
			eventId: eventId,
			threadName: threadName,
			threadId: threadId,
			errorMessage: error.message,
			errorCode: error.code || 'N/A',
			errorName: error.name || 'Error'
		};
		logActivity(`Error in eventThreadUpdate for event "${eventName}" (ID: ${eventId}), thread "${threadName}" (${threadId}): ${error.message}${error.code ? ` (code: ${error.code})` : ''}`);
	}
}

// Create a discussion thread for an event in the spelningar channel
async function eventThread(signupData) {
	try {
		const channel = client.channels.cache.get(ch_Spelningar);
		if (!channel) {
			logActivity(`Error: Could not find spelningar channel with ID ${ch_Spelningar}`);
			return;
		}
		// Get emojis
		const emote_ja = client.emojis.cache.find(emoji => emoji.name === "ja");
		const emote_kanske = client.emojis.cache.find(emoji => emoji.name === "kanske");

		// Create the thread title and content
		const threadTitle = `${signupData.name}`;
		const threadContent = `## ${signupData.name}\n**Signup: https://discord.com/channels/${guildId}/${ch_Signup}/${signupData.link}**\n\n${emote_ja} 0: Ingen\n\n${emote_kanske} 0: Ingen\n\n-# ${signupData.id}`;

		// Create the thread
		const thread = await channel.threads.create({
			name: threadTitle,
			message: {
				content: threadContent
			},
			autoArchiveDuration: 10080  // Archive after 1 week
		});

		// Set permission to allow everyone to pin messages in the thread
		// PIN_MESSAGES permission (1 << 51) is required starting February 2026
		try {
			const guild = thread.guild;
			const everyoneRole = guild.roles.everyone;
			// Use PinMessages if available, otherwise use the numeric value (1 << 51 = 2251799813685248)
			const pinMessagesPermission = PermissionFlagsBits.PinMessages ?? 2251799813685248n;
			await thread.permissionOverwrites.edit(everyoneRole.id, {
				allow: [pinMessagesPermission]
			});
		} catch (permError) {
			logActivity(`Warning: Could not set pin messages permission in thread for '${signupData.name}' (Thread ID: ${thread.id}): ${permError.message}`);
		}

		// Post "## ℹ️ Information" message and pin it
		// Note: Bot needs PIN_MESSAGES permission (required starting February 2026)
		try {
			// Verify bot has permission to pin messages
			const botMember = await thread.guild.members.fetch(client.user.id);
			const hasPinPermission = thread.permissionsFor(botMember).has(PermissionFlagsBits.PinMessages ?? 2251799813685248n);
			if (!hasPinPermission) {
				logActivity(`Warning: Bot does not have PIN_MESSAGES permission in thread for '${signupData.name}' (Thread ID: ${thread.id}). Pinning will fail after February 2026.`);
			}

			// Post the "## ℹ️ Information" message (this will always be the second message)
			const informationMessage = await thread.send("## ℹ️ Information");

			// Pin the information message
			await informationMessage.pin();
		} catch (pinError) {
			// Check if it's a permission error related to PIN_MESSAGES
			if (pinError.code === 50013 || pinError.message.includes('permission') || pinError.message.includes('PIN_MESSAGES')) {
				logActivity(`Warning: Could not pin information message in thread for '${signupData.name}' (Thread ID: ${thread.id}). Bot may need PIN_MESSAGES permission (required starting February 2026): ${pinError.message}`);
			} else {
				logActivity(`Warning: Could not pin information message in thread for '${signupData.name}' (Thread ID: ${thread.id}): ${pinError.message}`);
			}
		}

		logActivity(`Created discussion thread for event: '${signupData.name}' (Thread ID: ${thread.id})`);
	} catch (error) {
		logActivity(`Error creating event thread for '${signupData.name}' (Thread ID: ${thread.id}): ${error.message}`);
	}
}

async function findEventThread(eventId) {
	try {
		const spelningarChannel = client.channels.cache.get(ch_Spelningar);
		if (!spelningarChannel) {
			logActivity(`Error: Could not find spelningar channel with ID ${ch_Spelningar}`);
			return null;
		}

		const checkThread = async (thread) => {
			try {
				// Checkmark filter removed - event ID matching works regardless of thread title

				let starterMessage = null;

				// Try the modern, explicit method first.
				try {
					starterMessage = await thread.fetchStarterMessage();
				} catch (err) {
					logActivity(`fetchStarterMessage failed for thread ${thread.id}. It might be an older thread. Falling back.`);
					// Fallback for older threads or API versions: the starter message ID is the thread ID.
					try {
						starterMessage = await thread.messages.fetch(thread.id);
					} catch (fallbackErr) {
						logActivity(`Fallback message fetch failed for thread ${thread.id}. Cannot check this thread.`);
						return null;
					}
				}

				if (!starterMessage || starterMessage.author.id !== client.user.id) {
					return null;
                }

				const eventIdMatch = starterMessage.content.match(/-#\s*(\d+)\s*$/m);
				if (eventIdMatch && eventIdMatch[1] === eventId) {
					return thread;
				}

			} catch (threadError) {
				logActivity(`An unexpected error occurred while checking thread ${thread.id}: ${threadError.message}`);
			}
			return null;
		};

		const searchThreadCollection = async (collection) => {
			for (const thread of collection.values()) {
				const found = await checkThread(thread);
				if (found) return found;
			}
			return null;
		};

		// 1. Check active threads
		const active = await spelningarChannel.threads.fetchActive();
		let foundThread = await searchThreadCollection(active.threads);
		if (foundThread) return foundThread;

		// 2. Check archived threads with pagination to ensure all are checked
		let lastThreadId = null;
		let hasMore = true;
		while (hasMore) {
			const options = { limit: 100 };
			if (lastThreadId) options.before = lastThreadId;

			const archived = await spelningarChannel.threads.fetchArchived(options);
			foundThread = await searchThreadCollection(archived.threads);
			if (foundThread) return foundThread;

			if (archived.threads.size > 0) {
				lastThreadId = archived.threads.lastKey();
			}
			hasMore = archived.hasMore || false;
		}

		return null; // Not found

	} catch (error) {
		logActivity(`Error in findEventThread for event ID ${eventId}: ${error.message}`);
		return null;
	}
}

// Helper function to update information message in thread
async function updateInformationMessage(thread, text) {
	try {
		// Fetch the message immediately after the starter (info message is always 2nd).
		// Using `after: thread.id` avoids relying on `limit: 20` most-recent fetch,
		// which would miss the info message in long threads.
		const messages = await thread.messages.fetch({ after: thread.id, limit: 1 });
		if (messages.size === 0) return null;

		const informationMessage = messages.first();
		const isInformationMessage =
			informationMessage.content.startsWith('## ℹ️ Information') ||
			informationMessage.content.startsWith('Information:');
		if (isInformationMessage) {
			const newContent = text ? `## ℹ️ Information\n${text}` : '## ℹ️ Information';
			await informationMessage.edit(newContent);
			return informationMessage.id;
		}
		return null;
	} catch (error) {
		logActivity(`Error updating information message: ${error.message}`);
		return null;
	}
}

// Helper function to get participant user IDs from event signups
function getParticipantUserIds(eventData) {
	const userIds = new Set();
	if (eventData.signups) {
		for (const instrument in eventData.signups) {
			for (const signup of eventData.signups[instrument]) {
				if (signup.response === 'ja' || signup.response === 'kanske') {
					if (signup.id) {
						userIds.add(signup.id);
					}
				}
			}
		}
	}
	return Array.from(userIds);
}

module.exports = { eventThreadUpdate, eventThread, findEventThread, updateInformationMessage, getParticipantUserIds };
