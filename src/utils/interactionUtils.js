const logActivity = require('../core/logger');

// Helper function to get user nickname or username
function getNickname(interaction) {
	return interaction.member ? (interaction.member.nickname || interaction.member.user.username) : interaction.user.username;
}

// Utility function to safely reply to Discord interactions
async function safeReply(interaction, content, options = {}) {
    try {
        if (interaction.replied || interaction.deferred) {
            return await interaction.followUp({ content, ...options });
        } else {
            return await interaction.reply({ content, ...options });
        }
    } catch (error) {
        if (error.code === 10062) {
            // Interaction has expired, try to send a follow-up message
            try {
                return await interaction.followUp({ content, ...options });
            } catch (followUpError) {
                logActivity('Failed to send followUp message:', followUpError);
                return null;
            }
        } else {
            logActivity('Error replying to interaction:', error);
            return null;
        }
    }
}

module.exports = { getNickname, safeReply };
