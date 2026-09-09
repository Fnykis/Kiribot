const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const client = require('../core/client');
const logActivity = require('../core/logger');
const { ch_YourProfile, cat_Sektioner, cat_Arbetsgrupper } = require('../core/constants');
const { formatChannelName } = require('../utils/stringUtils');
const { getNickname } = require('../utils/interactionUtils');

async function sendInstrumentNotification(role, interaction, action) {
	try {
		// Find the instrument channel in the sektioner category
		const guild = interaction.member.guild;
		const roleNameLower = role.name.toLowerCase();
		const category = guild.channels.cache.get(cat_Sektioner);
		if (!category || category.type !== ChannelType.GuildCategory) {
			logActivity(`Instrument category not found. Category ID: ${cat_Sektioner}, Instrument: ${roleNameLower}`);
			return;
		}

		// Determine channel name based on special cases
		let channelName;
		if (roleNameLower === '1:a' || roleNameLower === '2:a') {
			channelName = 'puls';
		} else if (roleNameLower === '3:a' || roleNameLower === '4:a') {
			channelName = 'dubblar';
		} else {
			// Default: format channel name like Discord does (remove special characters)
			channelName = formatChannelName(roleNameLower);
		}

		const instrumentChannel = category.children.cache.find(channel =>
			channel.name === channelName && channel.type === ChannelType.GuildText
		);

		if (!instrumentChannel) {
			logActivity(`Instrument channel not found for role: ${roleNameLower} (looking for: ${channelName})`);
			return;
		}

		// Create the notification message
		let message;
		if (action === 'join') {
			// Tag the user when they join
			message = `<@${interaction.user.id}> har anslutit ${roleNameLower} ✨`;
		} else {
			// Just show username when they leave
			message = `${getNickname(interaction)} har lämnat ${roleNameLower} 🫡`;
		}

		// Send the notification
		await instrumentChannel.send(message);

	} catch (error) {
		logActivity(`Error sending instrument notification for ${roleNameLower}: ${error.message}`);
	}
}

// Helper function to send workgroup join/leave notifications
async function sendWorkgroupNotification(role, interaction, action) {
	try {
		// Find the workgroup channel in the arbetsgrupper category
		const guild = interaction.member.guild;
		const roleNameLower = role.name.toLowerCase();
		const category = guild.channels.cache.get(cat_Arbetsgrupper);
		if (!category || category.type !== ChannelType.GuildCategory) {
			logActivity(`Workgroup category not found. Category ID: ${cat_Arbetsgrupper}, Workgroup: ${roleNameLower}`);
			return;
		}

		// Format channel name like Discord does (remove special characters)
		const channelName = formatChannelName(roleNameLower);

		const workgroupChannel = category.children.cache.find(channel =>
			channel.name === channelName && channel.type === ChannelType.GuildText
		);

		if (!workgroupChannel) {
			logActivity(`Workgroup channel not found for role: ${roleNameLower} (looking for: ${channelName})`);
			return;
		}

		// Create the notification message
		let message;
		if (action === 'join') {
			// Tag the user when they join
			message = `<@${interaction.user.id}> har anslutit ${roleNameLower} ✨`;
		} else {
			// Just show username when they leave
			message = `${getNickname(interaction)} har lämnat ${roleNameLower} 🫡`;
		}

		// Send the notification
		await workgroupChannel.send(message);

	} catch (error) {
		logActivity(`Error sending workgroup notification for ${roleNameLower}: ${error.message}`);
	}
}

async function postYourProfile() {

	const btn_status = new ButtonBuilder()
		.setCustomId('status')
		.setLabel('Medlemstatus')
		.setStyle(ButtonStyle.Secondary);

	const btn_name = new ButtonBuilder()
		.setCustomId('namn')
		.setLabel('Namn')
		.setStyle(ButtonStyle.Secondary);

	const btn_inst = new ButtonBuilder()
		.setCustomId('instrument')
		.setLabel('Instrument')
		.setStyle(ButtonStyle.Secondary);

	const btn_work = new ButtonBuilder()
		.setCustomId('arbetsgrupp')
		.setLabel('Arbetsgrupp')
		.setStyle(ButtonStyle.Secondary);

	const btn_details = new ButtonBuilder()
		.setCustomId('detaljer')
		.setLabel('Detaljer')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(false);

	const btn_nyckel = new ButtonBuilder()
		.setCustomId('nyckel')
		.setLabel('Nyckel')
		.setStyle(ButtonStyle.Secondary);

	const btn_view = new ButtonBuilder()
		.setCustomId('visaprofil')
		.setLabel('👁 Visa din profil')
		.setStyle(ButtonStyle.Secondary);

	const row1_buttons = new ActionRowBuilder()
		.addComponents(btn_name, btn_status, btn_inst, btn_work);
	const row2_buttons = new ActionRowBuilder()
		.addComponents(btn_details, btn_nyckel);
	const row3_buttons = new ActionRowBuilder()
		.addComponents(btn_view);

	client.channels.cache.get(ch_YourProfile).messages.fetch({ limit: 1 }).then(messages => {
		let lastMessage = messages.first();

		lastMessage.edit({
			content: `Tryck på knapparna för att ändra i din profil`,
			components: [row1_buttons, row2_buttons, row3_buttons],
		});
	})
	/*
	client.channels.cache.get(ch_YourProfile).send({
		content: `Tryck på knapparna för att ändra i din profil`,
		components: [row1_buttons, row2_buttons],
	});
	*/

};

module.exports = { postYourProfile, sendInstrumentNotification, sendWorkgroupNotification };
