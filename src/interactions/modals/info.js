const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockFile = require('lockfile');
const logActivity = require('../../core/logger');
const { dir_EventsActive } = require('../../core/constants');
const { getNickname } = require('../../utils/interactionUtils');
const { getEventJSON } = require('../../features/signup');
const { updateInformationMessage } = require('../../features/eventThread');

module.exports = {
    matches(customId) {
        return (
            customId.startsWith('modal_info_add_') ||
            customId.startsWith('modal_info_edit_')
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        try {
            const isAdd = customId.startsWith('modal_info_add_');
            const eventId = customId.split('_')[3];
            const rawText = interaction.fields.getTextInputValue('infoTextInput');
            const normalizedText = rawText.trim();
            const newText = normalizedText ? rawText : '';

            const files = fs.readdirSync(dir_EventsActive);
            const fileName = files.find(file => file.endsWith('_' + eventId + '.json'));

            if (!fileName) {
                await interaction.reply({
                    content: 'Detta event har passerat.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const filePath = path.join(dir_EventsActive, fileName);

            lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
                if (err) {
                    logActivity(`Failed to acquire lock for ${fileName}: ${err.message}`);
                    await interaction.reply({
                        content: 'Ett fel uppstod när informationen skulle sparas.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                    return;
                }

                try {
                    let eventData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                    if (!eventData.information) {
                        lockFile.unlock(`${fileName}.lock`, () => {});
                        await interaction.reply({
                            content: 'Detta event har inget informationsmeddelande.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    if (isAdd) {
                        if (!normalizedText) {
                            lockFile.unlock(`${fileName}.lock`, () => {});
                            await interaction.reply({
                                content: 'Informationen kan inte vara tom.',
                                flags: MessageFlags.Ephemeral
                            });
                            return;
                        }
                        const existingText = eventData.information.text || '';
                        eventData.information.text = existingText ? `${existingText}\n\n${newText}` : newText;
                    } else {
                        eventData.information.text = newText;
                    }

                    fs.writeFileSync(filePath, JSON.stringify(eventData));

                    const thread = interaction.channel;
                    if (!thread.isThread()) {
                        lockFile.unlock(`${fileName}.lock`, () => {});
                        await interaction.reply({
                            content: 'Ett fel uppstod.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    const messageId = await updateInformationMessage(thread, eventData.information.text);

                    lockFile.unlock(`${fileName}.lock`, (err) => {
                        if (err) {
                            logActivity(`Failed to unlock ${fileName}: ${err.message}`);
                        }
                    });

                    const btn_notify_thread = new ButtonBuilder()
                        .setCustomId(`info_notify_thread_${eventId}`)
                        .setLabel('Normal')
                        .setStyle(ButtonStyle.Secondary);

                    const btn_notify_tagged = new ButtonBuilder()
                        .setCustomId(`info_notify_tagged_${eventId}`)
                        .setLabel('Tagga')
                        .setStyle(ButtonStyle.Secondary);

                    const btn_notify_silent = new ButtonBuilder()
                        .setCustomId(`info_notify_silent_${eventId}`)
                        .setLabel('Tyst')
                        .setStyle(ButtonStyle.Secondary);

                    const row = new ActionRowBuilder()
                        .addComponents(btn_notify_thread, btn_notify_tagged, btn_notify_silent);

                    await interaction.reply({
                        content: 'Välj hur du vill meddela tråden:\n**Normal** – Kiribot skickar ett meddelande i tråden utan att tagga någon (rekommenderat).\n**Tagga** – Kiribot pingar alla som signat upp sig. Det här är bra när det är viktigt att alla får veta att det har uppdaterats. Till exampel när spelningen alldeles strax börjar.\n**Tyst** – Kiribot uppdaterar utan nytt meddelande i tråden. Bra när man till exempel bara ändrar felstavningar etc.',
                        components: [row],
                        flags: MessageFlags.Ephemeral
                    });

                    logActivity(`${getNickname(interaction)} ${isAdd ? 'added' : 'edited'} information for event: ${eventData.name || 'unknown'}`);

                } catch (error) {
                    lockFile.unlock(`${fileName}.lock`, () => {});
                    logActivity(`Error updating information: ${error.message}`);
                    await interaction.reply({
                        content: 'Ett fel uppstod när informationen skulle sparas.',
                        flags: MessageFlags.Ephemeral
                    }).catch(() => {});
                }
            });
        } catch (error) {
            logActivity(`Error handling info modal submission: ${error.message}`);
            await interaction.reply({
                content: 'Ett fel uppstod när informationen skulle sparas.',
                flags: MessageFlags.Ephemeral
            }).catch(() => {});
        }
    }
};
