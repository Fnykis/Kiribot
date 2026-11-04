const { Events } = require('discord.js');
const { guildId, hex_instr } = require('../core/constants');
const logActivity = require('../core/logger');
const { isSectionRename, renameSectionInFiles } = require('../services/sectionRename');

// Same cached object the API validates against in core/express.js.
let instrumentList;
try { instrumentList = require('../data/instrumentList.json'); } catch { instrumentList = {}; }

module.exports = {
	name: Events.GuildRoleUpdate,
	async execute(oldRole, newRole) {
		if (!isSectionRename(oldRole, newRole, { guildId, sectionColor: hex_instr })) return;

		try {
			await renameSectionInFiles({ oldName: oldRole.name, newName: newRole.name, instrumentList });
		} catch (err) {
			logActivity(`Error in roleUpdate: ${err.code || err.name}`);
		}
	},
};
