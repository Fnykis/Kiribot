const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const client = require('../core/client');
const logActivity = require('../core/logger');
const { ch_Sektionlista, ch_Arbetsgruppslista, ch_Nyckellista, hex_instr, hex_arbet, guildId } = require('../core/constants');

async function checkRoles() {

    let guild = client.guilds.cache.get(guildId);

	// Instrument
    let roles = guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));
    let data = {};

    let members = await guild.members.fetch();
    roles.each(role => {
        let users = members.filter(member =>
            member.roles.cache.find(r => r.id === role.id) &&
            member.roles.cache.find(r => r.name === `aktiv`)
        );
        data[role.name] = users.map(user => user.displayName);
    });
    fs.writeFileSync('src/data/instrumentList.json', JSON.stringify(data));

	postInstrumentList(true);

	// Workgroup - Wait 1 minute before second fetch to avoid rate limits
	await new Promise(resolve => setTimeout(resolve, 60 * 1000)); // 1 minute delay

    roles = guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));
    data = {};

    members = await guild.members.fetch();
    roles.each(role => {
        let users = members.filter(member =>
            member.roles.cache.find(r => r.id === role.id) &&
            member.roles.cache.find(r => r.name === `aktiv`)
        );
        data[role.name] = users.map(user => user.displayName);
    });
    fs.writeFileSync('src/data/groupList.json', JSON.stringify(data));

	postGroupList(true);

}

async function postInstrumentList(update) {

    let data = JSON.parse(fs.readFileSync('src/data/instrumentList.json', 'utf8'));
    let guild = client.guilds.cache.get(guildId);
    let channel = guild.channels.cache.get(ch_Sektionlista);

    let description = "";
    for (let instrument in data) {
        description += `**${instrument.charAt(0).toUpperCase() + instrument.slice(1)}**\n> ${data[instrument].join('\n> ')}\n`;
    }

    const date = new Date();
    const embed = {
        "title": 'Sektionslista (aktiva medlemmar)',
        "description": description,
        "color": 7419530,
        "footer": {
            "text": `Senast uppdaterad: ${new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h24', timeZone: 'Europe/Stockholm'}).format(date)}`
        }
    };

    if (update) {
        try {
            // Fetch the last message in the channel
            const messages = await channel.messages.fetch({ limit: 1 });
            const lastMessage = messages.first();

            // Update the last message
            lastMessage.edit({ embeds: [embed] });
        } catch (error) {
            logActivity(`Failed to update instrument list: ${error}`);
        }
    } else {
        try {
            channel.send({ embeds: [embed] });
        } catch (error) {
            logActivity(`Failed to post instrument list: ${error}`);
        }
    }

}

async function postGroupList(update) {

    let data = JSON.parse(fs.readFileSync('src/data/groupList.json', 'utf8'));
    let guild = client.guilds.cache.get(guildId);
    let channel = guild.channels.cache.get(ch_Arbetsgruppslista);

    let description = "";
    for (let group in data) {
        description += `**${group.charAt(0).toUpperCase() + group.slice(1)}**\n> ${data[group].join('\n> ')}\n`;
    }

    const date = new Date();
    const embed = {
        "title": 'Arbetsgruppslista (aktiva medlemmar)',
        "description": description,
        "color": 7419530,
        "footer": {
            "text": `Senast uppdaterad: ${new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h24', timeZone: 'Europe/Stockholm'}).format(date)}`
        }
    };

    if (update) {
        try {
            // Fetch the last message in the channel
            const messages = await channel.messages.fetch({ limit: 1 });
            const lastMessage = messages.first();

            // Update the last message
            lastMessage.edit({ embeds: [embed] });
        } catch (error) {
            logActivity(`Failed to update workgroup list: ${error}`);
        }
    } else {
        try {
            channel.send({ embeds: [embed] });
        } catch (error) {
            logActivity(`Failed to post workgroup list: ${error}`);
        }
    }

}

async function postNyckelList(update) {

    const detailsFilePath = 'src/data/detailsList.json';
    if (!fs.existsSync(detailsFilePath)) {
        fs.writeFileSync(detailsFilePath, JSON.stringify({ aktiv: [], inaktiv: [] }, null, 2), 'utf8');
    }
    let detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
    let guild = client.guilds.cache.get(guildId);
    let channel = guild.channels.cache.get(ch_Nyckellista);

    // Filter users with nyckel: "Ja" from both aktiv and inaktiv arrays
    const usersWithKey = [...detailsData.aktiv, ...detailsData.inaktiv]
        .filter(user => user.nyckel === 'Ja')
        .map(user => user.namn)
        .sort((a, b) => a.localeCompare(b));

    let description = "🔑 Följande personer har nyckel till replokalen\n\n";
    if (usersWithKey.length > 0) {
        description += usersWithKey.join('\n');
    } else {
        description += "Inga personer har registrerat nyckel ännu.";
    }

    const embed = {
        "title": 'Nyckellista',
        "description": description,
        "color": 7419530
    };

    if (update) {
        try {
            // Fetch the last message in the channel
            const messages = await channel.messages.fetch({ limit: 1 });
            const lastMessage = messages.first();

            // Update the last message
            lastMessage.edit({ embeds: [embed] });
        } catch (error) {
            logActivity(`Failed to update nyckel list: ${error}`);
        }
    } else {
        try {
            channel.send({ embeds: [embed] });
        } catch (error) {
            logActivity(`Failed to post nyckel list: ${error}`);
        }
    }

}

module.exports = { checkRoles, postInstrumentList, postGroupList, postNyckelList };
