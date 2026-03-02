const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const client = require('../core/client');
const logActivity = require('../core/logger');
const { getEventJSON } = require('../features/signup');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('info')
		.setDescription('Lägg till eller ändra viktig information'),

	async execute(interaction) {
		try {
			// Check if command was used in a thread
			if (!interaction.channel.isThread()) {
				await interaction.reply({
					content: 'Det här kommandot kan bara användas i en tråd för spelningar.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			const thread = interaction.channel;

			// Get the starter message to extract event ID
			let starterMessage = null;
			try {
				starterMessage = await thread.fetchStarterMessage();
			} catch (err) {
				// Fallback for older threads
				try {
					starterMessage = await thread.messages.fetch(thread.id);
				} catch (fallbackErr) {
					await interaction.reply({
						content: 'Kunde inte hitta event-ID i tråden.',
						flags: MessageFlags.Ephemeral
					});
					return;
				}
			}

			if (!starterMessage || starterMessage.author.id !== client.user.id) {
				await interaction.reply({
					content: 'Det här kommandot kan bara användas i en tråd för spelningar.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			// Extract event ID from the starter message
			const eventIdMatch = starterMessage.content.match(/-#\s*(\d+)\s*$/m);
			if (!eventIdMatch) {
				await interaction.reply({
					content: 'Kunde inte hitta event-ID i tråden.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			const eventId = eventIdMatch[1];

			// Load event JSON from active directory only
			const eventData = getEventJSON(eventId);
			if (!eventData) {
				await interaction.reply({
					content: 'Detta event har passerat.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			// Check if information field exists
			if (!eventData.information) {
				await interaction.reply({
					content: 'Detta event har inget informationsmeddelande.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			// Create buttons
			const btn_add = new ButtonBuilder()
				.setCustomId(`info_add_${eventId}`)
				.setLabel('Lägg till info')
				.setStyle(ButtonStyle.Primary);

			const btn_edit = new ButtonBuilder()
				.setCustomId(`info_edit_${eventId}`)
				.setLabel('Ändra info')
				.setStyle(ButtonStyle.Secondary);

			const row = new ActionRowBuilder()
				.addComponents(btn_add, btn_edit);

			await interaction.reply({
				content: 'Denna funktion är för att lägga till *information* om spelningen så att medlemmar lätt kan hitta vad som gäller.Detta hamnar högst upp i tråden.\n\nSkriv gärna ditt namn eller din arbetsgrupp innan ditt meddelande.\nExempel: *"Stars: Vi kommer ha massa guld!"*, *"Olle: Jag har nyckel till rummet vi lämnar kläder i."*\n\nVälj vad du vill göra:',
				components: [row],
				flags: MessageFlags.Ephemeral
			});

		} catch (error) {
			logActivity(`Error handling /info command: ${error.message}`);
			await interaction.reply({
				content: 'Ett fel uppstod när kommandot kördes.',
				flags: MessageFlags.Ephemeral
			}).catch(() => {});
		}
	},
};
