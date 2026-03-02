const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logActivity = require('../../core/logger');
const { dir_EventsActive } = require('../../core/constants');

module.exports = {
    matches(customId) {
        return customId === 'reminderDropdown';
    },

    async execute(interaction) {
        try {
            const selectedEventId = interaction.values[0];

            const files = fs.readdirSync(dir_EventsActive);
            const fileName = files.find(file => file.endsWith('_' + selectedEventId + '.json'));

            if (!fileName) {
                await interaction.reply({
                    content: 'Kunde inte hitta spelningen. Den kanske har tagits bort.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));

            const reminderAlreadySent = data.hasOwnProperty('remindersSent') && data.remindersSent === true;
            const warningText = reminderAlreadySent ? '\n\n⚠️ **En påminnelse har tidigare redan skickats för denna spelning.**\n\n' : '';

            const btn_sendReminder = new ButtonBuilder()
                .setCustomId('sendReminder_' + selectedEventId)
                .setLabel('Skicka påminnelse')
                .setStyle(ButtonStyle.Primary);

            const row_buttons = new ActionRowBuilder()
                .addComponents(btn_sendReminder);

            await interaction.reply({
                content: `Detta kommer skicka ett meddelande till alla aktiva medlemmar som __inte__ svarat på spelningen **${data.name}** med en påminnelse om att svara på signupen.${warningText}`,
                components: [row_buttons],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logActivity(`Error in reminderDropdown handler: ${error}`);
            await interaction.reply({
                content: 'Ett fel uppstod när spelningen skulle hämtas.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
