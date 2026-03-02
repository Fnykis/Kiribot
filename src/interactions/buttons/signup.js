const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockFile = require('lockfile');
const { ChannelType } = require('discord.js');
const client = require('../../core/client');
const logActivity = require('../../core/logger');
const { ch_YourProfile, ch_Signup, ch_Verktyg_Signup, ch_PrivataMeddelanden, dir_EventsActive, dir_EventsArchived, guildId } = require('../../core/constants');
const store = require('../../state/store');
const { parseEventDate } = require('../../utils/dateUtils');
const { makeFileNameFriendly } = require('../../utils/stringUtils');
const { getNickname } = require('../../utils/interactionUtils');
const { postCalendar } = require('../../features/calendar');
const { verktygSignup, listaSvar, listaInstrument, listaDetaljer, cleanupOutdatedSignups } = require('../../features/signup');
const { eventThread, eventThreadUpdate } = require('../../features/eventThread');

module.exports = {
    matches(customId) {
        return (
            customId === 'ja' ||
            customId === 'nej' ||
            customId === 'kanske' ||
            customId === 'btn_signupverktyg' ||
            customId === 'btn_newSignup' ||
            customId === 'btn_signupHowTo' ||
            customId.startsWith('redigera_') ||
            customId.startsWith('avboj_') ||
            customId.startsWith('oppna_') ||
            customId.startsWith('tabort_') ||
            customId.startsWith('listaInstrument_') ||
            customId.startsWith('sendReminder_') ||
            customId.startsWith('reminder_')
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        // ja/nej/kanske buttons
        if (customId === 'ja' || customId === 'nej' || customId === 'kanske') {
            try {
                let buttonId = customId;
                let userId = interaction.user.id;
                let guildIdLocal = interaction.guild.id;
                let messageId = interaction.message.id;

                let guild = client.guilds.cache.get(guildIdLocal);
                let member = guild.members.cache.get(userId);
                let roles = member.roles.cache.filter(role => role.hexColor === '#e91e63');

                if (roles.size === 0) {
                    await interaction.reply({ content: `Du måste ha ett instrument knutet till din profil för att kunna svara. ${interaction.guild.channels.cache.get(ch_YourProfile).toString()}`, flags: MessageFlags.Ephemeral });
                    return;
                }
                if (!member.nickname) {
                    await interaction.reply({ content: `Du måste ha valt ett namn för att kunna svara. ${interaction.guild.channels.cache.get(ch_YourProfile).toString()}`, flags: MessageFlags.Ephemeral });
                    return;
                }

                const modal = new ModalBuilder()
                    .setCustomId('modal_note')
                    .setTitle('Tillägg');

                const noteInput = new TextInputBuilder()
                    .setCustomId('noteInput')
                    .setLabel("Skriv tillägg, annars lämna blankt")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                const actionRow = new ActionRowBuilder().addComponents(noteInput);
                modal.addComponents(actionRow);

                await interaction.showModal(modal);

                let modalNote = "";
                const submitted = await interaction.awaitModalSubmit({
                    time: 60000,
                    filter: i => i.user.id === interaction.user.id,
                }).catch(error => {
                    console.error(error);
                    return null;
                });

                if (submitted) {
                    modalNote = submitted.fields.getTextInputValue('noteInput');
                } else {
                    modalNote = "";
                }

                let message = await interaction.channel.messages.fetch(messageId);
                let embed = message.embeds[0];
                let id = embed.footer.text.split(': ')[1];

                let files = fs.readdirSync(dir_EventsActive);
                let fileName = files.find(file => file.endsWith('_' + id + '.json'));
                if (!fileName) return;

                lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
                    if (err) {
                        console.error('Failed to acquire lock:', err);
                        return;
                    }
                    let data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));

                    for (let role in data.signups) {
                        data.signups[role] = data.signups[role].filter(entry => entry.name !== member.displayName);
                    }

                    roles.forEach((role) => {
                        if (data.signups[role.name]) {
                            data.signups[role.name].push({
                                "name": member.displayName,
                                "id": member.id,
                                "response": buttonId,
                                "note": modalNote
                            });
                        }
                    });

                    fs.writeFileSync(path.join(dir_EventsActive, fileName), JSON.stringify(data));

                    eventThreadUpdate(id);

                    lockFile.unlock(`${fileName}.lock`, (err) => {
                        if (err) {
                            console.error('Failed to unlock:', err);
                        }
                    });

                    const buttonText = buttonId.charAt(0).toUpperCase() + buttonId.slice(1);
                    let replyEmoji = "";
                    switch (buttonId) {
                        case "ja": replyEmoji = client.emojis.cache.find(emoji => emoji.name === "ja"); break;
                        case "nej": replyEmoji = client.emojis.cache.find(emoji => emoji.name === "nej"); break;
                        case "kanske": replyEmoji = client.emojis.cache.find(emoji => emoji.name === "kanske"); break;
                        default: replyEmoji = ""; break;
                    }

                    if (submitted) {
                        const replyContent = `${replyEmoji} Du har meddelat **${buttonText}** på **${data.name}** som **${roles.map(obj => obj.name).join(", ")}.**\nSvara igen om du vill ändra din medverkan.`;
                        try {
                            await submitted.reply({ content: replyContent, flags: MessageFlags.Ephemeral });
                        } catch (error) {
                            if (error.code === 10062) {
                                if (submitted.replied || submitted.deferred) {
                                    try {
                                        await submitted.followUp({ content: replyContent, flags: MessageFlags.Ephemeral });
                                    } catch (followUpError) {
                                        logActivity(`Failed to send followUp message to ${member.displayName} on ${data.name} (interaction ID: ${submitted.id}, already replied: ${submitted.replied}, deferred: ${submitted.deferred}): ${followUpError.message}${followUpError.code ? ` (code: ${followUpError.code})` : ''}`);
                                    }
                                } else {
                                    logActivity(`Interaction expired for ${member.displayName} on ${data.name} (interaction ID: ${submitted.id}). Could not reply or send DM. Signup was processed successfully. Error: ${error.message}`);
                                }
                            } else {
                                logActivity(`Error replying to interaction for ${member.displayName} on ${data.name} (interaction ID: ${submitted.id}): ${error.message}${error.code ? ` (code: ${error.code})` : ''}`);
                            }
                        }
                    }
                });
            } catch (error) {
                logActivity(error);
            }
            return;
        }

        // btn_signupverktyg button
        if (customId === 'btn_signupverktyg') {
            try {
                const allowedRoleIds = store.getPermissionSettings()['signup-creation'] || [];
                const member = interaction.member;
                const guild = interaction.guild;
                const isOwner = member.id === guild?.ownerId;
                const hasRole = member.roles.cache.some(role => allowedRoleIds.includes(role.id));

                if (!isOwner && !hasRole) {
                    return interaction.reply({
                        content: 'Du har inte behörighet att använda denna funktion.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const btn_newSignup = new ButtonBuilder()
                    .setCustomId('btn_newSignup')
                    .setLabel('Skapa ny signup')
                    .setStyle(ButtonStyle.Primary);

                const row1_buttons = new ActionRowBuilder()
                    .addComponents(btn_newSignup);

                let events = [];
                try {
                    const files = fs.readdirSync(dir_EventsActive).filter(file => file.endsWith('.json'));

                    for (const file of files) {
                        const filePath = path.join(dir_EventsActive, file);
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                        events.push({
                            id: data.id,
                            name: data.name,
                            date: parseEventDate(data.date),
                            rawDate: data.date,
                            active: data.active
                        });
                    }

                    events.sort((a, b) => {
                        const da = a.date;
                        const db = b.date;

                        if (da === null && db === null) return 0;
                        if (da === null) return -1;
                        if (db === null) return 1;

                        return da - db;
                    });
                } catch (error) {
                    logActivity(`Error fetching events for dropdown: ${error}`);
                }

                const components = [row1_buttons];

                if (events.length > 0) {
                    const selectEdit = new StringSelectMenuBuilder()
                        .setCustomId('editSignupDropdown')
                        .setPlaceholder('Redigera spelning')
                        .addOptions(
                            events.slice(0, 25).map(event => {
                                const eventDateString = event.date
                                    ? event.date.toLocaleDateString('en-GB', {
                                        month: 'numeric',
                                        day: 'numeric'
                                    })
                                    : 'Ogiltigt datum';

                                return new StringSelectMenuOptionBuilder()
                                    .setLabel(event.name)
                                    .setValue(event.id)
                                    .setDescription(`${eventDateString}${event.active ? '' : ' (Avböjd)'}`);
                            })
                        );

                    const row2_dropdown = new ActionRowBuilder().addComponents(selectEdit);
                    components.push(row2_dropdown);

                    const selectReminder = new StringSelectMenuBuilder()
                        .setCustomId('reminderDropdown')
                        .setPlaceholder('Skicka påminnelse')
                        .addOptions(
                            events.slice(0, 25).map(event => {
                                const eventDateString = event.date
                                    ? event.date.toLocaleDateString('en-GB', {
                                        month: 'numeric',
                                        day: 'numeric'
                                    })
                                    : 'Ogiltigt datum';

                                return new StringSelectMenuOptionBuilder()
                                    .setLabel(event.name)
                                    .setValue(event.id)
                                    .setDescription(`${eventDateString}${event.active ? '' : ' (Avböjd)'}`);
                            })
                        );

                    const row3_dropdown = new ActionRowBuilder().addComponents(selectReminder);
                    components.push(row3_dropdown);
                }

                await interaction.reply({
                    content: 'Välj vad du vill göra:',
                    components: components,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logActivity(`Error during button interaction for user ${interaction.user.tag} (${interaction.user.id}):`, error);
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content: 'Ett fel uppstod när detta kommando skulle utföras!', flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.reply({ content: 'Ett fel uppstod när detta kommando skulle utföras!', flags: MessageFlags.Ephemeral });
                    }
                } catch (replyError) {
                    logActivity(`Failed to send error reply to user ${interaction.user.tag}:`, replyError);
                }
            }
            return;
        }

        // btn_newSignup button
        if (customId === 'btn_newSignup') {
            try {
                const modal = new ModalBuilder()
                    .setCustomId('modal_signup')
                    .setTitle('Ny signup');

                const nameInput = new TextInputBuilder()
                    .setCustomId('nameInput')
                    .setLabel("Namn på spelningen")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(50)
                    .setMinLength(1)
                    .setRequired(true);

                const dateInput = new TextInputBuilder()
                    .setCustomId('dateInput')
                    .setLabel("Startdatum")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('31/01/24')
                    .setMaxLength(50)
                    .setMinLength(1)
                    .setRequired(true);

                const timeInput = new TextInputBuilder()
                    .setCustomId('timeInput')
                    .setLabel("Starttid")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('09:00')
                    .setMaxLength(50)
                    .setMinLength(1)
                    .setRequired(false);

                const locInput = new TextInputBuilder()
                    .setCustomId('locInput')
                    .setLabel("Plats")
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(50)
                    .setMinLength(1)
                    .setRequired(true);

                const infoInput = new TextInputBuilder()
                    .setCustomId('infoInput')
                    .setLabel("Info")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMaxLength(1500)
                    .setRequired(false);

                const actionRow1 = new ActionRowBuilder().addComponents(nameInput);
                const actionRow2 = new ActionRowBuilder().addComponents(dateInput);
                const actionRow3 = new ActionRowBuilder().addComponents(timeInput);
                const actionRow4 = new ActionRowBuilder().addComponents(locInput);
                const actionRow5 = new ActionRowBuilder().addComponents(infoInput);

                modal.addComponents(actionRow1, actionRow2, actionRow3, actionRow4, actionRow5);

                await interaction.showModal(modal);
            } catch (error) {
                logActivity(`Error during button interaction for user ${interaction.user.tag} (${interaction.user.id}):`, error);
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content: 'Ett fel uppstod när detta kommando skulle utföras!', flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.reply({ content: 'Ett fel uppstod när detta kommando skulle utföras!', flags: MessageFlags.Ephemeral });
                    }
                } catch (replyError) {
                    logActivity(`Failed to send error reply to user ${interaction.user.tag}:`, replyError);
                }
            }
            return;
        }

        // btn_signupHowTo button
        if (customId === 'btn_signupHowTo') {
            try {
                const threadIdNySignup = '1452645297418145903';
                const threadIdRedigeraSignup = '1452645545825800333';

                const threadLinkNySignup = `https://discord.com/channels/${interaction.guild.id}/${threadIdNySignup}`;
                const threadLinkRedigeraSignup = `https://discord.com/channels/${interaction.guild.id}/${threadIdRedigeraSignup}`;

                const message = `# Hur gör jag?\n` +
                    `## [Ny signup](${threadLinkNySignup})\n` +
                    `## [Redigera signup](${threadLinkRedigeraSignup})`;

                await interaction.reply({
                    content: message,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logActivity(`Error during button interaction for user ${interaction.user.tag} (${interaction.user.id}):`, error);
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content: 'Ett fel uppstod när detta kommando skulle utföras!', flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.reply({ content: 'Ett fel uppstod när detta kommando skulle utföras!', flags: MessageFlags.Ephemeral });
                    }
                } catch (replyError) {
                    logActivity(`Failed to send error reply to user ${interaction.user.tag}:`, replyError);
                }
            }
            return;
        }

        // listaInstrument_* button
        if (customId.startsWith('listaInstrument_')) {
            try {
                const eventId = customId.replace('listaInstrument_', '');

                let eventName = 'Unknown Event';
                try {
                    const files = fs.readdirSync(dir_EventsActive);
                    const fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
                    if (fileName) {
                        const data = JSON.parse(fs.readFileSync(dir_EventsActive + '/' + fileName));
                        eventName = data.name;
                    }
                } catch (error) {
                    logActivity(`Error loading event data for logging: ${error.message}`);
                }

                await listaInstrument(interaction, eventId);

            } catch (error) {
                logActivity(`Error in listaInstrument button handler: ${error.message}`);
                await interaction.reply({ content: 'Ett fel uppstod när instrumentlistan skulle visas.', flags: MessageFlags.Ephemeral });
            }
            return;
        }

        // sendReminder_* button
        if (customId.startsWith('sendReminder_')) {
            try {
                const eventId = customId.split('_')[1];

                const files = fs.readdirSync(dir_EventsActive);
                const fileName = files.find(file => file.endsWith('_' + eventId + '.json'));

                if (!fileName) {
                    await interaction.reply({
                        content: 'Kunde inte hitta spelningen. Den kanske har tagits bort.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));

                const aktivRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'aktiv');
                if (!aktivRole) {
                    await interaction.reply({
                        content: 'Kunde inte hitta "aktiv" medlemmar.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const aktivMembers = aktivRole.members;

                const signedUpUserIds = new Set();
                if (data.signups) {
                    for (const instrumentGroup in data.signups) {
                        if (Array.isArray(data.signups[instrumentGroup])) {
                            data.signups[instrumentGroup].forEach(signup => {
                                if (signup.id) {
                                    signedUpUserIds.add(signup.id);
                                }
                            });
                        }
                    }
                }

                const membersToRemind = aktivMembers.filter(member =>
                    !member.user.bot &&
                    !signedUpUserIds.has(member.id)
                );

                let eventDateString = data.date || 'Okänt datum';
                if (data.time) {
                    eventDateString += ` | ${data.time}`;
                }

                const eventLink = `https://discord.com/channels/${guildId}/${ch_Signup}/${data.link}`;

                data.remindersSent = true;
                fs.writeFileSync(path.join(dir_EventsActive, fileName), JSON.stringify(data, null, 2));

                const reminderChannel = client.channels.cache.get(ch_PrivataMeddelanden);
                if (!reminderChannel) {
                    await interaction.reply({
                        content: 'Kunde inte hitta kanalen för privata meddelanden.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const mentionIds = Array.from(membersToRemind.keys());
                const mentions = mentionIds.map(id => `<@${id}>`).join(' ');

                const thread = await reminderChannel.threads.create({
                    name: `Påminnelse: ${data.name}`.slice(0, 100),
                    autoArchiveDuration: 10080,
                    type: ChannelType.PrivateThread,
                });

                for (const memberId of mentionIds) {
                    try {
                        await thread.members.add(memberId);
                    } catch (error) {
                        logActivity(`Error adding member ${memberId} to reminder thread: ${error.message}`);
                    }
                }

                const btn_ja_reminder = new ButtonBuilder()
                    .setCustomId(`reminder_ja_${eventId}`)
                    .setLabel('Ja')
                    .setStyle(ButtonStyle.Success);

                const btn_nej_reminder = new ButtonBuilder()
                    .setCustomId(`reminder_nej_${eventId}`)
                    .setLabel('Nej')
                    .setStyle(ButtonStyle.Danger);

                const btn_kanske_reminder = new ButtonBuilder()
                    .setCustomId(`reminder_kanske_${eventId}`)
                    .setLabel('Kanske')
                    .setStyle(ButtonStyle.Secondary);

                const row_reminder_buttons = new ActionRowBuilder()
                    .addComponents(btn_ja_reminder, btn_nej_reminder, btn_kanske_reminder);

                await thread.send({
                    content: `Kära Kirrisar!\n\nNi som taggats i detta meddelande har inte svarat på signupen för **${data.name}**.\nSvara så snart som möjligt, även om du inte kan delta, så att vi kan planera för spelningen!✨\n\n**Datum:** ${eventDateString}\n**Signup:** ${eventLink}\n\n-# ${mentions}`,
                    components: [row_reminder_buttons],
                    allowedMentions: { users: mentionIds }
                });

                data.remindersSent = true;
                fs.writeFileSync(path.join(dir_EventsActive, fileName), JSON.stringify(data, null, 2));

                await interaction.reply({
                    content: `Påminnelse skickad till ${membersToRemind.size} medlemmar som inte svarat på **[${data.name}]**.`,
                    flags: MessageFlags.Ephemeral
                });

                logActivity(`${interaction.user.tag} sent reminder for event: ${data.name} to ${membersToRemind.size} members`);

            } catch (error) {
                logActivity(`Error in sendReminder handler: ${error}`);
                await interaction.reply({
                    content: 'Ett fel uppstod när påminnelsen skulle skickas.',
                    flags: MessageFlags.Ephemeral
                });
            }
            return;
        }

        // reminder_ja/nej/kanske_* buttons
        if (customId.startsWith('reminder_')) {
            try {
                let buttonId = customId;
                const parts = buttonId.split('_');
                if (parts.length !== 3) return;

                const responseType = parts[1];
                const eventId = parts[2];

                if (!['ja', 'nej', 'kanske'].includes(responseType)) return;

                let userId = interaction.user.id;
                let guildIdLocal = interaction.guild.id;

                let guild = client.guilds.cache.get(guildIdLocal);
                let member = guild.members.cache.get(userId);
                let roles = member.roles.cache.filter(role => role.hexColor === '#e91e63');

                if (roles.size === 0) {
                    await interaction.reply({ content: `Du måste ha ett instrument knutet till din profil för att kunna svara. ${interaction.guild.channels.cache.get(ch_YourProfile).toString()}`, flags: MessageFlags.Ephemeral });
                    return;
                }
                if (!member.nickname) {
                    await interaction.reply({ content: `Du måste ha valt ett namn för att kunna svara. ${interaction.guild.channels.cache.get(ch_YourProfile).toString()}`, flags: MessageFlags.Ephemeral });
                    return;
                }

                let files = fs.readdirSync(dir_EventsActive);
                let fileName = files.find(file => file.endsWith('_' + eventId + '.json'));

                let isArchived = false;
                if (!fileName) {
                    if (fs.existsSync(dir_EventsArchived)) {
                        files = fs.readdirSync(dir_EventsArchived);
                        fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
                        isArchived = !!fileName;
                    }
                }

                if (!fileName) {
                    await interaction.reply({
                        content: 'Spelningen är tyvärr inte längre aktuell.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const filePath = isArchived ? path.join(dir_EventsArchived, fileName) : path.join(dir_EventsActive, fileName);
                let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                if (isArchived || data.active === false) {
                    await interaction.reply({
                        content: 'Spelningen är tyvärr inte längre aktuell.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
                    if (err) {
                        console.error('Failed to acquire lock:', err);
                        return;
                    }

                    let data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));

                    for (let role in data.signups) {
                        data.signups[role] = data.signups[role].filter(entry => entry.name !== member.displayName);
                    }

                    roles.forEach((role) => {
                        if (data.signups[role.name]) {
                            data.signups[role.name].push({
                                "name": member.displayName,
                                "id": member.id,
                                "response": responseType,
                                "note": ""
                            });
                        }
                    });

                    fs.writeFileSync(path.join(dir_EventsActive, fileName), JSON.stringify(data));

                    eventThreadUpdate(eventId);

                    lockFile.unlock(`${fileName}.lock`, (err) => {
                        if (err) {
                            console.error('Failed to unlock:', err);
                        }
                    });

                    const responseText = responseType.charAt(0).toUpperCase() + responseType.slice(1);

                    await interaction.reply({
                        content: `Tack! Du har svarat **${responseText}** på signupen!`,
                        flags: MessageFlags.Ephemeral
                    });
                });
            } catch (error) {
                logActivity(`Error in reminder button handler: ${error}`);
                try {
                    await interaction.reply({
                        content: 'Ett fel uppstod när ditt svar skulle sparas. Rapportera gärna detta till admin.',
                        flags: MessageFlags.Ephemeral
                    });
                } catch (replyError) {
                    logActivity(`Error replying to reminder button interaction: ${replyError}`);
                }
            }
            return;
        }

        // redigera_*, avboj_*, oppna_*, tabort_* buttons
        const editingButtons = ['redigera', 'avboj', 'oppna', 'tabort', 'tryckigen'];
        let parts = customId.split('_');
        let buttonId = parts[0];

        if (!editingButtons.includes(buttonId)) return;

        try {
            let messageId = parts[1];

            let deleted = false;
            let deleting = false;
            let modal;

            const signupChannel = client.channels.cache.get(ch_Signup);
            if (!signupChannel) {
                await interaction.reply({
                    content: 'Kunde inte hitta signup-kanalen.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            let message = await signupChannel.messages.fetch(messageId);

            if (!interaction.message.content.includes('Ändra signupen')) return;

            let embed = message.embeds[0];
            let id = embed.footer.text.split(': ')[1];

            let files = fs.readdirSync(dir_EventsActive);
            let fileName = files.find(file => file.endsWith('_' + id + '.json'));
            if (!fileName) return;
            let data = JSON.parse(fs.readFileSync(dir_EventsActive + '/' + fileName));

            switch (buttonId) {
                case 'redigera':
                    try {
                        let dateInputValue = "";
                        let timeInputValue = "";
                        if (embed.fields[1].value.indexOf(' | ') != -1) {
                            if (embed.fields[1].value.split(' | ').length != 2) {
                                dateInputValue = embed.fields[1].value;
                                timeInputValue = "";
                            } else {
                                dateInputValue = embed.fields[1].value.split(' | ')[0];
                                timeInputValue = embed.fields[1].value.split(' | ')[1];
                            }
                        } else {
                            dateInputValue = embed.fields[1].value;
                            timeInputValue = "";
                        }

                        let modalCustomId = `modal_signupEdit_${messageId}`;
                        if (modalCustomId.length > 100) {
                            modalCustomId = modalCustomId.substring(0, 99);
                        }

                        modal = new ModalBuilder()
                            .setCustomId(modalCustomId)
                            .setTitle("Redigera signup");

                        const nameInput = new TextInputBuilder()
                            .setCustomId('nameInput')
                            .setLabel("Namn på spelningen")
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder(data.name)
                            .setValue(data.name)
                            .setMaxLength(50)
                            .setMinLength(1)
                            .setRequired(true);

                        const dateInput = new TextInputBuilder()
                            .setCustomId('dateInput')
                            .setLabel("Startdatum")
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder(dateInputValue)
                            .setValue(dateInputValue)
                            .setMaxLength(50)
                            .setRequired(true);

                        const timeInput = new TextInputBuilder()
                            .setCustomId('timeInput')
                            .setLabel("Starttid")
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder(timeInputValue)
                            .setValue(timeInputValue)
                            .setMaxLength(50)
                            .setRequired(false);

                        const locInput = new TextInputBuilder()
                            .setCustomId('locInput')
                            .setLabel("Plats")
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder(embed.fields[0].value)
                            .setValue(embed.fields[0].value)
                            .setMaxLength(50)
                            .setMinLength(1)
                            .setRequired(true);

                        const infoInput = new TextInputBuilder()
                            .setCustomId('infoInput')
                            .setLabel("Info")
                            .setStyle(TextInputStyle.Paragraph)
                            .setValue(embed.description)
                            .setMaxLength(1500)
                            .setRequired(false);

                        const actionRow1 = new ActionRowBuilder().addComponents(nameInput);
                        const actionRow2 = new ActionRowBuilder().addComponents(dateInput);
                        const actionRow3 = new ActionRowBuilder().addComponents(timeInput);
                        const actionRow4 = new ActionRowBuilder().addComponents(locInput);
                        const actionRow5 = new ActionRowBuilder().addComponents(infoInput);

                        modal.addComponents(actionRow1, actionRow2, actionRow3, actionRow4, actionRow5);

                    } catch (error) {
                        logActivity(error);
                    }
                    break;
                case 'avboj':
                    try {
                        data.active = false;
                        fs.writeFileSync(dir_EventsActive + '/' + fileName, JSON.stringify(data));

                        const avboj_newEmbed = {
                            "title": '[AVBÖJD] ~~' + embed.title + '~~',
                            "description": embed.description,
                            "color": 7419530,
                            "footer": {
                                "text": embed.footer.text
                            },
                            "fields": embed.fields
                        };

                        const avboj_btn_ja = new ButtonBuilder()
                            .setCustomId('ja')
                            .setLabel('Ja')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true);

                        const avboj_btn_nej = new ButtonBuilder()
                            .setCustomId('nej')
                            .setLabel('Nej')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true);

                        const avboj_btn_kanske = new ButtonBuilder()
                            .setCustomId('kanske')
                            .setLabel('Kanske')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true);

                        const avboj_row_buttons = new ActionRowBuilder()
                            .addComponents(avboj_btn_ja, avboj_btn_nej, avboj_btn_kanske);

                        await message.edit({ embeds: [avboj_newEmbed], components: [avboj_row_buttons] });

                        logActivity(getNickname(interaction) + " cancelled " + data.name);
                        postCalendar(true);
                        verktygSignup();

                    } catch (error) {
                        logActivity(error);
                    }
                    break;
                case 'oppna':
                    data.active = true;
                    fs.writeFileSync(dir_EventsActive + '/' + fileName, JSON.stringify(data));

                    const oppna_newEmbed = {
                        "title": embed.title.replace(/~~/g, '').replaceAll('[AVBÖJD] ', ''),
                        "description": embed.description,
                        "color": 7419530,
                        "footer": {
                            "text": embed.footer.text
                        },
                        "fields": embed.fields
                    };

                    const oppna_btn_ja = new ButtonBuilder()
                        .setCustomId('ja')
                        .setLabel('Ja')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(false);

                    const oppna_btn_nej = new ButtonBuilder()
                        .setCustomId('nej')
                        .setLabel('Nej')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(false);

                    const oppna_btn_kanske = new ButtonBuilder()
                        .setCustomId('kanske')
                        .setLabel('Kanske')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(false);

                    const oppna_row_buttons = new ActionRowBuilder()
                        .addComponents(oppna_btn_ja, oppna_btn_nej, oppna_btn_kanske);

                    await message.edit({ embeds: [oppna_newEmbed], components: [oppna_row_buttons] });

                    logActivity(getNickname(interaction) + " reopened " + data.name);
                    postCalendar(true);
                    verktygSignup();

                    break;
                case 'tabort':
                    deleting = true;
                    break;
                case 'tryckigen':
                    fs.unlinkSync(dir_EventsActive + '/' + fileName);
                    deleted = true;
                    deleting = true;
                    await message.delete();
                    logActivity(getNickname(interaction) + " deleted " + data.name);
                    postCalendar(true);
                    verktygSignup();
                    break;
            }

            if (buttonId != 'redigera') {
                const btn_redigera = new ButtonBuilder()
                    .setCustomId('redigera_' + messageId)
                    .setLabel('Redigera')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(deleted ? true : false);

                const btn_avböj = new ButtonBuilder()
                    .setCustomId(data.active ? 'avboj_' + messageId : 'oppna_' + messageId)
                    .setLabel(data.active ? 'Avböj' : 'Öppna')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(deleted ? true : false);

                const btn_tabort = new ButtonBuilder()
                    .setCustomId(deleting ? 'tryckigen_' + messageId : 'tabort_' + messageId)
                    .setLabel(deleting ? 'Tryck igen för att ta bort' : 'Ta bort')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(deleted ? true : false);

                const row_buttons = new ActionRowBuilder()
                    .addComponents(btn_redigera, btn_avböj, btn_tabort);

                const theContent = "Ändra signupen: **" + embed.title.replace(/~~/g, '').replaceAll('[AVBÖJD] ', '') + "**";
                await interaction.update({ content: deleted ? theContent + " [BORTTAGEN]" : theContent, components: [row_buttons] });
            } else {
                await interaction.showModal(modal);
            }

        } catch (error) {
            logActivity("Error when pressing editing signup button: " + error);
        }
    }
};
