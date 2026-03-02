const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockFile = require('lockfile');
const logActivity = require('../../core/logger');
const { dir_EventsActive, guildId } = require('../../core/constants');
const { getNickname } = require('../../utils/interactionUtils');
const { getEventJSON } = require('../../features/signup');
const { getParticipantUserIds, updateInformationMessage } = require('../../features/eventThread');

module.exports = {
    matches(customId) {
        return (
            customId.startsWith('info_add_') ||
            customId.startsWith('info_edit_') ||
            customId.startsWith('info_notify_')
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        // info_add_* button
        if (customId.startsWith('info_add_')) {
            try {
                const eventId = customId.split('_')[2];
                const eventData = getEventJSON(eventId);

                if (!eventData) {
                    await interaction.reply({
                        content: 'Detta event har passerat.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (!eventData.information) {
                    await interaction.reply({
                        content: 'Detta event har inget informationsmeddelande.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const currentText = eventData.information.text || '';
                const maxLength = Math.max(1, 1200 - currentText.length);

                let modalTitle = `Lägg till information för ${eventData.name}`;
                if (modalTitle.length > 45) {
                    modalTitle = modalTitle.substring(0, 42) + '...';
                }

                const modal = new ModalBuilder()
                    .setCustomId(`modal_info_add_${eventId}`)
                    .setTitle(modalTitle);

                const textInput = new TextInputBuilder()
                    .setCustomId('infoTextInput')
                    .setLabel('Ny information')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(maxLength)
                    .setRequired(true);

                const actionRow = new ActionRowBuilder().addComponents(textInput);
                modal.addComponents(actionRow);

                await interaction.showModal(modal);
            } catch (error) {
                logActivity(`Error showing add info modal: ${error.message}`);
                await interaction.reply({
                    content: 'Ett fel uppstod när modalen skulle visas.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
            return;
        }

        // info_edit_* button
        if (customId.startsWith('info_edit_')) {
            try {
                const eventId = customId.split('_')[2];
                const eventData = getEventJSON(eventId);

                if (!eventData) {
                    await interaction.reply({
                        content: 'Detta event har passerat.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (!eventData.information) {
                    await interaction.reply({
                        content: 'Detta event har inget informationsmeddelande.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const currentText = eventData.information.text || '';

                let modalTitle = `Ändra information för ${eventData.name}`;
                if (modalTitle.length > 45) {
                    modalTitle = modalTitle.substring(0, 42) + '...';
                }

                const modal = new ModalBuilder()
                    .setCustomId(`modal_info_edit_${eventId}`)
                    .setTitle(modalTitle);

                const textInput = new TextInputBuilder()
                    .setCustomId('infoTextInput')
                    .setLabel('Redigera information')
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1200)
                    .setValue(currentText)
                    .setRequired(false);

                const actionRow = new ActionRowBuilder().addComponents(textInput);
                modal.addComponents(actionRow);

                await interaction.showModal(modal);
            } catch (error) {
                logActivity(`Error showing edit info modal: ${error.message}`);
                await interaction.reply({
                    content: 'Ett fel uppstod när modalen skulle visas.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
            return;
        }

        // info_notify_* button
        if (customId.startsWith('info_notify_')) {
            try {
                const parts = customId.split('_');
                const notifyType = parts[2];
                const eventId = parts[3];

                const eventData = getEventJSON(eventId);
                if (!eventData) {
                    await interaction.reply({
                        content: 'Detta event har passerat.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const thread = interaction.channel;
                if (!thread.isThread()) {
                    await interaction.reply({
                        content: 'Ett fel uppstod.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const messages = await thread.messages.fetch({ limit: 20 });
                const messageArray = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
                let informationMessageId = null;
                if (messageArray.length >= 2) {
                    const informationMessage = messageArray[1];
                    const isInformationMessage =
                        informationMessage.content.startsWith('## ℹ️ Information') ||
                        informationMessage.content.startsWith('Information:');
                    if (isInformationMessage) {
                        informationMessageId = informationMessage.id;
                    }
                }

                const messageLink = informationMessageId
                    ? `https://discord.com/channels/${guildId}/${thread.id}/${informationMessageId}`
                    : '';

                if (notifyType === 'thread') {
                    const notificationText = informationMessageId
                        ? `📢 Ny information har lagts till för **${eventData.name}**.\n\nKlicka här för att se informationsmeddelandet: ${messageLink}`
                        : `📢 Ny information har lagts till för **${eventData.name}**.`;

                    await thread.send(notificationText);
                    await interaction.reply({
                        content: 'Meddelande har skickats i tråden.',
                        flags: MessageFlags.Ephemeral
                    });
                } else if (notifyType === 'tagged') {
                    const participantIds = getParticipantUserIds(eventData);
                    const mentions = participantIds.map(id => `<@${id}>`).join(' ');

                    const notificationText = informationMessageId
                        ? `${mentions}\n\n📢 Ny information har lagts till för **${eventData.name}**.\n\nKlicka här för att se informationsmeddelandet: ${messageLink}`
                        : `${mentions}\n\n📢 Ny information har lagts till för **${eventData.name}**.`;

                    await thread.send({
                        content: notificationText,
                        allowedMentions: { users: participantIds }
                    });
                    await interaction.reply({
                        content: 'Meddelande har skickats i tråden med taggningar.',
                        flags: MessageFlags.Ephemeral
                    });
                } else if (notifyType === 'silent') {
                    await interaction.reply({
                        content: 'Informationen har uppdaterats tyst.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                logActivity(`${getNickname(interaction)} ${notifyType === 'silent' ? 'silently' : 'notified'} about info update for event: ${eventData.name || 'unknown'}`);

            } catch (error) {
                logActivity(`Error handling notification button: ${error.message}`);
                await interaction.reply({
                    content: 'Ett fel uppstod när meddelandet skulle skickas.',
                    flags: MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    }
};
