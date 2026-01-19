const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');
const { token, guildId, clientId } = require('../config.json');

const commands = [
	{
		name: 'info',
		description: 'Lägg till eller ändra viktig information'
	}
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
	try {
		console.log('Started refreshing application (/) commands.');

		// Register commands for a specific guild (faster for testing)
		await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands }
		);

		console.log('Successfully registered application (/) commands.');
	} catch (error) {
		console.error('Error registering commands:', error);
	}
})();

