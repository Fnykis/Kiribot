function createActivityInviteService({ restPost, channelId, applicationId }) {
    return {
        async create() {
            return restPost(`/channels/${channelId}/invites`, {
                max_age: 604800,
                max_uses: 0,
                target_type: 2,
                target_application_id: applicationId
            });
        }
    };
}

module.exports = createActivityInviteService;
