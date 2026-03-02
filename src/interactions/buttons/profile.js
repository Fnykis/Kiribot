const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const client = require('../../core/client');
const logActivity = require('../../core/logger');
const { ch_YourProfile, ch_ContactInstrument, hex_instr, hex_arbet } = require('../../core/constants');
const store = require('../../state/store');
const { sendInstrumentNotification, sendWorkgroupNotification } = require('../../features/profile');
const { checkRoles } = require('../../features/lists');
const { updateDetails } = require('../../features/details');
const { verktygSignup } = require('../../features/signup');
const { getNickname } = require('../../utils/interactionUtils');

module.exports = {
    matches(customId) {
        return (
            customId === 'namn' ||
            customId === 'status' ||
            customId.startsWith('roleStatus-') ||
            customId === 'instrument' ||
            customId.startsWith('roleInstrument-') ||
            customId === 'arbetsgrupp' ||
            customId.startsWith('roleArbetsgrupp-') ||
            customId === 'detaljer' ||
            customId === 'visaprofil' ||
            (() => {
                const sanitizedFields = store.getRequiredFields().map(field =>
                    field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o")
                );
                return sanitizedFields.includes(customId) && customId !== 'nyckel';
            })()
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        // namn button
        if (customId === 'namn') {
            const modal = new ModalBuilder()
                .setCustomId('modal_namn')
                .setTitle('Visningsnamn');

            const nameInput = new TextInputBuilder()
                .setCustomId('nameInput')
                .setLabel("Förnamn med första initialen av efternamnet")
                .setPlaceholder('Homero C')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(20)
                .setMinLength(1)
                .setRequired(true);

            const actionRow = new ActionRowBuilder().addComponents(nameInput);
            modal.addComponents(actionRow);
            await interaction.showModal(modal);
            return;
        }

        // status button
        if (customId === 'status') {
            const activeRole = interaction.guild.roles.cache.find(role => role.name === 'aktiv');
            const inactiveRole = interaction.guild.roles.cache.find(role => role.name === 'inaktiv');

            const activeButton = new ButtonBuilder()
                .setCustomId(`roleStatus-${activeRole.id}`)
                .setLabel('Aktiv')
                .setStyle(interaction.member.roles.cache.has(activeRole.id) ? 'Primary' : 'Secondary')
                .setDisabled(interaction.member.roles.cache.has(activeRole.id));

            const inactiveButton = new ButtonBuilder()
                .setCustomId(`roleStatus-${inactiveRole.id}`)
                .setLabel('Inaktiv')
                .setStyle(interaction.member.roles.cache.has(inactiveRole.id) ? 'Primary' : 'Secondary')
                .setDisabled(interaction.member.roles.cache.has(inactiveRole.id));

            const actionRow = new ActionRowBuilder()
                .addComponents(activeButton, inactiveButton);

            await interaction.reply({ content: 'Är du aktiv i föreningen just nu?', components: [actionRow], flags: MessageFlags.Ephemeral });
            return;
        }

        // roleStatus-* assignment
        if (customId.startsWith('roleStatus-')) {
            const activeRole = interaction.guild.roles.cache.find(role => role.name === 'aktiv');
            const inactiveRole = interaction.guild.roles.cache.find(role => role.name === 'inaktiv');

            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);

            try {
                if (role.name === 'aktiv' || role.name === 'inaktiv') {
                    const otherRole = role.name === 'aktiv' ? interaction.guild.roles.cache.find(r => r.name === 'inaktiv') : interaction.guild.roles.cache.find(r => r.name === 'aktiv');

                    if (interaction.member.roles.cache.has(role.id)) {
                        await interaction.member.roles.remove(role.id);
                    } else {
                        await interaction.member.roles.add(role.id);
                        if (interaction.member.roles.cache.has(otherRole.id)) {
                            await interaction.member.roles.remove(otherRole.id);
                        }
                    }
                }

                const activeButton = new ButtonBuilder()
                    .setCustomId(`roleStatus-${activeRole.id}`)
                    .setLabel('Aktiv')
                    .setStyle(interaction.member.roles.cache.has(activeRole.id) ? 'Primary' : 'Secondary')
                    .setDisabled(interaction.member.roles.cache.has(activeRole.id));

                const inactiveButton = new ButtonBuilder()
                    .setCustomId(`roleStatus-${inactiveRole.id}`)
                    .setLabel('Inaktiv')
                    .setStyle(interaction.member.roles.cache.has(inactiveRole.id) ? 'Primary' : 'Secondary')
                    .setDisabled(interaction.member.roles.cache.has(inactiveRole.id));

                const actionRow = new ActionRowBuilder()
                    .addComponents(activeButton, inactiveButton);

                await interaction.update({ content: 'Är du aktiv i föreningen just nu?', components: [actionRow] });

                checkRoles();
                updateDetails().catch(err => logActivity(`Error in updateDetails (from role status update): ${err.message}`));
                verktygSignup();
                logActivity(getNickname(interaction) + " updated their status to " + role.name);

            } catch (error) {
                console.error('Error while assigning role. ', error);
            }
            return;
        }

        // instrument button
        if (customId === 'instrument') {
            let currentChannel;

            if (interaction.channelId === ch_ContactInstrument) {
                currentChannel = 'contactGroup';
            } else if (interaction.channelId === ch_YourProfile) {
                currentChannel = 'roleInstrument';
            } else {
                return;
            }

            const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));

            let actionRows = [];
            let actionRow = new ActionRowBuilder();
            let count = 0;

            roles.each((role, index) => {
                if (count === 5) {
                    actionRows.push(actionRow);
                    actionRow = new ActionRowBuilder();
                    count = 0;
                }

                const hasRole = interaction.member.roles.cache.has(role.id);
                const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
                const button = new ButtonBuilder()
                    .setCustomId(`${currentChannel}-${role.id}`)
                    .setLabel(roleName)
                    .setStyle(hasRole ? 'Primary' : 'Secondary');

                actionRow.addComponents(button);
                count++;
            });

            if (count > 0) {
                actionRows.push(actionRow);
            }

            await interaction.reply({ content: 'Välj instrument:', components: actionRows, flags: MessageFlags.Ephemeral });
            return;
        }

        // roleInstrument-* assignment
        if (customId.startsWith('roleInstrument-')) {
            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);
            let rmOradd = "";

            try {
                if (interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.remove(role.id);
                    rmOradd = " left ";
                    await sendInstrumentNotification(role, interaction, 'leave');
                } else {
                    await interaction.member.roles.add(role.id);
                    rmOradd = " joined ";
                    await sendInstrumentNotification(role, interaction, 'join');
                }

                const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));

                let actionRows = [];
                let actionRow = new ActionRowBuilder();
                let count = 0;

                roles.each((role, index) => {
                    if (count === 5) {
                        actionRows.push(actionRow);
                        actionRow = new ActionRowBuilder();
                        count = 0;
                    }

                    const hasRole = interaction.member.roles.cache.has(role.id);
                    const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
                    const button = new ButtonBuilder()
                        .setCustomId(`roleInstrument-${role.id}`)
                        .setLabel(roleName)
                        .setStyle(hasRole ? 'Primary' : 'Secondary');

                    actionRow.addComponents(button);
                    count++;
                });

                if (count > 0) {
                    actionRows.push(actionRow);
                }

                await interaction.update({ content: 'Välj instrument:', components: actionRows });

                checkRoles();
                verktygSignup();
                logActivity(getNickname(interaction) + rmOradd + "the instrument " + role.name);

            } catch (error) {
                console.error('Error while assigning role. ', error);
            }
            return;
        }

        // arbetsgrupp button
        if (customId === 'arbetsgrupp') {
            let currentChannel;

            if (interaction.channelId === require('../../core/constants').ch_ContactWorkgroup) {
                currentChannel = 'contactGroup';
            } else if (interaction.channelId === ch_YourProfile) {
                currentChannel = 'roleArbetsgrupp';
            } else {
                return;
            }

            const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));

            let actionRows = [];
            let actionRow = new ActionRowBuilder();
            let count = 0;

            roles.each((role, index) => {
                if (count === 5) {
                    actionRows.push(actionRow);
                    actionRow = new ActionRowBuilder();
                    count = 0;
                }

                const hasRole = interaction.member.roles.cache.has(role.id);
                const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
                const button = new ButtonBuilder()
                    .setCustomId(`${currentChannel}-${role.id}`)
                    .setLabel(roleName)
                    .setStyle(hasRole ? 'Primary' : 'Secondary');

                actionRow.addComponents(button);
                count++;
            });

            if (count > 0) {
                actionRows.push(actionRow);
            }

            await interaction.reply({ content: 'Välj arbetsgrupp:', components: actionRows, flags: MessageFlags.Ephemeral });
            return;
        }

        // roleArbetsgrupp-* assignment
        if (customId.startsWith('roleArbetsgrupp-')) {
            const roleId = customId.split('-')[1];
            const role = interaction.guild.roles.cache.get(roleId);
            let rmOradd = "";

            try {
                if (interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.remove(role.id);
                    rmOradd = " left ";
                    await sendWorkgroupNotification(role, interaction, 'leave');
                } else {
                    await interaction.member.roles.add(role.id);
                    rmOradd = " joined ";
                    await sendWorkgroupNotification(role, interaction, 'join');
                }

                const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));

                let actionRows = [];
                let actionRow = new ActionRowBuilder();
                let count = 0;

                roles.each((role, index) => {
                    if (count === 5) {
                        actionRows.push(actionRow);
                        actionRow = new ActionRowBuilder();
                        count = 0;
                    }

                    const hasRole = interaction.member.roles.cache.has(role.id);
                    const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
                    const button = new ButtonBuilder()
                        .setCustomId(`roleArbetsgrupp-${role.id}`)
                        .setLabel(roleName)
                        .setStyle(hasRole ? 'Primary' : 'Secondary');

                    actionRow.addComponents(button);
                    count++;
                });

                if (count > 0) {
                    actionRows.push(actionRow);
                }

                await interaction.update({ content: 'Välj arbetsgrupp:', components: actionRows });
                checkRoles();
                verktygSignup();

                logActivity(getNickname(interaction) + rmOradd + "the workgroup " + role.name);

            } catch (error) {
                console.error('Error while assigning role. ', error);
            }
            return;
        }

        // detaljer button
        if (customId === 'detaljer') {
            const detailsFilePath = 'src/data/detailsList.json';
            let detailsData;
            if (fs.existsSync(detailsFilePath)) {
                detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
            } else {
                await interaction.reply({ content: `Efterfrågan misslyckades.`, flags: MessageFlags.Ephemeral });
                logActivity(`${interaction.member.user.username} failed to update details - file not found`);
                return;
            }

            const userId = interaction.member.user.id;
            let userDetails = {};

            ['aktiv', 'inaktiv'].forEach(status => {
                const user = detailsData[status].find(user => user.id === userId);
                if (user) userDetails = user;
            });

            const modal = new ModalBuilder()
                .setCustomId('modal_detaljer')
                .setTitle('Detaljer');

            const requiredFields = store.getRequiredFields();
            const fieldsForModal = requiredFields.filter(field => field !== 'nyckel');

            const actionRows = fieldsForModal.map(field => {
                const sanitizedField = field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
                const inputValue = userDetails[sanitizedField] && userDetails[sanitizedField] !== '-' ? userDetails[sanitizedField] : '';
                const textInput = new TextInputBuilder()
                    .setCustomId(sanitizedField)
                    .setLabel(field)
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(100)
                    .setRequired(true)
                    .setValue(inputValue);
                return new ActionRowBuilder().addComponents(textInput);
            });

            modal.addComponents(...actionRows);
            await interaction.showModal(modal);
            return;
        }

        // visaprofil button
        if (customId === 'visaprofil') {
            const activeRole = interaction.guild.roles.cache.find(role => role.name === 'aktiv');
            const inactiveRole = interaction.guild.roles.cache.find(role => role.name === 'inaktiv');
            const instruments = interaction.guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));
            const workgroups = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));

            const member = interaction.member;

            let memberStatus = 'Inget angivet';
            if (member.roles.cache.has(activeRole.id)) {
                memberStatus = 'Aktiv';
            } else if (member.roles.cache.has(inactiveRole.id)) {
                memberStatus = 'Inaktiv';
            }

            function capitalizeFirstLetter(string) {
                return string.charAt(0).toUpperCase() + string.slice(1);
            }

            const memberInstruments = instruments
                .filter(role => member.roles.cache.has(role.id))
                .map(role => capitalizeFirstLetter(role.name));

            const memberWorkgroups = workgroups
                .filter(role => member.roles.cache.has(role.id))
                .map(role => capitalizeFirstLetter(role.name));

            const detailsFilePath = 'src/data/detailsList.json';
            let detailsData;
            const requiredFields = store.getRequiredFields();
            if (fs.existsSync(detailsFilePath)) {
                detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
                const userDetails = [...detailsData.aktiv, ...detailsData.inaktiv].find(user => user.id === member.id);

                if (userDetails) {
                    const userDetailEntries = requiredFields
                        .map(field => {
                            const sanitizedField = field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
                            const value = userDetails[sanitizedField] || '-';
                            return `**${field.charAt(0).toUpperCase() + field.slice(1)}:** ${value}`;
                        })
                        .join('\n');

                    await interaction.reply({
                        content: `**Namn:** ${member.displayName}\n` +
                            `**Status:** ${memberStatus}\n` +
                            `**Instrument:** ${memberInstruments.length ? memberInstruments.join(', ') : '-' }\n` +
                            `**Arbetsgrupper:** ${memberWorkgroups.length ? memberWorkgroups.join(', ') : '-' }` +
                            `${userDetailEntries ? '\n' + userDetailEntries : ''}`,
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    await interaction.reply({
                        content: `**Namn:** ${member.displayName}\n` +
                            `**Status:** ${memberStatus}\n` +
                            `**Instrument:** ${memberInstruments.length ? memberInstruments.join(', ') : '-' }\n` +
                            `**Arbetsgrupper:** ${memberWorkgroups.length ? memberWorkgroups.join(', ') : '-' }`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            } else {
                await interaction.reply({
                    content: `**Namn:** ${member.displayName}\n` +
                        `**Status:** ${memberStatus}\n` +
                        `**Instrument:** ${memberInstruments.length ? memberInstruments.join(', ') : '-' }\n` +
                        `**Arbetsgrupper:** ${memberWorkgroups.length ? memberWorkgroups.join(', ') : '-' }`,
                    flags: MessageFlags.Ephemeral
                });
            }
            return;
        }

        // Dynamic details field buttons (requiredFields-based)
        const requiredFields = store.getRequiredFields();
        const sanitizedFields = requiredFields.map(field =>
            field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o")
        );

        if (customId === 'nyckel') return;

        if (!sanitizedFields.includes(customId)) return;

        const selectedFieldIndex = sanitizedFields.indexOf(customId);
        const selectedField = requiredFields[selectedFieldIndex];
        const displayField = selectedField.charAt(0).toUpperCase() + selectedField.slice(1);

        let message = `## ${displayField}:\n`;

        const detailsFilePath = 'src/data/detailsList.json';
        if (!fs.existsSync(detailsFilePath)) {
            await interaction.reply({ content: 'No user details file available.', flags: MessageFlags.Ephemeral });
            return;
        }

        const detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
        let aktivUsers = detailsData.aktiv;

        aktivUsers.sort((a, b) => {
            const customOrder = 'abcdefghijklmnopqrstuvwxyzåäö';
            const nameA = a.namn.toLowerCase();
            const nameB = b.namn.toLowerCase();

            for (let i = 0; i < Math.min(nameA.length, nameB.length); i++) {
                const charA = customOrder.indexOf(nameA[i]);
                const charB = customOrder.indexOf(nameB[i]);

                if (charA !== charB) {
                    return charA - charB;
                }
            }
            return nameA.length - nameB.length;
        });

        aktivUsers.forEach(user => {
            const sanitizedKey = customId;
            message += `${user.namn}: **${user[sanitizedKey]}**\n`;
        });

        const msgLength = message.length;
        if (msgLength > 2000) {
            message = message.slice(0, 1952) + "\n\nHela listan kan inte visas - kontakta admin.";
            logActivity(`Warning: Truncated ${displayField} message from ${msgLength} to 2000 characters`);
        } else if (msgLength > 1900) {
            logActivity(`Warning: The total character count of ${displayField} is ${msgLength}. Maximum is 2000 characters.`);
        }

        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
};
