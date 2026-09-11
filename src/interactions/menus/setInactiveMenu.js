const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const client = require('../../core/client');
const logActivity = require('../../core/logger');
const { guildId, ch_PrivataMeddelanden, ch_YourProfile, role_moderator, role_discordgruppen } = require('../../core/constants');
const { getNickname } = require('../../utils/interactionUtils');
const { checkRoles } = require('../../features/lists');
const { updateDetails } = require('../../features/details');
const { verktygSignup } = require('../../features/signup');
const createMemberStatusService = require('../../services/memberStatus');

const memberStatus = createMemberStatusService({
    client,
    guildId,
    privateMessagesChannelId: ch_PrivataMeddelanden,
    yourProfileChannelId: ch_YourProfile,
    logActivity
});

module.exports = {
    matches(customId) {
        return customId === 'setInactive_select';
    },

    async execute(interaction) {
        const allowedRoleIds = [role_moderator, role_discordgruppen];
        const isOwner = interaction.member.id === interaction.guild?.ownerId;
        const hasRole = interaction.member.roles.cache.some(role => allowedRoleIds.includes(role.id));
        if (!isOwner && !hasRole) return interaction.reply({ content: 'Du har inte behörighet att använda denna funktion.', flags: MessageFlags.Ephemeral });

        // Collection -> array so the service can iterate members directly.
        const selectedMembers = [...interaction.members.values()];

        const modal = new ModalBuilder()
            .setCustomId('modal_setInactive')
            .setTitle('Sätt som inaktiv');

        const reasonInput = new TextInputBuilder()
            .setCustomId('setInactiveReason')
            .setLabel('Anledning (valfritt)')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(500)
            .setRequired(false);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        await interaction.showModal(modal);

        // Selected members live in this closure, so the modal customId never has to carry 25 user IDs.
        const submitted = await interaction.awaitModalSubmit({
            time: 5 * 60 * 1000,
            filter: i => i.user.id === interaction.user.id && i.customId === 'modal_setInactive',
        }).catch(() => null);

        if (!submitted) return;

        await submitted.deferReply({ flags: MessageFlags.Ephemeral });

        const reason = submitted.fields.getTextInputValue('setInactiveReason');
        const moderatorNickname = getNickname(interaction);

        try {
            const result = await memberStatus.setMembersInactive({ members: selectedMembers, reason, moderatorNickname });

            if (result.changed.length > 0) {
                checkRoles();
                updateDetails().catch(err => logActivity(`Error in updateDetails (from setInactive): ${err.message}`));
                verktygSignup();
            }

            logActivity(`${moderatorNickname} set inaktiv: [${result.changed.join(', ')}] skipped: [${result.skipped.join(', ')}] notify errors: ${result.errors}${reason.trim() ? ` reason: "${reason.trim()}"` : ''}`);
            await submitted.editReply({ content: memberStatus.formatSummary(result) });
        } catch (error) {
            logActivity(`Error in setInactive by ${moderatorNickname}: ${error.message}`);
            await submitted.editReply({ content: 'Ett fel uppstod. Kontrollera loggar för detaljer.' });
        }
    }
};
