const fs = require('fs');
const path = require('path');
const discord = require('discord.js');
const logActivity = require('../core/logger');

const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = discord;
const oneTimeFunctionPath = path.join(__dirname, '..', 'one-time', 'oneTimeFunction.js');

function loadOneTimeFunction() {
	if (!fs.existsSync(oneTimeFunctionPath)) {
		return {
			error: 'Hittade inte src/one-time/oneTimeFunction.js. Kopiera från oneTimeFunction.example.js och försök igen.'
		};
	}

	try {
		delete require.cache[require.resolve(oneTimeFunctionPath)];
		const oneTimeFunction = require(oneTimeFunctionPath);

		if (typeof oneTimeFunction !== 'function') {
			return { error: 'oneTimeFunction.js måste exportera exakt en funktion via module.exports = async (...) => { ... }.' };
		}

		return { oneTimeFunction };
	} catch (error) {
		return { error: `Kunde inte läsa oneTimeFunction.js: ${error.message}` };
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('one-time')
		.setDescription('Kör en tillfällig engångsfunktion från lokal fil')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

	async execute(interaction) {
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
			await interaction.reply({
				content: 'Du behöver admin-rättigheter för att köra det här kommandot.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const { oneTimeFunction, error } = loadOneTimeFunction();
		if (error) {
			await interaction.editReply(error);
			return;
		}

		try {
			const result = await oneTimeFunction({
				interaction,
				client: interaction.client,
				discord
			});

			const suffix = typeof result === 'string' && result.trim().length > 0
				? `\n${result}`
				: '';

			await interaction.editReply(`Körde engångsfunktionen.${suffix}`);
		} catch (err) {
			logActivity(`Error executing one-time function: ${err.message}`);
			await interaction.editReply(`Fel när engångsfunktionen kördes: ${err.message}`);
		}
	}
};
