const logActivity = require('../core/logger');

// Helper function to get a guild member's nickname, falling back to their username
function getMemberNickname(member) {
	return member.nickname || member.user.username;
}

// Helper function to get user nickname or username
function getNickname(interaction) {
	return interaction.member ? getMemberNickname(interaction.member) : interaction.user.username;
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

module.exports = { getNickname, getMemberNickname, safeReply };
