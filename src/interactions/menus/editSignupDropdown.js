const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const client = require('../../core/client');
const logActivity = require('../../core/logger');
const { ch_Signup, dir_EventsActive } = require('../../core/constants');

module.exports = {
    matches(customId) {
        return customId === 'editSignupDropdown';
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

            const signupChannel = client.channels.cache.get(ch_Signup);
            if (!signupChannel) {
                await interaction.reply({
                    content: 'Kunde inte hitta signup-kanalen.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            let targetMessage;
            try {
                targetMessage = await signupChannel.messages.fetch(data.link);
            } catch (error) {
                await interaction.reply({
                    content: 'Kunde inte hitta meddelandet för denna spelning. Det kanske har tagits bort.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const embed = targetMessage.embeds[0];
            if (!embed) {
                await interaction.reply({
                    content: 'Kunde inte hitta eventdetaljer för denna spelning.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

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

            await interaction.reply({
                content: "Ändra signupen: **" + embed.title.replace(/~~/g, '').replaceAll('[AVBÖJD] ', '') + "**",
                components: [row_buttons],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            logActivity(`Error in editSignupDropdown handler: ${error}`);
            await interaction.reply({
                content: 'Ett fel uppstod när spelningen skulle hämtas.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
