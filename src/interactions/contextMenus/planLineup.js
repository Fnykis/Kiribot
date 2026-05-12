const { MessageFlags } = require('discord.js');
const { getEventJSON } = require('../../features/signup');
const { pendingConcerts } = require('../../features/lineup');
const logActivity = require('../../core/logger');

function matches(commandName) {
    return commandName === 'Planera lineup';
}

async function execute(interaction) {
    let targetMessage;
    try {
        targetMessage = await interaction.channel.messages.fetch(interaction.targetId);
    } catch (err) {
        logActivity('planLineup: failed to fetch target message:', err);
        await interaction.reply({
            content: 'Kunde inte hämta meddelandet.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const embed = targetMessage.embeds[0];
    const footerText = embed?.footer?.text || '';
    const parts = footerText.split(': ');
    const eventId = parts.length === 2 ? parts[1] : null;

    if (!eventId) {
        await interaction.reply({
            content: 'Det här är inte en signup-post.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const data = getEventJSON(eventId);
    if (!data) {
        await interaction.reply({
            content: 'Kunde inte hitta konserten. Är den arkiverad?',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    pendingConcerts.set(interaction.user.id, eventId);

    await interaction.reply({
        content:
            `Lineup för **${data.name}** är reserverad åt dig.\n\n` +
            `Öppna **Lineup Planner** från aktivitetsraden i en röstkanal inom 10 minuter.`,
        flags: MessageFlags.Ephemeral
    });
}

module.exports = { matches, execute };
