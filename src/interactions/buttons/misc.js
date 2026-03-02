const { MessageFlags } = require('discord.js');
const logActivity = require('../../core/logger');
const { getNickname } = require('../../utils/interactionUtils');
const { getCleaningInstructions, getFikaInstructions } = require('../../services/google/sheets');

module.exports = {
    matches(customId) {
        return (
            customId === 'cleaning_instructions' ||
            customId === 'fika_instructions'
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        // cleaning_instructions button
        if (customId === 'cleaning_instructions') {
            try {
                const cleaningInstructions = await getCleaningInstructions();
                await interaction.reply({ content: cleaningInstructions, flags: MessageFlags.Ephemeral });
            } catch (error) {
                await interaction.reply({ content: 'Kunde inte hämta städinstruktioner.', flags: MessageFlags.Ephemeral });
                logActivity(`Error handling cleaning instructions request by ${getNickname(interaction)}: ${error.message}`);
            }
            return;
        }

        // fika_instructions button
        if (customId === 'fika_instructions') {
            try {
                const fikaInstructions = await getFikaInstructions();
                await interaction.reply({ content: fikaInstructions, flags: MessageFlags.Ephemeral });
            } catch (error) {
                await interaction.reply({ content: 'Kunde inte hämta fikainstruktioner.', flags: MessageFlags.Ephemeral });
                logActivity(`Error handling fika instructions request by ${getNickname(interaction)}: ${error.message}`);
            }
        }
    }
};
