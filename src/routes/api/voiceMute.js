function createVoiceMuteRoute({ getMember, lineupChannelId, logger }) {
    return async function voiceMuteRoute(req, res) {
        const { muted } = req.body || {};
        if (typeof muted !== 'boolean') {
            return res.status(400).json({ error: 'invalid_body' });
        }
        let member;
        try {
            member = await getMember(req.user.id);
        } catch (err) {
            if (logger) logger('voiceMute: getMember failed', err);
            return res.status(500).json({ error: 'member_lookup_failed' });
        }
        if (!member || !member.voice || member.voice.channelId !== lineupChannelId) {
            return res.status(409).json({ error: 'not_in_lineup_vc' });
        }
        try {
            await member.voice.setMute(muted, 'activity toggle');
        } catch (err) {
            if (logger) logger('voiceMute: setMute failed', err);
            return res.status(500).json({ error: 'mute_failed' });
        }
        return res.json({ muted });
    };
}

module.exports = createVoiceMuteRoute;
