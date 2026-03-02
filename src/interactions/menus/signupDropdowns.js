const { MessageFlags } = require('discord.js');
const logActivity = require('../../core/logger');
const { listaSvar, listaInstrument, listaDetaljer } = require('../../features/signup');

module.exports = {
    matches(customId) {
        return customId.startsWith('signupDropdown_');
    },

    async execute(interaction) {
        try {
            switch (interaction.customId.split('_')[1]) {
                case "listaSvar": await listaSvar(interaction, interaction.values[0]); break;
                case "listaInstrument": await listaInstrument(interaction, interaction.values[0]); break;
                case "listaKost": await listaDetaljer(interaction, interaction.values[0], "kost"); break;
                case "listaKorkort": await listaDetaljer(interaction, interaction.values[0], "korkort"); break;
                case "listaBil": await listaDetaljer(interaction, interaction.values[0], "bil"); break;
                default: throw new Error("Could not find a matching ID");
            }

            await interaction.message.edit({
                components: interaction.message.components
            });

        } catch (error) {
            logActivity('Error handling event selection:', error);
            await interaction.reply({
                content: 'Ett fel uppstod vid hämtning av spelningen', flags: MessageFlags.Ephemeral
            });
        }
    }
};
