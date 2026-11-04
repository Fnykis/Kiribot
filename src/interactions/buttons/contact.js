const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const client = require('../../core/client');
const logActivity = require('../../core/logger');
const { ch_Sektionlista, ch_Arbetsgruppslista } = require('../../core/constants');
const { getNickname } = require('../../utils/interactionUtils');

const MESSAGE_LIMIT = 2000;
const SUBJECT_MAX_LENGTH = 100;

function capitalize(name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function getEligibleMembers(guild, targetChannel) {
    const aktivRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'aktiv');
    if (!aktivRole) return null;
    return aktivRole.members.filter(m =>
        !m.user.bot &&
        m.id !== guild.ownerId &&
        targetChannel.permissionsFor(m).has(PermissionFlagsBits.ViewChannel)
    );
}

function buildFooter(targetChannel, userId, eligibleMembers) {
    const mentions = Array.from(eligibleMembers.keys()).map(id => `<@${id}>`).join(' ');
    return `\n\n-# Meddelande skickat till **${capitalize(targetChannel.name)}** av <@${userId}>\n-# ${mentions}\n-# Tagga fler personer om du vill lägga till dem i konversationen.`;
}

// Room left for the body: limit minus "## <subject>\n" header (worst-case subject) and footer
function getMessageBudget(footer) {
    const header = `## ${'x'.repeat(SUBJECT_MAX_LENGTH)}\n`;
    return Math.max(1, Math.min(4000, MESSAGE_LIMIT - header.length - footer.length));
}

