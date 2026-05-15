function createVoiceLeaveRoute({ getMember, lineupChannelId, logger }) {
    return async function voiceLeaveRoute(req, res) {
        let member;
        try {
            member = await getMember(req.user.id);
        } catch (err) {
            if (logger) logger('voiceLeave: getMember failed', err);
            return res.status(500).json({ error: 'member_lookup_failed' });
        }
        if (!member || !member.voice || member.voice.channelId !== lineupChannelId) {
            return res.status(409).json({ error: 'not_in_lineup_vc' });
        }
        try {
            await member.voice.disconnect('activity leave');
        } catch (err) {
            if (logger) logger('voiceLeave: disconnect failed', err);
            return res.status(500).json({ error: 'leave_failed' });
        }
        return res.json({ ok: true });
    };
}

module.exports = createVoiceLeaveRoute;
