const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const logActivity = require('../../core/logger');
const { role_moderator, role_discordgruppen, hex_arbet, hex_instr, cat_Arbetsgrupper, cat_Sektioner } = require('../../core/constants');
const store = require('../../state/store');
const { getNickname } = require('../../utils/interactionUtils');
const { cleanupOutdatedSignups } = require('../../features/signup');
const { savePermissions } = require('../../services/permissions');

module.exports = {
    matches(customId) {
        return (
            customId === 'openModeratorTools' ||
            customId === 'addWorkgroup' ||
            customId.startsWith('editWorkgroup') ||
            customId.startsWith('removeWorkgroup') ||
            customId.startsWith('confirmRemove') ||
            customId.startsWith('finalConfirmRemove') ||
            customId === 'addSection' ||
            customId.startsWith('editSection') ||
            customId.startsWith('removeSection') ||
            customId.startsWith('confirmRemoveSection') ||
            customId.startsWith('finalConfirmRemoveSection') ||
            customId === 'adjustPermissions' ||
            customId === 'cleanupSignups' ||
            customId === 'permissions_signup-creation' ||
            customId.startsWith('toggle_signup-creation_')
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        // openModeratorTools button
        if (customId === 'openModeratorTools') {
            const allowedRoleIds = [role_moderator, role_discordgruppen];
            const member = interaction.member;
            const guild = interaction.guild;
            const isOwner = member.id === guild?.ownerId;
            const hasRole = member.roles.cache.some(role => allowedRoleIds.includes(role.id));
            if (!isOwner && !hasRole) return interaction.reply({ content: 'Du har inte behörighet att använda denna funktion.', flags: MessageFlags.Ephemeral });

            const btn_addWorkgroup = new ButtonBuilder()
                .setCustomId('addWorkgroup')
                .setLabel('Lägg till arbetsgrupp')
                .setStyle(ButtonStyle.Secondary);

            const btn_editWorkgroup = new ButtonBuilder()
                .setCustomId('editWorkgroup')
                .setLabel('Ändra arbetsgrupp')
                .setStyle(ButtonStyle.Secondary);

            const btn_removeWorkgroup = new ButtonBuilder()
                .setCustomId('removeWorkgroup')
                .setLabel('Ta bort arbetsgrupp')
                .setStyle(ButtonStyle.Secondary);

            const btn_addSection = new ButtonBuilder()
                .setCustomId('addSection')
                .setLabel('Lägg till sektion')
                .setStyle(ButtonStyle.Secondary);

            const btn_editSection = new ButtonBuilder()
                .setCustomId('editSection')
                .setLabel('Ändra sektion')
                .setStyle(ButtonStyle.Secondary);

            const btn_removeSection = new ButtonBuilder()
                .setCustomId('removeSection')
                .setLabel('Ta bort sektion')
                .setStyle(ButtonStyle.Secondary);

            const btn_adjustPermissions = new ButtonBuilder()
                .setCustomId('adjustPermissions')
                .setLabel('Justera behörigheter')
                .setStyle(ButtonStyle.Secondary);

            const btn_cleanupSignups = new ButtonBuilder()
                .setCustomId('cleanupSignups')
                .setLabel('Städa upp signups')
                .setStyle(ButtonStyle.Secondary);

            const row1_buttons = new ActionRowBuilder()
                .addComponents(btn_addWorkgroup, btn_editWorkgroup, btn_removeWorkgroup);
            const row2_buttons = new ActionRowBuilder()
                .addComponents(btn_addSection, btn_editSection, btn_removeSection);
            const row3_buttons = new ActionRowBuilder()
                .addComponents(btn_adjustPermissions, btn_cleanupSignups);

            await interaction.reply({
                content: '',
                components: [row1_buttons, row2_buttons, row3_buttons],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // adjustPermissions button
        if (customId === 'adjustPermissions') {
            const allowedRoleIds = [role_moderator, role_discordgruppen];
            const member = interaction.member;
            const guild = interaction.guild;
            const isOwner = member.id === guild?.ownerId;
            const hasRole = member.roles.cache.some(role => allowedRoleIds.includes(role.id));
            if (!isOwner && !hasRole) return interaction.reply({ content: 'Du har inte behörighet att använda denna funktion.', flags: MessageFlags.Ephemeral });

            const btn_signupPermissions = new ButtonBuilder()
                .setCustomId('permissions_signup-creation')
                .setLabel('Skapa signup')
                .setStyle(ButtonStyle.Secondary);

            const row_buttons = new ActionRowBuilder()
                .addComponents(btn_signupPermissions);

            await interaction.reply({
                content: 'Välj vilken funktion du vill justera behörigheter för:',
                components: [row_buttons],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // cleanupSignups button
        if (customId === 'cleanupSignups') {
            const allowedRoleIds = [role_moderator, role_discordgruppen];
            const member = interaction.member;
            const guild = interaction.guild;
            const isOwner = member.id === guild?.ownerId;
            const hasRole = member.roles.cache.some(role => allowedRoleIds.includes(role.id));
            if (!isOwner && !hasRole) return interaction.reply({ content: 'Du har inte behörighet att använda denna funktion.', flags: MessageFlags.Ephemeral });

            await interaction.reply({ content: 'Städar upp gamla signups...', flags: MessageFlags.Ephemeral });

            try {
                const results = await cleanupOutdatedSignups(getNickname(interaction));

                let responseMessage = `**Städning slutförd!**\n`;
                responseMessage += `📁 Filer flyttade: ${results.filesMoved}\n`;
                responseMessage += `🔧 Meddelanden rensade: ${results.messagesCleaned}\n`;
                responseMessage += `❌ Fel: ${results.errors}\n`;

                if (results.errors > 0) {
                    responseMessage += `\nKontrollera loggar för detaljer om felen.`;
                }

                await interaction.editReply({ content: responseMessage });
                logActivity(`${getNickname(interaction)} - CleanupSignups completed: ${results.filesMoved} files moved, ${results.messagesCleaned} messages cleaned, ${results.errors} errors. Invoked by ${getNickname(interaction)}`);
            } catch (error) {
                logActivity(`${getNickname(interaction)} - Error in cleanupSignups: ${error}. Invoked by ${getNickname(interaction)}`);
                await interaction.editReply({ content: 'Ett fel uppstod under städningen. Kontrollera loggar för detaljer.' });
            }
            return;
        }

        // permissions_signup-creation button
        if (customId === 'permissions_signup-creation') {
            const allowedRoleIds = [role_moderator, role_discordgruppen];
            const member = interaction.member;
            const guild = interaction.guild;
            const isOwner = member.id === guild?.ownerId;
            const hasRole = member.roles.cache.some(role => allowedRoleIds.includes(role.id));
            if (!isOwner && !hasRole) return interaction.reply({ content: 'Du har inte behörighet att använda denna funktion.', flags: MessageFlags.Ephemeral });

            const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));

            let actionRows = [];
            let actionRow = new ActionRowBuilder();
            let count = 0;

            roles.each((role) => {
                if (count === 5) {
                    actionRows.push(actionRow);
                    actionRow = new ActionRowBuilder();
                    count = 0;
                }

                const isAllowed = store.getPermissionSettings()['signup-creation'].includes(role.id);
                const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
                const button = new ButtonBuilder()
                    .setCustomId(`toggle_signup-creation_${role.id}`)
                    .setLabel(roleName)
                    .setStyle(isAllowed ? ButtonStyle.Success : ButtonStyle.Danger);

                actionRow.addComponents(button);
                count++;
            });

            if (count > 0) {
                actionRows.push(actionRow);
            }

            await interaction.reply({
                content: 'Välj vilka arbetsgrupper som ska ha behörighet att använda "Skapa signup" funktionen:',
                components: actionRows,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // toggle_signup-creation_* buttons
        if (customId.startsWith('toggle_signup-creation_')) {
            const allowedRoleIds = [role_moderator, role_discordgruppen];
            const member = interaction.member;
            const guild = interaction.guild;
            const isOwner = member.id === guild?.ownerId;
            const hasRole = member.roles.cache.some(role => allowedRoleIds.includes(role.id));
            if (!isOwner && !hasRole) return interaction.reply({ content: 'Du har inte behörighet att använda denna funktion.', flags: MessageFlags.Ephemeral });

            const roleId = customId.split('_')[2];
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                return interaction.reply({ content: 'Rollen kunde inte hittas.', flags: MessageFlags.Ephemeral });
            }

            const currentPermissions = store.getPermissionSettings()['signup-creation'] || [];
            const isCurrentlyAllowed = currentPermissions.includes(roleId);

            const permissionSettings = store.getPermissionSettings();
            if (isCurrentlyAllowed) {
                permissionSettings['signup-creation'] = currentPermissions.filter(id => id !== roleId);
            } else {
                permissionSettings['signup-creation'] = [...currentPermissions, roleId];
            }
            store.setPermissionSettings(permissionSettings);

            try {
                await savePermissions();
            } catch (error) {
                logActivity(`Error saving permissions: ${error.message}`);
                return interaction.reply({ content: 'Ett fel uppstod vid sparande av behörigheter.', flags: MessageFlags.Ephemeral });
            }

            const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));

            let actionRows = [];
            let actionRow = new ActionRowBuilder();
            let count = 0;

            roles.each((role) => {
                if (count === 5) {
                    actionRows.push(actionRow);
                    actionRow = new ActionRowBuilder();
                    count = 0;
                }

                const isAllowed = store.getPermissionSettings()['signup-creation'].includes(role.id);
                const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
                const button = new ButtonBuilder()
                    .setCustomId(`toggle_signup-creation_${role.id}`)
                    .setLabel(roleName)
                    .setStyle(isAllowed ? ButtonStyle.Success : ButtonStyle.Danger);

                actionRow.addComponents(button);
                count++;
            });

            if (count > 0) {
                actionRows.push(actionRow);
            }

            await interaction.update({
                content: 'Välj vilka arbetsgrupper som ska ha behörighet att använda "Skapa signup" funktionen:',
                components: actionRows
            });
            return;
        }

        // addWorkgroup button
        if (customId === 'addWorkgroup') {
            const modal = new ModalBuilder()
                .setCustomId('modal_addWorkgroup')
                .setTitle('Lägg till arbetsgrupp');

            const nameInput = new TextInputBuilder()
                .setCustomId('workgroupNameInput')
                .setLabel("Namn på arbetsgruppen")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(50)
                .setMinLength(1)
                .setRequired(true);

            const createChannelInput = new TextInputBuilder()
                .setCustomId('createChannelInput')
                .setLabel("Skapa kanal för arbetsgruppen? (ja/nej)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ja')
                .setValue('ja')
                .setMaxLength(3)
                .setMinLength(2)
                .setRequired(true);

            const actionRow1 = new ActionRowBuilder().addComponents(nameInput);
            const actionRow2 = new ActionRowBuilder().addComponents(createChannelInput);

            modal.addComponents(actionRow1, actionRow2);

            await interaction.showModal(modal);
            return;
        }

        // editWorkgroup (list) button
        if (customId === 'editWorkgroup') {
            const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));

            let actionRows = [];
            let actionRow = new ActionRowBuilder();
            let count = 0;

            roles.each((role) => {
                if (count === 5) {
                    actionRows.push(actionRow);
                    actionRow = new ActionRowBuilder();
                    count = 0;
                }

                const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
                const button = new ButtonBuilder()
                    .setCustomId(`editWorkgroup-${role.id}`)
                    .setLabel(roleName)
                    .setStyle(ButtonStyle.Secondary);

                actionRow.addComponents(button);
                count++;
            });

            if (count > 0) {
                actionRows.push(actionRow);
            }

            await interaction.reply({
                content: `**Redigera arbetsgrupp**:`,
                components: actionRows,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // removeWorkgroup (list) button
        if (customId === 'removeWorkgroup') {
            const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));

            let actionRows = [];
            let actionRow = new ActionRowBuilder();
            let count = 0;

            roles.each((role) => {
                if (count === 5) {
                    actionRows.push(actionRow);
                    actionRow = new ActionRowBuilder();
                    count = 0;
                }

                const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
                const button = new ButtonBuilder()
                    .setCustomId(`removeWorkgroup-${role.id}`)
                    .setLabel(roleName)
                    .setStyle(ButtonStyle.Danger);

                actionRow.addComponents(button);
                count++;
            });

            if (count > 0) {
                actionRows.push(actionRow);
            }

            await interaction.reply({
                content: `**Ta bort arbetsgrupp**:`,
                components: actionRows,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // editWorkgroup-<roleId> button
        if (customId.startsWith('editWorkgroup-') && customId !== 'editWorkgroup') {
            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                await interaction.reply({
                    content: 'Arbetsgruppen kunde inte hittas.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`modal_editWorkgroup-${roleId}`)
                .setTitle('Redigera arbetsgrupp');

            const nameInput = new TextInputBuilder()
                .setCustomId('editWorkgroupNameInput')
                .setLabel("Nytt namn på arbetsgruppen")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(50)
                .setMinLength(1)
                .setRequired(true)
                .setValue(role.name);

            const actionRow = new ActionRowBuilder().addComponents(nameInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
            return;
        }

        // removeWorkgroup-<roleId> button
        if (customId.startsWith('removeWorkgroup-') && customId !== 'removeWorkgroup') {
            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                await interaction.reply({
                    content: 'Arbetsgruppen kunde inte hittas.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const confirmButton = new ButtonBuilder()
                .setCustomId(`confirmRemove-${roleId}`)
                .setLabel('Radera arbetsgrupp')
                .setStyle(ButtonStyle.Secondary);

            const actionRow = new ActionRowBuilder().addComponents(confirmButton);

            await interaction.reply({
                content: `Detta kommer ta bort arbetsgruppen **${role.name}** och radera tillhörande kanal.\nHandlingen går **inte** att ångra.`,
                components: [actionRow],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // confirmRemove-<roleId> button
        if (customId.startsWith('confirmRemove-') && !customId.startsWith('confirmRemoveSection')) {
            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                await interaction.reply({
                    content: 'Arbetsgruppen kunde inte hittas.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const finalConfirmButton = new ButtonBuilder()
                .setCustomId(`finalConfirmRemove-${roleId}`)
                .setLabel('Bekräfta')
                .setStyle(ButtonStyle.Danger);

            const actionRow = new ActionRowBuilder().addComponents(finalConfirmButton);

            await interaction.update({
                content: `Är du säker på att du vill ta bort arbetsgruppen **${role.name}**?`,
                components: [actionRow]
            });
            return;
        }

        // finalConfirmRemove-<roleId> button
        if (customId.startsWith('finalConfirmRemove-') && !customId.startsWith('finalConfirmRemoveSection')) {
            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                await interaction.reply({
                    content: 'Arbetsgruppen kunde inte hittas.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            try {
                let channelRemoved = false;
                let channelName = '';

                const category = interaction.guild.channels.cache.get(cat_Arbetsgrupper);
                if (category && category.type === ChannelType.GuildCategory) {
                    const channels = category.children.cache;
                    const channelNameToFind = role.name.replace(/\s+/g, '-');

                    for (const [channelId, channel] of channels) {
                        if (channel.name === channelNameToFind) {
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
                                await channel.delete();
                                channelRemoved = true;
                                channelName = channel.name;
                            }
                            break;
                        }
                    }
                }

                await role.delete();

                let resultMessage = `**${role.name}** har tagits bort.`;
                if (channelRemoved) {
                    resultMessage += ` Kanalen **${channelName}** har också raderats.`;
                } else {
                    resultMessage += ` Ingen kanal raderades (kan ha flera roller tilldelade).`;
                }

                await interaction.update({
                    content: resultMessage,
                    components: []
                });

                logActivity(`Workgroup "${role.name}" was removed by ${getNickname(interaction)}${channelRemoved ? ' with channel' : ''}`);

            } catch (error) {
                await interaction.update({
                    content: `Fel uppstod vid borttagning: ${error.message}`,
                    components: []
                });
                logActivity(`Error removing workgroup: ${error.message}`);
            }
            return;
        }

        // addSection button
        if (customId === 'addSection') {
            const modal = new ModalBuilder()
                .setCustomId('modal_addSection')
                .setTitle('Lägg till sektion');

            const nameInput = new TextInputBuilder()
                .setCustomId('sectionNameInput')
                .setLabel("Namn på sektionen")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(50)
                .setMinLength(1)
                .setRequired(true);

            const createChannelInput = new TextInputBuilder()
                .setCustomId('createSectionChannelInput')
                .setLabel("Skapa kanal för sektionen? (ja/nej)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('ja')
                .setValue('ja')
                .setMaxLength(3)
                .setMinLength(2)
                .setRequired(true);

            const actionRow1 = new ActionRowBuilder().addComponents(nameInput);
            const actionRow2 = new ActionRowBuilder().addComponents(createChannelInput);

            modal.addComponents(actionRow1, actionRow2);

            await interaction.showModal(modal);
            return;
        }

        // editSection (list) button
        if (customId === 'editSection') {
            const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));

            let actionRows = [];
            let actionRow = new ActionRowBuilder();
            let count = 0;

            roles.each((role) => {
                if (count === 5) {
                    actionRows.push(actionRow);
                    actionRow = new ActionRowBuilder();
                    count = 0;
                }

                const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
                const button = new ButtonBuilder()
                    .setCustomId(`editSection-${role.id}`)
                    .setLabel(roleName)
                    .setStyle(ButtonStyle.Secondary);

                actionRow.addComponents(button);
                count++;
            });

            if (count > 0) {
                actionRows.push(actionRow);
            }

            await interaction.reply({
                content: `**Redigera sektion**:`,
                components: actionRows,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // removeSection (list) button
        if (customId === 'removeSection') {
            const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));

            let actionRows = [];
            let actionRow = new ActionRowBuilder();
            let count = 0;

            roles.each((role) => {
                if (count === 5) {
                    actionRows.push(actionRow);
                    actionRow = new ActionRowBuilder();
                    count = 0;
                }

                const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
                const button = new ButtonBuilder()
                    .setCustomId(`removeSection-${role.id}`)
                    .setLabel(roleName)
                    .setStyle(ButtonStyle.Secondary);

                actionRow.addComponents(button);
                count++;
            });

            if (count > 0) {
                actionRows.push(actionRow);
            }

            await interaction.reply({
                content: `**Ta bort sektion**:`,
                components: actionRows,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // editSection-<roleId> button
        if (customId.startsWith('editSection-') && customId !== 'editSection') {
            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                await interaction.reply({
                    content: 'Sektionen kunde inte hittas.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`modal_editSection-${roleId}`)
                .setTitle('Redigera sektion');

            const nameInput = new TextInputBuilder()
                .setCustomId('editSectionNameInput')
                .setLabel("Nytt namn på sektionen")
                .setStyle(TextInputStyle.Short)
                .setMaxLength(50)
                .setMinLength(1)
                .setRequired(true)
                .setValue(role.name);

            const actionRow = new ActionRowBuilder().addComponents(nameInput);
            modal.addComponents(actionRow);

            await interaction.showModal(modal);
            return;
        }

        // removeSection-<roleId> button
        if (customId.startsWith('removeSection-') && customId !== 'removeSection') {
            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                await interaction.reply({
                    content: 'Sektionen kunde inte hittas.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const confirmButton = new ButtonBuilder()
                .setCustomId(`confirmRemoveSection-${roleId}`)
                .setLabel('Radera sektionen')
                .setStyle(ButtonStyle.Secondary);

            const actionRow = new ActionRowBuilder().addComponents(confirmButton);

            await interaction.reply({
                content: `Detta kommer ta bort sektionen **${role.name}** och radera tillhörande kanal.\nHandlingen går **inte** att ångra.`,
                components: [actionRow],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // confirmRemoveSection-<roleId> button
        if (customId.startsWith('confirmRemoveSection-')) {
            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                await interaction.reply({
                    content: 'Sektionen kunde inte hittas.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const finalConfirmButton = new ButtonBuilder()
                .setCustomId(`finalConfirmRemoveSection-${roleId}`)
                .setLabel('Bekräfta')
                .setStyle(ButtonStyle.Danger);

            const actionRow = new ActionRowBuilder().addComponents(finalConfirmButton);

            await interaction.update({
                content: `Är du säker på att du vill ta bort sektionen **${role.name}**?`,
                components: [actionRow]
            });
            return;
        }

        // finalConfirmRemoveSection-<roleId> button
        if (customId.startsWith('finalConfirmRemoveSection-')) {
            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            if (!role) {
                await interaction.reply({
                    content: 'Sektionen kunde inte hittas.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            try {
                let channelRemoved = false;
                let channelName = '';

                const category = interaction.guild.channels.cache.get(cat_Sektioner);
                if (category && category.type === ChannelType.GuildCategory) {
                    const channels = category.children.cache;
                    const channelNameToFind = role.name.replace(/\s+/g, '-');

                    for (const [channelId, channel] of channels) {
                        if (channel.name === channelNameToFind) {
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
                                await channel.delete();
                                channelRemoved = true;
                                channelName = channel.name;
                            }
                            break;
                        }
                    }
                }

                await role.delete();

                let resultMessage = `**${role.name}** har tagits bort.`;
                if (channelRemoved) {
                    resultMessage += ` Kanalen **${channelName}** har också raderats.`;
                } else {
                    resultMessage += ` Ingen kanal raderades (kan ha flera roller tilldelade).`;
                }

                await interaction.update({
                    content: resultMessage,
                    components: []
                });

                logActivity(`Section "${role.name}" was removed by ${getNickname(interaction)}${channelRemoved ? ' with channel' : ''}`);

            } catch (error) {
                await interaction.update({
                    content: `Fel uppstod vid borttagning: ${error.message}`,
                    components: []
                });
                logActivity(`Error removing section: ${error.message}`);
            }
            return;
        }
    }
};
