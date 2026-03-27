const { Events } = require('discord.js');
const logActivity = require('../core/logger');
const { cleanupOldLogs } = require('../core/logger');
const { cleanupOldUiMetricsLogs } = require('../core/uiMetricsLogger');
const { loadPermissions } = require('../services/permissions');
const { scheduleDailyTask, scheduleHourlyTask, scheduleTwiceDailyTask } = require('../services/scheduler');
const { cleanupLocks } = require('../services/lockUtils');
const { backupJsonFiles, cleanupOldBackups, checkAndProcessPassedEvents, checkEmptyDriveFolders } = require('../services/google/drive');
const { postFikaList } = require('../services/google/sheets');
const { checkRoles, postNyckelList } = require('../features/lists');
const { updateDetails } = require('../features/details');
const { postCalendar } = require('../features/calendar');
const { verktygSignup, updateSignupButtonMessage } = require('../features/signup');

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(readyClient) {
		loadPermissions();
		dailyTasks();
		scheduleDailyTask(3, 0, dailyTasks);
		// scheduleDailyTask(8, 0, remindUsers);
		remindUsers();
		scheduleHourlyTask(postFikaList);
		scheduleHourlyTask(checkAndProcessPassedEvents);
		scheduleTwiceDailyTask(3, 0, 15, 0, backupJsonFiles); // Backup at 3 AM and 3 PM
		scheduleDailyTask(9, 0, () => {
			// Only run on the 1st of each month
			if (new Date().getDate() === 1) checkEmptyDriveFolders();
		}); // Check for empty Drive folders on the 1st of each month at 9 AM
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

async function remindUsers() {
	/*
	const embed = {
		"title": "Tester",
		"description": "Här skrivs information till alla glada människor.",
		"color": 7419530,
		"footer": {
			"text": "har svarat ja  -  ID: 4255523",
			"iconURL": "https://ollelindberg.se/kiribot/replycount/0.webp"
		},
		"fields": [
			{
			"name": "Plats",
			"value": "I rymden",
			"inline": true
			},
			{
			"name": "Datum",
			"value": "13/5",
			"inline": true
			}
		]
	};
	await client.channels.cache.get(ch_BotTest).send({
		content: `till aktiva`,
		embeds: [embed]
	});
	*/

	// await client.channels.cache.get(ch_BotTest).send({
	// 	content: `## Test\nHär står något kul!\n-# Meddelande skickat till BotTest av __Olle L__\n-# <@${"602246889727066182"}>\n-# Tagga fler personer om du vill lägga till dem i konversationen.`
	// });
}
