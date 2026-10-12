const fs = require('fs');
const path = require('path');
const { Events } = require('discord.js');
const logActivity = require('../core/logger');
const { cleanupOldLogs } = require('../core/logger');
const { cleanupOldUiMetricsLogs } = require('../core/uiMetricsLogger');
const { ch_LineupVoice, guildId } = require('../core/constants');
const { loadPermissions } = require('../services/permissions');
const { scheduleDailyTask, scheduleHourlyTask, scheduleTwiceDailyTask } = require('../services/scheduler');
const { cleanupLocks } = require('../services/lockUtils');
const { backupJsonFiles, cleanupOldBackups, checkAndProcessPassedEvents, checkEmptyDriveFolders } = require('../services/google/drive');
const { postFikaList, syncAktivMembersToSheet, sendFikaReminder } = require('../services/google/sheets');
const { checkRoles, postNyckelList } = require('../features/lists');
const { updateDetails } = require('../features/details');
const { postCalendar } = require('../features/calendar');
const { verktygSignup, updateSignupButtonMessage } = require('../features/signup');
const { postYourProfile } = require('../features/profile');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(readyClient) {
		loadPermissions();
		try {
			const guild = readyClient.guilds.cache.get(guildId);
			if (guild) {
				const members = await guild.members.fetch();
				for (const m of members.values()) {
					if (m.voice?.serverMute && m.voice.channelId !== ch_LineupVoice) {
						await m.voice.setMute(false, 'lineup-activity startup sweep').catch(() => {});
					}
				}
			}
		} catch (err) {
			console.error('ready: lineup unmute sweep failed', err);
		}
		dailyTasks().catch(err => logActivity(`Error in dailyTasks (startup): ${err.message}`));
		scheduleDailyTask(3, 0, dailyTasks);
		oneTimeFunction().catch(err => logActivity(`Error in oneTimeFunction: ${err.message}`));
		scheduleHourlyTask(postFikaList);
		scheduleDailyTask(8, 0, sendFikaReminder);
		scheduleHourlyTask(checkAndProcessPassedEvents);
		scheduleTwiceDailyTask(3, 0, 15, 0, backupJsonFiles); // Backup at 3 AM and 3 PM
		scheduleDailyTask(9, 0, () => {
			// Only run on the 1st of each month
			if (new Date().getDate() === 1) checkEmptyDriveFolders();
		}); // Check for empty Drive folders on the 1st of each month at 9 AM
		setTimeout(() => syncAktivMembersToSheet(), 60 * 1000);
		logActivity(`Ready! Logged in as ${readyClient.user.tag}`);
		// testFunction: delay updateSignupButtonMessage by 5 seconds on startup
		setTimeout(() => {
			updateSignupButtonMessage();
		}, 5000);
	},
};

async function dailyTasks() {
	await checkRoles();
	postCalendar(true);
	// Schedule updateDetails to run 1 minute after checkRoles completes to avoid rate limits
	// checkRoles does 2 fetches (with 1 min delay between them), so we wait 1 more minute before updateDetails
	setTimeout(() => {
		updateDetails().catch(err => logActivity(`Error in updateDetails (from dailyTasks): ${err.message}`));
	}, 60 * 1000); // 1 minute delay after checkRoles completes
	cleanupLocks();
	cleanupOldLogs();
	cleanupOldUiMetricsLogs();
	verktygSignup();
	cleanupOldBackups();
	postNyckelList(true);
}

// Runs the task below once, then flags it done in oneTimeFunctionState.json.
// Reuse: swap the task body, set "executed" back to false, restart the bot.
const oneTimeStatePath = path.join(__dirname, 'oneTimeFunctionState.json');

async function oneTimeFunction() {
	const state = JSON.parse(fs.readFileSync(oneTimeStatePath, 'utf8'));
	if (state.executed) return;

	// --- one-time task ---
	await postYourProfile(); // edits the panel message in #din-profil (adds Kontaktuppgifter button)
	// ---------------------

	state.executed = true;
	fs.writeFileSync(oneTimeStatePath, JSON.stringify(state, null, 4));
	logActivity('oneTimeFunction executed');
}
