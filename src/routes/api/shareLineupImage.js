// TEMP: posting to test channel instead of Harmonia. Revert to '1139444157706932234' when done.
const HARMONIA_CHANNEL_ID = '1231042885411930253';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buf) {
    return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

// Strip control chars + collapse whitespace + escape Discord markdown metachars.
function sanitizeTitle(s) {
    if (typeof s !== 'string') return '';
    return s
        .replace(/[\x00-\x1f\x7f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/([\\`*_~|>#\[\]()])/g, '\\$1')
        .slice(0, 200);
}

module.exports = function createShareLineupImageRoute({ client, lineupStore, logger }) {
    return async function shareLineupImageRoute(req, res) {
        try {
            const concertId = String(req.query.concertId || '').trim();
            if (!concertId || !/^[\w-]{1,64}$/.test(concertId)) {
                return res.status(400).json({ error: 'bad_concert_id' });
            }

            const event = await lineupStore.loadEvent(concertId);
            if (!event) return res.status(404).json({ error: 'concert_not_found' });

            const buf = req.body;
            if (!Buffer.isBuffer(buf) || buf.length === 0) {
                return res.status(400).json({ error: 'empty_image' });
            }
            if (buf.length > 8 * 1024 * 1024) {
                return res.status(413).json({ error: 'image_too_large' });
            }
            if (!isPng(buf)) {
                return res.status(400).json({ error: 'not_png' });
            }

            const rawName = sanitizeTitle(event.name || 'Uppställning');
            const rawDate = sanitizeTitle(event.date || '');
            const fileSafe = (event.name || 'lineup').replace(/[^\wåäöÅÄÖ0-9-]+/g, '_').slice(0, 80) || 'lineup';
            const userTag = req.user ? `<@${req.user.id}>` : 'Någon';
            const titleLine = rawDate ? `**${rawName}** — ${rawDate}` : `**${rawName}**`;

            const channel = await client.channels.fetch(HARMONIA_CHANNEL_ID);
            if (!channel || typeof channel.send !== 'function') {
                if (logger) logger('shareLineupImage: channel not sendable', HARMONIA_CHANNEL_ID);
                return res.status(500).json({ error: 'channel_unavailable' });
            }

            await channel.send({
                content: `${userTag} delade en uppställning: ${titleLine}`,
                files: [{ attachment: buf, name: `${fileSafe}.png` }],
                allowedMentions: { parse: [] }
            });

            res.json({ ok: true });
        } catch (err) {
            if (logger) logger('shareLineupImage failed', err);
            res.status(500).json({ error: 'send_failed' });
        }
    };
};
