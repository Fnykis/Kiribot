const { Events } = require('discord.js');
const { ch_Signup, ch_Allmant } = require('../core/constants');

module.exports = {
	name: Events.MessageCreate,
	once: false,
	async execute(message) {

		if (message.author.bot) return;

		const restrictedChannelId = ch_Signup;
		const targetChannelId = ch_Allmant;

		// Check if the message is in the restricted channel
		if (message.channel.id === restrictedChannelId) {
			try {
				// Save the original content before deleting the message
				const originalContent = message.content;

				// Delete the message
				await message.delete();

				// Send an ephemeral-like reply (via DM since ephemeral is only for interactions)
				await message.author.send({
					content: `Det är inte tillåtet att skicka meddelanden i <#${restrictedChannelId}>.\n` +
					         `Använd <#${targetChannelId}> för frågor om spelningar.\n\n` +
					         `Här är ditt ursprungliga meddelande för enkel kopiering:\n\n`
				});
				await message.author.send({
					content: `${originalContent}`
				});

			} catch (error) {
				console.error('Failed to delete message or send DM:', error);
			}
		}

	},
};
