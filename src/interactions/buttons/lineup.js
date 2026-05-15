const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const createActivityInviteService = require('../../services/activityInvite');
const { ch_LineupVoice, activity_Lineup } = require('../../core/constants');
const { harmonianRoleId } = require('../../../config.json');
const logActivity = require('../../core/logger');

function matches(customId) {
    return customId === 'btn_lineup_invite';
}

async function execute(interaction) {
    const member = interaction.member;
    const hasHarmonian = member?.roles?.cache?.has(harmonianRoleId);
    if (!hasHarmonian) {
        return interaction.reply({
            content: 'Du behöver rollen Harmonian för att öppna lineup.',
            flags: MessageFlags.Ephemeral
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const svc = createActivityInviteService({
        restPost: (route, body) => interaction.client.rest.post(route, { body }),
        channelId: ch_LineupVoice,
        applicationId: activity_Lineup
    });

    let invite;
    try {
        invite = await svc.create();
    } catch (err) {
        logActivity(`btn_lineup_invite: invite generation failed: ${err.message}`);
        return interaction.editReply({ content: 'Kunde inte skapa lineup-länk. Försök igen.' });
    }

    const urlBtn = new ButtonBuilder()
        .setLabel('Öppna lineup')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.gg/${invite.code}`);

    logActivity(`btn_lineup_invite: ${interaction.member?.displayName || interaction.user.username} generated lineup invite`);
    return interaction.editReply({
        content: 'Klicka för att starta lineup-aktiviteten:',
        components: [new ActionRowBuilder().addComponents(urlBtn)],
    });
}

module.exports = { matches, execute };
