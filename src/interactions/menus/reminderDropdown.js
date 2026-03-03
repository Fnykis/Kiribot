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
        const sendEphemeral = async (payload) => {
            const response = typeof payload === 'string'
                ? { content: payload, flags: MessageFlags.Ephemeral }
                : { ...payload, flags: MessageFlags.Ephemeral };

            if (interaction.replied || interaction.deferred) {
                return interaction.followUp(response);
            }
            return interaction.reply(response);
        };

        try {
            const selectedEventId = interaction.values[0];
            if (!selectedEventId) {
                await sendEphemeral('Kunde inte läsa valt event. Försök igen.');
                return;
            }

            const files = fs.readdirSync(dir_EventsActive);
            const fileName = files.find(file => file.endsWith('_' + selectedEventId + '.json'));

            if (!fileName) {
                await sendEphemeral('Kunde inte hitta spelningen. Den kanske har tagits bort.');
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

            await sendEphemeral({
                content: `Detta kommer skicka ett meddelande till alla aktiva medlemmar som __inte__ svarat på spelningen **${data.name}** med en påminnelse om att svara på signupen.${warningText}`,
                components: [row_buttons],
            });

        } catch (error) {
            logActivity(`Error in reminderDropdown handler: ${error}`);
            await sendEphemeral('Ett fel uppstod när spelningen skulle hämtas.');
        }
    }
};
