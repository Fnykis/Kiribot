const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function postArshjulPanel({ client, channelId, url, logger }) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
        if (logger) logger(`arshjulPanel: channel ${channelId} not found`);
        return 'skipped';
    }

    // Explicit dedup-scan window (Discord's default limit is undocumented) — see the
    // ch_YourProfile "last message" caveat noted on postYourProfile in src/features/profile.js.
    const messages = await channel.messages.fetch({ limit: 50 });
    const existing = [...messages.values()].find(msg =>
        (msg.components || []).some(row =>
            (row.components || []).some(c => c.data && c.data.url === url)
        )
    );
    if (existing) return 'exists';

    const button = new ButtonBuilder()
        .setLabel('Öppna årshjulet')
        .setStyle(ButtonStyle.Link)
        .setURL(url);

    await channel.send({
        content: '**Årshjul** — planera året för din sektion eller arbetsgrupp.',
        components: [new ActionRowBuilder().addComponents(button)]
    });
    if (logger) logger('arshjulPanel: posted panel message');
    return 'created';
}

module.exports = postArshjulPanel;
