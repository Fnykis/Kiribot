const HARMONIA_CHANNEL_ID = '1139444157706932234';

module.exports = function createShareLineupImageRoute({ client, logger }) {
    return async function shareLineupImageRoute(req, res) {
        try {
            const buf = req.body;
            if (!Buffer.isBuffer(buf) || buf.length === 0) {
                return res.status(400).json({ error: 'empty_image' });
            }
            if (buf.length > 8 * 1024 * 1024) {
                return res.status(413).json({ error: 'image_too_large' });
            }
            const rawTitle = String(req.query.title || 'Uppställning').slice(0, 200);
            const safeFile = rawTitle.replace(/[^\wåäöÅÄÖ0-9-]+/g, '_').slice(0, 80) || 'lineup';
            const userTag = req.user ? `<@${req.user.id}>` : 'Någon';

            const channel = await client.channels.fetch(HARMONIA_CHANNEL_ID);
            if (!channel || typeof channel.send !== 'function') {
                if (logger) logger('shareLineupImage: channel not sendable', HARMONIA_CHANNEL_ID);
                return res.status(500).json({ error: 'channel_unavailable' });
            }

            await channel.send({
                content: `${userTag} delade en uppställning: **${rawTitle}**`,
                files: [{ attachment: buf, name: `${safeFile}.png` }],
                allowedMentions: { parse: [] }
            });

            res.json({ ok: true });
        } catch (err) {
            if (logger) logger('shareLineupImage failed', err);
            res.status(500).json({ error: 'send_failed' });
        }
    };
};
