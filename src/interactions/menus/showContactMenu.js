const { MessageFlags } = require('discord.js');
const fs = require('fs');
const logActivity = require('../../core/logger');
const { getNickname, getMemberNickname } = require('../../utils/interactionUtils');

module.exports = {
    matches(customId) {
        return customId === 'visakontakt_select';
    },

    async execute(interaction) {
        const selectedId = interaction.values[0];
        const selectedMember = interaction.members?.get(selectedId);
        const name = selectedMember ? getMemberNickname(selectedMember) : 'Medlemmen';

        const detailsFilePath = 'src/data/detailsList.json';
        if (!fs.existsSync(detailsFilePath)) {
            await interaction.reply({ content: 'Efterfrågan misslyckades.', flags: MessageFlags.Ephemeral });
            logActivity(`${getNickname(interaction)} failed to look up contact info - file not found`);
            return;
        }

        const detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
        const user = [...detailsData.aktiv, ...detailsData.inaktiv].find(u => u.id === selectedId);
        const mail = user?.mail && user.mail !== '-' ? user.mail : 'Inte angivet';
        const mobil = user?.mobil && user.mobil !== '-' ? user.mobil : 'Inte angivet';

        await interaction.reply({
            content: `## ${name}\n**Mail:** ${mail}\n**Mobil:** ${mobil}`,
            flags: MessageFlags.Ephemeral
        });
        logActivity(`${getNickname(interaction)} looked up contact info for ${name}`);
    }
};