module.exports = {
    matches(customId) {
        return (
            customId === 'contactWorkgroup' ||
            customId === 'contactInstrument' ||
            customId.startsWith('selectChannel-')
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        // contactWorkgroup and contactInstrument buttons
        if (customId === 'contactWorkgroup' || customId === 'contactInstrument') {
            const member = interaction.guild.members.cache.get(interaction.user.id);

            const currentChannel = await client.channels.fetch(interaction.channelId);

            if (!currentChannel || !currentChannel.isTextBased()) {
                logActivity("Target channel not found or invalid. Contact form " + customId + " by user " + getNickname(interaction));
                return interaction.reply({ content: 'Något gick fel', flags: MessageFlags.Ephemeral });
            }

            const category = currentChannel.parent;
            if (!category || category.type !== ChannelType.GuildCategory) {
                logActivity("Target category not found or invalid. Contact form " + customId + " by user " + getNickname(interaction));
                return interaction.reply({ content: 'Något gick fel.', flags: MessageFlags.Ephemeral });
            }

            const channelsInCategory = category.children.cache.filter(channel => channel.type === ChannelType.GuildText).sort((a, b) => a.position - b.position);

            const channelsToList = channelsInCategory.filter(channel =>
                channel.id !== currentChannel.id &&
                channel.id !== ch_Sektionlista &&
                channel.id !== ch_Arbetsgruppslista
            );

            let actionRows = [];
            let actionRow = new ActionRowBuilder();
            let count = 0;

            channelsToList.each(channel => {
                if (count === 5) {
                    actionRows.push(actionRow);
                    actionRow = new ActionRowBuilder();
                    count = 0;
                }

                const isUserInChannel = interaction.member.permissionsIn(channel).has([PermissionFlagsBits.ViewChannel]);
                const channelName = channel.name.charAt(0).toUpperCase() + channel.name.slice(1);

                const button = new ButtonBuilder()
                    .setCustomId(`selectChannel-${channel.id}`)
                    .setLabel(channelName)
                    .setStyle('Secondary')
                    .setDisabled(isUserInChannel);

                actionRow.addComponents(button);
                count++;
            });

            if (count > 0) {
                actionRows.push(actionRow);
            }

            await interaction.reply({ content: 'Välj en kanal från listan:', components: actionRows, flags: MessageFlags.Ephemeral });
            return;
        }

        // selectChannel-* button
        if (customId.startsWith('selectChannel-')) {
            const member = interaction.guild.members.cache.get(interaction.user.id);
            const targetChannelId = customId.split('-')[1];

            const [targetChannel, contactChannel] = await Promise.all([
                client.channels.fetch(targetChannelId),
                client.channels.fetch(interaction.channelId)
            ]);

            if (!targetChannel?.isTextBased()) {
                logActivity(`Invalid target channel: ${customId} by ${getNickname(interaction)}`);
                return interaction.reply({ content: 'Något gick fel', flags: MessageFlags.Ephemeral });
            }

            const previewMembers = getEligibleMembers(interaction.guild, targetChannel);
            const messageBudget = getMessageBudget(buildFooter(targetChannel, interaction.user.id, previewMembers ?? new Map()));

            const modal = new ModalBuilder()
                .setCustomId('modal_contact')
                .setTitle(`Kontaktar ${capitalize(targetChannel.name)}`);

            const subjectInput = new TextInputBuilder()
                .setCustomId('subjectInput')
                .setLabel("Ämne")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(SUBJECT_MAX_LENGTH)
                .setRequired(true);

            const textInput = new TextInputBuilder()
                .setCustomId('textInput')
                .setLabel("Meddelande")
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(messageBudget)
                .setRequired(true);

            const actionRow1 = new ActionRowBuilder().addComponents(subjectInput);
            const actionRow2 = new ActionRowBuilder().addComponents(textInput);

            modal.addComponents(actionRow1, actionRow2);

            await interaction.showModal(modal);

            const submitted = await interaction.awaitModalSubmit({
                time: 1200000,
                filter: i => i.user.id === interaction.user.id,
            }).catch(console.error);

            if (!submitted) return;

            // Ack within Discord's 3s window before thread creation; a failed ack also means another collector already claimed this submit
            try {
                await submitted.deferReply({ flags: MessageFlags.Ephemeral });
            } catch (error) {
                logActivity(`Contact form: could not acknowledge modal submit by ${getNickname(interaction)}: ${error.message}`);
                return;
            }

            const subject = submitted.fields.getTextInputValue('subjectInput');
            const message = submitted.fields.getTextInputValue('textInput');

            const eligibleMembers = getEligibleMembers(interaction.guild, targetChannel);
            if (!eligibleMembers) {
                logActivity(`Aktiv role missing while in contact form by ${getNickname(interaction)}`);
                try {
                    return await submitted.editReply({ content: 'Något gick fel' });
                } catch (error) {
                    logActivity('Failed to reply to interaction (aktiv role missing):', error);
                    return;
                }
            }

            const footer = buildFooter(targetChannel, interaction.user.id, eligibleMembers);

            const thread = await contactChannel.threads.create({
                name: `${getNickname(interaction)} - ${subject}`.slice(0, 100),
                autoArchiveDuration: 10080,
                type: ChannelType.PrivateThread,
            });

            try {
                const mentionIds = [
                    ...Array.from(eligibleMembers.keys()),
                    interaction.user.id
                ];
                // Safety net: roster may have grown since the modal was shown
                const header = `## ${subject}\n`;
                const body = message.slice(0, Math.max(0, MESSAGE_LIMIT - header.length - footer.length));
                await thread.send({
                    content: `${header}${body}${footer}`,
                    allowedMentions: { users: mentionIds }
                });
            } catch (error) {
                logActivity('Thread creation failed:', error);
                try {
                    return await submitted.editReply({ content: 'Något gick fel när tråden skulle skapas' });
                } catch (replyError) {
                    logActivity('Failed to reply to interaction (thread creation failed):', replyError);
                    return;
                }
            }

            try {
                await submitted.editReply({
                    content: `Ditt meddelande har skickats i tråden: ${thread.toString()}`
                });
            } catch (error) {
                logActivity('Failed to confirm contact message to user (thread was created):', error);
            }
        }
    }
};
