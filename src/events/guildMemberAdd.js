const { Events } = require('discord.js');
const logActivity = require('../core/logger');
const { updateDetails } = require('../features/details');
const { verktygSignup } = require('../features/signup');

module.exports = {
	name: Events.GuildMemberAdd,
	once: false,
	execute(member) {
		logActivity(member + " joined the Discord!");
		updateDetails().catch(err => logActivity(`Error in updateDetails (from guildMemberAdd): ${err.message}`));
		verktygSignup();
	},
};
