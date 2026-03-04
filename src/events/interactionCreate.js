const { Events } = require('discord.js');
const logActivity = require('../core/logger');
const logUiInteraction = require('../core/uiMetricsLogger');

// Button handlers
const profileButtons = require('../interactions/buttons/profile');
const contactButtons = require('../interactions/buttons/contact');
const signupButtons = require('../interactions/buttons/signup');
const moderatorButtons = require('../interactions/buttons/moderator');
const nyckelButtons = require('../interactions/buttons/nyckel');
const infoButtons = require('../interactions/buttons/info');
const miscButtons = require('../interactions/buttons/misc');
const showSignupsButtons = require('../interactions/buttons/showsignups');

// Modal handlers
const profileModals = require('../interactions/modals/profile');
const workgroupModals = require('../interactions/modals/workgroups');
const signupModals = require('../interactions/modals/signup');
const infoModals = require('../interactions/modals/info');

// Select menu handlers
const signupDropdowns = require('../interactions/menus/signupDropdowns');
const editSignupDropdown = require('../interactions/menus/editSignupDropdown');
const reminderDropdown = require('../interactions/menus/reminderDropdown');

// Commands
const infoCommand = require('../commands/info');
const executeOneTimeFunctionCommand = require('../commands/executeOneTimeFunction');

// Context menu command (handled in signupButtons)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
	name: Events.InteractionCreate,
	once: false,
	async execute(interaction) {
		try {
			if (interaction.isChatInputCommand()) {
				if (interaction.commandName === 'info') {
					await infoCommand.execute(interaction);
				} else if (interaction.commandName === 'one-time') {
					await executeOneTimeFunctionCommand.execute(interaction);
				}

			} else if (interaction.isContextMenuCommand()) {
				if (interaction.commandName === 'Ändra signup') {
					await handleChangeSignup(interaction);
				}

			} else if (interaction.isButton()) {
				logUiInteraction(interaction);
				const customId = interaction.customId;
				if (profileButtons.matches(customId)) await profileButtons.execute(interaction);
				else if (signupButtons.matches(customId)) await signupButtons.execute(interaction);
				else if (showSignupsButtons.matches(customId)) await showSignupsButtons.execute(interaction);
				else if (contactButtons.matches(customId)) await contactButtons.execute(interaction);
				else if (moderatorButtons.matches(customId)) await moderatorButtons.execute(interaction);
				else if (nyckelButtons.matches(customId)) await nyckelButtons.execute(interaction);
				else if (infoButtons.matches(customId)) await infoButtons.execute(interaction);
				else if (miscButtons.matches(customId)) await miscButtons.execute(interaction);

			} else if (interaction.isModalSubmit()) {
				const customId = interaction.customId;
				if (profileModals.matches(customId)) await profileModals.execute(interaction);
				else if (workgroupModals.matches(customId)) await workgroupModals.execute(interaction);
				else if (signupModals.matches(customId)) await signupModals.execute(interaction);
				else if (infoModals.matches(customId)) await infoModals.execute(interaction);

			} else if (interaction.isStringSelectMenu()) {
				logUiInteraction(interaction);
				const customId = interaction.customId;
				if (signupDropdowns.matches(customId)) await signupDropdowns.execute(interaction);
				else if (editSignupDropdown.matches(customId)) await editSignupDropdown.execute(interaction);
				else if (reminderDropdown.matches(customId)) await reminderDropdown.execute(interaction);
			}

		} catch (error) {
			logActivity('Unhandled error in interactionCreate:', error);
		}
	},
};

async function handleChangeSignup(interaction) {
	let targetMessage = await interaction.channel.messages.fetch(interaction.targetId);
	let embed = targetMessage.embeds[0];

	if (!targetMessage.components ||
		targetMessage.components.length == 0 ||
		!targetMessage.components[0].components ||
		targetMessage.components[0].components.length == 0
	) {
		await interaction.reply({ content: "Det här kommandot fungerar bara på aktiva signups.", flags: MessageFlags.Ephemeral });
		return;
	}

	let buttons = targetMessage.components[0].components;

	// Check if it's a valid "signup" message
	let validButtons = buttons.filter(button => ['ja', 'nej', 'kanske'].includes(button.customId));
	if (validButtons.length !== 3) {
		await interaction.reply({ content: "Det här kommandot fungerar bara på aktiva signups.", flags: MessageFlags.Ephemeral });
		return;
	}

	// Create new buttons
	const btn_redigera = new ButtonBuilder()
		.setCustomId('redigera_' + targetMessage.id)
		.setLabel('Redigera')
		.setStyle(ButtonStyle.Primary);

	const btn_avboj = new ButtonBuilder()
		.setCustomId(embed.title.includes('~~') ? 'oppna_' + targetMessage.id : 'avboj_' + targetMessage.id)
		.setLabel(embed.title.includes('~~') ? 'Öppna' : 'Avböj')
		.setStyle(ButtonStyle.Primary);

	const btn_tabort = new ButtonBuilder()
		.setCustomId('tabort_' + targetMessage.id)
		.setLabel('Ta bort')
		.setStyle(ButtonStyle.Danger);

	const row_buttons = new ActionRowBuilder()
		.addComponents(btn_redigera, btn_avboj, btn_tabort);

	await interaction.reply({ content: "Ändra signupen: **" + embed.title.replace(/~~/g, '').replaceAll('[AVBÖJD] ', '') + "**", components: [row_buttons], flags: MessageFlags.Ephemeral });
}
