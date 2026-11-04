const { MessageFlags } = require('discord.js');
const fs = require('fs');
const logActivity = require('../../core/logger');
const store = require('../../state/store');
const { getNickname } = require('../../utils/interactionUtils');
const { updateDetails } = require('../../features/details');
const { verktygSignup } = require('../../features/signup');

module.exports = {
    matches(customId) {
        return (
            customId === 'modal_namn' ||
            customId === 'modal_detaljer' ||
            customId === 'modal_title'
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        // modal_namn
        if (customId === 'modal_namn') {
            let nickname = interaction.fields.getTextInputValue('nameInput');
            interaction.member.setNickname(nickname);
            await interaction.reply({ content: `Ditt visningsnamn är nu: **${nickname}** 🎉`, flags: MessageFlags.Ephemeral });

            logActivity(interaction.member.user.username + " changed their nickname to " + nickname);
            return;
        }

        // modal_title
        if (customId === 'modal_title') {
            let nickname = interaction.fields.getTextInputValue('nameInput');
            interaction.member.setNickname(nickname);
            await interaction.reply({ content: `Ditt visningsnamn är nu: **${nickname}** 🎉`, flags: MessageFlags.Ephemeral });

            logActivity(interaction.member.user.username + " changed their nickname to " + nickname);
            return;
        }

        // modal_detaljer
        if (customId === 'modal_detaljer') {
            try {
                const requiredFields = store.getRequiredFields();
                const fieldsForModal = requiredFields.filter(field => field !== 'nyckel');

                const keyFields = fieldsForModal.map(field => {
                    const sanitizedField = field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
                    return interaction.fields.getTextInputValue(sanitizedField);
                });
                const detailsFilePath = 'src/data/detailsList.json';
                let detailsData;
                if (fs.existsSync(detailsFilePath)) {
                    detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
                } else {
                    await interaction.reply({ content: `Efterfrågan misslyckades.`, flags: MessageFlags.Ephemeral });
                    logActivity(`${getNickname(interaction)} failed to update details - file not found`);
                    return;
                }

                const userId = interaction.member.user.id;
                let userFound = false;

                ['aktiv', 'inaktiv'].forEach(status => {
                    const userIndex = detailsData[status].findIndex(user => user.id === userId);
                    if (userIndex !== -1) {
                        userFound = true;
                        fieldsForModal.forEach((field, index) => {
                            const sanitizedField = field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
                            detailsData[status][userIndex][sanitizedField] = keyFields[index];
                        });
                    }
                });

                if (userFound) {
                    fs.writeFileSync(detailsFilePath, JSON.stringify(detailsData, null, 2));
                    updateDetails().catch(err => logActivity(`Error in updateDetails (from modal submit): ${err.message}`));
                    verktygSignup();
                    await interaction.reply({ content: `Du har uppdaterat dina detaljer!`, flags: MessageFlags.Ephemeral });
                    logActivity(`${getNickname(interaction)} updated their details`);
                } else {
                    updateDetails().catch(err => logActivity(`Error in updateDetails (from modal submit): ${err.message}`));
                    verktygSignup();
                    await interaction.reply({ content: `Uppdateringen misslyckades - prova igen.`, flags: MessageFlags.Ephemeral });
                    logActivity(`${getNickname(interaction)} failed to update their details - user not found`);
                }

            } catch (error) {
                logActivity("Error when updating details for " + getNickname(interaction) + ": " + error);
            }
        }
    }
};
