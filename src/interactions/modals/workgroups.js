const { ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const logActivity = require('../../core/logger');
const { hex_arbet, hex_instr, cat_Arbetsgrupper, cat_Sektioner } = require('../../core/constants');
const { getNickname } = require('../../utils/interactionUtils');

module.exports = {
    matches(customId) {
        return (
            customId === 'modal_addWorkgroup' ||
            customId.startsWith('modal_editWorkgroup-') ||
            customId === 'modal_addSection' ||
            customId.startsWith('modal_editSection-')
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        // modal_addWorkgroup
        if (customId === 'modal_addWorkgroup') {
            try {
                const workgroupName = interaction.fields.getTextInputValue('workgroupNameInput');
                const workgroupNameLower = workgroupName.toLowerCase();
                const createChannel = interaction.fields.getTextInputValue('createChannelInput').toLowerCase() === 'ja';

                const newRole = await interaction.guild.roles.create({
                    name: workgroupNameLower,
                    color: hex_arbet,
                    permissions: [],
                    reason: `Workgroup created by ${interaction.member.user.username}`
                });

                let channelCreated = false;
                if (createChannel) {
                    const newChannel = await interaction.guild.channels.create({
                        name: workgroupNameLower.replace(/\s+/g, '-'),
                        type: ChannelType.GuildText,
                        parent: cat_Arbetsgrupper,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.roles.everyone.id,
                                deny: [PermissionFlagsBits.ViewChannel]
                            },
                            {
                                id: newRole.id,
                                allow: [PermissionFlagsBits.ViewChannel]
                            }
                        ]
                    });
                    channelCreated = true;
                }

                await interaction.reply({
                    content: `**${workgroupNameLower}** har skapats.${channelCreated ? ' En kanal har också skapats.' : ''}`,
                    flags: MessageFlags.Ephemeral
                });

                logActivity(`Workgroup "${workgroupNameLower}" was created by ${getNickname(interaction)}${channelCreated ? ' with channel' : ''}`);

            } catch (error) {
                await interaction.reply({
                    content: `Fel vid skapandet av arbetsgruppen: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
                logActivity(`Error creating workgroup: ${error.message}`);
            }
            return;
        }

        // modal_editWorkgroup-<roleId>
        if (customId.startsWith('modal_editWorkgroup-')) {
            try {
                const roleId = customId.split('-')[1];
                const role = interaction.guild.roles.cache.get(roleId);

                if (!role) {
                    await interaction.reply({
                        content: 'Arbetsgruppen kunde inte hittas.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const newName = interaction.fields.getTextInputValue('editWorkgroupNameInput');
                const newNameLower = newName.toLowerCase();
                const oldName = role.name;

                await role.setName(newNameLower);

                let channelUpdated = false;
                let channelName = '';

                const category = interaction.guild.channels.cache.get(cat_Arbetsgrupper);
                if (category && category.type === ChannelType.GuildCategory) {
                    const channels = category.children.cache;
                    const oldChannelName = oldName.replace(/\s+/g, '-');
                    const newChannelName = newNameLower.replace(/\s+/g, '-');

                    for (const [channelId, channel] of channels) {
                        if (channel.name === oldChannelName) {
                            const permissionOverwrites = channel.permissionOverwrites.cache;
                            let onlyThisRole = true;

                            for (const [overwriteId, overwrite] of permissionOverwrites) {
                                if (overwriteId !== role.id && overwriteId !== interaction.guild.roles.everyone.id) {
                                    const overwriteRole = interaction.guild.roles.cache.get(overwriteId);
                                    if (overwriteRole) {
                                        onlyThisRole = false;
                                        break;
                                    }
                                }
                            }

                            if (onlyThisRole) {
                                await channel.setName(newChannelName);
                                channelUpdated = true;
                                channelName = newChannelName;
                            }
                            break;
                        }
                    }
                }

                let resultMessage = `**${oldName}** har bytt namn till **${newNameLower}**.`;
                if (channelUpdated) {
                    resultMessage += ` Kanalen har också uppdaterats.`;
                } else {
                    resultMessage += ` Ingen kanal uppdaterades (kan ha flera roller tilldelade).`;
                }

                await interaction.reply({
                    content: resultMessage,
                    flags: MessageFlags.Ephemeral
                });

                logActivity(`Workgroup "${oldName}" was renamed to "${newNameLower}" by ${getNickname(interaction)}${channelUpdated ? ' with channel update' : ''}`);

            } catch (error) {
                await interaction.reply({
                    content: `Fel uppstod vid redigering: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
                logActivity(`Error editing workgroup: ${error.message}`);
            }
            return;
        }

        // modal_addSection
        if (customId === 'modal_addSection') {
            try {
                const sectionName = interaction.fields.getTextInputValue('sectionNameInput');
                const sectionNameLower = sectionName.toLowerCase();
                const createChannel = interaction.fields.getTextInputValue('createSectionChannelInput').toLowerCase() === 'ja';

                const newRole = await interaction.guild.roles.create({
                    name: sectionNameLower,
                    color: hex_instr,
                    permissions: [],
                    reason: `Section created by ${interaction.member.user.username}`
                });

                let channelCreated = false;
                if (createChannel) {
                    const newChannel = await interaction.guild.channels.create({
                        name: sectionNameLower.replace(/\s+/g, '-'),
                        type: ChannelType.GuildText,
                        parent: cat_Sektioner,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.roles.everyone.id,
                                deny: [PermissionFlagsBits.ViewChannel]
                            },
                            {
                                id: newRole.id,
                                allow: [PermissionFlagsBits.ViewChannel]
                            }
                        ]
                    });
                    channelCreated = true;
                }

                await interaction.reply({
                    content: `**${sectionNameLower}** har skapats.${channelCreated ? ' En kanal har också skapats.' : ''}`,
                    flags: MessageFlags.Ephemeral
                });

                logActivity(`Section "${sectionNameLower}" was created by ${getNickname(interaction)}${channelCreated ? ' with channel' : ''}`);

            } catch (error) {
                await interaction.reply({
                    content: `Fel vid skapande av sektionen: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
                logActivity(`Error creating section: ${error.message}`);
            }
            return;
        }

        // modal_editSection-<roleId>
        if (customId.startsWith('modal_editSection-')) {
            try {
                const roleId = customId.split('-')[1];
                const role = interaction.guild.roles.cache.get(roleId);

                if (!role) {
                    await interaction.reply({
                        content: 'Sektionen kunde inte hittas.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const newName = interaction.fields.getTextInputValue('editSectionNameInput');
                const newNameLower = newName.toLowerCase();
                const oldName = role.name;

                await role.setName(newNameLower);

                let channelUpdated = false;
                let channelName = '';

                const category = interaction.guild.channels.cache.get(cat_Sektioner);
                if (category && category.type === ChannelType.GuildCategory) {
                    const channels = category.children.cache;
                    const oldChannelName = oldName.replace(/\s+/g, '-');
                    const newChannelName = newNameLower.replace(/\s+/g, '-');

                    for (const [channelId, channel] of channels) {
                        if (channel.name === oldChannelName) {
                            const permissionOverwrites = channel.permissionOverwrites.cache;
                            let onlyThisRole = true;

                            for (const [overwriteId, overwrite] of permissionOverwrites) {
                                if (overwriteId !== role.id && overwriteId !== interaction.guild.roles.everyone.id) {
                                    const overwriteRole = interaction.guild.roles.cache.get(overwriteId);
                                    if (overwriteRole) {
                                        onlyThisRole = false;
                                        break;
                                    }
                                }
                            }

                            if (onlyThisRole) {
                                await channel.setName(newChannelName);
                                channelUpdated = true;
                                channelName = newChannelName;
                            }
                            break;
                        }
                    }
                }

                let resultMessage = `**${oldName}** har bytt namn till **${newNameLower}**.`;
                if (channelUpdated) {
                    resultMessage += ` Kanalen har också uppdaterats.`;
                } else {
                    resultMessage += ` Ingen kanal uppdaterades (kan ha flera roller tilldelade).`;
                }

                await interaction.reply({
                    content: resultMessage,
                    flags: MessageFlags.Ephemeral
                });

                logActivity(`Section "${oldName}" was renamed to "${newNameLower}" by ${getNickname(interaction)}${channelUpdated ? ' with channel update' : ''}`);

            } catch (error) {
                await interaction.reply({
                    content: `Fel uppstod vid redigering: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
                logActivity(`Error editing section: ${error.message}`);
            }
        }
    }
};
