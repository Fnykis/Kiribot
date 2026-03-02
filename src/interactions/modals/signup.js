const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const lockFile = require('lockfile');
const client = require('../../core/client');
const logActivity = require('../../core/logger');
const { ch_Signup, dir_EventsActive, guildId } = require('../../core/constants');
const { checkDateFormat, formatTimeInput } = require('../../utils/dateUtils');
const { makeFileNameFriendly } = require('../../utils/stringUtils');
const { getNickname } = require('../../utils/interactionUtils');
const { postCalendar } = require('../../features/calendar');
const { verktygSignup } = require('../../features/signup');
const { eventThread } = require('../../features/eventThread');

module.exports = {
    matches(customId) {
        return (
            customId === 'modal_signup' ||
            customId.startsWith('modal_signupEdit_')
        );
    },

    async execute(interaction) {
        const customId = interaction.customId;

        // modal_signup - create new signup
        if (customId === 'modal_signup') {
            try {
                const fields = interaction.fields;
                let signupName = fields.getTextInputValue('nameInput');
                let signupDate = fields.getTextInputValue('dateInput');
                let signupTime = fields.getTextInputValue('timeInput');
                let signupLoc = fields.getTextInputValue('locInput');
                let signupInfo = fields.getTextInputValue('infoInput');
                let signupId = String(Math.floor(Math.random() * (999999999 - 100000000 + 1) + 100000000));

                const btn_ja = new ButtonBuilder()
                    .setCustomId('ja')
                    .setLabel('Ja')
                    .setStyle(ButtonStyle.Success);

                const btn_nej = new ButtonBuilder()
                    .setCustomId('nej')
                    .setLabel('Nej')
                    .setStyle(ButtonStyle.Danger);

                const btn_kanske = new ButtonBuilder()
                    .setCustomId('kanske')
                    .setLabel('Kanske')
                    .setStyle(ButtonStyle.Secondary);

                const row_buttons = new ActionRowBuilder()
                    .addComponents(btn_ja, btn_nej, btn_kanske);

                let correctedDate = checkDateFormat(signupDate);
                if (correctedDate != null) {
                    signupDate = correctedDate;
                }

                let correctedTime = formatTimeInput(signupTime);
                if (correctedTime !== signupTime) {
                    signupTime = correctedTime;
                }

                let contentReply = `${interaction.user} Spelningen skapad. Se #verktyg för att se detaljerade signup-listor.`;
                if (correctedDate == null) contentReply += '\n_Om du vill att datumet ska fungera i kalendern behöver formatet se ut såhär: DD/MM/YY_';

                let signupDateAndTime = "";
                if (signupTime == "") {
                    signupDateAndTime = signupDate;
                } else {
                    signupDateAndTime = signupDate + " | " + signupTime;
                }
                const embed = {
                    "title": signupName,
                    "description": signupInfo,
                    "color": 7419530,
                    "footer": {
                        "text": "ID: " + signupId
                    },
                    "fields": [
                        {
                            "name": "Plats",
                            "value": signupLoc,
                            "inline": true
                        },
                        {
                            "name": "Datum",
                            "value": signupDateAndTime,
                            "inline": true
                        }
                    ]
                };

                let guild = client.guilds.cache.get(guildId);
                let roles = guild.roles.cache.filter(role => role.hexColor === '#e91e63').sort((a, b) => a.name.localeCompare(b.name));
                let instruments = {};
                let messageId = null;

                roles.forEach((role) => {
                    instruments[role.name] = [];
                });

                let roleId = guild.roles.cache.find(r => r.name === 'aktiv');
                let message = await client.channels.cache.get(ch_Signup).send({
                    content: `${roleId}`,
                    embeds: [embed],
                    components: [row_buttons]
                });

                messageId = message.id;

                const signupData = {
                    "name": signupName,
                    "id": signupId,
                    "date": signupDate,
                    "time": signupTime,
                    "location": signupLoc,
                    "active": true,
                    "createDriveDir": true,
                    "link": messageId,
                    "signups": instruments,
                    "information": {"text": ""}
                };
                fs.writeFileSync(dir_EventsActive + '/' + makeFileNameFriendly(signupName) + '_' + signupId + '.json', JSON.stringify(signupData));

                eventThread(signupData);

                await interaction.reply({ content: contentReply, flags: MessageFlags.Ephemeral });

                logActivity(getNickname(interaction) + " created a new signup: " + signupName);
                postCalendar(true);
                verktygSignup();

            } catch (error) {
                logActivity(`Error during modal submission for user ${interaction.user.tag} (${interaction.user.id}):`, error);
                try {
                    const replyOptions = { content: 'Ett fel uppstod när din förfrågan skulle behandlas!', flags: MessageFlags.Ephemeral };
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(replyOptions);
                    } else {
                        await interaction.reply(replyOptions);
                    }
                } catch (replyError) {
                    logActivity(`Failed to send error reply to user ${interaction.user.tag}:`, replyError);
                }
            }
            return;
        }

        // modal_signupEdit_<messageId> - edit existing signup
        if (customId.startsWith('modal_signupEdit_')) {
            let modalId = customId.substring(0, customId.lastIndexOf("_"));
            let messageId = customId.substring(customId.lastIndexOf("_") + 1, customId.length);

            if (!/^\d+$/.test(messageId)) {
                logActivity(`Invalid message ID in signup edit: ${messageId} from customId: ${customId}`);
                return;
            }

            if (modalId === 'modal_signupEdit') {

                try {
                    const signupChannel = client.channels.cache.get(ch_Signup);
                    if (!signupChannel) {
                        await interaction.reply({
                            content: 'Kunde inte hitta signup-kanalen.',
                            flags: MessageFlags.Ephemeral
                        });
                        return;
                    }

                    let message = await signupChannel.messages.fetch(messageId);
                    let id = message.embeds[0].footer.text.split(': ')[1];

                    let signupEditName = interaction.fields.getTextInputValue('nameInput');
                    let signupEditDate = interaction.fields.getTextInputValue('dateInput');
                    let signupEditTime = interaction.fields.getTextInputValue('timeInput');
                    let signupEditLoc = interaction.fields.getTextInputValue('locInput');
                    let signupEditInfo = interaction.fields.getTextInputValue('infoInput');
                    let signupEditId = id;

                    const btn_ja = new ButtonBuilder()
                        .setCustomId('ja')
                        .setLabel('Ja')
                        .setStyle(ButtonStyle.Success);

                    const btn_nej = new ButtonBuilder()
                        .setCustomId('nej')
                        .setLabel('Nej')
                        .setStyle(ButtonStyle.Danger);

                    const btn_kanske = new ButtonBuilder()
                        .setCustomId('kanske')
                        .setLabel('Kanske')
                        .setStyle(ButtonStyle.Secondary);

                    const row_buttons = new ActionRowBuilder()
                        .addComponents(btn_ja, btn_nej, btn_kanske);

                    let correctedDate = checkDateFormat(signupEditDate);
                    if (correctedDate != null) {
                        signupEditDate = correctedDate;
                    }

                    let contentReply = "**" + signupEditName + "** uppdaterad!";
                    if (correctedDate == null) contentReply += '\n_Om du vill att datumet ska fungera i kalendern behöver formatet se ut såhär: DD/MM/YY_';

                    let signupEditDateAndTime = "";
                    if (signupEditTime == "") {
                        signupEditDateAndTime = signupEditDate;
                    } else {
                        signupEditDateAndTime = signupEditDate + " | " + signupEditTime;
                    }
                    const embedEdit = {
                        "title": signupEditName,
                        "description": signupEditInfo,
                        "color": 7419530,
                        "footer": {
                            "text": "ID: " + signupEditId
                        },
                        "fields": [
                            {
                                "name": "Plats",
                                "value": signupEditLoc,
                                "inline": true
                            },
                            {
                                "name": "Datum",
                                "value": signupEditDateAndTime,
                                "inline": true
                            }
                        ]
                    };

                    let files = fs.readdirSync(dir_EventsActive);
                    let fileName = files.find(file => file.endsWith('_' + id + '.json'));
                    if (!fileName) return;

                    lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
                        if (err) {
                            console.error('Failed to acquire lock:', err);
                            return;
                        }
                        let data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));

                        data.name = signupEditName;
                        data.date = signupEditDate;
                        data.time = signupEditTime;
                        data.location = signupEditLoc;

                        fs.writeFileSync(path.join(dir_EventsActive, fileName), JSON.stringify(data));

                        lockFile.unlock(`${fileName}.lock`, (err) => {
                            if (err) {
                                console.error('Failed to unlock:', err);
                            }
                        });
                    });

                    await message.edit({ embeds: [embedEdit], components: [row_buttons] });
                    await interaction.reply({ content: contentReply, flags: MessageFlags.Ephemeral });

                    logActivity("Signup for " + signupEditName + " was edited by " + getNickname(interaction));
                    postCalendar(true);
                    verktygSignup();

                } catch (error) {
                    logActivity("Error while editing signup: " + error);
                }
            }
        }
    }
};
