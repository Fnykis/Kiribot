const { ButtonBuilder, ButtonStyle } = require('discord.js');

// Copy this file to oneTimeFunction.js and edit it.
// Run with: /one-time
module.exports = async function oneTimeFunction({ interaction }) {
	const channelId = 'REPLACE_CHANNEL_ID';
	const messageId = 'REPLACE_MESSAGE_ID';

	if (channelId.startsWith('REPLACE_') || messageId.startsWith('REPLACE_')) {
		return 'Sätt channelId och messageId i src/one-time/oneTimeFunction.js innan körning.';
	}

	const channel = await interaction.client.channels.fetch(channelId);
	if (!channel || !channel.isTextBased()) {
		throw new Error('Kanalen hittades inte eller stödjer inte textmeddelanden.');
	}

	const message = await channel.messages.fetch(messageId);
	if (message.author.id !== interaction.client.user.id) {
		throw new Error('Målsmeddelandet måste vara skickat av boten.');
	}

	const newButton = new ButtonBuilder()
		.setCustomId('example_new_button')
		.setLabel('Ny knapp')
		.setStyle(ButtonStyle.Primary);

	const updatedComponents = message.components.map(row => ({
		type: row.type,
		components: row.components.map(component => component.toJSON())
	}));

	if (updatedComponents.length === 0) {
		updatedComponents.push({
			type: 1,
			components: [newButton.toJSON()]
		});
	} else if (updatedComponents[0].components.length < 5) {
		updatedComponents[0].components.push(newButton.toJSON());
	} else {
		throw new Error('Första knappraden har redan 5 komponenter.');
	}

	await message.edit({ components: updatedComponents });
	return `Uppdaterade meddelandet ${message.id} i kanal ${channel.id}.`;
};
