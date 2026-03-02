const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const logActivity = require('../../core/logger');
const { postNyckelList } = require('../../features/lists');

module.exports = {
    matches(customId) {
        return (
            customId === 'nyckel' ||
            customId === 'nyckel_ja' ||
            customId === 'nyckel_nej'
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        // nyckel button
        if (customId === 'nyckel') {
            const detailsFilePath = 'src/data/detailsList.json';
            let detailsData;
            let userNyckelStatus = 'Nej';

            try {
                if (fs.existsSync(detailsFilePath)) {
                    detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
                    const userDetails = [...detailsData.aktiv, ...detailsData.inaktiv].find(user => user.id === interaction.user.id);
                    if (userDetails && userDetails.nyckel) {
                        userNyckelStatus = userDetails.nyckel;
                    }
                }

                const btn_ja = new ButtonBuilder()
                    .setCustomId('nyckel_ja')
                    .setLabel('Ja')
                    .setStyle(userNyckelStatus === 'Ja' ? ButtonStyle.Primary : ButtonStyle.Secondary);

                const btn_nej = new ButtonBuilder()
                    .setCustomId('nyckel_nej')
                    .setLabel('Nej')
                    .setStyle(userNyckelStatus === 'Nej' ? ButtonStyle.Primary : ButtonStyle.Secondary);

                const row = new ActionRowBuilder().addComponents(btn_ja, btn_nej);

                await interaction.reply({
                    content: 'Har du en nyckel till replokalen?',
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });

            } catch (error) {
                logActivity('Error handling "nyckel" interaction:', error);
                await interaction.reply({
                    content: 'Ett fel uppstod när din nyckelstatus skulle hämtas.',
                    flags: MessageFlags.Ephemeral
                });
            }
            return;
        }

        // nyckel_ja and nyckel_nej buttons
        if (customId === 'nyckel_ja' || customId === 'nyckel_nej') {
            const detailsFilePath = 'src/data/detailsList.json';
            const newStatus = customId === 'nyckel_ja' ? 'Ja' : 'Nej';

            try {
                let detailsData = { aktiv: [], inaktiv: [] };
                if (fs.existsSync(detailsFilePath)) {
                    detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
                }

                let userFound = false;
                ['aktiv', 'inaktiv'].forEach(status => {
                    const userIndex = detailsData[status].findIndex(user => user.id === interaction.user.id);
                    if (userIndex !== -1) {
                        detailsData[status][userIndex].nyckel = newStatus;
                        userFound = true;
                    }
                });

                if (!userFound) {
                    const member = await interaction.guild.members.fetch(interaction.user.id);
                    const isActive = member.roles.cache.some(role => role.name === 'aktiv');
                    const newUser = {
                        id: interaction.user.id,
                        namn: member.displayName,
                        kost: "-",
                        korkort: "-",
                        bil: "-",
                        nyckel: newStatus
                    };
                    if (isActive) {
                        detailsData.aktiv.push(newUser);
                    } else {
                        detailsData.inaktiv.push(newUser);
                    }
                }

                fs.writeFileSync(detailsFilePath, JSON.stringify(detailsData, null, 2));

                postNyckelList(true);

                const btn_ja = new ButtonBuilder()
                    .setCustomId('nyckel_ja')
                    .setLabel('Ja')
                    .setStyle(newStatus === 'Ja' ? ButtonStyle.Primary : ButtonStyle.Secondary);

                const btn_nej = new ButtonBuilder()
                    .setCustomId('nyckel_nej')
                    .setLabel('Nej')
                    .setStyle(newStatus === 'Nej' ? ButtonStyle.Primary : ButtonStyle.Secondary);

                const row = new ActionRowBuilder().addComponents(btn_ja, btn_nej);

                await interaction.update({
                    content: 'Din nyckelstatus har uppdaterats.',
                    components: [row]
                });

            } catch (error) {
                logActivity(`Error updating nyckel status for ${interaction.user.id}:`, error);
                await interaction.followUp({
                    content: 'Ett fel uppstod när din nyckelstatus skulle uppdateras.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};
