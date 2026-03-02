const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const client = require('../core/client');
const { ch_ModeratorVerktyg } = require('../core/constants');

async function postModeratorTools() {

	const btn_openModeratorTools = new ButtonBuilder()
		.setCustomId('openModeratorTools')
		.setLabel('Öppna moderatorverktyg')
		.setStyle(ButtonStyle.Secondary);

	const row_buttons = new ActionRowBuilder()
		.addComponents(btn_openModeratorTools);

	client.channels.cache.get(ch_ModeratorVerktyg).send({
		components: [row_buttons],
	});
}

module.exports = { postModeratorTools };
