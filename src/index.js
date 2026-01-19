// Require the necessary discord.js classes
const { Client, Events, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle, ChannelType, CategoryChannel, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { token } = require('../config.json');
const { guildId } = require('../config.json');
const fs = require('fs');
const lockFile = require('lockfile');
const path = require('path');
const { google } = require('googleapis');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
client.setMaxListeners(30);

const hex_instr = "#e91e63";
const hex_arbet = "#f1c40f";

const ch_YourProfile = '1139459850754084935'; 			// The channel din-profil
const ch_Calendar = '1325478670797897870'; 				// The channel kalender
const ch_Allmant = '1139440378181849138'; 				// The channel allmänt-spelningar
const ch_Signup = '1228238682394333265'; 				// The channel signups
const ch_Medlemsdetaljer = '1325745854149300245'; 		// The channel medlemsdetaljer
const ch_Sektionlista = '1315280649820573707'; 			// The channel sektionslista
const ch_Arbetsgruppslista = '1315279527403982918'; 	// The channel arbetsgruppsslista
const ch_ContactWorkgroup = '1292735994973650974'; 		// The channel kontakta-arbetsgrupp
const ch_ContactInstrument = '1292741268216221727'; 	// The channel kontakta-sektion
const ch_Verktyg_Signup = '1329775907367551074';		// The channel verktyg - signup
const ch_Spelningar = '1416132845402849420';			// The channel spelningar
const ch_FikaList = '1413819045576183888';				// The channel fika list
const ch_ModeratorVerktyg = '1331385309098676295';		// The channel moderatorverktyg
const ch_Nyckellista = '1437452414679519387';			// The channel nyckellista
const ch_PrivataMeddelanden = '1416019629993627750';	// The channel privata meddelanden
const ch_BotTest = '1231042885411930253';

const cat_Arbetsgrupper = '1139444099716489346';		// The category arbetsgrupper
const cat_Sektioner = '1139440490211721287';			// The category sektioner

const role_discordgruppen = '1292758232632135740';
const role_moderator = '1139505519149719604';

const dir_EventsActive = 'src/events/active';
const dir_EventsArchived = 'src/events/archived';

let requiredFields = []; // Fields in the detailsList

// Permission management system
let permissionSettings = {
	'signup-creation': []
};

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
client.once(Events.ClientReady, readyClient => {
	loadPermissions();
	dailyTasks();
	scheduleDailyTask(3, 0, dailyTasks);
	// scheduleDailyTask(8, 0, remindUsers);
	remindUsers();
	scheduleHourlyTask(postFikaList);
	scheduleHourlyTask(checkAndProcessPassedEvents);
	scheduleTwiceDailyTask(3, 0, 15, 0, backupJsonFiles); // Backup at 3 AM and 3 PM
	logActivity(`Ready! Logged in as ${readyClient.user.tag}`);
	testFunction();
});

// Helper functions for permission management
function loadPermissions() {
	try {
		const permissionsPath = path.join(__dirname, 'data', 'permissions.json');
		
		// Ensure directory exists
		const dataDir = path.dirname(permissionsPath);
		if (!fs.existsSync(dataDir)) {
			fs.mkdirSync(dataDir, { recursive: true });
		}
		
		if (fs.existsSync(permissionsPath)) {
			const data = fs.readFileSync(permissionsPath, 'utf8');
			const loaded = JSON.parse(data);
			permissionSettings = { ...permissionSettings, ...loaded };
		} else {
			// Create default permissions file
			fs.writeFileSync(permissionsPath, JSON.stringify(permissionSettings, null, 2));
			logActivity('Created default permissions file');
		}
	} catch (error) {
		logActivity(`Error loading permissions: ${error.message}`);
	}
}

function savePermissions() {
	return new Promise((resolve, reject) => {
		const permissionsPath = path.join(__dirname, 'data', 'permissions.json');
		const lockPath = permissionsPath + '.lock';
		
		lockFile.lock(lockPath, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, (err) => {
			if (err) {
				logActivity(`Error acquiring lock for permissions file: ${err.message}`);
				reject(err);
				return;
			}
			
			try {
				fs.writeFileSync(permissionsPath, JSON.stringify(permissionSettings, null, 2));
				resolve();
			} catch (writeErr) {
				logActivity(`Error writing permissions file: ${writeErr.message}`);
				reject(writeErr);
			} finally {
				lockFile.unlock(lockPath, (unlockErr) => {
					if (unlockErr) {
						logActivity(`Error unlocking permissions file: ${unlockErr.message}`);
					}
				});
			}
		});
	});
}

// Helper function to format channel names like Discord does
function formatChannelName(name) {
	return name
		.toLowerCase() // Convert to lowercase
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/[^a-z0-9-]/g, ''); // Remove disallowed characters (keep only alphanumeric and hyphens)
}

// Helper function to send instrument join/leave notifications
async function sendInstrumentNotification(role, interaction, action) {
	try {
		// Find the instrument channel in the sektioner category
		const guild = interaction.member.guild;
		const roleNameLower = role.name.toLowerCase();
		const category = guild.channels.cache.get(cat_Sektioner);
		if (!category || category.type !== ChannelType.GuildCategory) {
			logActivity(`Instrument category not found. Category ID: ${cat_Sektioner}, Instrument: ${roleNameLower}`);
			return;
		}

		// Determine channel name based on special cases
		let channelName;
		if (roleNameLower === '1:a' || roleNameLower === '2:a') {
			channelName = 'puls';
		} else if (roleNameLower === '3:a' || roleNameLower === '4:a') {
			channelName = 'dubblar';
		} else {
			// Default: format channel name like Discord does (remove special characters)
			channelName = formatChannelName(roleNameLower);
		}
		
		const instrumentChannel = category.children.cache.find(channel => 
			channel.name === channelName && channel.type === ChannelType.GuildText
		);

		if (!instrumentChannel) {
			logActivity(`Instrument channel not found for role: ${roleNameLower} (looking for: ${channelName})`);
			return;
		}

		// Create the notification message
		let message;
		if (action === 'join') {
			// Tag the user when they join
			message = `<@${interaction.user.id}> har anslutit ${roleNameLower} ✨`;
		} else {
			// Just show username when they leave
			message = `${getNickname(interaction)} har lämnat ${roleNameLower} 🫡`;
		}

		// Send the notification
		await instrumentChannel.send(message);

	} catch (error) {
		logActivity(`Error sending instrument notification for ${roleNameLower}: ${error.message}`);
	}
}

// Helper function to send workgroup join/leave notifications
async function sendWorkgroupNotification(role, interaction, action) {
	try {
		// Find the workgroup channel in the arbetsgrupper category
		const guild = interaction.member.guild;
		const roleNameLower = role.name.toLowerCase();
		const category = guild.channels.cache.get(cat_Arbetsgrupper);
		if (!category || category.type !== ChannelType.GuildCategory) {
			logActivity(`Workgroup category not found. Category ID: ${cat_Arbetsgrupper}, Workgroup: ${roleNameLower}`);
			return;
		}

		// Format channel name like Discord does (remove special characters)
		const channelName = formatChannelName(roleNameLower);
		
		const workgroupChannel = category.children.cache.find(channel => 
			channel.name === channelName && channel.type === ChannelType.GuildText
		);

		if (!workgroupChannel) {
			logActivity(`Workgroup channel not found for role: ${roleNameLower} (looking for: ${channelName})`);
			return;
		}

		// Create the notification message
		let message;
		if (action === 'join') {
			// Tag the user when they join
			message = `<@${interaction.user.id}> har anslutit ${roleNameLower} ✨`;
		} else {
			// Just show username when they leave
			message = `${getNickname(interaction)} har lämnat ${roleNameLower} 🫡`;
		}

		// Send the notification
		await workgroupChannel.send(message);

	} catch (error) {
		logActivity(`Error sending workgroup notification for ${roleNameLower}: ${error.message}`);
	}
}

//////////////////////////////
//// Your Profile buttons ////
//////////////////////////////

async function postYourProfile() {

	const btn_status = new ButtonBuilder()
		.setCustomId('status')
		.setLabel('Medlemstatus')
		.setStyle(ButtonStyle.Secondary);

	const btn_name = new ButtonBuilder()
		.setCustomId('namn')
		.setLabel('Namn')
		.setStyle(ButtonStyle.Secondary);

	const btn_inst = new ButtonBuilder()
		.setCustomId('instrument')
		.setLabel('Instrument')
		.setStyle(ButtonStyle.Secondary);

	const btn_work = new ButtonBuilder()
		.setCustomId('arbetsgrupp')
		.setLabel('Arbetsgrupp')
		.setStyle(ButtonStyle.Secondary);

	const btn_details = new ButtonBuilder()
		.setCustomId('detaljer')
		.setLabel('Detaljer')
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(false);

	const btn_nyckel = new ButtonBuilder()
		.setCustomId('nyckel')
		.setLabel('Nyckel')
		.setStyle(ButtonStyle.Secondary);

	const btn_view = new ButtonBuilder()
		.setCustomId('visaprofil')
		.setLabel('👁 Visa din profil')
		.setStyle(ButtonStyle.Secondary);

	const row1_buttons = new ActionRowBuilder()
		.addComponents(btn_name, btn_status, btn_inst, btn_work);
	const row2_buttons = new ActionRowBuilder()
		.addComponents(btn_details, btn_nyckel);
	const row3_buttons = new ActionRowBuilder()
		.addComponents(btn_view);

	client.channels.cache.get(ch_YourProfile).messages.fetch({ limit: 1 }).then(messages => {
		let lastMessage = messages.first();

		lastMessage.edit({
			content: `Tryck på knapparna för att ändra i din profil`,
			components: [row1_buttons, row2_buttons, row3_buttons],
		});
	})
	/*
	client.channels.cache.get(ch_YourProfile).send({
		content: `Tryck på knapparna för att ändra i din profil`,
		components: [row1_buttons, row2_buttons],
	});
	*/
	
};

//////////////////////////////
//// Moderator Tools ////////
//////////////////////////////

async function postModeratorTools() {

	const btn_openModeratorTools = new ButtonBuilder()
		.setCustomId('openModeratorTools')
		.setLabel('Öppna moderatorverktyg')
		.setStyle(ButtonStyle.Secondary);

	const row_buttons = new ActionRowBuilder()
		.addComponents(btn_openModeratorTools);

	client.channels.cache.get(ch_ModeratorVerktyg).send({
		components: [row_buttons],
	});
}

//////////////////////////////////////////
//// Your profile button interactions ////
//////////////////////////////////////////

// Namn button
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId != 'namn') return;

	const modal = new ModalBuilder()
		.setCustomId('modal_namn')
		.setTitle('Visningsnamn');

	// Create the text input components
	const nameInput = new TextInputBuilder()
		.setCustomId('nameInput')
		.setLabel("Förnamn med första initialen av efternamnet")
		.setPlaceholder('Homero C')
		.setStyle(TextInputStyle.Short)
		.setMaxLength(20)
		.setMinLength(1)
		.setRequired(true);

	const actionRow = new ActionRowBuilder().addComponents(nameInput);

	// Add inputs to the modal
	modal.addComponents(actionRow);

	// Show the modal to the user
	await interaction.showModal(modal);

});

// Namn data, details data & edit signup
client.on(Events.InteractionCreate, async interaction => {

	if (!interaction.isModalSubmit()) return;

	// Change nickname
	if (interaction.customId === 'modal_namn') {
		let nickname = interaction.fields.getTextInputValue('nameInput');
		interaction.member.setNickname(nickname);
		await interaction.reply({ content: `Ditt visningsnamn är nu: **${nickname}** 🎉`, flags: MessageFlags.Ephemeral });

		logActivity(interaction.member.user.username + " changed their nickname to " + nickname);
	}

	// Edit signup
	if (interaction.customId.startsWith('modal_signupEdit_')) {
		let modalId = interaction.customId.substring(0, interaction.customId.lastIndexOf("_"));
		let messageId = interaction.customId.substring(interaction.customId.lastIndexOf("_") + 1, interaction.customId.length);

		// Validate that messageId is a valid Discord snowflake (numeric)
		if (!/^\d+$/.test(messageId)) {
			logActivity(`Invalid message ID in signup edit: ${messageId} from customId: ${interaction.customId}`);
			return;
		}

		if (modalId === 'modal_signupEdit') {

		try {

			// Fetch the message from the signup channel, not the current channel
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
			//await interaction.update({ content: deleted ? theContent + " [BORTTAGEN]" : theContent, components: [row_buttons] });

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
			
			// Check the date format
			let correctedDate = checkDateFormat(signupEditDate);
			if (correctedDate != null) {
				signupEditDate = correctedDate;
			}
			
			let contentReply = "**" + signupEditName + "** uppdaterad!";
			if (correctedDate == null) contentReply += '\n_Om du vill att datumet ska fungera i kalendern behöver formatet se ut såhär: DD/MM/YY_';

			// Join date and time
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

			// Find the file with the matching ID
			let files = fs.readdirSync(dir_EventsActive);
			let fileName = files.find(file => file.endsWith('_' + id + '.json'));
			if (!fileName) return;

			// Read and update the JSON file
			lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
				if (err) {
					console.error('Failed to acquire lock:', err);
					return;
				}
				// The lock was acquired. Now you can read/update your file safely.
				let data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));

				// Change the name of the signup
				data.name = signupEditName;
				data.date = signupEditDate;
				data.time = signupEditTime;
				data.location = signupEditLoc;

				fs.writeFileSync(path.join(dir_EventsActive, fileName), JSON.stringify(data));
    
				// Release the lock
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

		} catch(error) {
			logActivity("Error while editing signup: " + error);
		}

		}
	}

	// Edit personal details
	if (interaction.customId === 'modal_detaljer') {
		try {

			// Exclude "nyckel" from the modal fields since it's handled with buttons
			const fieldsForModal = requiredFields.filter(field => field !== 'nyckel');

			const keyFields = fieldsForModal.map(field => {
				const sanitizedField = field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
				return interaction.fields.getTextInputValue(sanitizedField);
			});
			const detailsFilePath = 'src/detailsList.json';
			let detailsData;
			if (fs.existsSync(detailsFilePath)) {
				detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
			} else {
				await interaction.reply({ content: `Efterfrågan misslyckades.`, flags: MessageFlags.Ephemeral });
				logActivity(`${getNickname(interaction)} failed to update details - file not found`);
				return;
			}

			// Find the user ID in the "aktiv" or "inaktiv" array
			const userId = interaction.member.user.id;
			let userFound = false;

			['aktiv', 'inaktiv'].forEach(status => {
				const userIndex = detailsData[status].findIndex(user => user.id === userId);
				if (userIndex !== -1) {
					userFound = true;
					// Update the user's details with values from keyFields (excluding nyckel)
					fieldsForModal.forEach((field, index) => {
						const sanitizedField = field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
						detailsData[status][userIndex][sanitizedField] = keyFields[index];
					});
				}
			});

			if (userFound) {
				fs.writeFileSync(detailsFilePath, JSON.stringify(detailsData, null, 2));
				updateDetails().catch(err => logActivity(`Error in updateDetails (from modal submit): ${err.message}`));
				verktygSignup();
				await interaction.reply({ content: `Du har uppdaterat dina detaljer!`, flags: MessageFlags.Ephemeral });
				logActivity(`${getNickname(interaction)} updated their details`);
			} else {
				updateDetails().catch(err => logActivity(`Error in updateDetails (from modal submit): ${err.message}`));
				verktygSignup();
				await interaction.reply({ content: `Uppdateringen misslyckades - prova igen.`, flags: MessageFlags.Ephemeral });
				logActivity(`${getNickname(interaction)} failed to update their details - user not found`);
			}

		} catch(error) {
			logActivity("Error when updating details for " + getNickname(interaction) + ": " + error);
		}

	}

	// Add workgroup modal submit
	if (interaction.customId === 'modal_addWorkgroup') {
		try {
			const workgroupName = interaction.fields.getTextInputValue('workgroupNameInput');
			const workgroupNameLower = workgroupName.toLowerCase();
			const createChannel = interaction.fields.getTextInputValue('createChannelInput').toLowerCase() === 'ja';
			
			// Create the role with hex_arbet color
			const newRole = await interaction.guild.roles.create({
				name: workgroupNameLower,
				color: hex_arbet,
				permissions: [], // No special permissions
				reason: `Workgroup created by ${interaction.member.user.username}`
			});

			let channelCreated = false;
			if (createChannel) {
				// Create the channel in the arbetsgrupper category
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

		} catch(error) {
			await interaction.reply({ 
				content: `Fel vid skapandet av arbetsgruppen: ${error.message}`, 
				flags: MessageFlags.Ephemeral 
			});
			logActivity(`Error creating workgroup: ${error.message}`);
		}
	}

	// Edit workgroup modal submit
	if (interaction.customId.startsWith('modal_editWorkgroup-')) {
		try {
			const roleId = interaction.customId.split('-')[1];
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

			// Update the role name
			await role.setName(newNameLower);

			let channelUpdated = false;
			let channelName = '';

			// Check if there's a channel in the arbetsgrupper category with the old name
			const category = interaction.guild.channels.cache.get(cat_Arbetsgrupper);
			if (category && category.type === ChannelType.GuildCategory) {
				const channels = category.children.cache;
				const oldChannelName = oldName.replace(/\s+/g, '-');
				const newChannelName = newNameLower.replace(/\s+/g, '-');
				
				for (const [channelId, channel] of channels) {
					if (channel.name === oldChannelName) {
						// Check if this channel only has this role as special permissions
						const permissionOverwrites = channel.permissionOverwrites.cache;
						let onlyThisRole = true;
						
						// Check if there are other roles with special permissions
						for (const [overwriteId, overwrite] of permissionOverwrites) {
							if (overwriteId !== role.id && overwriteId !== interaction.guild.roles.everyone.id) {
								// Check if it's a role (not a user)
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

		} catch(error) {
			await interaction.reply({
				content: `Fel uppstod vid redigering: ${error.message}`,
				flags: MessageFlags.Ephemeral
			});
			logActivity(`Error editing workgroup: ${error.message}`);
		}
	}

	// Add section modal submit
	if (interaction.customId === 'modal_addSection') {
		try {
			const sectionName = interaction.fields.getTextInputValue('sectionNameInput');
			const sectionNameLower = sectionName.toLowerCase();
			const createChannel = interaction.fields.getTextInputValue('createSectionChannelInput').toLowerCase() === 'ja';
			
			// Create the role with hex_instr color
			const newRole = await interaction.guild.roles.create({
				name: sectionNameLower,
				color: hex_instr,
				permissions: [], // No special permissions
				reason: `Section created by ${interaction.member.user.username}`
			});

			let channelCreated = false;
			if (createChannel) {
				// Create the channel in the sektioner category
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

		} catch(error) {
			await interaction.reply({ 
				content: `Fel vid skapande av sektionen: ${error.message}`, 
				flags: MessageFlags.Ephemeral 
			});
			logActivity(`Error creating section: ${error.message}`);
		}
	}

	// Edit section modal submit
	if (interaction.customId.startsWith('modal_editSection-')) {
		try {
			const roleId = interaction.customId.split('-')[1];
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

			// Update the role name
			await role.setName(newNameLower);

			let channelUpdated = false;
			let channelName = '';

			// Check if there's a channel in the sektioner category with the old name
			const category = interaction.guild.channels.cache.get(cat_Sektioner);
			if (category && category.type === ChannelType.GuildCategory) {
				const channels = category.children.cache;
				const oldChannelName = oldName.replace(/\s+/g, '-');
				const newChannelName = newNameLower.replace(/\s+/g, '-');
				
				for (const [channelId, channel] of channels) {
					if (channel.name === oldChannelName) {
						// Check if this channel only has this role as special permissions
						const permissionOverwrites = channel.permissionOverwrites.cache;
						let onlyThisRole = true;
						
						// Check if there are other roles with special permissions
						for (const [overwriteId, overwrite] of permissionOverwrites) {
							if (overwriteId !== role.id && overwriteId !== interaction.guild.roles.everyone.id) {
								// Check if it's a role (not a user)
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

		} catch(error) {
			await interaction.reply({
				content: `Fel uppstod vid redigering: ${error.message}`,
				flags: MessageFlags.Ephemeral
			});
			logActivity(`Error editing section: ${error.message}`);
		}
	}

});

// Medlemstatus button
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId != 'status') return;
    
    // Get the "Aktiv" and "Inaktiv" roles
    const activeRole = interaction.guild.roles.cache.find(role => role.name === 'aktiv');
    const inactiveRole = interaction.guild.roles.cache.find(role => role.name === 'inaktiv');

    // Create buttons for the roles
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

    // Create an action row and add the buttons
    const actionRow = new ActionRowBuilder()
        .addComponents(activeButton, inactiveButton);

    // Send a message with the buttons
    await interaction.reply({ content: 'Är du aktiv i föreningen just nu?', components: [actionRow], flags: MessageFlags.Ephemeral });
});

// Medlemstatus assignment
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('roleStatus')) return;

    // Get the "Aktiv" and "Inaktiv" roles
    const activeRole = interaction.guild.roles.cache.find(role => role.name === 'aktiv');
    const inactiveRole = interaction.guild.roles.cache.find(role => role.name === 'inaktiv');

    const roleId = interaction.customId.split('-')[1];
    const role = interaction.guild.roles.cache.get(roleId);

	try {

		// Check if the role is "Aktiv" or "Inaktiv"
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

		// Update the message to reflect the new role state
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
});

// Instrument button
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId != 'instrument') return;

	if (interaction.channelId === ch_ContactInstrument) {
        currentChannel = 'contactGroup';
    } else if (interaction.channelId === ch_YourProfile) {
        currentChannel = 'roleInstrument';
    } else {
        return; // Exit if it's neither of the specified channels
    }
    
    // Get all roles with a specific color
    const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));
    
    // Create an action row and populate it with buttons
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

    // Add the last row if it has any buttons
    if (count > 0) {
        actionRows.push(actionRow);
    }

    // Send a message with the buttons
    await interaction.reply({ content: 'Välj instrument:', components: actionRows, flags: MessageFlags.Ephemeral });
});

// Instrument buttons
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('roleInstrument-')) return;

    const roleId = interaction.customId.split('-')[1];
    const role = interaction.guild.roles.cache.get(roleId);
	let rmOradd = "";

	try {

		if (interaction.member.roles.cache.has(role.id)) {
			await interaction.member.roles.remove(role.id);
			rmOradd = " left ";
			// Send leave notification
			await sendInstrumentNotification(role, interaction, 'leave');
		} else {
			await interaction.member.roles.add(role.id);
			rmOradd = " joined ";
			// Send join notification
			await sendInstrumentNotification(role, interaction, 'join');
		}

		// Update the message to reflect the new role state
		// Get all roles with a specific color
		const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));
    
		// Create an action row and populate it with buttons
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
	
		// Add the last row if it has any buttons
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

});

// ListaInstrument button from spelningar thread
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('listaInstrument_')) return;

    try {
        // Extract event ID from customId
        const eventId = interaction.customId.replace('listaInstrument_', '');
        
        // Load event data to get event name for logging
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
        
        // Call listaInstrument function
        await listaInstrument(interaction, eventId);
        
    } catch (error) {
        logActivity(`Error in listaInstrument button handler: ${error.message}`);
        await interaction.reply({ content: 'Ett fel uppstod när instrumentlistan skulle visas.', flags: MessageFlags.Ephemeral });
    }
});

// Arbetsgrupp button
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId != 'arbetsgrupp') return;

	let currentChannel;

    if (interaction.channelId === ch_ContactWorkgroup) {
        currentChannel = 'contactGroup';
    } else if (interaction.channelId === ch_YourProfile) {
        currentChannel = 'roleArbetsgrupp';
    } else {
        return; // Exit if it's neither of the specified channels
    }
    
    // Get all roles with a specific color
    const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));
    
    // Create an action row and populate it with buttons
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
            //.setDisabled(currentChannel === 'contactGroup' && hasRole); // Disable button if in 'contactGroup' and user has the role

        actionRow.addComponents(button);
        count++;
    });

    // Add the last row if it has any buttons
    if (count > 0) {
        actionRows.push(actionRow);
    }

    // Send a message with the buttons
    await interaction.reply({ content: 'Välj arbetsgrupp:', components: actionRows, flags: MessageFlags.Ephemeral });
});

// Arbetsgrupp buttons
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('roleArbetsgrupp-')) return;

    const roleId = interaction.customId.split('-')[1];
    const role = interaction.guild.roles.cache.get(roleId);
	let rmOradd = "";

	try {

		if (interaction.member.roles.cache.has(role.id)) {
			await interaction.member.roles.remove(role.id);
			rmOradd = " left ";
			// Send leave notification
			await sendWorkgroupNotification(role, interaction, 'leave');
		} else {
			await interaction.member.roles.add(role.id);
			rmOradd = " joined ";
			// Send join notification
			await sendWorkgroupNotification(role, interaction, 'join');
		}

		// Update the message to reflect the new role state
		// Get all roles with a specific color
		const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));
    
		// Create an action row and populate it with buttons
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
	
		// Add the last row if it has any buttons
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

});

// Detaljer button
client.on('interactionCreate', async (interaction) => {

    if (!interaction.isButton()) return;
    if (interaction.customId != 'detaljer') return;

    const detailsFilePath = 'src/detailsList.json';
    let detailsData;
    if (fs.existsSync(detailsFilePath)) {
        detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
    } else {
        await interaction.reply({ content: `Efterfrågan misslyckades.`, flags: MessageFlags.Ephemeral });
        logActivity(`${interaction.member.user.username} failed to update details - file not found`);
        return;
    }

    // Find the user ID in the "aktiv" or "inaktiv" array
    const userId = interaction.member.user.id;
    let userDetails = {};

    ['aktiv', 'inaktiv'].forEach(status => {
        const user = detailsData[status].find(user => user.id === userId);
        if (user) userDetails = user;
    });

    const modal = new ModalBuilder()
        .setCustomId('modal_detaljer')
        .setTitle('Detaljer');

    // Exclude "nyckel" from the modal since it's handled with buttons
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

    // Add inputs to the modal
    modal.addComponents(...actionRows);

    // Show the modal to the user
    await interaction.showModal(modal);

});

// View button
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId != 'visaprofil') return;

	const activeRole = interaction.guild.roles.cache.find(role => role.name === 'aktiv');
	const inactiveRole = interaction.guild.roles.cache.find(role => role.name === 'inaktiv');
	const instruments = interaction.guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));
	const workgroups = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));
    
    // Get the member from the interaction
    const member = interaction.member;

    // Member Status
    let memberStatus = 'Inget angivet';
    if (member.roles.cache.has(activeRole.id)) {
        memberStatus = 'Aktiv';
    } else if (member.roles.cache.has(inactiveRole.id)) {
        memberStatus = 'Inaktiv';
    }

	function capitalizeFirstLetter(string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	}

    // Member Instruments
    const memberInstruments = instruments
        .filter(role => member.roles.cache.has(role.id))
        .map(role => capitalizeFirstLetter(role.name));

    // Member Workgroups
    const memberWorkgroups = workgroups
        .filter(role => member.roles.cache.has(role.id))
        .map(role => capitalizeFirstLetter(role.name));

    // Create the ephemeral message
	const detailsFilePath = 'src/detailsList.json';
	let detailsData;
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
		// If the file is missing, don't add any extra details to the message
		await interaction.reply({
			content: `**Namn:** ${member.displayName}\n` +
				`**Status:** ${memberStatus}\n` +
				`**Instrument:** ${memberInstruments.length ? memberInstruments.join(', ') : '-' }\n` +
				`**Arbetsgrupper:** ${memberWorkgroups.length ? memberWorkgroups.join(', ') : '-' }`,
			flags: MessageFlags.Ephemeral
		});
	}


});

/////////////////
//// Contact ////
/////////////////

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId != 'contactWorkgroup' && interaction.customId != 'contactInstrument') return; // INSTRUMENT FUNKAR INTE, SKICKAR TILL FAN ALLA
	const member = interaction.guild.members.cache.get(interaction.user.id);

    // Get the current channel where the interaction happened
    const currentChannel = await client.channels.fetch(interaction.channelId);
    
    // Ensure the current channel is a text channel
    if (!currentChannel || !currentChannel.isTextBased()) {
		logActivity("Target channel not found or invalid. Contact form " + interaction.customId + " by user " + nickname);
        return interaction.reply({ content: 'Något gick fel', flags: MessageFlags.Ephemeral });
    }

    // Get the category of the current channel
    const category = currentChannel.parent;
    if (!category || category.type !== ChannelType.GuildCategory) {
		logActivity("Target category not found or invalid. Contact form " + interaction.customId + " by user " + nickname);
        return interaction.reply({ content: 'Något gick fel.', flags: MessageFlags.Ephemeral });
    }

    // Fetch all channels in the same category
    const channelsInCategory = category.children.cache.filter(channel => channel.type === ChannelType.GuildText).sort((a, b) => a.position - b.position);
    
    // Exclude the top channel (the current channel where the button is located)
	const channelsToList = channelsInCategory.filter(channel => 
		channel.id !== currentChannel.id && 
		channel.id !== ch_Sektionlista && // Sektionslista
		channel.id !== ch_Arbetsgruppslista 	// Arbetsgruppslista
	);

    // Create action rows and populate them with buttons
    let actionRows = [];
    let actionRow = new ActionRowBuilder();
    let count = 0;

    channelsToList.each(channel => {
        if (count === 5) {
            actionRows.push(actionRow);
            actionRow = new ActionRowBuilder();
            count = 0;
        }

        const isUserInChannel = interaction.member.permissionsIn(channel).has([PermissionFlagsBits.ViewChannel])
        const channelName = channel.name.charAt(0).toUpperCase() + channel.name.slice(1);

        const button = new ButtonBuilder()
            .setCustomId(`selectChannel-${channel.id}`)
            .setLabel(channelName)
            .setStyle('Secondary')
            .setDisabled(isUserInChannel); // Disable the button if the user can view the channel

        actionRow.addComponents(button);
        count++;
    });

    // Add the last row if it has any buttons
    if (count > 0) {
        actionRows.push(actionRow);
    }

    // Send a message with the buttons
    await interaction.reply({ content: 'Välj en kanal från listan:', components: actionRows, flags: MessageFlags.Ephemeral });
});

// Contact modal
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    // Handle channel selection buttons
    if (interaction.customId.startsWith('selectChannel-')) {
        const member = interaction.guild.members.cache.get(interaction.user.id);
        const targetChannelId = interaction.customId.split('-')[1];
        
        const [targetChannel, contactChannel] = await Promise.all([
            client.channels.fetch(targetChannelId),
            client.channels.fetch(interaction.channelId)
        ]);

        // Validate target channel
        if (!targetChannel?.isTextBased()) {
            logActivity(`Invalid target channel: ${interaction.customId} by ${getNickname(interaction)}`);
            return interaction.reply({ content: 'Något gick fel', flags: MessageFlags.Ephemeral });
        }

        // Show modal
        const modal = new ModalBuilder()
            .setCustomId('modal_contact')
            .setTitle(`Kontaktar ${targetChannel.name.charAt(0).toUpperCase() + targetChannel.name.slice(1)}`);
	
		const subjectInput = new TextInputBuilder()
			.setCustomId('subjectInput')
			.setLabel("Ämne")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);
	
		const textInput = new TextInputBuilder()
			.setCustomId('textInput')
			.setLabel("Meddelande")
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true);
	
		const actionRow1 = new ActionRowBuilder().addComponents(subjectInput);
		const actionRow2 = new ActionRowBuilder().addComponents(textInput);
	
		// Add inputs to the modal
		modal.addComponents(actionRow1, actionRow2);
	
		// Show the modal to the user
		await interaction.showModal(modal);

        // Handle modal submission
        const submitted = await interaction.awaitModalSubmit({
            time: 1200000,
            filter: i => i.user.id === interaction.user.id,
        }).catch(console.error);

        if (!submitted) return;

        // Get input values
        const subject = submitted.fields.getTextInputValue('subjectInput');
        const message = submitted.fields.getTextInputValue('textInput');

        // Find required role
        const aktivRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'aktiv');
        if (!aktivRole) {
            logActivity(`Aktiv role missing while in contact form by ${getNickname(interaction)}`);
            try {
                return await submitted.reply({ content: 'Något gick fel', flags: MessageFlags.Ephemeral });
            } catch (error) {
                logActivity('Failed to reply to interaction (aktiv role missing):', error);
                return;
            }
        }

        // Get members with aktiv role
        const aktivMembers = aktivRole.members;

        // Filter eligible members
        const eligibleMembers = aktivMembers.filter(m => 
			!m.user.bot &&
			m.id !== interaction.guild.ownerId &&
			targetChannel.permissionsFor(m).has(PermissionFlagsBits.ViewChannel)
		);

        // Generate mentions list
        const mentions = [
			...Array.from(eligibleMembers.values()).map(m => `<@${m.id}>`)
		].join(' ');

        // Create thread and send message
        const thread = await contactChannel.threads.create({
            name: `${getNickname(interaction)} - ${subject}`.slice(0, 100),
            autoArchiveDuration: 10080,
            type: ChannelType.PrivateThread,
        });

        try {
			const mentionIds = [
				...Array.from(eligibleMembers.keys()), // Get all member IDs
				interaction.user.id
			];
            await thread.send({
                content: `## ${subject}\n${message}\n\n-# Meddelande skickat till **${targetChannel.name.charAt(0).toUpperCase() + targetChannel.name.slice(1)}** av <@${interaction.user.id}>\n-# ${mentions}\n-# Tagga fler personer om du vill lägga till dem i konversationen.`,
                allowedMentions: { users: mentionIds }
            });
        } catch (error) {
            logActivity('Thread creation failed:', error);
            try {
                return await submitted.reply({ content: 'Något gick fel när tråden skulle skapas', flags: MessageFlags.Ephemeral });
            } catch (replyError) {
                logActivity('Failed to reply to interaction (thread creation failed):', replyError);
                return;
            }
        }

		try {
			await submitted.reply({ 
				content: `Ditt meddelande har skickats i tråden: ${thread.toString()}`,
				flags: MessageFlags.Ephemeral 
			});
		} catch (error) {
			logActivity('Sending message failed:', error);
			try {
				return await submitted.reply({ content: 'Något gick fel när tråden skulle skapas', flags: MessageFlags.Ephemeral });
			} catch (replyError) {
				logActivity('Failed to reply to interaction (sending message failed):', replyError);
				return;
			}
		}
        
    }
});

// Cleaning instructions button
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;
	if (interaction.customId !== 'cleaning_instructions') return;

	try {
		
		const cleaningInstructions = await getCleaningInstructions();
		await interaction.reply({ content: cleaningInstructions, flags: MessageFlags.Ephemeral });
	} catch (error) {
		await interaction.reply({ content: 'Kunde inte hämta städinstruktioner.', flags: MessageFlags.Ephemeral });
		logActivity(`Error handling cleaning instructions request by ${getNickname(interaction)}: ${error.message}`);
	}
});

// Fika instructions button
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;
	if (interaction.customId !== 'fika_instructions') return;

	try {
		
		const fikaInstructions = await getFikaInstructions();
		await interaction.reply({ content: fikaInstructions, flags: MessageFlags.Ephemeral });
	} catch (error) {
		await interaction.reply({ content: 'Kunde inte hämta fikainstruktioner.', flags: MessageFlags.Ephemeral });
		logActivity(`Error handling fika instructions request by ${getNickname(interaction)}: ${error.message}`);
	}
});

// OLD CODE
/*
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('selectChannel-')) return; // Custom ID for buttons is based on channel IDs

    const member = interaction.guild.members.cache.get(interaction.user.id);
    const targetChannelId = interaction.customId.split('-')[1];
    const targetChannel = await client.channels.fetch(targetChannelId);
    const contactChannel = await client.channels.fetch(interaction.channelId);

    // Ensure the target channel exists and is a text-based channel
    if (!targetChannel || !targetChannel.isTextBased()) {
		logActivity("Target channel not found or invalid. Contact form " + interaction.customId + " by user " + nickname);
        return interaction.reply({ content: 'Target channel not found or invalid.', flags: MessageFlags.Ephemeral });
    }

    // Display a modal to the user to enter a subject and message
    const modal = new ModalBuilder()
        .setCustomId('modal_contact')
        .setTitle('Kontaktar ' + targetChannel.name.charAt(0).toUpperCase() + targetChannel.name.slice(1));

    const subjectInput = new TextInputBuilder()
        .setCustomId('subjectInput')
        .setLabel("Ämne")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

    const textInput = new TextInputBuilder()
        .setCustomId('textInput')
        .setLabel("Meddelande")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

    const actionRow1 = new ActionRowBuilder().addComponents(subjectInput);
    const actionRow2 = new ActionRowBuilder().addComponents(textInput);

    // Add inputs to the modal
    modal.addComponents(actionRow1, actionRow2);

    // Show the modal to the user
    await interaction.showModal(modal);

    // Await for the user's submission of the modal
    const submitted = await interaction.awaitModalSubmit({
        time: 1200000, // 20 minutes timeout
        filter: i => i.user.id === interaction.user.id,
    }).catch(error => {
        console.error(error);
        return null;
    });

    if (!submitted) return;

    // Extract values from the submitted modal
    const subject = submitted.fields.getTextInputValue('subjectInput');
    const message = submitted.fields.getTextInputValue('textInput');

    // Get all users who have access to the target channel, filter out bots and server owner
    const membersInChannel = targetChannel.members.filter(member => 
        !member.user.bot && member.id !== interaction.guild.ownerId
    );

    // Create user mentions without bots or the server owner
    let userMentions = membersInChannel.map(member => `<@${member.id}>`).join(' ');

    // Add the interaction user at the top of the mention list
    userMentions = `<@${interaction.user.id}> ` + userMentions;

    // Create a secret thread within the target channel
    const thread = await contactChannel.threads.create({
        name: `${getNickname(interaction)} - ${subject}`,
        autoArchiveDuration: 10080,  // Archive after 1 week
        type: ChannelType.PrivateThread,
        reason: `${getNickname(interaction)} started a secret thread`,
    });

    // Send the message in the thread, mentioning all users (without bots or the server owner)
    await thread.send({
        content: `${userMentions}\n\n**${getNickname(interaction)}:**\n${message}`,
        allowedMentions: { users: membersInChannel.map(member => member.id).concat(interaction.user.id) },  // Mention all valid users and the interaction user
    });

    // Confirm with the user that the message was sent
    try {
        await submitted.reply({ content: `Ditt meddelande har skickats i tråden: ${thread.name}`, flags: MessageFlags.Ephemeral });
    } catch (error) {
        if (error.code === 10062) {
            // Interaction has expired, try to send a follow-up message
            try {
                await submitted.followUp({ content: `Ditt meddelande har skickats i tråden: ${thread.name}`, flags: MessageFlags.Ephemeral });
            } catch (followUpError) {
                logActivity('Failed to send followUp message:', followUpError);
            }
        } else {
            logActivity('Error replying to interaction:', error);
        }
    }

});*/

//////////////////////////////
//// Moderator Tools ////////
//////////////////////////////

// Moderator tools button
client.on('interactionCreate', async (interaction) => {
	
	if (!interaction.isButton()) return;

	if (interaction.customId == "openModeratorTools") {

		// Check if user has moderator role
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
	}

	// Handle adjustPermissions button
	if (interaction.customId == "adjustPermissions") {
		// Check if user has moderator role
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
	}

	// Handle cleanupSignups button
	if (interaction.customId == "cleanupSignups") {
		// Check if user has moderator role
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
	}

	// Handle permissions_signup-creation button
	if (interaction.customId == "permissions_signup-creation") {
		// Check if user has moderator role
		const allowedRoleIds = [role_moderator, role_discordgruppen];
		const member = interaction.member;
		const guild = interaction.guild;
		const isOwner = member.id === guild?.ownerId;
		const hasRole = member.roles.cache.some(role => allowedRoleIds.includes(role.id));
		if (!isOwner && !hasRole) return interaction.reply({ content: 'Du har inte behörighet att använda denna funktion.', flags: MessageFlags.Ephemeral });

		// Get all roles with hex_arbet color
		const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));
		
		// Create action rows with buttons (max 5 per row)
		let actionRows = [];
		let actionRow = new ActionRowBuilder();
		let count = 0;

		roles.each((role) => {
			if (count === 5) {
				actionRows.push(actionRow);
				actionRow = new ActionRowBuilder();
				count = 0;
			}

			const isAllowed = permissionSettings['signup-creation'].includes(role.id);
			const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
			const button = new ButtonBuilder()
				.setCustomId(`toggle_signup-creation_${role.id}`)
				.setLabel(roleName)
				.setStyle(isAllowed ? ButtonStyle.Success : ButtonStyle.Danger);

			actionRow.addComponents(button);
			count++;
		});

		// Add the last row if it has any buttons
		if (count > 0) {
			actionRows.push(actionRow);
		}

		await interaction.reply({
			content: 'Välj vilka arbetsgrupper som ska ha behörighet att använda "Skapa signup" funktionen:',
			components: actionRows,
			flags: MessageFlags.Ephemeral
		});
	}

	// Handle toggle buttons for permissions
	if (interaction.customId.startsWith('toggle_signup-creation_')) {
		// Check if user has moderator role
		const allowedRoleIds = [role_moderator, role_discordgruppen];
		const member = interaction.member;
		const guild = interaction.guild;
		const isOwner = member.id === guild?.ownerId;
		const hasRole = member.roles.cache.some(role => allowedRoleIds.includes(role.id));
		if (!isOwner && !hasRole) return interaction.reply({ content: 'Du har inte behörighet att använda denna funktion.', flags: MessageFlags.Ephemeral });

		const roleId = interaction.customId.split('_')[2];
		const role = interaction.guild.roles.cache.get(roleId);
		
		if (!role) {
			return interaction.reply({ content: 'Rollen kunde inte hittas.', flags: MessageFlags.Ephemeral });
		}

		// Toggle role in permissionSettings
		const currentPermissions = permissionSettings['signup-creation'] || [];
		const isCurrentlyAllowed = currentPermissions.includes(roleId);
		
		if (isCurrentlyAllowed) {
			// Remove role from permissions
			permissionSettings['signup-creation'] = currentPermissions.filter(id => id !== roleId);
		} else {
			// Add role to permissions
			permissionSettings['signup-creation'] = [...currentPermissions, roleId];
		}

		// Save permissions to file
		try {
			await savePermissions();
		} catch (error) {
			logActivity(`Error saving permissions: ${error.message}`);
			return interaction.reply({ content: 'Ett fel uppstod vid sparande av behörigheter.', flags: MessageFlags.Ephemeral });
		}

		// Update the message to show new button colors
		const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));
		
		// Create action rows with buttons (max 5 per row)
		let actionRows = [];
		let actionRow = new ActionRowBuilder();
		let count = 0;

		roles.each((role) => {
			if (count === 5) {
				actionRows.push(actionRow);
				actionRow = new ActionRowBuilder();
				count = 0;
			}

			const isAllowed = permissionSettings['signup-creation'].includes(role.id);
			const roleName = role.name.charAt(0).toUpperCase() + role.name.slice(1);
			const button = new ButtonBuilder()
				.setCustomId(`toggle_signup-creation_${role.id}`)
				.setLabel(roleName)
				.setStyle(isAllowed ? ButtonStyle.Success : ButtonStyle.Danger);

			actionRow.addComponents(button);
			count++;
		});

		// Add the last row if it has any buttons
		if (count > 0) {
			actionRows.push(actionRow);
		}

		await interaction.update({
			content: 'Välj vilka arbetsgrupper som ska ha behörighet att använda "Skapa signup" funktionen:',
			components: actionRows
		});
	}

	// Handle workgroup management buttons
	if (interaction.customId == "addWorkgroup") {
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
	}

	if (interaction.customId == "editWorkgroup") {
		// Get all roles with hex_arbet color
		const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));
		
		// Create action rows with buttons (max 5 per row)
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

		// Add the last row if it has any buttons
		if (count > 0) {
			actionRows.push(actionRow);
		}

		await interaction.reply({
			content: `**Redigera arbetsgrupp**:`,
			components: actionRows,
			flags: MessageFlags.Ephemeral
		});
	}

	if (interaction.customId == "removeWorkgroup") {
		// Get all roles with hex_arbet color
		const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_arbet).sort((a, b) => a.name.localeCompare(b.name));
		
		// Create action rows with buttons (max 5 per row)
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

		// Add the last row if it has any buttons
		if (count > 0) {
			actionRows.push(actionRow);
		}

		await interaction.reply({
			content: `**Ta bort arbetsgrupp**:`,
			components: actionRows,
			flags: MessageFlags.Ephemeral
		});
	}

	// Handle specific workgroup selection for editing
	if (interaction.customId.startsWith('editWorkgroup-')) {
		const roleId = interaction.customId.split('-')[1];
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
	}

	// Handle specific workgroup selection for removal
	if (interaction.customId.startsWith('removeWorkgroup-')) {
		const roleId = interaction.customId.split('-')[1];
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
	}

	// Handle final confirmation for removal
	if (interaction.customId.startsWith('confirmRemove-')) {
		const roleId = interaction.customId.split('-')[1];
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
	}

	// Handle final removal execution
	if (interaction.customId.startsWith('finalConfirmRemove-')) {
		const roleId = interaction.customId.split('-')[1];
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

			// Check if there's a channel in the arbetsgrupper category with the same name
			const category = interaction.guild.channels.cache.get(cat_Arbetsgrupper);
			if (category && category.type === ChannelType.GuildCategory) {
				const channels = category.children.cache;
				const channelNameToFind = role.name.replace(/\s+/g, '-');
				
				for (const [channelId, channel] of channels) {
					if (channel.name === channelNameToFind) {
						// Check if this channel only has this role as special permissions
						const permissionOverwrites = channel.permissionOverwrites.cache;
						let onlyThisRole = true;
						
						// Check if there are other roles with special permissions
						for (const [overwriteId, overwrite] of permissionOverwrites) {
							if (overwriteId !== role.id && overwriteId !== interaction.guild.roles.everyone.id) {
								// Check if it's a role (not a user)
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

			// Remove the role (this will also remove it from all members)
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

		} catch(error) {
			await interaction.update({
				content: `Fel uppstod vid borttagning: ${error.message}`,
				components: []
			});
			logActivity(`Error removing workgroup: ${error.message}`);
		}
	}

	// Handle section management buttons
	if (interaction.customId == "addSection") {
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
	}

	if (interaction.customId == "editSection") {
		// Get all roles with hex_instr color
		const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));
		
		// Create action rows with buttons (max 5 per row)
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

		// Add the last row if it has any buttons
		if (count > 0) {
			actionRows.push(actionRow);
		}

		await interaction.reply({
			content: `**Redigera sektion**:`,
			components: actionRows,
			flags: MessageFlags.Ephemeral
		});
	}

	if (interaction.customId == "removeSection") {
		// Get all roles with hex_instr color
		const roles = interaction.guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));
		
		// Create action rows with buttons (max 5 per row)
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

		// Add the last row if it has any buttons
		if (count > 0) {
			actionRows.push(actionRow);
		}

		await interaction.reply({
			content: `**Ta bort sektion**:`,
			components: actionRows,
			flags: MessageFlags.Ephemeral
		});
	}

	// Handle specific section selection for editing
	if (interaction.customId.startsWith('editSection-')) {
		const roleId = interaction.customId.split('-')[1];
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
	}

	// Handle specific section selection for removal
	if (interaction.customId.startsWith('removeSection-')) {
		const roleId = interaction.customId.split('-')[1];
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
	}

	// Handle final confirmation for section removal
	if (interaction.customId.startsWith('confirmRemoveSection-')) {
		const roleId = interaction.customId.split('-')[1];
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
	}

	// Handle final section removal execution
	if (interaction.customId.startsWith('finalConfirmRemoveSection-')) {
		const roleId = interaction.customId.split('-')[1];
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

			// Check if there's a channel in the sektioner category with the same name
			const category = interaction.guild.channels.cache.get(cat_Sektioner);
			if (category && category.type === ChannelType.GuildCategory) {
				const channels = category.children.cache;
				const channelNameToFind = role.name.replace(/\s+/g, '-');
				
				for (const [channelId, channel] of channels) {
					if (channel.name === channelNameToFind) {
						// Check if this channel only has this role as special permissions
						const permissionOverwrites = channel.permissionOverwrites.cache;
						let onlyThisRole = true;
						
						// Check if there are other roles with special permissions
						for (const [overwriteId, overwrite] of permissionOverwrites) {
							if (overwriteId !== role.id && overwriteId !== interaction.guild.roles.everyone.id) {
								// Check if it's a role (not a user)
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

			// Remove the role (this will also remove it from all members)
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

		} catch(error) {
			await interaction.update({
				content: `Fel uppstod vid borttagning: ${error.message}`,
				components: []
			});
			logActivity(`Error removing section: ${error.message}`);
		}
	}

});

////////////////
//// Signup ////
////////////////

// Signup modal
client.on('interactionCreate', async (interaction) => {
	try {
		if (!interaction.isButton()) return;

		if (interaction.customId == "btn_signupverktyg") {

			// Define required role IDs
			const allowedRoleIds = permissionSettings['signup-creation'] || [];
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

			// Create the "Skapa ny signup" button for authorized users
			const btn_newSignup = new ButtonBuilder()
				.setCustomId('btn_newSignup')
				.setLabel('Skapa ny signup')
				.setStyle(ButtonStyle.Primary);

			const row1_buttons = new ActionRowBuilder()
				.addComponents(btn_newSignup);

			// Fetch active events for dropdown
			let events = [];
			try {
				const files = fs.readdirSync(dir_EventsActive).filter(file => file.endsWith('.json'));
				
				// Read and parse all event files
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

				// Sort events with invalid dates first, then by date (newest first)
				events.sort((a, b) => {
					const da = a.date;
					const db = b.date;

					// Invalid dates first
					if (da === null && db === null) return 0;
					if (da === null) return -1;
					if (db === null) return 1;

					// Newest first for valid dates
					return da - db;
				});
			} catch (error) {
				logActivity(`Error fetching events for dropdown: ${error}`);
			}

			// Create components array
			const components = [row1_buttons];

			// Add dropdown if events exist
			if (events.length > 0) {
				const selectEdit = new StringSelectMenuBuilder()
					.setCustomId('editSignupDropdown')
					.setPlaceholder('Redigera spelning')
					.addOptions(
						events.slice(0, 25).map(event => { // Discord limit is 25 options
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

				// Add reminder dropdown
				const selectReminder = new StringSelectMenuBuilder()
					.setCustomId('reminderDropdown')
					.setPlaceholder('Skicka påminnelse')
					.addOptions(
						events.slice(0, 25).map(event => { // Discord limit is 25 options
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
		}

		if (interaction.customId == "btn_newSignup") {

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

			// Add inputs to the modal
			modal.addComponents(actionRow1, actionRow2, actionRow3, actionRow4, actionRow5);

			// Show the modal to the user
			await interaction.showModal(modal);
		}

		if (interaction.customId == "btn_signupHowTo") {
			// Thread IDs
			const threadIdNySignup = '1452645297418145903';
			const threadIdRedigeraSignup = '1452645545825800333';
			
			// Create thread links
			const threadLinkNySignup = `https://discord.com/channels/${interaction.guild.id}/${threadIdNySignup}`;
			const threadLinkRedigeraSignup = `https://discord.com/channels/${interaction.guild.id}/${threadIdRedigeraSignup}`;
			
			// Create the message with links
			const message = `# Hur gör jag?\n` +
				`## [Ny signup](${threadLinkNySignup})\n` +
				`## [Redigera signup](${threadLinkRedigeraSignup})`;
			
			await interaction.reply({
				content: message,
				flags: MessageFlags.Ephemeral
			});
		}
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

});

// Create signup
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isModalSubmit()) return;

	try {
		if (interaction.customId === 'modal_signup') {

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
			
			// Check the date format
			let correctedDate = checkDateFormat(signupDate);
			if (correctedDate != null) {
				signupDate = correctedDate;
			}
			
			// Check the time format
			let correctedTime = formatTimeInput(signupTime);
			if (correctedTime !== signupTime) {
				signupTime = correctedTime;
			}
			
			let contentReply = `${interaction.user} Spelningen skapad. Se #verktyg för att se detaljerade signup-listor.`;
			if (correctedDate == null) contentReply += '\n_Om du vill att datumet ska fungera i kalendern behöver formatet se ut såhär: DD/MM/YY_';

			// Join date and time
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

			// Create file for signup
			let guild = client.guilds.cache.get(guildId);
			let roles = guild.roles.cache.filter(role => role.hexColor === hex_instr).sort((a, b) => a.name.localeCompare(b.name));
			let instruments = {};
			let messageId = null;

			roles.forEach((role) => {
				instruments[role.name] = [];
			});

			// Send message
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
			}
			fs.writeFileSync(dir_EventsActive + '/' + makeFileNameFriendly(signupName) + '_' + signupId + '.json', JSON.stringify(signupData));

			// Create discussion thread for the event
			eventThread(signupData);

			await interaction.reply({ content: contentReply, flags: MessageFlags.Ephemeral });
		
			logActivity(getNickname(interaction) + " created a new signup: " + signupName);
			postCalendar(true);
			verktygSignup();

		}

		if (interaction.customId.startsWith('modal_signup_edit_')) {
			const fields = interaction.fields;
			let signupName = fields.getTextInputValue('nameInput_edit');
			let signupEditDate = fields.getTextInputValue('dateInput_edit');
			let signupEditTime = fields.getTextInputValue('timeInput_edit');
			let signupEditLoc = fields.getTextInputValue('locInput_edit');
			let signupEditInfo = fields.getTextInputValue('infoInput_edit');
			let signupEditId = fields.getTextInputValue('signupId_edit');

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
			
			// Check the date format
			let correctedDate = checkDateFormat(signupEditDate);
			if (correctedDate != null) {
				signupEditDate = correctedDate;
			}
			
			let contentReply = "**" + signupName + "** uppdaterad!";
			if (correctedDate == null) contentReply += '\n_Om du vill att datumet ska fungera i kalendern behöver formatet se ut såhär: DD/MM/YY_';

			// Join date and time
			let signupEditDateAndTime = "";
			if (signupEditTime == "") {
				signupEditDateAndTime = signupEditDate;
			} else {
				signupEditDateAndTime = signupEditDate + " | " + signupEditTime;
			}
			const embedEdit = {
				"title": signupName,
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

			// Find the file with the matching ID
			let files = fs.readdirSync(dir_EventsActive);
			let fileName = files.find(file => file.endsWith('_' + signupEditId + '.json'));
			if (!fileName) return;

			// Read and update the JSON file
			lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
				if (err) {
					console.error('Failed to acquire lock:', err);
					return;
				}
				// The lock was acquired. Now you can read/update your file safely.
				let data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));

				// Change the name of the signup
				data.name = signupName;
				data.date = signupEditDate;
				data.time = signupEditTime;
				data.location = signupEditLoc;

				fs.writeFileSync(path.join(dir_EventsActive, fileName), JSON.stringify(data));
    
				// Release the lock
				lockFile.unlock(`${fileName}.lock`, (err) => {
					if (err) {
						console.error('Failed to unlock:', err);
					}
				});
				
			});

			await message.edit({ embeds: [embedEdit], components: [row_buttons] });
			await interaction.reply({ content: contentReply, flags: MessageFlags.Ephemeral });

			logActivity("Signup for " + signupName + " was edited by " + getNickname(interaction));
			postCalendar(true);
			verktygSignup();

		}
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
});

// Edit signup dropdown handler
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isStringSelectMenu()) return;
	if (interaction.customId !== 'editSignupDropdown') return;

	try {
		const selectedEventId = interaction.values[0];
		
		// Find the event file
		const files = fs.readdirSync(dir_EventsActive);
		const fileName = files.find(file => file.endsWith('_' + selectedEventId + '.json'));
		
		if (!fileName) {
			await interaction.reply({ 
				content: 'Kunde inte hitta spelningen. Den kanske har tagits bort.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Parse the event data
		const data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));
		
		// Fetch the message from the signup channel
		const signupChannel = client.channels.cache.get(ch_Signup);
		if (!signupChannel) {
			await interaction.reply({ 
				content: 'Kunde inte hitta signup-kanalen.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		let targetMessage;
		try {
			targetMessage = await signupChannel.messages.fetch(data.link);
		} catch (error) {
			await interaction.reply({ 
				content: 'Kunde inte hitta meddelandet för denna spelning. Det kanske har tagits bort.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Get the embed to extract event details
		const embed = targetMessage.embeds[0];
		if (!embed) {
			await interaction.reply({ 
				content: 'Kunde inte hitta eventdetaljer för denna spelning.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Create edit buttons (same as "Ändra signup" context menu)
		const btn_redigera = new ButtonBuilder()
			.setCustomId('redigera_' + targetMessage.id)
			.setLabel('Redigera')
			.setStyle(ButtonStyle.Primary);

		const btn_avboj = new ButtonBuilder()
			.setCustomId(embed.title.includes('~~') ? 'oppna_' + targetMessage.id : 'avboj_' + targetMessage.id)
			.setLabel(embed.title.includes('~~') ? 'Öppna' : 'Avböj')
			.setStyle(ButtonStyle.Primary);

		const btn_tabort = new ButtonBuilder()
			.setCustomId('tabort_' + targetMessage.id)
			.setLabel('Ta bort')
			.setStyle(ButtonStyle.Danger);

		const row_buttons = new ActionRowBuilder()
			.addComponents(btn_redigera, btn_avboj, btn_tabort);

		await interaction.reply({ 
			content: "Ändra signupen: **" + embed.title.replace(/~~/g, '').replaceAll('[AVBÖJD] ', '') + "**", 
			components: [row_buttons], 
			flags: MessageFlags.Ephemeral 
		});

	} catch (error) {
		logActivity(`Error in editSignupDropdown handler: ${error}`);
		await interaction.reply({ 
			content: 'Ett fel uppstod när spelningen skulle hämtas.', 
			flags: MessageFlags.Ephemeral 
		});
	}
});

// Reminder dropdown handler
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isStringSelectMenu()) return;
	if (interaction.customId !== 'reminderDropdown') return;

	try {
		const selectedEventId = interaction.values[0];
		
		// Find the event file
		const files = fs.readdirSync(dir_EventsActive);
		const fileName = files.find(file => file.endsWith('_' + selectedEventId + '.json'));
		
		if (!fileName) {
			await interaction.reply({ 
				content: 'Kunde inte hitta spelningen. Den kanske har tagits bort.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Parse the event data
		const data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));
		
		// Check if reminder has already been sent (property may not exist, so check explicitly)
		const reminderAlreadySent = data.hasOwnProperty('remindersSent') && data.remindersSent === true;
		const warningText = reminderAlreadySent ? '\n\n⚠️ **En påminnelse har tidigare redan skickats för denna spelning.**\n\n' : '';
		
		// Create confirmation button
		const btn_sendReminder = new ButtonBuilder()
			.setCustomId('sendReminder_' + selectedEventId)
			.setLabel('Skicka påminnelse')
			.setStyle(ButtonStyle.Primary);

		const row_buttons = new ActionRowBuilder()
			.addComponents(btn_sendReminder);

		await interaction.reply({ 
			content: `Detta kommer skicka ett meddelande till alla aktiva medlemmar som __inte__ svarat på spelningen **${data.name}** med en påminnelse om att svara på signupen.${warningText}`, 
			components: [row_buttons], 
			flags: MessageFlags.Ephemeral 
		});

	} catch (error) {
		logActivity(`Error in reminderDropdown handler: ${error}`);
		await interaction.reply({ 
			content: 'Ett fel uppstod när spelningen skulle hämtas.', 
			flags: MessageFlags.Ephemeral 
		});
	}
});

// Send reminder button handler
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;
	if (!interaction.customId.startsWith('sendReminder_')) return;

	try {
		const eventId = interaction.customId.split('_')[1];
		
		// Find the event file
		const files = fs.readdirSync(dir_EventsActive);
		const fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
		
		if (!fileName) {
			await interaction.reply({ 
				content: 'Kunde inte hitta spelningen. Den kanske har tagits bort.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Parse the event data
		const data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));
		
		// Get active role
		const aktivRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'aktiv');
		if (!aktivRole) {
			await interaction.reply({ 
				content: 'Kunde inte hitta "aktiv" medlemmar.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Get all active members
		const aktivMembers = aktivRole.members;
		
		// Get all user IDs that have signed up to this event
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

		// Filter out members who have signed up and bots
		const membersToRemind = aktivMembers.filter(member => 
			!member.user.bot && 
			!signedUpUserIds.has(member.id)
		);

		// Format event date
		let eventDateString = data.date || 'Okänt datum';
		if (data.time) {
			eventDateString += ` | ${data.time}`;
		}

		// Create event link
		const eventLink = `https://discord.com/channels/${guildId}/${ch_Signup}/${data.link}`;

		// For testing: Show ephemeral message with users in plain text
		const userList = Array.from(membersToRemind.values())
			.map(m => m.displayName || m.user.username)
			.join(', ');

		// This will add the property for remindersSent if it doesn't exist, or update it if it does
		data.remindersSent = true;
		fs.writeFileSync(path.join(dir_EventsActive, fileName), JSON.stringify(data, null, 2));

		// Send message to ch_PrivataMeddelanden as a private thread
		const reminderChannel = client.channels.cache.get(ch_PrivataMeddelanden);
		if (!reminderChannel) {
			await interaction.reply({ 
				content: 'Kunde inte hitta kanalen för privata meddelanden.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Create mentions list
		const mentionIds = Array.from(membersToRemind.keys());
		const mentions = mentionIds.map(id => `<@${id}>`).join(' ');

		// Create a private thread for the reminder
		const thread = await reminderChannel.threads.create({
			name: `Påminnelse: ${data.name}`.slice(0, 100),
			autoArchiveDuration: 10080, // Archive after 1 week
			type: ChannelType.PrivateThread,
		});

		// Add all members to the thread
		for (const memberId of mentionIds) {
			try {
				await thread.members.add(memberId);
			} catch (error) {
				logActivity(`Error adding member ${memberId} to reminder thread: ${error.message}`);
			}
		}

		// Create signup buttons for the reminder message
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

		// Send reminder message in the private thread with buttons
		await thread.send({
			content: `Kära Kirrisar!\n\nNi som taggats i detta meddelande har inte svarat på signupen för **${data.name}**.\nSvara så snart som möjligt, även om du inte kan delta, så att vi kan planera för spelningen!✨\n\n**Datum:** ${eventDateString}\n**Signup:** ${eventLink}\n\n-# ${mentions}`,
			components: [row_reminder_buttons],
			allowedMentions: { users: mentionIds }
		});

		// Update JSON file to mark reminder as sent
		// This will add the property if it doesn't exist, or update it if it does
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
});

// Signup button response
client.on(Events.InteractionCreate, async interaction => {
	try {
		if (!interaction.isButton()) return;

		let buttonId = interaction.customId;
		if (!['ja', 'nej', 'kanske'].includes(buttonId)) return;

		let userId = interaction.user.id;
		let guildId = interaction.guild.id;
		let messageId = interaction.message.id;

		// Get the user's roles with the color #e91e63
		let guild = client.guilds.cache.get(guildId);
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
			.setRequired(false)

		const actionRow = new ActionRowBuilder().addComponents(noteInput);
	
		// Add inputs to the modal
		modal.addComponents(actionRow);
		
		// Show the modal to the user
		await interaction.showModal(modal);

		let modalNote = "";
		// Get the Modal Submit Interaction that is emitted once the User submits the Modal
		const submitted = await interaction.awaitModalSubmit({
			// Timeout after a minute of not receiving any valid Modals
			time: 60000,
			// Make sure we only accept Modals from the User who sent the original Interaction we're responding to
			filter: i => i.user.id === interaction.user.id,
		}).catch(error => {
			// Catch any Errors that are thrown (e.g. if the awaitModalSubmit times out after 60000 ms)
			console.error(error)
			return null
		})
		
		if (submitted) {
			modalNote = submitted.fields.getTextInputValue('noteInput')
		} else {
			modalNote = "";
		}

		// Get the message and extract the ID from the footer
		let message = await interaction.channel.messages.fetch(messageId);
		let embed = message.embeds[0];
		let id = embed.footer.text.split(': ')[1];

		// Find the file with the matching ID
		let files = fs.readdirSync(dir_EventsActive);
		let fileName = files.find(file => file.endsWith('_' + id + '.json'));
		if (!fileName) return;

		// Read and update the JSON file
		lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
			if (err) {
				console.error('Failed to acquire lock:', err);
				return;
			}
			// The lock was acquired. Now you can read/update your file safely.
			let data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));

			// Remove the user from all roles in the file
			for (let role in data.signups) {
				data.signups[role] = data.signups[role].filter(entry => entry.name !== member.displayName);
			}

			// Add the user to their current roles
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
			
			// Update the event thread in ch_Spelningar
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
						// Interaction has expired (3 second window for buttons)
						// Check if interaction was already replied to before using followUp
						if (submitted.replied || submitted.deferred) {
							try {
								await submitted.followUp({ content: replyContent, flags: MessageFlags.Ephemeral });
							} catch (followUpError) {
								logActivity(`Failed to send followUp message to ${member.displayName} on ${data.name} (interaction ID: ${submitted.id}, already replied: ${submitted.replied}, deferred: ${submitted.deferred}): ${followUpError.message}${followUpError.code ? ` (code: ${followUpError.code})` : ''}`);
							}
						} else {
						// Interaction expired and was never replied to - cannot use followUp
						logActivity(`Interaction expired for ${member.displayName} on ${data.name} (interaction ID: ${submitted.id}). Could not reply or send DM. Signup was processed successfully. Error: ${error.message}`);
						}
					} else {
						// Log other types of errors with context
						logActivity(`Error replying to interaction for ${member.displayName} on ${data.name} (interaction ID: ${submitted.id}): ${error.message}${error.code ? ` (code: ${error.code})` : ''}`);
					}
				}
			} else {
				// Modal timed out, but we still processed the signup
			}

		});
	} catch (error) {
		logActivity(error);
	}
});

// Reminder button response handler
client.on(Events.InteractionCreate, async interaction => {
	try {
		if (!interaction.isButton()) return;

		let buttonId = interaction.customId;
		if (!buttonId.startsWith('reminder_')) return;

		// Extract response type and event ID from button ID (format: reminder_ja_<eventId>)
		const parts = buttonId.split('_');
		if (parts.length !== 3) return;
		
		const responseType = parts[1]; // ja, nej, or kanske
		const eventId = parts[2];

		if (!['ja', 'nej', 'kanske'].includes(responseType)) return;

		let userId = interaction.user.id;
		let guildId = interaction.guild.id;

		// Get the user's roles with the color #e91e63
		let guild = client.guilds.cache.get(guildId);
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

		// Check if event exists in active directory
		let files = fs.readdirSync(dir_EventsActive);
		let fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
		
		// If not found in active, check archived directory
		let isArchived = false;
		if (!fileName) {
			if (fs.existsSync(dir_EventsArchived)) {
				files = fs.readdirSync(dir_EventsArchived);
				fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
				isArchived = !!fileName;
			}
		}

		// If still not found, event doesn't exist
		if (!fileName) {
			await interaction.reply({ 
				content: 'Spelningen är tyvärr inte längre aktuell.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Read the event data
		const filePath = isArchived ? path.join(dir_EventsArchived, fileName) : path.join(dir_EventsActive, fileName);
		let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

		// Check if event is inactive (active: false) or archived
		if (isArchived || data.active === false) {
			await interaction.reply({ 
				content: 'Spelningen är tyvärr inte längre aktuell.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Process the signup (only if event is active)
		lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
			if (err) {
				console.error('Failed to acquire lock:', err);
				return;
			}

			// Re-read the file to ensure we have the latest data
			let data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));

			// Remove the user from all roles in the file
			for (let role in data.signups) {
				data.signups[role] = data.signups[role].filter(entry => entry.name !== member.displayName);
			}

			// Add the user to their current roles
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
			
			// Update the event thread in ch_Spelningar
			eventThreadUpdate(eventId);

			lockFile.unlock(`${fileName}.lock`, (err) => {
				if (err) {
					console.error('Failed to unlock:', err);
				}
			});

			// Format response text
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
			// Interaction might have already been replied to
			logActivity(`Error replying to reminder button interaction: ${replyError}`);
		}
	}
});

function makeFileNameFriendly(str) {
    let newStr = str.toLowerCase(); // Convert to lower case
    newStr = newStr.replace(/å/g, 'a'); // Replace å with a
    newStr = newStr.replace(/ä/g, 'a'); // Replace ä with a
    newStr = newStr.replace(/ö/g, 'o'); // Replace ö with o
    newStr = newStr.replace(/\s/g, '_'); // Replace spaces with _
    newStr = newStr.replace(/[\/\\:*?"<>|]/g, ''); // Remove special characters
    newStr = newStr.replace(/[^a-z0-9_]/g, ''); // Remove any remaining non-alphanumeric, non-underscore characters
    return newStr;
}

// Event listener for dropdown selections
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isStringSelectMenu() || !interaction.customId.startsWith('signupDropdown_')) return;

    try {

		switch (interaction.customId.split('_')[1]) {
			case "listaSvar": await listaSvar(interaction, interaction.values[0]); break;
			case "listaInstrument": await listaInstrument(interaction, interaction.values[0]); break;
			case "listaKost": await listaDetaljer(interaction, interaction.values[0], "kost"); break;
			case "listaKorkort": await listaDetaljer(interaction, interaction.values[0], "korkort"); break;
			case "listaBil": await listaDetaljer(interaction, interaction.values[0], "bil"); break;
			default: throw new Error("Could not find a matching ID");
		}

		// Reset dropwdown
        await interaction.message.edit({
            components: interaction.message.components // Re-add the same components
        });
        
    } catch (error) {

        logActivity('Error handling event selection:', error);
        await interaction.reply({
            content: 'Ett fel uppstod vid hämtning av spelningen', flags: MessageFlags.Ephemeral
        });

    }
});

// Show signup list from reply
async function listaSvar(interaction, eventId) {

	let files = fs.readdirSync(dir_EventsActive);
	let fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
	let data = JSON.parse(fs.readFileSync(dir_EventsActive + '/' + fileName));

	let name = data.name;
	let signups = {};
	let kanskeReplies = {};
	let nejReplies = {};
	let uniqueNames = new Set();

	for (let instrument in data.signups) {
		data.signups[instrument].forEach(signup => {
			uniqueNames.add(signup.name);
			if (signup.response === 'ja') {
				if (signups[signup.name]) {
					signups[signup.name].instruments.push(instrument.charAt(0).toUpperCase() + instrument.slice(1));
				} else {
					signups[signup.name] = {instruments: [instrument.charAt(0).toUpperCase() + instrument.slice(1)], note: signup.note};
				}
			} else if (signup.response === 'kanske') {
				if (kanskeReplies[signup.name]) {
					kanskeReplies[signup.name].instruments.push(instrument.charAt(0).toUpperCase() + instrument.slice(1));
				} else {
					kanskeReplies[signup.name] = {instruments: [instrument.charAt(0).toUpperCase() + instrument.slice(1)], note: signup.note};
				}
			} else if (signup.response === 'nej') {
				if (nejReplies[signup.name]) {
					nejReplies[signup.name].instruments.push(instrument.charAt(0).toUpperCase() + instrument.slice(1));
				} else {
					nejReplies[signup.name] = {instruments: [instrument.charAt(0).toUpperCase() + instrument.slice(1)], note: signup.note};
				}
			}
		});
	}

	const emote_ja = client.emojis.cache.find(emoji => emoji.name === "ja");
	const emote_kanske = client.emojis.cache.find(emoji => emoji.name === "kanske");
	const emote_nej = client.emojis.cache.find(emoji => emoji.name === "nej");

	let message = `**${name}** (${uniqueNames.size} svar)\n\n${emote_ja}\n`;
	for (let signup in signups) {
		message += `**${signup}**: ${signups[signup].instruments.join(', ')}`;
		if (signups[signup].note) {
			message += ` (*${signups[signup].note}*)`;
		}
		message += '\n';
	}

	message += `${emote_kanske}\n` + Object.keys(kanskeReplies).map(name => `**${name}**: ${kanskeReplies[name].instruments.join(', ')}` + (kanskeReplies[name].note ? ` (*${kanskeReplies[name].note}*)` : '')).join('\n');
	message += `\n${emote_nej}\n` + Object.keys(nejReplies).map(name => `**${name}**: ${nejReplies[name].instruments.join(', ')}` + (nejReplies[name].note ? ` (*${nejReplies[name].note}*)` : '')).join('\n');

	await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
};

// Show signup list from instrument
async function listaInstrument(interaction, eventId) {

	let files = fs.readdirSync(dir_EventsActive);
	let fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
	let data = JSON.parse(fs.readFileSync(dir_EventsActive + '/' + fileName));

	// Initialize a Set object to store all unique names
	let allUniqueNames = new Set();

	for (let instrument in data.signups) {
		let names = data.signups[instrument].filter(signup => signup.response === 'ja').map(signup => signup.name);
		// Add each name to the Set object
		names.forEach(name => allUniqueNames.add(name));
	}

	// Now, allUniqueNames.size will give you the total number of unique names that replied with "ja"
	let name = data.name;
	const emote_ja = client.emojis.cache.find(emoji => emoji.name === "ja");
	let message = `**${name}** (${allUniqueNames.size} ja)\n\n${emote_ja}\n`;

	for (let instrument in data.signups) {
		// Capitalize the first letter of the instrument name
		let capitalizedInstrument = instrument.charAt(0).toUpperCase() + instrument.slice(1);
		message += `**${capitalizedInstrument}** `;
		let names = data.signups[instrument].filter(signup => signup.response === 'ja').map(signup => signup.name);
		message += names.length > 0 ? names.join(', ') : '';
		message += '\n';
	}

	await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
};

async function listaDetaljer(interaction, eventId, dataType) {
    const validTypes = ['kost', 'korkort', 'bil'];
    if (!validTypes.includes(dataType)) {
        return interaction.reply({ content: 'Ogiltig datatyp vald', flags: MessageFlags.Ephemeral });
    }

    try {
        // Load event data
        const eventFiles = fs.readdirSync(dir_EventsActive);
        const eventFile = eventFiles.find(file => file.endsWith(`_${eventId}.json`));
        const eventData = JSON.parse(fs.readFileSync(`${dir_EventsActive}/${eventFile}`, 'utf8'));

        // Load user details
        const detailsList = JSON.parse(fs.readFileSync('src/detailsList.json', 'utf8'));
        
        // Process all "ja" responses
        const uniqueNames = new Set();
        const userDetails = [];

        for (const [instrument, signups] of Object.entries(eventData.signups)) {
            signups.filter(s => s.response === 'ja').forEach(({ name }) => {
                if (!uniqueNames.has(name)) {
                    uniqueNames.add(name);
                    
                    // Find user in detailsList
                    const userDetail = [...detailsList.aktiv, ...detailsList.inaktiv]
                        .find(u => u.namn === name);

                    userDetails.push({
                        name,
                        data: userDetail?.[dataType] || '-'
                    });
                }
            });
        }

        // Swedish sorting
        userDetails.sort((a, b) => {
            const customOrder = 'abcdefghijklmnopqrstuvwxyzåäö';
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();

            for (let i = 0; i < Math.min(nameA.length, nameB.length); i++) {
                const charA = customOrder.indexOf(nameA[i]);
                const charB = customOrder.indexOf(nameB[i]);
                
                if (charA !== charB) return charA - charB;
            }
            return nameA.length - nameB.length;
        });

		let listEmoji = "";
		switch (dataType) {
			case "kost": listEmoji = "🥦 Kost"; break;
			case "korkort": listEmoji = "🪪 Körkort"; break;
			case "bil": listEmoji = "🚗 Bil"; break;
		}

        // Build message
        let message = `**${eventData.name}** (${userDetails.length} ja)\n${listEmoji}\n\n`;
        message += userDetails.map(u => `**${u.name}:** ${u.data}`).join('\n');

        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });

    } catch (error) {
        console.error('Error:', error);
        await interaction.reply({ content: 'Ett fel uppstod', flags: MessageFlags.Ephemeral });
    }
};
async function listaKorkort(interaction, eventId) {
	await interaction.reply({
		content: 'Den här funktionen är ännu inte implementerad', flags: MessageFlags.Ephemeral
	});
};
async function listaBil(interaction, eventId) {
	await interaction.reply({
		content: 'Den här funktionen är ännu inte implementerad', flags: MessageFlags.Ephemeral
	});
};

// Edit signup
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isContextMenuCommand()) return;
	if (interaction.commandName === 'Ändra signup') {
		
		let targetMessage = await interaction.channel.messages.fetch(interaction.targetId);
		let embed = targetMessage.embeds[0];

		if (!targetMessage.components ||
			targetMessage.components.length == 0 ||
			!targetMessage.components[0].components ||
			targetMessage.components[0].components.length == 0
		) {
			await interaction.reply({ content: "Det här kommandot fungerar bara på aktiva signups.", flags: MessageFlags.Ephemeral });
			return;
		}

		let buttons = targetMessage.components[0].components;

		// Check if it's a valid "signup" message
		let validButtons = buttons.filter(button => ['ja', 'nej', 'kanske'].includes(button.customId));
		if (validButtons.length !== 3) {
			await interaction.reply({ content: "Det här kommandot fungerar bara på aktiva signups.", flags: MessageFlags.Ephemeral });
			return;
		}

		// Create new buttons
		const btn_redigera = new ButtonBuilder()
			.setCustomId('redigera_' + targetMessage.id)
			.setLabel('Redigera')
			.setStyle(ButtonStyle.Primary);

		const btn_avboj = new ButtonBuilder()
			.setCustomId(embed.title.includes('~~') ? 'oppna_' + targetMessage.id : 'avboj_' + targetMessage.id)
			.setLabel(embed.title.includes('~~') ? 'Öppna' : 'Avböj')
			.setStyle(ButtonStyle.Primary);

		const btn_tabort = new ButtonBuilder()
			.setCustomId('tabort_' + targetMessage.id)
			.setLabel('Ta bort')
			.setStyle(ButtonStyle.Danger);

		const row_buttons = new ActionRowBuilder()
			.addComponents(btn_redigera, btn_avboj, btn_tabort);

		await interaction.reply({ content: "Ändra signupen: **" + embed.title.replace(/~~/g, '').replaceAll('[AVBÖJD] ', '') + "**", components: [row_buttons], flags: MessageFlags.Ephemeral });
	}
});

// Helper function to get event JSON by event ID (active directory only)
function getEventJSON(eventId) {
	try {
		const files = fs.readdirSync(dir_EventsActive);
		const fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
		if (!fileName) {
			return null;
		}
		const filePath = path.join(dir_EventsActive, fileName);
		return JSON.parse(fs.readFileSync(filePath, 'utf8'));
	} catch (error) {
		logActivity(`Error loading event JSON for ID ${eventId}: ${error.message}`);
		return null;
	}
}

// Helper function to update information message in thread
async function updateInformationMessage(thread, text) {
	try {
		const messages = await thread.messages.fetch({ limit: 20 });
		const messageArray = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
		if (messageArray.length >= 2) {
			const informationMessage = messageArray[1]; // Second message (after starter)
			if (informationMessage.content.startsWith('Information:')) {
				const newContent = text ? `## ℹ️ Information ${text}` : '## ℹ️ Information';
				await informationMessage.edit(newContent);
				return informationMessage.id;
			}
		}
		return null;
	} catch (error) {
		logActivity(`Error updating information message: ${error.message}`);
		return null;
	}
}

// Helper function to get participant user IDs from event signups
function getParticipantUserIds(eventData) {
	const userIds = new Set();
	if (eventData.signups) {
		for (const instrument in eventData.signups) {
			for (const signup of eventData.signups[instrument]) {
				if (signup.response === 'ja' || signup.response === 'kanske') {
					if (signup.id) {
						userIds.add(signup.id);
					}
				}
			}
		}
	}
	return Array.from(userIds);
}

// Slash command: /info
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	if (interaction.commandName !== 'info') return;

	try {
		// Check if command was used in a thread
		if (!interaction.channel.isThread()) {
			await interaction.reply({ 
				content: 'Det här kommandot kan bara användas i en tråd för spelningar.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		const thread = interaction.channel;

		// Get the starter message to extract event ID
		let starterMessage = null;
		try {
			starterMessage = await thread.fetchStarterMessage();
		} catch (err) {
			// Fallback for older threads
			try {
				starterMessage = await thread.messages.fetch(thread.id);
			} catch (fallbackErr) {
				await interaction.reply({ 
					content: 'Kunde inte hitta event-ID i tråden.', 
					flags: MessageFlags.Ephemeral 
				});
				return;
			}
		}

		if (!starterMessage || starterMessage.author.id !== client.user.id) {
			await interaction.reply({ 
				content: 'Det här kommandot kan bara användas i en tråd för spelningar.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Extract event ID from the starter message
		const eventIdMatch = starterMessage.content.match(/-#\s*(\d+)\s*$/m);
		if (!eventIdMatch) {
			await interaction.reply({ 
				content: 'Kunde inte hitta event-ID i tråden.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		const eventId = eventIdMatch[1];

		// Load event JSON from active directory only
		const eventData = getEventJSON(eventId);
		if (!eventData) {
			await interaction.reply({ 
				content: 'Detta event har passerat.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Check if information field exists
		if (!eventData.information) {
			await interaction.reply({ 
				content: 'Detta event har inget informationsmeddelande.', 
				flags: MessageFlags.Ephemeral 
			});
			return;
		}

		// Get current information text
		const currentText = eventData.information.text || '';

		// Create buttons
		const btn_add = new ButtonBuilder()
			.setCustomId(`info_add_${eventId}`)
			.setLabel('Lägg till info')
			.setStyle(ButtonStyle.Primary);

		const btn_edit = new ButtonBuilder()
			.setCustomId(`info_edit_${eventId}`)
			.setLabel('Ändra info')
			.setStyle(ButtonStyle.Secondary);

		const row = new ActionRowBuilder()
			.addComponents(btn_add, btn_edit);

		await interaction.reply({
			content: 'Välj vad du vill göra:',
			components: [row],
			flags: MessageFlags.Ephemeral
		});

	} catch (error) {
		logActivity(`Error handling /info command: ${error.message}`);
		await interaction.reply({ 
			content: 'Ett fel uppstod när kommandot kördes.', 
			flags: MessageFlags.Ephemeral 
		}).catch(() => {});
	}
});

// Button handlers for /info command
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;
	
	// Handle "Lägg till info" button
	if (interaction.customId.startsWith('info_add_')) {
		try {
			const eventId = interaction.customId.split('_')[2];
			const eventData = getEventJSON(eventId);
			
			if (!eventData) {
				await interaction.reply({
					content: 'Detta event har passerat.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			if (!eventData.information) {
				await interaction.reply({
					content: 'Detta event har inget informationsmeddelande.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			const currentText = eventData.information.text || '';
			const maxLength = Math.max(1, 1200 - currentText.length);

			// Create modal title with event name (truncate to 45 chars including "...")
			let modalTitle = `Lägg till information för ${eventData.name}`;
			if (modalTitle.length > 45) {
				modalTitle = modalTitle.substring(0, 42) + '...';
			}

			const modal = new ModalBuilder()
				.setCustomId(`modal_info_add_${eventId}`)
				.setTitle(modalTitle);

			const textInput = new TextInputBuilder()
				.setCustomId('infoTextInput')
				.setLabel('Ny information')
				.setStyle(TextInputStyle.Paragraph)
				.setMaxLength(maxLength)
				.setRequired(true);

			const actionRow = new ActionRowBuilder().addComponents(textInput);
			modal.addComponents(actionRow);

			await interaction.showModal(modal);
		} catch (error) {
			logActivity(`Error showing add info modal: ${error.message}`);
			await interaction.reply({
				content: 'Ett fel uppstod när modalen skulle visas.',
				flags: MessageFlags.Ephemeral
			}).catch(() => {});
		}
		return;
	}

	// Handle "Ändra info" button
	if (interaction.customId.startsWith('info_edit_')) {
		try {
			const eventId = interaction.customId.split('_')[2];
			const eventData = getEventJSON(eventId);
			
			if (!eventData) {
				await interaction.reply({
					content: 'Detta event har passerat.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			if (!eventData.information) {
				await interaction.reply({
					content: 'Detta event har inget informationsmeddelande.',
					flags: MessageFlags.Ephemeral
				});
				return;
			}

			const currentText = eventData.information.text || '';

			// Create modal title with event name (truncate to 45 chars including "...")
			let modalTitle = `Ändra information för ${eventData.name}`;
			if (modalTitle.length > 45) {
				modalTitle = modalTitle.substring(0, 42) + '...';
			}

			const modal = new ModalBuilder()
				.setCustomId(`modal_info_edit_${eventId}`)
				.setTitle(modalTitle);

			const textInput = new TextInputBuilder()
				.setCustomId('infoTextInput')
				.setLabel('Redigera information')
				.setStyle(TextInputStyle.Paragraph)
				.setMaxLength(1200)
				.setValue(currentText)
				.setRequired(true);

			const actionRow = new ActionRowBuilder().addComponents(textInput);
			modal.addComponents(actionRow);

			await interaction.showModal(modal);
		} catch (error) {
			logActivity(`Error showing edit info modal: ${error.message}`);
			await interaction.reply({
				content: 'Ett fel uppstod när modalen skulle visas.',
				flags: MessageFlags.Ephemeral
			}).catch(() => {});
		}
		return;
	}
});

// Modal submission handler for /info command
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isModalSubmit()) return;
	if (!interaction.customId.startsWith('modal_info_add_') && !interaction.customId.startsWith('modal_info_edit_')) return;

	try {
		const isAdd = interaction.customId.startsWith('modal_info_add_');
		const eventId = interaction.customId.split('_')[3];
		const newText = interaction.fields.getTextInputValue('infoTextInput');

		// Load event JSON
		const files = fs.readdirSync(dir_EventsActive);
		const fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
		
		if (!fileName) {
			await interaction.reply({
				content: 'Detta event har passerat.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		const filePath = path.join(dir_EventsActive, fileName);

		// Use lockFile to safely update JSON
		lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
			if (err) {
				logActivity(`Failed to acquire lock for ${fileName}: ${err.message}`);
				await interaction.reply({
					content: 'Ett fel uppstod när informationen skulle sparas.',
					flags: MessageFlags.Ephemeral
				}).catch(() => {});
				return;
			}

			try {
				// Re-read the file to ensure we have the latest data
				let eventData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

				// Verify information field exists
				if (!eventData.information) {
					lockFile.unlock(`${fileName}.lock`, () => {});
					await interaction.reply({
						content: 'Detta event har inget informationsmeddelande.',
						flags: MessageFlags.Ephemeral
					});
					return;
				}

				// Update text
				if (isAdd) {
					// Append with two newline separators
					eventData.information.text = (eventData.information.text || '') + '\n\n' + newText;
				} else {
					// Replace entirely
					eventData.information.text = newText;
				}

				// Save updated JSON
				fs.writeFileSync(filePath, JSON.stringify(eventData));

				// Get thread from interaction
				const thread = interaction.channel;
				if (!thread.isThread()) {
					lockFile.unlock(`${fileName}.lock`, () => {});
					await interaction.reply({
						content: 'Ett fel uppstod.',
						flags: MessageFlags.Ephemeral
					});
					return;
				}

				// Update information message in thread
				const messageId = await updateInformationMessage(thread, eventData.information.text);

				lockFile.unlock(`${fileName}.lock`, (err) => {
					if (err) {
						logActivity(`Failed to unlock ${fileName}: ${err.message}`);
					}
				});

				// Create notification buttons
				const btn_notify_thread = new ButtonBuilder()
					.setCustomId(`info_notify_thread_${eventId}`)
					.setLabel('Meddela i tråden utan att tagga medverkande')
					.setStyle(ButtonStyle.Secondary);

				const btn_notify_tagged = new ButtonBuilder()
					.setCustomId(`info_notify_tagged_${eventId}`)
					.setLabel('Tagga medverkande i ett meddelande i tråden')
					.setStyle(ButtonStyle.Secondary);

				const btn_notify_silent = new ButtonBuilder()
					.setCustomId(`info_notify_silent_${eventId}`)
					.setLabel('Uppdatera tyst - inget nytt meddelande')
					.setStyle(ButtonStyle.Secondary);

				const row = new ActionRowBuilder()
					.addComponents(btn_notify_thread, btn_notify_tagged, btn_notify_silent);

				// Store messageId in a way we can access it later (we'll need it for the link)
				// We can store it in the button customId or use a different approach
				// For now, we'll fetch it again when needed

				await interaction.reply({
					content: 'Vill du meddela att ny information lagts till?',
					components: [row],
					flags: MessageFlags.Ephemeral
				});

				logActivity(`${getNickname(interaction)} ${isAdd ? 'added' : 'edited'} information for event: ${eventData.name || 'unknown'}`);

			} catch (error) {
				lockFile.unlock(`${fileName}.lock`, () => {});
				logActivity(`Error updating information: ${error.message}`);
				await interaction.reply({
					content: 'Ett fel uppstod när informationen skulle sparas.',
					flags: MessageFlags.Ephemeral
				}).catch(() => {});
			}
		});
	} catch (error) {
		logActivity(`Error handling info modal submission: ${error.message}`);
		await interaction.reply({
			content: 'Ett fel uppstod när informationen skulle sparas.',
			flags: MessageFlags.Ephemeral
		}).catch(() => {});
	}
});

// Notification button handlers for /info command
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;
	if (!interaction.customId.startsWith('info_notify_')) return;

	try {
		const parts = interaction.customId.split('_');
		const notifyType = parts[2]; // thread, tagged, or silent
		const eventId = parts[3];

		const eventData = getEventJSON(eventId);
		if (!eventData) {
			await interaction.reply({
				content: 'Detta event har passerat.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		const thread = interaction.channel;
		if (!thread.isThread()) {
			await interaction.reply({
				content: 'Ett fel uppstod.',
				flags: MessageFlags.Ephemeral
			});
			return;
		}

		// Get information message ID for link
		const messages = await thread.messages.fetch({ limit: 20 });
		const messageArray = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
		let informationMessageId = null;
		if (messageArray.length >= 2) {
			const informationMessage = messageArray[1];
			if (informationMessage.content.startsWith('Information:')) {
				informationMessageId = informationMessage.id;
			}
		}

		const messageLink = informationMessageId 
			? `https://discord.com/channels/${guildId}/${thread.id}/${informationMessageId}`
			: '';

		if (notifyType === 'thread') {
			// Post message in thread without tagging
			const notificationText = informationMessageId
				? `📢 Ny information har lagts till för **${eventData.name}**.\n\nKlicka här för att se informationsmeddelandet: ${messageLink}`
				: `📢 Ny information har lagts till för **${eventData.name}**.`;
			
			await thread.send(notificationText);
			await interaction.reply({
				content: 'Meddelande har skickats i tråden.',
				flags: MessageFlags.Ephemeral
			});
		} else if (notifyType === 'tagged') {
			// Post message in thread with @mentions
			const participantIds = getParticipantUserIds(eventData);
			const mentions = participantIds.map(id => `<@${id}>`).join(' ');
			
			const notificationText = informationMessageId
				? `${mentions}\n\n📢 Ny information har lagts till för **${eventData.name}**.\n\nKlicka här för att se informationsmeddelandet: ${messageLink}`
				: `${mentions}\n\n📢 Ny information har lagts till för **${eventData.name}**.`;
			
			await thread.send({
				content: notificationText,
				allowedMentions: { users: participantIds }
			});
			await interaction.reply({
				content: 'Meddelande har skickats i tråden med taggningar.',
				flags: MessageFlags.Ephemeral
			});
		} else if (notifyType === 'silent') {
			// No action, just acknowledge
			await interaction.reply({
				content: 'Informationen har uppdaterats tyst.',
				flags: MessageFlags.Ephemeral
			});
		}

		logActivity(`${getNickname(interaction)} ${notifyType === 'silent' ? 'silently' : 'notified'} about info update for event: ${eventData.name || 'unknown'}`);

	} catch (error) {
		logActivity(`Error handling notification button: ${error.message}`);
		await interaction.reply({
			content: 'Ett fel uppstod när meddelandet skulle skickas.',
			flags: MessageFlags.Ephemeral
		}).catch(() => {});
	}
});

// Button click for editting
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isButton()) return;

	// Only process specific editing buttons
	const editingButtons = ['redigera', 'avboj', 'oppna', 'tabort', 'tryckigen'];
	let parts = interaction.customId.split('_');
	let buttonId = parts[0];
	
	if (!editingButtons.includes(buttonId)) return;

	try {

		// Split the customId on the underscore character
		let messageId = parts[1];

		let deleted = false;
		let deleting = false;
		let modal;

		// Fetch the message from the signup channel, not the current channel
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

		// Find the file with the matching ID
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

					// Edit the title, description, and fields
					// Ensure custom ID is within Discord's 100 character limit
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
						//.setPlaceholder(embed.description)
						.setValue(embed.description)
						.setMaxLength(1500)
						.setRequired(false);
				
					const actionRow1 = new ActionRowBuilder().addComponents(nameInput);
					const actionRow2 = new ActionRowBuilder().addComponents(dateInput);
					const actionRow3 = new ActionRowBuilder().addComponents(timeInput);
					const actionRow4 = new ActionRowBuilder().addComponents(locInput);
					const actionRow5 = new ActionRowBuilder().addComponents(infoInput);
				
					// Add inputs to the modal
					modal.addComponents(actionRow1, actionRow2, actionRow3, actionRow4, actionRow5);

				} catch (error) {
					logActivity(error);
				}
				break;
			case 'avboj':
				try {
					// Change data.active to false
					data.active = false;
					fs.writeFileSync(dir_EventsActive + '/' + fileName, JSON.stringify(data));

					// Edit the source message
					const avboj_newEmbed = {
						"title": '[AVBÖJD] ~~' + embed.title + '~~', // Update this as needed
						"description": embed.description, // Update this as needed
						"color": 7419530,
						"footer": {
							"text": embed.footer.text 
						},
						"fields": embed.fields // Update this as needed
					};

					// Disable the buttons
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
					logActivity(error)
				}
				break;
			case 'oppna':
				// Change data.active to true
				data.active = true;
				fs.writeFileSync(dir_EventsActive + '/' + fileName, JSON.stringify(data));

				// Edit the source message
				const oppna_newEmbed = {
					"title": embed.title.replace(/~~/g, '').replaceAll('[AVBÖJD] ', ''),
					"description": embed.description,
					"color": 7419530,
					"footer": {
						"text": embed.footer.text 
					},
					"fields": embed.fields
				};

				// Disable the buttons
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
				// Confirm deletiton
				deleting = true;
				break;
			case 'tryckigen':
				// Delete the data file and the source message
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
			// Create new buttons
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

			// Update the message with the new buttons
			const theContent = "Ändra signupen: **" + embed.title.replace(/~~/g, '').replaceAll('[AVBÖJD] ', '') + "**";
			await interaction.update({ content: deleted ? theContent + " [BORTTAGEN]" : theContent, components: [row_buttons] });
		} else {
			// Show the modal to the user
			await interaction.showModal(modal);
		}

	} catch (error) {
		logActivity("Error when pressing editing signup button: " + error);
	}

});

async function postSignupButtons() {

	const btn_signupverktyg = new ButtonBuilder()
		.setCustomId('btn_signupverktyg')
		.setLabel('Signupverktyg')
		.setStyle(ButtonStyle.Primary);

	const row1_buttons = new ActionRowBuilder()
		.addComponents(btn_signupverktyg);

	client.channels.cache.get(ch_Verktyg_Signup).send({
		components: [row1_buttons],
	});

}

/////////////////////////
//// Nickname change ////
/////////////////////////

client.on(Events.InteractionCreate, async interaction => {

	if (!interaction.isModalSubmit()) return;

	// Change nickname
	if (interaction.customId === 'modal_title') {
		let nickname = interaction.fields.getTextInputValue('nameInput');
		interaction.member.setNickname(nickname);
		await interaction.reply({ content: `Ditt visningsnamn är nu: **${nickname}** 🎉`, flags: MessageFlags.Ephemeral });

		logActivity(interaction.member.user.username + " changed their nickname to " + nickname);
	}

});

//////////////////
//// Calendar ////
//////////////////

async function postCalendar(update) {

	try {
		let guild = client.guilds.cache.get(guildId);
		let channel = guild.channels.cache.get(ch_Calendar);

		// Define the folder path
		const folderPath = dir_EventsActive;

		// Initialize an array to store collected data
		let collectedData = [];

		// Read the files in the folder
		fs.readdirSync(folderPath).forEach(file => {
            // Check if the file has a .json extension
			if (path.extname(file) === '.json') {
				// Parse the JSON data
				let data = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));

				// Collect the required fields
				let { name, date, active, link, time } = data;
				
				// Extract ID from filename (e.g., "avenyn_for_varldens_barn_545106982.json" -> "545106982")
				const idMatch = file.match(/_(\d+)\.json$/);
				const id = idMatch ? idMatch[1] : null;
				
				collectedData.push({ name, date, active, link, time, id, file });
			}
		});

        // 1) Sort events by date, placing invalid formats at the beginning
        function parseEventDate(dateString) {
            if (!dateString) return null;
            let parts = dateString.split('/');
            if (parts.length !== 3) return null; // invalid format
            let formattedDate = `20${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
            let d = new Date(formattedDate);
            return isNaN(d.getTime()) ? null : d;
        }

		collectedData.sort((a, b) => {
            const da = parseEventDate(a.date);
            const db = parseEventDate(b.date);

			// Place invalid dates at the beginning
            if (da === null && db === null) return 0;
            if (da === null) return -1;
            if (db === null) return 1;

            return da - db;
		});

        // 2) Filter out past events and group by year, then by month
        //    We'll store valid future events in a nested structure: year -> month -> events
        const monthNames = [
            "Januari", "Februari", "Mars", "April", "Maj", "Juni",
            "Juli", "Augusti", "September", "Oktober", "November", "December"
        ];

        let groupedByYear = {};
        let invalidDateEvents = [];

		collectedData.forEach(event => {
            let eventDate = parseEventDate(event.date);
            if (eventDate) {
                // Check if the event is in the future
                const today = new Date();
                eventDate.setHours(0, 0, 0, 0);
                today.setHours(0, 0, 0, 0);
                if (eventDate.getTime() < today.getTime()) {
                    // Skip if not in the future
					moveToArchived(event);
                    return;
                }

                // Valid date, group by year and month
                const year = eventDate.getFullYear();
                const monthIndex = eventDate.getMonth();
                const monthName = monthNames[monthIndex]; 
                
                if (!groupedByYear[year]) {
                    groupedByYear[year] = {};
                }
                if (!groupedByYear[year][monthName]) {
                    groupedByYear[year][monthName] = [];
                }
                groupedByYear[year][monthName].push({ event, eventDate });
            } else {
                // Invalid date => place in a special group at the beginning
                invalidDateEvents.push({ event, eventDate: null });
            }
        });

        // 3) Build the calendar string with year and monthly subtitles
        let description = '';

        // First, handle invalid date events if any
        if (invalidDateEvents.length > 0) {
            description += `\n__**Ogiltigt datum**__\n`;
            invalidDateEvents.forEach(({ event, eventDate }) => {
                description += `${event.name}\n`;
                description += `**Okänd datum**\n`;
            });
        }

        // Sort years in chronological order
        let yearKeys = Object.keys(groupedByYear).map(Number).sort((a, b) => a - b);

        // Iterate through each year
        yearKeys.forEach(year => {
            // Add the year as a bold header (no underline)
            description += `\n### ${year}\n`;

            // Get months for this year and sort them chronologically
            let monthKeys = Object.keys(groupedByYear[year]);
            monthKeys.sort((a, b) => {
                let ai = monthNames.indexOf(a);
                let bi = monthNames.indexOf(b);
                return ai - bi;
            });

            // Iterate through each month in this year
            monthKeys.forEach(month => {
                // Add the month subtitle as underlined bold
                description += `__**${month}**__\n`;

                // For each event in this month
                groupedByYear[year][month].forEach(({ event, eventDate }) => {
                    // Format date
			let eventDateString = eventDate.toLocaleDateString('en-GB', {
				month: 'numeric',
				day: 'numeric'
			});
			let eventDayString = eventDate.toLocaleDateString('sv-SE', {
				weekday: 'long'
			});

			// Check link
			if (event.link) {
				let messageLink = `https://discord.com/channels/${guildId}/${ch_Signup}/${event.link}`;
				// Append event details to the string
				if (event.active) {
					description += `[${event.name}](${messageLink})\n`;
					description += `**${eventDateString}**  ${eventDayString}  -  ${event.time ?? 'Okänt'}\n`;
				} else {
					description += `~~[${event.name}](${messageLink})~~\n`;
					description += `~~**${eventDateString}**~~  ${eventDayString}  (avböjd)\n`;
				}
			} else {
				// Append event details to the string
				if (event.active) {
					description += `${event.name}\n`;
					description += `**${eventDateString}**  ${eventDayString}  -  ${event.time ?? 'Okänt'}\n`;
				} else {
					description += `~~${event.name}~~\n`;
					description += `~~**${eventDateString}**  ${eventDayString}~~  (avböjd)\n`;
				}
			}
                });
            });
        });

		let date = new Date();
		let embed = {
			title: '📅 Kommande spelningar',
			description: description,
			color: 7419530,
			footer: {
				text: `Senast uppdaterad: ${new Intl.DateTimeFormat('sv-SE', {
					dateStyle: 'medium',
					timeStyle: 'short',
					hourCycle: 'h24',
					timeZone: 'Europe/Stockholm'
				}).format(date)}`
			}
		};

		if (update) {
			try {
				// Fetch the last message in the channel
				let messages = await channel.messages.fetch({ limit: 1 });
				let lastMessage = messages.first();

				// Update the last message
                await lastMessage.edit({ embeds: [embed] });
			} catch (error) {
				logActivity(`Failed to update calendar: ${error}`);
			}
		} else {
			try {
                await channel.send({ embeds: [embed] });
			} catch (error) {
				logActivity(`Failed to post calendar: ${error}`);
			}
		}
	} catch (error) {
		logActivity(`Failed to post calendar: ${error}`);
	}
	
}

//////////////////////
//// User details ////
//////////////////////

async function updateDetails(requiredDetails) {
	const maxRetries = 3;
	const retryDelay = 5000; // 5 seconds
	let lastError = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			requiredFields = ["kost", "körkort", "bil", "nyckel"]; // TODO: Make dynamic (right click message to change what fields should be in the details)
			const requiredFieldsObject = requiredFields.reduce((acc, field) => {
				const sanitizedField = field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
				acc[sanitizedField] = "-";
				return acc;
			}, {});

			const guild = client.guilds.cache.get(guildId);
			if (!guild) {
				throw new Error(`Guild with ID ${guildId} not found in cache`);
			}

			// Fetch members with increased timeout and retry handling
			let members;
			try {
				members = await guild.members.fetch({ 
					time: 60000, // 60 second timeout instead of default 15
					force: false // Use cache when possible
				});
			} catch (fetchError) {
				// Handle specific error types
				if (fetchError.name === 'GuildMembersTimeout') {
					lastError = fetchError;
					if (attempt < maxRetries) {
						const waitTime = retryDelay * attempt;
						await logActivity(`GuildMembersTimeout in updateDetails (attempt ${attempt}/${maxRetries}). Retrying in ${waitTime/1000}s...`);
						await new Promise(resolve => setTimeout(resolve, waitTime));
						continue;
					} else {
						throw new Error(`GuildMembersTimeout: Failed to fetch members after ${maxRetries} attempts. Guild: ${guild.name} (${guild.id}), Member count: ${guild.memberCount || 'unknown'}`);
					}
				} else if (fetchError.name === 'GatewayRateLimitError' || fetchError.code === 'GatewayRateLimitError') {
					lastError = fetchError;
					// Extract retry time from error message if retryAfter property doesn't exist
					let retryAfter = fetchError.retryAfter;
					if (!retryAfter && fetchError.message) {
						const retryMatch = fetchError.message.match(/Retry after ([\d.]+) seconds?/i);
						if (retryMatch) {
							retryAfter = parseFloat(retryMatch[1]) * 1000; // Convert to milliseconds
						}
					}
					// Fallback to exponential backoff if we can't extract the time
					if (!retryAfter) {
						retryAfter = retryDelay * attempt;
					}
					
					if (attempt < maxRetries) {
						await logActivity(`GatewayRateLimitError in updateDetails (attempt ${attempt}/${maxRetries}). Retrying after ${retryAfter/1000}s...`);
						await new Promise(resolve => setTimeout(resolve, retryAfter));
						continue;
					} else {
						// Don't throw - log and return gracefully
						await logActivity(`GatewayRateLimitError: Rate limited after ${maxRetries} attempts. Guild: ${guild.name} (${guild.id}). Will retry on next scheduled run.`);
						return;
					}
				} else {
					throw fetchError;
				}
			}

			const aktivRole = guild.roles.cache.find(role => role.name === 'aktiv');
			const inaktivRole = guild.roles.cache.find(role => role.name === 'inaktiv');

			let detailsData = { aktiv: {}, inaktiv: {} };

			// Load existing data if the file exists
			const detailsFilePath = 'src/detailsList.json';
			if (fs.existsSync(detailsFilePath)) detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
			detailsData.aktiv = detailsData.aktiv || [];
			detailsData.inaktiv = detailsData.inaktiv || [];

			// Helper function to find a user in a role array
			function findUser(array, userId) {
				if (Array.isArray(array)) {
					return array.find(user => user.id === userId);
				}
				return null; // Return null if array is not valid
			}
			
			members.forEach(member => {
				const userId = member.id;
				const nickname = member.nickname ? member.nickname : member.user.username;
				let userData = findUser(detailsData.aktiv, userId) || findUser(detailsData.inaktiv, userId) || {};
				if (userData == null) userData = {};

				// Set common user properties
				userData.id = userId;
				userData.namn = nickname;

				// Add or update required fields
				Object.keys(requiredFieldsObject).forEach(field => {
					if (!(field in userData)) {
						userData[field] = "-";
					}
				});

				// Move user data to the correct role-based array
				if (member.roles.cache.has(aktivRole.id)) {
					if (!findUser(detailsData.aktiv, userId)) {
						detailsData.aktiv.push(userData);
					}
					detailsData.inaktiv = detailsData.inaktiv.filter(user => user.id !== userId);
				} else if (member.roles.cache.has(inaktivRole.id)) {
					if (!findUser(detailsData.inaktiv, userId)) {
						detailsData.inaktiv.push(userData);
					}
					detailsData.aktiv = detailsData.aktiv.filter(user => user.id !== userId);
				}

			});
			
			// Write updated data back to the file
			fs.writeFileSync(detailsFilePath, JSON.stringify(detailsData, null, 2), 'utf8');
			
			// Success - log if it was a retry
			if (attempt > 1) {
				await logActivity(`updateDetails succeeded on attempt ${attempt}/${maxRetries}`);
			}
			return; // Success, exit function

		} catch (error) {
			lastError = error;
			const guild = client.guilds.cache.get(guildId);
			const guildInfo = guild ? `Guild: ${guild.name} (${guild.id}), Members: ${guild.memberCount || 'unknown'}` : `Guild ID: ${guildId} (not in cache)`;
			
			if (attempt === maxRetries) {
				// Final attempt failed
				await logActivity(`Error in updateDetails function after ${maxRetries} attempts. ${guildInfo}. Error: ${error.message}${error.code ? ` (code: ${error.code})` : ''}`);
				// Don't re-throw - log and return gracefully to prevent unhandled rejections
				return;
			}
			// Will retry on next iteration
		}
	}
}

async function postDetailsButtons(update) {

    let guild = client.guilds.cache.get(guildId);
    let channel = guild.channels.cache.get(ch_Medlemsdetaljer);

	// Dynamically create buttons based on requiredFields
    const row_buttons = new ActionRowBuilder();
    requiredFields.forEach(field => {
        const sanitizedId = field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
        const button = new ButtonBuilder()
            .setCustomId(sanitizedId)
            .setLabel(field.charAt(0).toUpperCase() + field.slice(1)) // Capitalize first letter
            .setStyle(ButtonStyle.Secondary);
        row_buttons.addComponents(button);
    });

	if (update) {
        try {
			// Fetch the last message in the channel
			const messages = await channel.messages.fetch({ limit: 1 });
			const lastMessage = messages.first();

			// Update the last message
			lastMessage.edit({ 
				content: `Tryck på knapparna för att visa medlemsdetaljer`,
				components: [row_buttons],
			 });
		} catch (error) {
            logActivity(`Failed to update details buttons: ${error}`);
        }
    } else {
        try {
			channel.send({
				content: `Tryck på knapparna för att visa medlemsdetaljer`,
				components: [row_buttons],
			});
		} catch (error) {
            logActivity(`Failed to post details buttons: ${error}`);
        }
	}
}

client.on('interactionCreate', async (interaction) => {
	
	if (!interaction.isButton()) return;
	
	// Exclude "nyckel" as it has its own handler
	if (interaction.customId === 'nyckel') return;
	
	const sanitizedFields = requiredFields.map(field =>
		field.replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o")
	);

	if (!sanitizedFields.includes(interaction.customId)) return;

	// Determine the selected field based on the button clicked
	const selectedFieldIndex = sanitizedFields.indexOf(interaction.customId);
	const selectedField = requiredFields[selectedFieldIndex];
    const displayField = selectedField.charAt(0).toUpperCase() + selectedField.slice(1);

	let message = `## ${displayField}:\n`;

	// Load the latest details data
	const detailsFilePath = 'src/detailsList.json';
	if (!fs.existsSync(detailsFilePath)) {
		await interaction.reply({ content: 'No user details file available.', flags: MessageFlags.Ephemeral });
		return;
	}

	const detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
	let aktivUsers = detailsData.aktiv;

	// Sort users by name
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

	// Add all "aktiv" users with their selected field value to "message"
	aktivUsers.forEach(user => {
		const sanitizedKey = interaction.customId;
		message += `${user.namn}: **${user[sanitizedKey]}**\n`;
	});

    // Character limit check
    const msgLength = message.length;
	if (msgLength > 2000) {
        message = message.slice(0, 1952) + "\n\nHela listan kan inte visas - kontakta admin.";
        logActivity(`Warning: Truncated ${displayField} message from ${msgLength} to 2000 characters`);
    } else if (msgLength > 1900) {
        logActivity(`Warning: The total character count of ${displayField} is ${msgLength}. Maximum is 2000 characters.`);
    }

	// Send a message with the dynamically created content
	await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });

});

//////////////
//// Misc ////
//////////////

client.on('messageCreate', async (message) => {
	
    if (message.author.bot) return;

    const restrictedChannelId = ch_Signup; // Replace with ID of Channel A
    const targetChannelId = ch_Allmant; // Replace with ID of Channel B

    // Check if the message is in the restricted channel
    if (message.channel.id === restrictedChannelId) {
        try {
            // Save the original content before deleting the message
            const originalContent = message.content;

            // Delete the message
            await message.delete();

            // Send an ephemeral-like reply (via DM since ephemeral is only for interactions)
            await message.author.send({
                content: `Det är inte tillåtet att skicka meddelanden i <#${restrictedChannelId}>.\n` +
                         `Använd <#${targetChannelId}> för frågor om spelningar.\n\n` +
                         `Här är ditt ursprungliga meddelande för enkel kopiering:\n\n`
            });
			await message.author.send({
                content: `${originalContent}`
            });

        } catch (error) {
            console.error('Failed to delete message or send DM:', error);
        }
    }

});

client.on('guildMemberAdd', member => {
	logActivity(member + " joined the Discord!");
	updateDetails().catch(err => logActivity(`Error in updateDetails (from guildMemberAdd): ${err.message}`));
	verktygSignup();
});

///////////////////
//// Functions ////
///////////////////

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
    fs.writeFileSync('src/instrumentList.json', JSON.stringify(data));

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
    fs.writeFileSync('src/groupList.json', JSON.stringify(data));

	postGroupList(true);

}

async function cleanupOutdatedSignups(nickname) {
    let filesMoved = 0;
    let messagesCleaned = 0;
    let errors = 0;

    // Parse event date helper function (same as in postCalendar)
    function parseEventDate(dateString) {
        if (!dateString) return null;
        let parts = dateString.split('/');
        if (parts.length !== 3) return null; // invalid format
        let formattedDate = `20${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
        let d = new Date(formattedDate);
        return isNaN(d.getTime()) ? null : d;
    }

    // Check if date has passed
    function isDatePassed(dateString) {
        const eventDate = parseEventDate(dateString);
        if (!eventDate) return false;
        
        const today = new Date();
        eventDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return eventDate.getTime() < today.getTime();
    }

    // Extract date from embed fields
    function extractDateFromEmbed(embed) {
        if (!embed || !embed.fields) return null;
        
        const dateField = embed.fields.find(field => 
            field.name && field.name.toLowerCase().includes('datum')
        );
        
        if (!dateField || !dateField.value) return null;
        
        // Extract just the date part (before the pipe character if present)
        const dateValue = dateField.value.split(' | ')[0];
        return dateValue;
    }

    try {
        // Get the signup channel
        const signupChannel = client.channels.cache.get(ch_Signup);
        if (!signupChannel) {
            logActivity(`${nickname} - Signup channel not found`);
            return { filesMoved: 0, messagesCleaned: 0, errors: 1 };
        }

        // Fetch all messages from the signup channel
        const messages = await signupChannel.messages.fetch({ limit: 100 });
        logActivity(`${nickname} started cleanup of ${messages.size} messages in signup channel`);

        for (const [messageId, message] of messages) {
            try {
                // Check if message has embeds and is a signup message
                if (!message.embeds || message.embeds.length === 0) continue;
                
                const embed = message.embeds[0];
                if (!embed.title || !embed.fields) continue;

                // Check if this is a signup message by looking for Ja/Nej/Kanske buttons
                const hasSignupButtons = message.components && message.components.length > 0 && 
                    message.components.some(row => 
                        row.components && row.components.length > 0 &&
                        row.components.some(button => 
                            ['ja', 'nej', 'kanske'].includes(button.customId)
                        )
                    );

                // Skip if no signup buttons (already cleaned or not a signup message)
                if (!hasSignupButtons) continue;

                // Extract date from embed
                const eventDate = extractDateFromEmbed(embed);
                if (!eventDate) continue;

                // Check if event is outdated
                if (!isDatePassed(eventDate)) {
                    continue; // Skip if not outdated
                }

                // Try to find and move corresponding JSON file
                try {
                    // Extract event ID from embed footer
                    const eventId = embed.footer?.text?.split(': ')[1];
                    if (eventId) {
                        // Look for the file in active directory
                        const activeFiles = fs.existsSync(dir_EventsActive) ? fs.readdirSync(dir_EventsActive) : [];
                        const fileName = activeFiles.find(file => file.endsWith('_' + eventId + '.json'));
                        
                        if (fileName) {
                            const oldPath = path.join(dir_EventsActive, fileName);
                            const newPath = path.join(dir_EventsArchived, fileName);

                            // Create the archive directory if it doesn't exist
                            if (!fs.existsSync(dir_EventsArchived)) {
                                fs.mkdirSync(dir_EventsArchived, { recursive: true });
                            }

                            // Move the file
                            fs.renameSync(oldPath, newPath);
                            filesMoved++;
                        }
                    }
                } catch (fileError) {
                    errors++;
                }

                // Remove buttons from the Discord message
                try {
                    await message.edit({
                        content: message.content,
                        embeds: message.embeds,
                        components: [] // Remove all buttons
                    });
                    messagesCleaned++;
                } catch (messageError) {
                    errors++;
                }

            } catch (messageError) {
                errors++;
            }
        }

        logActivity(`${nickname} completed cleanup: ${filesMoved} files moved, ${messagesCleaned} messages cleaned, ${errors} errors`);

    } catch (error) {
        logActivity(`${nickname} - Cleanup fatal error: ${error}`);
        errors++;
    }

    return { filesMoved, messagesCleaned, errors };
}

async function moveToArchived(event) {

    // Move the file from active to archived
    try {
        const oldPath = path.join(dir_EventsActive, event.file);
        const newPath = path.join(dir_EventsArchived, event.file);

        // Create the archive directory if it doesn't exist
        if (!fs.existsSync(dir_EventsArchived)) {
            fs.mkdirSync(dir_EventsArchived, { recursive: true });
        }

        // Move the file
        fs.renameSync(oldPath, newPath);
    } catch (err) {
        logActivity(`Failed to move file to archived: ${err}`);
        // You might want to throw an error or handle it differently
        return;
    }

    // Remove the buttons from the corresponding message
    try {
        // Build the link (optional if you just need the ID)
        const messageLink = `https://discord.com/channels/${guildId}/${ch_Signup}/${event.link}`;
        logActivity(`Archiving event. Message link: ${messageLink}`);

        // Fetch the channel and message
        const channel = client.channels.cache.get(ch_Signup);
        if (!channel) throw new Error('Channel not found');

        const archivedMessage = await channel.messages.fetch(event.link);
        if (!archivedMessage) throw new Error('Message not found');

        // Edit the message to remove buttons (keep other content/embeds)
        await archivedMessage.edit({
            content: archivedMessage.content,
            embeds: archivedMessage.embeds,
            components: [] // <-- removing the buttons
        });
    } catch (err) {
        logActivity(`Failed to edit archived message: ${err}`);
        // Handle error (e.g., log it, rethrow, etc.)
    }

    // Thread title is not changed when archiving
    // (Removed checkmark addition to allow findEventThread to work correctly)
}

async function remindUsers() {
	/*
	const embed = {
		"title": "Tester",
		"description": "Här skrivs information till alla glada människor.",
		"color": 7419530,
		"footer": {
			"text": "har svarat ja  -  ID: 4255523",
			"iconURL": "https://ollelindberg.se/kiribot/replycount/0.webp"
		},
		"fields": [
			{
			"name": "Plats",
			"value": "I rymden",
			"inline": true
			},
			{
			"name": "Datum",
			"value": "13/5",
			"inline": true
			}
		]
	};
	await client.channels.cache.get(ch_BotTest).send({
		content: `till aktiva`,
		embeds: [embed]
	});
	*/

	// await client.channels.cache.get(ch_BotTest).send({
	// 	content: `## Test\nHär står något kul!\n-# Meddelande skickat till BotTest av __Olle L__\n-# <@${"602246889727066182"}>\n-# Tagga fler personer om du vill lägga till dem i konversationen.`
	// });
}

async function postInstrumentList(update) {

    let data = JSON.parse(fs.readFileSync('src/instrumentList.json', 'utf8'));
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

    let data = JSON.parse(fs.readFileSync('src/groupList.json', 'utf8'));
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

    let detailsData = JSON.parse(fs.readFileSync('src/detailsList.json', 'utf8'));
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

// Function to update ch_Verktyg_Signup
async function updateVerktygSignup(id, startsWith, message) {
    try {
		
        const files = fs.readdirSync(dir_EventsActive).filter(file => file.endsWith('.json'));
        
        // Read and parse all event files
        const events = [];
        for (const file of files) {
            const filePath = path.join(dir_EventsActive, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            events.push({
                id: data.id,
                name: data.name,
                date: parseEventDate(data.date),
                rawDate: data.date // Keep original for display
            });
        }

        // Sort events with invalid dates first
        events.sort((a, b) => {
            const da = a.date;
            const db = b.date;

            // Invalid dates first
            if (da === null && db === null) return 0;
            if (da === null) return -1;
            if (db === null) return 1;

            // Newest first for valid dates
            return da - db;
        });

        // Create dropdown options
        const select = new StringSelectMenuBuilder()
            .setCustomId('signupDropdown_' + id)
            .setPlaceholder('Välj en spelning')
            .addOptions(
                events.map(event => {
                    const eventDateString = event.date 
                        ? event.date.toLocaleDateString('en-GB', {
                            month: 'numeric',
                            day: 'numeric'
                          })
                        : 'Ogiltigt datum';

                    return new StringSelectMenuOptionBuilder()
                        .setLabel(event.name)
                        .setValue(event.id)
                        .setDescription(`${eventDateString}`);
                })
            );

        const row = new ActionRowBuilder().addComponents(select);

        // Get and update message
        const channel = client.channels.cache.get(ch_Verktyg_Signup);
        const messages = await channel.messages.fetch();
        const targetMessage = messages.find(msg => 
			msg.content.startsWith(startsWith)
		);

        if (targetMessage) {
            await targetMessage.edit({
                content: message,
                components: [row]
            });
        } else {
			logActivity(`Failed to update menu ${id} Verktyg - Signups`);
		}

    } catch (error) {
        logActivity(`Failed to update menu ${id} Verktyg - Signups: `, error);
    }
}

function parseEventDate(dateString) {
    if (!dateString) return null;
    let parts = dateString.split('/');
    if (parts.length !== 3) return null;
    let formattedDate = `20${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    let d = new Date(formattedDate);
    return isNaN(d.getTime()) ? null : d;
}

async function updateSignupButtonMessage() {
	try {
		
		const channel = client.channels.cache.get(ch_Verktyg_Signup);
		if (!channel) {
			logActivity(`Channel with ID ${ch_Verktyg_Signup} not found`);
			return;
		}
		
		// Add a small delay to avoid rate limits
		await new Promise(resolve => setTimeout(resolve, 2000));
		
		const messages = await channel.messages.fetch();
		
		// Find the message that contains a button with customId 'btn_signupverktyg'
		const targetMessage = messages.find(msg => {
			if (!msg.components || msg.components.length === 0) return false;
			
			// Check if any component in any action row has the btn_signupverktyg customId
			return msg.components.some(row => 
				row.components.some(component => 
					component.data && component.data.custom_id === 'btn_signupverktyg'
				)
			);
		});

		if (targetMessage) {
			
			// Add another delay before editing to avoid rate limits
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			// Create the new "Signupverktyg" button
			const btn_signupverktyg = new ButtonBuilder()
				.setCustomId('btn_signupverktyg')
				.setLabel('Signupverktyg')
				.setStyle(ButtonStyle.Primary);

			// Create the "Hur gör jag?" button in grey
			const btn_signupHowTo = new ButtonBuilder()
				.setCustomId('btn_signupHowTo')
				.setLabel('Hur gör jag?')
				.setStyle(ButtonStyle.Secondary);

			const row1_buttons = new ActionRowBuilder()
				.addComponents(btn_signupverktyg, btn_signupHowTo);

			await targetMessage.edit({
				components: [row1_buttons]
			});
			
		} else {
			logActivity(`Could not find message with 'btn_newSignup' button in verktyg channel`);
			// Log all messages for debugging
			messages.forEach((msg, key) => {
				logActivity(`Message ${key}: ${msg.id} - Components: ${msg.components?.length || 0}`);
			});
		}
	} catch (error) {
		logActivity(`Failed to update signup button message. Error type: ${error.constructor.name}`);
		logActivity(`Error message: ${error.message}`);
		if (error.code) {
			logActivity(`Error code: ${error.code}`);
		}
		if (error.retryAfter) {
			logActivity(`Retry after: ${error.retryAfter}ms`);
		}
		logActivity(`Full error: ${JSON.stringify(error, null, 2)}`);
	}
}

async function testFunction() {
	// Add delay to avoid rate limits during startup
	setTimeout(() => {
		updateSignupButtonMessage();
	}, 5000); // Wait 5 seconds after startup
}

// Store previous fika data for comparison
let previousFikaData = null;

async function postFikaList(update) {
	try {
		// Load the service account credentials
		const auth = new google.auth.GoogleAuth({
			keyFile: './src/service-account.json',
			scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
		});

		// Create the sheets API client
		const sheets = google.sheets({ version: 'v4', auth });

		// Read the config to get spreadsheet ID and tab name
		const config = require('../config.json');
		const spreadsheetId = config.spreadsheetId;
		
		// Get the responsible person from B6
		const responsibleRange = `${config.sheetsTab}!B6`;
		const responsibleResponse = await sheets.spreadsheets.values.get({
			spreadsheetId: spreadsheetId,
			range: responsibleRange,
		});
		const responsiblePerson = responsibleResponse.data.values?.[0]?.[0] || 'Okänt';

		// Get the current period from B5
		const periodRange = `${config.sheetsTab}!B5`;
		const periodResponse = await sheets.spreadsheets.values.get({
			spreadsheetId: spreadsheetId,
			range: periodRange,
		});
		const currentPeriod = periodResponse.data.values?.[0]?.[0] || '';

		// Get the fika data starting from row 7, columns A through H (and potentially more)
		const dataRange = `${config.sheetsTab}!A8:H50`; // Read a large range to get all data
		const response = await sheets.spreadsheets.values.get({
			spreadsheetId: spreadsheetId,
			range: dataRange,
		});

		const rows = response.data.values;
		
		if (!rows || rows.length === 0) {
			logActivity('No fika data found in the spreadsheet.');
			return;
		}

		// Process the data and extract raw data for comparison
		let fikaEntries = [];
		let currentRawData = []; // Store raw data for comparison
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
		let firstUpcomingDateFound = false; // Track if we've added emojis to the first upcoming date
		
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const date = row[0]; // Column A
			
			// Stop if date is empty
			if (!date || date.trim() === '') {
				break;
			}
			
			// Parse the date and format it
			const dateObj = new Date(date);
			if (isNaN(dateObj.getTime())) {
				continue; // Skip invalid dates
			}
			
			// Set time to start of day for accurate comparison
			dateObj.setHours(0, 0, 0, 0);
			
			// Check if date has passed
			const hasPassed = dateObj.getTime() < today.getTime();
			
			const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
			
			// Get Storstäd status (Column B)
			const storstad = row[1] === 'TRUE' || row[1] === true;
			
			// Get extra info (Column C)
			const extraInfo = row[2] || '';
			
			// Collect names from columns D onwards
			const names = [];
			for (let j = 3; j < row.length; j++) {
				if (row[j] && row[j].trim() !== '') {
					names.push(row[j].trim());
				}
			}
			
			// Skip if no names AND no extra info
			if (names.length === 0 && !extraInfo) {
				continue;
			}
			
			// Store raw data for comparison (without formatting)
			currentRawData.push({
				date: date.trim(),
				storstad: storstad,
				extraInfo: extraInfo,
				names: names.slice().sort() // Sort names for consistent comparison
			});
			
			// Format the entry
			let entryText;
			if (hasPassed) {
				// Past dates: bold without ###
				entryText = `**${formattedDate}**\n`;
			} else {
				// Future dates: normal ### format
				if (!firstUpcomingDateFound) {
					// First upcoming date gets the emojis
					entryText = `### ${formattedDate} <:nasta_1:1414262959479455854><:nasta_2:1414262943339516056><:nasta_3:1414262927053164604>\n`;
					firstUpcomingDateFound = true;
				} else {
					// Other future dates: normal format
					entryText = `### ${formattedDate}\n`;
				}
			}
			
			// Add Storstäd and extra info if present
			if (storstad || extraInfo) {
				let specialInfo = [];
				if (storstad) {
					specialInfo.push('**Storstäd**');
				}
				if (extraInfo) {
					specialInfo.push(`_${extraInfo}_`);
				}
				entryText += `-# ${specialInfo.join(' - ')}\n`;
			}
			
			// Add names (only if there are names)
			if (names.length > 0) {
				entryText += names.join(', ');
			}
			
			// Add "> " prefix to each line if date has passed
			if (hasPassed) {
				entryText = entryText.split('\n').map(line => line.trim() ? `> ${line}` : line).join('\n');
			}
			
			fikaEntries.push(entryText);
		}
		
		// Check if raw data has changed (excluding formatting changes)
		const dataHasChanged = !previousFikaData || 
			JSON.stringify(currentRawData) !== JSON.stringify(previousFikaData);
		
		// Update the stored raw data
		previousFikaData = currentRawData;
		
		// Create the final message
		let messageContent = `# Fikalista (${currentPeriod})\n-# Ansvarig: ${responsiblePerson}\n`;
		messageContent += fikaEntries.join('\n');
		
		// Create the fika instructions button
		const fikaButton = new ButtonBuilder()
			.setCustomId('fika_instructions')
			.setLabel('Vad ska jag göra som fikaansvarig?')
			.setStyle(ButtonStyle.Secondary);

		// Create the cleaning instructions button
		const cleaningButton = new ButtonBuilder()
			.setCustomId('cleaning_instructions')
			.setLabel('Vad ska jag storstäda?')
			.setStyle(ButtonStyle.Secondary);
		
		
		const row = new ActionRowBuilder().addComponents(fikaButton, cleaningButton);
		
		// Post or update the message
		const channel = client.channels.cache.get(ch_FikaList);
		if (!channel) {
			logActivity('Could not find the fika list channel');
			return;
		}
		
		if (update) {
			// Update the most recent message
			const messages = await channel.messages.fetch({ limit: 1 });
			const fikaMessage = messages.first();
			
			if (fikaMessage) {
				// Always update the message (for formatting changes like dates passing)
				// But only add timestamp and log if raw data has changed
				if (dataHasChanged) {
					// Add timestamp only when raw data changes
					const updateTime = new Intl.DateTimeFormat('sv-SE', { 
						dateStyle: 'short', 
						timeStyle: 'short', 
						hourCycle: 'h24', 
						timeZone: 'Europe/Stockholm'
					}).format(new Date());
					messageContent += `\n\n-# Senast uppdaterad: ${updateTime}`;
					
					await fikaMessage.edit({ content: messageContent, components: [row] });
				} else {
					// Update without new timestamp, but preserve existing timestamp if present
					const existingContent = fikaMessage.content;
					const timestampMatch = existingContent.match(/\n\n-# Senast uppdaterad: .+$/);
					
					if (timestampMatch) {
						// Preserve existing timestamp
						messageContent += timestampMatch[0];
					}
					
					await fikaMessage.edit({ content: messageContent, components: [row] });
				}
			} else {
				// If no existing message found, post a new one
				await channel.send({ content: messageContent, components: [row] });
			}
		} else {
			// Post a new message
			await channel.send({ content: messageContent, components: [row] });
		}

	} catch (error) {
		logActivity(`Error posting fika list: ${error.message}`);
	}
}

async function getCleaningInstructions() {
	try {
		// Load the service account credentials
		const auth = new google.auth.GoogleAuth({
			keyFile: './src/service-account.json',
			scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
		});

		// Create the sheets API client
		const sheets = google.sheets({ version: 'v4', auth });

		// Read the config to get spreadsheet ID
		const config = require('../config.json');
		const spreadsheetId = config.spreadsheetId;
		
		// Get the cleaning instructions from Checklista sheet, cell A2
		const cleaningRange = 'Checklista!A2';
		const response = await sheets.spreadsheets.values.get({
			spreadsheetId: spreadsheetId,
			range: cleaningRange,
		});

		const cleaningData = response.data.values?.[0]?.[0] || '';
		
		if (!cleaningData || cleaningData.trim() === '') {
			return 'Inga städinstruktioner hittades.';
		}

		return cleaningData;

	} catch (error) {
		logActivity(`Error fetching cleaning instructions: ${error.message}`);
		return 'Kunde inte hämta städinstruktioner.';
	}
}

async function getFikaInstructions() {
	try {
		// Load the service account credentials
		const auth = new google.auth.GoogleAuth({
			keyFile: './src/service-account.json',
			scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
		});

		// Create the sheets API client
		const sheets = google.sheets({ version: 'v4', auth });

		// Read the config to get spreadsheet ID
		const config = require('../config.json');
		const spreadsheetId = config.spreadsheetId;
		
		// Get the fika instructions from Instruktioner sheet, cell A2
		const fikaRange = 'Instruktioner!A2';
		const response = await sheets.spreadsheets.values.get({
			spreadsheetId: spreadsheetId,
			range: fikaRange,
		});

		const fikaData = response.data.values?.[0]?.[0] || '';
		
		if (!fikaData || fikaData.trim() === '') {
			return 'Inga fikainstruktioner hittades.';
		}

		return fikaData;

	} catch (error) {
		logActivity(`Error fetching fika instructions: ${error.message}`);
		return 'Kunde inte hämta fikainstruktioner.';
	}
}

function parseSwedishTime(timeStr) {
	if (!timeStr || typeof timeStr !== 'string') {
		return null;
	}
	
	// Clean the string
	let cleanTime = timeStr.trim().toLowerCase();
	
	// Handle various Swedish time formats
	
	// 1. Standard HH:MM format (14:00, 9:30, etc.)
	const standardMatch = cleanTime.match(/^(\d{1,2}):(\d{2})$/);
	if (standardMatch) {
		const hours = parseInt(standardMatch[1]);
		const minutes = parseInt(standardMatch[2]);
		if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
			return { hours, minutes };
		}
	}
	
	// 2. HH.MM format (14.30)
	const dotMatch = cleanTime.match(/^(\d{1,2})\.(\d{2})$/);
	if (dotMatch) {
		const hours = parseInt(dotMatch[1]);
		const minutes = parseInt(dotMatch[2]);
		if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
			return { hours, minutes };
		}
	}
	
	// 3. Single hour number (16, 9, etc.)
	const singleHourMatch = cleanTime.match(/^(\d{1,2})$/);
	if (singleHourMatch) {
		const hours = parseInt(singleHourMatch[1]);
		if (hours >= 0 && hours <= 23) {
			return { hours, minutes: 0 };
		}
	}
	
	// 4. Four digit format (0900, 1430, etc.)
	const fourDigitMatch = cleanTime.match(/^(\d{4})$/);
	if (fourDigitMatch) {
		const timeStr = fourDigitMatch[1];
		const hours = parseInt(timeStr.substring(0, 2));
		const minutes = parseInt(timeStr.substring(2, 4));
		if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
			return { hours, minutes };
		}
	}
	
	// 5. Swedish approximate times with "Ca" (Ca 17-sent, Ca 14-20, etc.)
	const caMatch = cleanTime.match(/ca\s*(\d{1,2})(?:-.*)?/);
	if (caMatch) {
		const hours = parseInt(caMatch[1]);
		if (hours >= 0 && hours <= 23) {
			return { hours, minutes: 0 };
		}
	}
	
	// 6. Swedish "Mellan X och Y" (Mellan 9 och 10 -> 09:00)
	const mellanMatch = cleanTime.match(/mellan\s*(\d{1,2})\s*och\s*\d{1,2}/);
	if (mellanMatch) {
		const hours = parseInt(mellanMatch[1]);
		if (hours >= 0 && hours <= 23) {
			return { hours, minutes: 0 };
		}
	}
	
	// 7. Extract first time-like pattern from complex strings
	// Look for patterns like "14:00", "14.00", "14", "1400" in any context
	const timePatterns = [
		/(\d{1,2}):(\d{2})/,  // HH:MM
		/(\d{1,2})\.(\d{2})/, // HH.MM
		/(\d{4})/,            // HHHH
		/(\d{1,2})(?:\s|$)/   // HH followed by space or end
	];
	
	for (const pattern of timePatterns) {
		const match = cleanTime.match(pattern);
		if (match) {
			let hours, minutes;
			
			if (match[2] !== undefined) {
				// HH:MM or HH.MM format
				hours = parseInt(match[1]);
				minutes = parseInt(match[2]);
			} else if (match[1].length === 4) {
				// HHHH format
				hours = parseInt(match[1].substring(0, 2));
				minutes = parseInt(match[1].substring(2, 4));
			} else {
				// Single hour
				hours = parseInt(match[1]);
				minutes = 0;
			}
			
			if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
				return { hours, minutes };
			}
		}
	}
	
	// 8. Additional Swedish time expressions (case-insensitive, includes plural forms)
	const swedishTimePatterns = [
		{ pattern: /förmiddag|förmiddan|fm|morgon|morgonen|morron|morronen/, time: { hours: 9, minutes: 0 } },
		{ pattern: /lunch|lunchen|lunchtid/, time: { hours: 12, minutes: 0 } },
		{ pattern: /eftermiddag|eftermiddagen|em|eftermiddan/, time: { hours: 14, minutes: 0 } },
		{ pattern: /kväll|kvällen|afton|aftonen/, time: { hours: 18, minutes: 0 } },
		{ pattern: /natt|natten/, time: { hours: 22, minutes: 0 } }
	];
	
	for (const { pattern, time } of swedishTimePatterns) {
		if (pattern.test(cleanTime)) {
			return time;
		}
	}
	
	// If no pattern matches, return null
	return null;
}

async function syncEventsToSheet() {
	try {
		// Load the service account credentials with write permissions
		const auth = new google.auth.GoogleAuth({
			keyFile: './src/service-account.json',
			scopes: ['https://www.googleapis.com/auth/spreadsheets'],
		});

		// Create the sheets API client
		const sheets = google.sheets({ version: 'v4', auth });

		// Read the config to get calendar spreadsheet ID and tab name
		const configContent = fs.readFileSync('./config.json', 'utf8');
		const config = JSON.parse(configContent);
		
		const spreadsheetId = config.calendarSpreadsheetId;
		const tabName = config.calendarTab;
		
		// Validate required config values
		if (!spreadsheetId) {
			throw new Error('calendarSpreadsheetId not found in config.json');
		}
		if (!tabName) {
			throw new Error('calendarTab not found in config.json');
		}
		
		// Read all JSON files from both active and archived directories
		const events = [];
		const directories = ['./src/events/active', './src/events/archived'];
		
		for (const dir of directories) {
			try {
				const files = fs.readdirSync(dir);
				const jsonFiles = files.filter(file => file.endsWith('.json') && file !== '.gitkeep');
				
				for (const file of jsonFiles) {
					try {
						const filePath = path.join(dir, file);
						const fileContent = fs.readFileSync(filePath, 'utf8');
						const eventData = JSON.parse(fileContent);
						
						// Extract required fields
						const name = eventData.name || '';
						const date = eventData.date || '';
						const time = eventData.time || '';
						const location = eventData.location || '';
						const id = eventData.id || '';
						const link = eventData.link || '';
						const active = eventData.active;
						
						// Skip if event is not active
						if (active === false) {
							continue;
						}
						
						// Skip if essential fields are missing
						if (!name || !date || !id) {
							continue;
						}
						
						// Validate date format (DD/MM/YY)
						const validatedDate = checkDateFormat(date);
						if (!validatedDate) {
							// Skipping event: Invalid date format
							continue;
						}
						
						// Parse date and time for sorting
						const [day, month, year] = validatedDate.split('/');
						const fullYear = 2000 + parseInt(year);
						const eventDate = new Date(fullYear, parseInt(month) - 1, parseInt(day));
						
						// Parse time for sorting (handle various Swedish time formats)
						let eventTime = new Date();
						const parsedTime = parseSwedishTime(time);
						
						if (parsedTime) {
							eventTime = new Date(fullYear, parseInt(month) - 1, parseInt(day), parsedTime.hours, parsedTime.minutes);
						} else {
							// If no valid time found, use start of day
							eventTime = new Date(fullYear, parseInt(month) - 1, parseInt(day), 0, 0);
						}
						
						// Create standardized time string for the sheet
						const standardizedTime = parsedTime ? 
							`${String(parsedTime.hours).padStart(2, '0')}:${String(parsedTime.minutes).padStart(2, '0')}` : 
							'00:00';
						
						events.push({
							name,
							date: validatedDate,
							time: standardizedTime,
							location,
							id,
							link,
							sortDate: eventDate,
							sortTime: eventTime
						});
						
					} catch (parseError) {
						logActivity(`Error parsing event file ${file}: ${parseError.message}`);
						continue;
					}
				}
			} catch (dirError) {
				logActivity(`Error reading directory ${dir}: ${dirError.message}`);
				continue;
			}
		}
		
		// Sort events by date, then by time (limit to 50 events)
		events.sort((a, b) => {
			const dateCompare = a.sortDate.getTime() - b.sortDate.getTime();
			if (dateCompare !== 0) return dateCompare;
			return a.sortTime.getTime() - b.sortTime.getTime();
		});
		
		const limitedEvents = events.slice(0, 50);
		
		// Prepare data for the sheet - ensure all values are strings to prevent apostrophe issues
		const sheetData = limitedEvents.map(event => [
			String(event.name || ''),                    // Column A: Title
			'',                                         // Column B: Description (ignored)
			String(event.location || ''),                // Column C: Location
			String(event.date || ''),                   // Column D: Start Date
			String(event.time || ''),                   // Column E: Start Time
			String(event.date || ''),                   // Column F: End Date (same as start)
			String(event.time || ''),                   // Column G: End Time (same as start)
			String(event.id || ''),                     // Column H: UID
			`https://discord.com/channels/1139435626211590236/1228238682394333265/${event.link}` // Column I: Discord URL
		]);
		
		// Clear existing data from row 3 onwards (keep header rows 1-2)
		const clearRange = `${tabName}!A3:Z1000`;
		await sheets.spreadsheets.values.clear({
			spreadsheetId: spreadsheetId,
			range: clearRange,
		});
		
		// Write new data starting from row 3
		if (sheetData.length > 0) {
			const writeRange = `${tabName}!A3:I${2 + sheetData.length}`;
			await sheets.spreadsheets.values.update({
				spreadsheetId: spreadsheetId,
				range: writeRange,
				valueInputOption: 'RAW',
				resource: {
					values: sheetData
				}
			});
		}
				
	} catch (error) {
		logActivity(`Error syncing events to sheet: ${error.message}`);
	}
}

function checkDateFormat(dateStr) { // Returns null if format is incorrect

	dateStr = dateStr.replace(/\\/g, '/');
	dateStr = dateStr.replace(/-/g, '/');
	dateStr = dateStr.replace(/\./g, '/');
	dateStr = dateStr.replace(/:/g, '/');
	dateStr = dateStr.replace(/ /g, '');

	// Handle DDMMYY and DDMMYYYY formats without separators
	if (/^\d{6}$/.test(dateStr)) {
		// DDMMYY format: 310124 -> 31/01/24
		dateStr = dateStr.substring(0, 2) + '/' + dateStr.substring(2, 4) + '/' + dateStr.substring(4, 6);
	} else if (/^\d{8}$/.test(dateStr)) {
		// DDMMYYYY format: 31012024 -> 31/01/24
		dateStr = dateStr.substring(0, 2) + '/' + dateStr.substring(2, 4) + '/' + dateStr.substring(6, 8);
	}

    // Split the string into parts
    let parts = dateStr.split('/');
    
    // Check if there are exactly three parts
    if (parts.length !== 3) return null;
    
    // Correct the day and month parts if necessary
    for (let i = 0; i < 2; i++) {
        if (parts[i].length === 1) {
            parts[i] = '0' + parts[i];
        }
    }
    
    // Correct the year part if necessary
    if (parts[2].length === 4) {
        parts[2] = parts[2].slice(2);
    }
    
    // Check if the corrected date string is valid
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    let currentYear = new Date().getFullYear() % 100;
    
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < currentYear)  return null;
    
    return parts.join('/');

}

function formatTimeInput(timeStr) { // Returns formatted HH:MM or original input if parsing fails
	if (!timeStr || typeof timeStr !== 'string') {
		return timeStr;
	}
	
	// Use existing parseSwedishTime function to parse the input
	const parsedTime = parseSwedishTime(timeStr);
	
	if (parsedTime) {
		// Format to HH:MM with leading zeros
		const hours = String(parsedTime.hours).padStart(2, '0');
		const minutes = String(parsedTime.minutes).padStart(2, '0');
		return `${hours}:${minutes}`;
	}
	
	// If parsing failed, return original input
	return timeStr;
}

function cleanupLocks() {
	
	let directoriesToClean = ['.', dir_EventsActive];

	directoriesToClean.forEach(dir => {
        try {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (file.endsWith('.lock')) {
                    const lockFilePath = path.join(dir, file);
                    try {
                        fs.unlinkSync(lockFilePath);
                        logActivity(`Removed lock file: ${lockFilePath}`);
                    } catch (err) {
                        logActivity(`Error removing lock file ${lockFilePath}:`, err);
                    }
                }
            });
        } catch (err) {
            logActivity(`Error reading directory ${dir} when cleaning up .lock files:`, err);
        }
    });

}

function verktygSignup() {
	try {
		updateVerktygSignup("listaSvar", '📋', '📋 Lista samtliga svar');
		updateVerktygSignup("listaInstrument", '🥁', '🥁 Lista "ja" per instrument');
		updateVerktygSignup("listaKost", '🥦', '🥦 Lista kost för uppsignade');
		updateVerktygSignup("listaKorkort", '🪪', '🪪 Lista körkort för uppsignade');
		updateVerktygSignup("listaBil", '🚗', '🚗 Lista bil för uppsignade');
		syncEventsToSheet();
	} catch (error) {
		logActivity(`Error in verktygSignup function: ${error.message}`);
		throw error; // Re-throw the error so calling code can handle it if needed
	}
}

function scheduleDailyTask(hour, minute, task) {
    // Calculate the delay until the next time the task should run
    const now = new Date();
    const targetTime = new Date();

    targetTime.setHours(hour);
    targetTime.setMinutes(minute);
    targetTime.setSeconds(0);
    targetTime.setMilliseconds(0);

    if (targetTime < now) {
        // If the target time has already passed today, schedule for tomorrow
        targetTime.setDate(targetTime.getDate() + 1);
    }

    const delay = targetTime - now;

    // Schedule the task to run at the target time
    setTimeout(() => {
        task();

        // Schedule the task to run every 24 hours
        setInterval(task, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
    }, delay);
}

function scheduleHourlyTask(task) {
    // Calculate the delay until the next hour
    const now = new Date();
    const nextHour = new Date();
    
    // Set to the next hour (e.g., if it's 11:44, set to 12:00)
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    
    const delay = nextHour - now;
    
    // Schedule the task to run at the next hour
    setTimeout(() => {
        task(true); // Pass true for update mode
        
        // Schedule the task to run every hour
        setInterval(() => {
            task(true); // Pass true for update mode
        }, 60 * 60 * 1000); // 60 minutes in milliseconds
    }, delay);
    
    logActivity(`Scheduled hourly task "${task.name}" to run at ${nextHour.getHours() + 1}:00`);
}

function cleanupOldLogs() {
    try {
        const logsDir = path.join(__dirname, '..', 'logs');
        if (!fs.existsSync(logsDir)) return;
        
        const files = fs.readdirSync(logsDir);
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        
        files.forEach(file => {
            const match = file.match(/^kiribot-(\d{4})-(\d{2})\.log$/);
            if (match) {
                const fileYear = parseInt(match[1]);
                const fileMonth = parseInt(match[2]);
                
                const fileDate = new Date(fileYear, fileMonth - 1);
                const currentDate = new Date(currentYear, currentMonth - 1);
                const monthsDiff = (currentDate.getFullYear() - fileDate.getFullYear()) * 12 
                    + (currentDate.getMonth() - fileDate.getMonth());
                
                if (monthsDiff > 3) {
                    fs.unlinkSync(path.join(logsDir, file));
                    logActivity(`Removed old log file: ${file}`);
                }
            }
        });
    } catch (error) {
        logActivity(`Error cleaning up old logs: ${error.message}`);
    }
}

async function dailyTasks() {
	await checkRoles();
	postCalendar(true);
	// Schedule updateDetails to run 1 minute after checkRoles completes to avoid rate limits
	// checkRoles does 2 fetches (with 1 min delay between them), so we wait 1 more minute before updateDetails
	setTimeout(() => {
		updateDetails().catch(err => logActivity(`Error in updateDetails (from dailyTasks): ${err.message}`));
	}, 60 * 1000); // 1 minute delay after checkRoles completes
	cleanupLocks();
	cleanupOldLogs();
	verktygSignup();
	cleanupOldBackups();
	postNyckelList(true);
}

// Edit the post in spelningar channel
async function eventThreadUpdate(targetEventId = null) {
	let eventName = 'unknown';
	let eventId = targetEventId || 'unknown';
	let threadId = 'unknown';
	let threadName = 'unknown';
	
	try {
		const result = await findEventThread(targetEventId);
		if (!result) {
			logActivity(`No matching thread found for event ID: ${targetEventId}. Searched active and archived threads.`);
			return;
		}

		const targetThread = result;
		threadId = targetThread.id;
		threadName = targetThread.name || 'unnamed thread';
		const isArchived = targetThread.archived;

		// Check if thread is archived and unarchive it if needed
		if (isArchived) {
			try {
				await targetThread.setArchived(false);
				logActivity(`Unarchived thread "${threadName}" (${threadId}) for event update`);
			} catch (unarchiveError) {
				logActivity(`Error unarchiving thread "${threadName}" (${threadId}) for event ID ${targetEventId}: ${unarchiveError.message}. Cannot update thread.`);
				return;
			}
		}

		// Since findEventThread returns the thread, we need to get the message to extract content.
		// Let's fetch the starter message or the oldest bot message again briefly.
		const channel = client.channels.cache.get(ch_Spelningar);
		let targetBotMessage = null;
		if (channel.type === ChannelType.GuildForum) {
			targetBotMessage = await result.fetchStarterMessage().catch(() => null);
		}
		if (!targetBotMessage) {
			const messages = await result.messages.fetch();
			targetBotMessage = messages.filter(msg => msg.author.id === client.user.id).last();
		}
		
		if (!targetBotMessage) {
			logActivity(`Found thread "${threadName}" (${threadId}) for event ${targetEventId} but could not find the key bot message.`);
			return;
		}

		// Extract event ID from the message
		const currentContent = targetBotMessage.content;
		const eventIdMatch = currentContent.match(/-#\s*(\d+)\s*$/m);
		
		if (!eventIdMatch) {
			logActivity(`No event ID found at the end of the message in thread "${threadName}" (${threadId}), message ID: ${targetBotMessage.id}`);
			return;
		}

		eventId = eventIdMatch[1];

		// Fetch event data from server
		let files = fs.readdirSync(dir_EventsActive);
		let fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
		
		if (!fileName) {
			logActivity(`No event file found for ID: ${eventId} (thread: "${threadName}", ${threadId})`);
			return;
		}
		
		let data = JSON.parse(fs.readFileSync(path.join(dir_EventsActive, fileName), 'utf8'));
		eventName = data.name || 'unknown';

		// Reconstruct the base content from data to prevent parsing errors from corrupted messages.
		// This makes the update process robust and also repairs previously corrupted messages.
		const baseContent = `## ${data.name}\n**Signup: https://discord.com/channels/${targetThread.guild.id}/${ch_Signup}/${data.link}**`;

		// Collect users who replied "ja" and "kanske" with their IDs
		let jaUsers = new Map();
		let kanskeUsers = new Map();

		for (const instrument in data.signups) {
			for (const signup of data.signups[instrument]) {
				if (signup.response === 'ja') {
					if (!jaUsers.has(signup.id)) {
						jaUsers.set(signup.id, { name: signup.name, id: signup.id });
					}
				} else if (signup.response === 'kanske') {
					if (!kanskeUsers.has(signup.id)) {
						kanskeUsers.set(signup.id, { name: signup.name, id: signup.id });
					}
				}
			}
		}

		// Get emojis
		const emote_ja = client.emojis.cache.find(emoji => emoji.name === "ja");
		const emote_kanske = client.emojis.cache.find(emoji => emoji.name === "kanske");

		// Create user lists with mentions (if ID available) or names
		const createUserList = (userMap) => {
			const users = Array.from(userMap.values());
			if (users.length === 0) return 'Ingen';
			return users.map(user => {
				return user.id ? `<@${user.id}>` : user.name;
			}).join(', ');
		};

		const jaList = jaUsers.size > 0 ? `${emote_ja} ${jaUsers.size}: ${createUserList(jaUsers)}` : `${emote_ja} 0: Ingen`;
		const kanskeList = kanskeUsers.size > 0 ? `${emote_kanske} ${kanskeUsers.size}: ${createUserList(kanskeUsers)}` : `${emote_kanske} 0: Ingen`;
		
		// Create the new content with updated lists, using the freshly generated and always-correct baseContent.
		const newContent = `${baseContent}\n\n${jaList}\n\n${kanskeList}\n\n-# ${eventId}`;
		
		// Create a button for listaInstrument
		const btn_listaInstrument = new ButtonBuilder()
			.setCustomId(`listaInstrument_${eventId}`)
			.setLabel('Instrumentlista (endast ja)')
			.setStyle(ButtonStyle.Secondary);
		
		const row = new ActionRowBuilder()
			.addComponents(btn_listaInstrument);
		
		await targetBotMessage.edit({ 
			content: newContent,
			components: [row]
		});
		logActivity(`Updated event thread for: ${data.name}`);
	} catch (error) {
		// Enhanced error logging with context
		const errorDetails = {
			eventName: eventName,
			eventId: eventId,
			threadName: threadName,
			threadId: threadId,
			errorMessage: error.message,
			errorCode: error.code || 'N/A',
			errorName: error.name || 'Error'
		};
		logActivity(`Error in eventThreadUpdate for event "${eventName}" (ID: ${eventId}), thread "${threadName}" (${threadId}): ${error.message}${error.code ? ` (code: ${error.code})` : ''}`);
	}
}

// Create a discussion thread for an event in the spelningar channel
async function eventThread(signupData) {
	try {
		const channel = client.channels.cache.get(ch_Spelningar);
		if (!channel) {
			logActivity(`Error: Could not find spelningar channel with ID ${ch_Spelningar}`);
			return;
		}
		// Get emojis
		const emote_ja = client.emojis.cache.find(emoji => emoji.name === "ja");
		const emote_kanske = client.emojis.cache.find(emoji => emoji.name === "kanske");

		// Create the thread title and content
		const threadTitle = `${signupData.name}`;
		const threadContent = `## ${signupData.name}\n**Signup: https://discord.com/channels/${guildId}/${ch_Signup}/${signupData.link}**\n\n${emote_ja} 0: Ingen\n\n${emote_kanske} 0: Ingen\n\n-# ${signupData.id}`;

		// Create the thread
		const thread = await channel.threads.create({
			name: threadTitle,
			message: {
				content: threadContent
			},
			autoArchiveDuration: 10080  // Archive after 1 week
		});

		// Set permission to allow everyone to pin messages in the thread
		// PIN_MESSAGES permission (1 << 51) is required starting February 2026
		try {
			const guild = thread.guild;
			const everyoneRole = guild.roles.everyone;
			// Use PinMessages if available, otherwise use the numeric value (1 << 51 = 2251799813685248)
			const pinMessagesPermission = PermissionFlagsBits.PinMessages ?? 2251799813685248n;
			await thread.permissionOverwrites.edit(everyoneRole.id, {
				allow: [pinMessagesPermission]
			});
		} catch (permError) {
			logActivity(`Warning: Could not set pin messages permission in thread for '${signupData.name}' (Thread ID: ${thread.id}): ${permError.message}`);
		}

		// Post "Information:" message and pin it
		// Note: Bot needs PIN_MESSAGES permission (required starting February 2026)
		try {
			// Verify bot has permission to pin messages
			const botMember = await thread.guild.members.fetch(client.user.id);
			const hasPinPermission = thread.permissionsFor(botMember).has(PermissionFlagsBits.PinMessages ?? 2251799813685248n);
			if (!hasPinPermission) {
				logActivity(`Warning: Bot does not have PIN_MESSAGES permission in thread for '${signupData.name}' (Thread ID: ${thread.id}). Pinning will fail after February 2026.`);
			}
			
			// Post the "Information:" message (this will always be the second message)
			const informationMessage = await thread.send("Information:");
			
			// Pin the information message
			await informationMessage.pin();
		} catch (pinError) {
			// Check if it's a permission error related to PIN_MESSAGES
			if (pinError.code === 50013 || pinError.message.includes('permission') || pinError.message.includes('PIN_MESSAGES')) {
				logActivity(`Warning: Could not pin information message in thread for '${signupData.name}' (Thread ID: ${thread.id}). Bot may need PIN_MESSAGES permission (required starting February 2026): ${pinError.message}`);
			} else {
				logActivity(`Warning: Could not pin information message in thread for '${signupData.name}' (Thread ID: ${thread.id}): ${pinError.message}`);
			}
		}

		logActivity(`Created discussion thread for event: '${signupData.name}' (Thread ID: ${thread.id})`);
	} catch (error) {
		logActivity(`Error creating event thread for '${signupData.name}' (Thread ID: ${thread.id}): ${error.message}`);
	}
}

//////////////////
//// Google Drive Event Folder Automation ////
//////////////////

// Helper function to find or create year folder in Google Drive
async function findOrCreateYearFolder(driveClient, year) {
	try {
		const parentFolderId = '1vyOe8TZpTbAxpxUQw3t_YPZDSP8Xd_X_';
		
		// Search for existing year folder
		const response = await driveClient.files.list({
			q: `'${parentFolderId}' in parents and name='${year}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			fields: 'files(id, name)',
		});
		
		if (response.data.files && response.data.files.length > 0) {
			return response.data.files[0].id;
		}
		
		// Year folder doesn't exist, create it
		const folderMetadata = {
			name: year,
			mimeType: 'application/vnd.google-apps.folder',
			parents: [parentFolderId]
		};
		
		const folder = await driveClient.files.create({
			resource: folderMetadata,
			fields: 'id, name'
		});
		
		return folder.data.id;
	} catch (error) {
		logActivity(`Error in findOrCreateYearFolder: ${error.message}`);
		throw error;
	}
}

// Create Google Drive folder for an event
async function createEventDriveFolder(eventData) {
	try {
		// Authenticate with Google Drive API
		const auth = new google.auth.GoogleAuth({
			keyFile: './src/service-account.json',
			scopes: ['https://www.googleapis.com/auth/drive'],
		});
		
		const drive = google.drive({ version: 'v3', auth });
		
		// Validate and extract year from event date (DD/MM/YY format)
		if (!eventData.date) {
			logActivity(`Error: Event date missing for event '${eventData.name || 'unknown'}'`);
			return null;
		}
		
		const dateParts = eventData.date.split('/');
		if (dateParts.length !== 3) {
			logActivity(`Error: Invalid date format for event '${eventData.name || 'unknown'}': ${eventData.date}`);
			return null;
		}
		
		const year = parseInt(dateParts[2]);
		if (isNaN(year) || year < 0 || year > 99) {
			logActivity(`Error: Cannot parse year from date '${eventData.date}' for event '${eventData.name || 'unknown'}'`);
			return null;
		}
		
		const fullYear = 2000 + year; // Convert YY to YYYY
		
		// Find or create year folder
		const yearFolderId = await findOrCreateYearFolder(drive, String(fullYear));
		
		// Format event folder name: YYMMDD Event name
		const day = dateParts[0].padStart(2, '0');
		const month = dateParts[1].padStart(2, '0');
		const yearShort = dateParts[2];
		const folderName = `${yearShort}${month}${day} ${eventData.name}`;
		
		// Check if folder already exists
		const existingFolders = await drive.files.list({
			q: `'${yearFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			fields: 'files(id, name, webViewLink)',
		});
		
		if (existingFolders.data.files && existingFolders.data.files.length > 0) {
			// Folder already exists, return existing folder info
			const existingFolder = existingFolders.data.files[0];
			// Construct URL from folder ID if webViewLink is not available
			const folderUrl = existingFolder.webViewLink || `https://drive.google.com/drive/folders/${existingFolder.id}`;
			return { folderId: existingFolder.id, folderUrl: folderUrl, alreadyExists: true };
		}
		
		// Create event folder inside year folder
		const folderMetadata = {
			name: folderName,
			mimeType: 'application/vnd.google-apps.folder',
			parents: [yearFolderId]
		};
		
		const folder = await drive.files.create({
			resource: folderMetadata,
			fields: 'id, name, webViewLink'
		});
		
		const folderId = folder.data.id;
		const folderUrl = folder.data.webViewLink;
		
		return { folderId, folderUrl, alreadyExists: false };
	} catch (error) {
		logActivity(`Error creating Drive folder for event '${eventData.name || 'unknown'}': ${error.message}`);
		return null;
	}
}

// Find event discussion thread by event ID (returns thread or null)
async function findEventThread(eventId) {
	try {
		const spelningarChannel = client.channels.cache.get(ch_Spelningar);
		if (!spelningarChannel) {
			logActivity(`Error: Could not find spelningar channel with ID ${ch_Spelningar}`);
			return null;
		}
		
		const checkThread = async (thread) => {
			try {
				// Checkmark filter removed - event ID matching works regardless of thread title
				
				let starterMessage = null;
				
				// Try the modern, explicit method first.
				try {
					starterMessage = await thread.fetchStarterMessage();
				} catch (err) {
					logActivity(`fetchStarterMessage failed for thread ${thread.id}. It might be an older thread. Falling back.`);
					// Fallback for older threads or API versions: the starter message ID is the thread ID.
					try {
						starterMessage = await thread.messages.fetch(thread.id);
					} catch (fallbackErr) {
						logActivity(`Fallback message fetch failed for thread ${thread.id}. Cannot check this thread.`);
						return null;
					}
				}
				
				if (!starterMessage || starterMessage.author.id !== client.user.id) {
					return null;
                }

				const eventIdMatch = starterMessage.content.match(/-#\s*(\d+)\s*$/m);
				if (eventIdMatch && eventIdMatch[1] === eventId) {
					return thread;
				}

			} catch (threadError) {
				logActivity(`An unexpected error occurred while checking thread ${thread.id}: ${threadError.message}`);
			}
			return null;
		};

		const searchThreadCollection = async (collection) => {
			for (const thread of collection.values()) {
				const found = await checkThread(thread);
				if (found) return found;
			}
			return null;
		};

		// 1. Check active threads
		const active = await spelningarChannel.threads.fetchActive();
		let foundThread = await searchThreadCollection(active.threads);
		if (foundThread) return foundThread;

		// 2. Check archived threads with pagination to ensure all are checked
		let lastThreadId = null;
		let hasMore = true;
		while (hasMore) {
			const options = { limit: 100 };
			if (lastThreadId) options.before = lastThreadId;

			const archived = await spelningarChannel.threads.fetchArchived(options);
			foundThread = await searchThreadCollection(archived.threads);
			if (foundThread) return foundThread;

			if (archived.threads.size > 0) {
				lastThreadId = archived.threads.lastKey();
			}
			hasMore = archived.hasMore || false;
		}

		return null; // Not found

	} catch (error) {
		logActivity(`Error in findEventThread for event ID ${eventId}: ${error.message}`);
		return null;
	}
}

// Check if bot has already posted a Google Drive link message in the thread
async function hasExistingDriveLinkMessage(thread) {
	try {
		// Fetch all messages in the thread
		const messages = await thread.messages.fetch();
		
		// Get all messages sent by the bot
		const botMessages = messages.filter(msg => msg.author.id === client.user.id);
		
		if (botMessages.size <= 1) {
			// Only the starter message exists, no Drive link message yet
			return false;
		}
		
		// Identify the starter message (oldest bot message)
		let starterMessage = null;
		try {
			starterMessage = await thread.fetchStarterMessage();
		} catch (err) {
			// Fallback: the oldest message is likely the starter
			starterMessage = botMessages.last();
		}
		
		// Sort messages by timestamp to find the information message (second message)
		const messageArray = Array.from(botMessages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
		
		// Check the information message (second message) for Google Drive link
		if (messageArray.length >= 2) {
			const informationMessage = messageArray[1];
			if (informationMessage.content.startsWith('Information:')) {
				const content = informationMessage.content.toLowerCase();
				if (content.includes('google drive')) {
					return true; // Information message already contains Drive link
				}
			}
		}
		
		// Also check all bot messages except the starter message for "google drive" (case-insensitive)
		// This covers the case where a separate Drive link message was posted (old behavior)
		for (const [messageId, message] of botMessages) {
			// Skip the starter message
			if (starterMessage && messageId === starterMessage.id) {
				continue;
			}
			
			const content = message.content.toLowerCase();
			if (content.includes('google drive')) {
				return true; // Found an existing Drive link message
			}
		}
		
		return false; // No Drive link message found
	} catch (error) {
		logActivity(`Error checking for existing Drive link message in thread ${thread.id}: ${error.message}`);
		// If we can't check, assume there's no existing message to be safe
		return false;
	}
}

// Post Drive folder link to event discussion thread
async function postDriveLinkToEventThread(eventId, driveUrl, eventName) {
	try {
		const targetThread = await findEventThread(eventId);
		
		if (!targetThread) {
			logActivity(`Error: Could not find discussion thread for event ID ${eventId} in active or archived threads`);
			return false;
		}
		
		// Get event data to access current information text
		const eventData = getEventJSON(eventId);
		if (!eventData) {
			logActivity(`Error: Could not load event data for event ID ${eventId}`);
			return false;
		}
		
		// Find the information message (second message in thread)
		const messages = await targetThread.messages.fetch({ limit: 20 });
		const messageArray = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
		
		let informationMessage = null;
		if (messageArray.length >= 2) {
			const potentialInfoMessage = messageArray[1];
			if (potentialInfoMessage.content.startsWith('Information:')) {
				informationMessage = potentialInfoMessage;
			}
		}
		
		// If information message exists, edit it to include the Drive link
		if (informationMessage) {
			// Check if the information message already contains the Google Drive link
			const messageContent = informationMessage.content;
			const hasDriveLink = messageContent.includes('📸✨ Google Drive-länk för');
			
			if (hasDriveLink) {
				logActivity(`Google Drive link already exists in information message for event ID ${eventId}. Skipping Drive link addition.`);
				return true; // Already added, no need to do anything
			}
			
			// Get current information text from event data
			const currentText = eventData.information?.text || '';
			
			// Also check the event data text to be safe
			if (currentText.includes('📸✨ Google Drive-länk för')) {
				logActivity(`Google Drive link already exists in event data for event ID ${eventId}. Skipping Drive link addition.`);
				return true; // Already added, no need to do anything
			}
			
			// Append Google Drive link to the information text
			const driveLinkText = `\n\n📸✨ Google Drive-länk för **${eventName}:**\n${driveUrl}`;
			const newInformationText = currentText + driveLinkText;
			
			// Update the information message
			const newContent = `Information:\n${newInformationText}`;
			await informationMessage.edit(newContent);
			
			// Update event data JSON file with the new text
			const files = fs.readdirSync(dir_EventsActive);
			const fileName = files.find(file => file.endsWith('_' + eventId + '.json'));
			
			if (fileName) {
				const filePath = path.join(dir_EventsActive, fileName);
				
				// Use lockFile to safely update JSON
				lockFile.lock(`${fileName}.lock`, { stale: (5 * 60 * 1000), retries: 3, retryWait: 100 }, async (err) => {
					if (err) {
						logActivity(`Failed to acquire lock for ${fileName} when updating with Drive link: ${err.message}`);
						return;
					}
					
					try {
						// Re-read the file to ensure we have the latest data
						let eventDataToUpdate = JSON.parse(fs.readFileSync(filePath, 'utf8'));
						
						// Update information text
						if (eventDataToUpdate.information) {
							eventDataToUpdate.information.text = newInformationText;
							fs.writeFileSync(filePath, JSON.stringify(eventDataToUpdate));
						}
					} catch (updateError) {
						logActivity(`Error updating event data with Drive link for event ID ${eventId}: ${updateError.message}`);
					} finally {
						lockFile.unlock(`${fileName}.lock`, (unlockErr) => {
							if (unlockErr) {
								logActivity(`Failed to unlock ${fileName}: ${unlockErr.message}`);
							}
						});
					}
				});
			}
			
			// Create link to information message
			const informationMessageLink = `https://discord.com/channels/${targetThread.guild.id}/${targetThread.id}/${informationMessage.id}`;
			
			// Send a new message saying everyone can add photos/videos to Google Drive
			await targetThread.send(`📸✨ Alla kan nu lägga till bilder och videos i Google Drive för **${eventName}**!\n\nKlicka här för att se informationsmeddelandet: ${informationMessageLink}`);
		} else {
			// Fallback: Information message is missing, send a regular message as previously done
			logActivity(`Information message not found for event ID ${eventId}, posting Drive link as regular message instead`);
			
			const message = await targetThread.send(`📸✨ Google Drive-länk för **${eventName}:**\n${driveUrl}\n\nLägg in bilder och videos där eller posta dem här i tråden (bilder som läggs i tråden synkar *inte* till Google Drive)!`);
			
			// Pin the message
			// Note: Bot needs PIN_MESSAGES permission (required starting February 2026)
			try {
				// Verify bot has permission to pin messages
				const botMember = await targetThread.guild.members.fetch(client.user.id);
				const hasPinPermission = targetThread.permissionsFor(botMember).has(PermissionFlagsBits.PinMessages ?? 2251799813685248n);
				if (!hasPinPermission) {
					logActivity(`Warning: Bot does not have PIN_MESSAGES permission in thread for event ID ${eventId}. Pinning will fail after February 2026.`);
				}
				
				await message.pin();
			} catch (pinError) {
				// Check if it's a permission error related to PIN_MESSAGES
				if (pinError.code === 50013 || pinError.message.includes('permission') || pinError.message.includes('PIN_MESSAGES')) {
					logActivity(`Warning: Could not pin Drive folder link message for event ID ${eventId}. Bot may need PIN_MESSAGES permission (required starting February 2026): ${pinError.message}`);
				} else {
					logActivity(`Warning: Could not pin Drive folder link message for event ID ${eventId}: ${pinError.message}`);
				}
				// Continue even if pinning fails
			}
		}
		
		return true;
		
	} catch (error) {
		logActivity(`Error posting Drive link to thread for event ID ${eventId}: ${error.message}`);
		return false;
	}
}

// Process a single passed event (creates Drive folder and posts link if needed)
async function processPassedEvent(eventData, fileName) {
	try {
		// Check if Drive folder creation is requested for this event
		if (eventData.createDriveDir === false || typeof eventData.createDriveDir === 'undefined') {
			logActivity(`Skipping Drive folder creation for event '${eventData.name}' as per event settings.`);
			return;
		}

		// First, verify we can find the thread before creating the Drive folder
		const targetThread = await findEventThread(eventData.id);
		
		if (!targetThread) {
			logActivity(`Error: Could not find discussion thread for event ID ${eventData.id}. Skipping Drive folder creation.`);
			return;
		}
		
		// Check if bot has already posted a Google Drive link message in this thread
		const alreadyPosted = await hasExistingDriveLinkMessage(targetThread);
		if (alreadyPosted) {
			logActivity(`Google Drive link already posted for event '${eventData.name}' (ID: ${eventData.id}). Skipping Drive folder creation and link posting.`);
			return;
		}
		
		// Only proceed with Drive folder creation if thread exists and no Drive link was found
		// Create or check for existing Drive folder
		const driveResult = await createEventDriveFolder(eventData);
		if (!driveResult || !driveResult.folderUrl) {
			logActivity(`Error: Failed to create or find Drive folder for event '${eventData.name}'`);
			return;
		}
		
		// Only post Drive link to thread if folder was just created (not if it already existed)
		if (!driveResult.alreadyExists) {
			const success = await postDriveLinkToEventThread(eventData.id, driveResult.folderUrl, eventData.name);
			if (!success) {
				logActivity(`Warning: Drive folder created for event '${eventData.name}' but failed to post link to thread.`);
			}
		}
		
		// Note: Archiving logic can be added here or in checkAndProcessPassedEvents() later
		// Existing moveToArchived() function at line 4146 should remain untouched for now
		// Function continues even if folder already exists, allowing archiving to proceed
		
	} catch (error) {
		logActivity(`Error processing passed event '${eventData.name || fileName}': ${error.message}`);
	}
}

// Check and process events that have just passed
async function checkAndProcessPassedEvents(update = null) {
	try {
		// Read all JSON files from active directory
		const files = fs.readdirSync(dir_EventsActive).filter(file => file.endsWith('.json'));
		
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		
		for (const file of files) {
			try {
				const filePath = path.join(dir_EventsActive, file);
				const eventData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
				
				// Parse event date (DD/MM/YY format)
				if (!eventData.date) {
					continue;
				}
				
				const dateParts = eventData.date.split('/');
				if (dateParts.length !== 3) {
					continue;
				}
				
				const day = parseInt(dateParts[0]);
				const month = parseInt(dateParts[1]);
				const year = parseInt(dateParts[2]);
				
				if (isNaN(day) || isNaN(month) || isNaN(year)) {
					continue;
				}
				
				const fullYear = 2000 + year;
				const eventDate = new Date(fullYear, month - 1, day);
				eventDate.setHours(0, 0, 0, 0);
				
				// Check if event date is today
				if (eventDate.getTime() !== today.getTime()) {
					continue;
				}
				
				// Parse event time
				let eventTime = null;
				if (eventData.time) {
					const parsedTime = parseSwedishTime(eventData.time);
					if (parsedTime) {
						eventTime = new Date(fullYear, month - 1, day, parsedTime.hours, parsedTime.minutes);
					}
				}
				
				// If no valid time, skip (we can't determine if event has passed)
				if (!eventTime) {
					continue;
				}
				
				// Check if current time is after event time
				if (now.getTime() > eventTime.getTime()) {
					// Event has passed, process it
					await processPassedEvent(eventData, file);
				}
				
			} catch (error) {
				logActivity(`Error checking event file ${file}: ${error.message}`);
			}
		}
	} catch (error) {
		logActivity(`Error in checkAndProcessPassedEvents: ${error.message}`);
	}
}

//////////////////
//// JSON Backup System to Google Drive ////
//////////////////

// Helper function to find existing subfolder in Google Drive (does NOT create if missing)
async function findSubfolder(driveClient, parentFolderId, folderName) {
	try {
		// Search for existing subfolder
		const response = await driveClient.files.list({
			q: `'${parentFolderId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			fields: 'files(id, name)',
			supportsAllDrives: true,
			includeItemsFromAllDrives: true
		});
		
		if (response.data.files && response.data.files.length > 0) {
			// logActivity(`Found existing subfolder: ${folderName} (ID: ${response.data.files[0].id})`);
			return response.data.files[0].id;
		}
		
		// Subfolder doesn't exist - return null (don't create, as service account can't own folders)
		// logActivity(`Warning: Subfolder '${folderName}' not found. Please create it manually in Google Drive.`);
		return null;
	} catch (error) {
		// logActivity(`Error in findSubfolder for '${folderName}': ${error.message}`);
		throw error;
	}
}

// Main backup function that uploads JSON files to Google Drive
async function backupJsonFiles() {
	try {
		
		// Authenticate with Google Drive API
		const auth = new google.auth.GoogleAuth({
			keyFile: './src/service-account.json',
			scopes: ['https://www.googleapis.com/auth/drive'],
		});
		
		const drive = google.drive({ version: 'v3', auth });
		
		// Backup folder ID (Discord Backup folder)
		const backupFolderId = '18og58SathrgEcHd9lyTSiropfRgcltlH';
		
		// Get current date in YYYY-MM-DD format
		const now = new Date();
		const dateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		
		// Define backup configuration
		const backupConfig = [
			{
				subfolderName: 'permissions',
				localPath: path.join(__dirname, 'data', 'permissions.json'),
				backupFileName: `${dateString}.json`
			},
			{
				subfolderName: 'detailsList',
				localPath: path.join(__dirname, 'detailsList.json'),
				backupFileName: `${dateString}.json`
			},
			{
				subfolderName: 'groupList',
				localPath: path.join(__dirname, 'groupList.json'),
				backupFileName: `${dateString}.json`
			},
			{
				subfolderName: 'instrumentList',
				localPath: path.join(__dirname, 'instrumentList.json'),
				backupFileName: `${dateString}.json`
			}
		];
		
		// Backup single files
		for (const config of backupConfig) {
			try {
				// Check if local file exists
				if (!fs.existsSync(config.localPath)) {
					// logActivity(`Error when backing up ${config.subfolderName}: file does not exist`);
					continue;
				}
				
				// Find existing subfolder (must be created manually by user)
				const subfolderId = await findSubfolder(drive, backupFolderId, config.subfolderName);
				
				if (!subfolderId) {
					// logActivity(`Skipping backup of ${config.subfolderName}: subfolder does not exist in Google Drive`);
					continue;
				}
				
				// Read local file
				const fileContent = fs.readFileSync(config.localPath, 'utf8');
				
				// Check if file with same name already exists in Drive
				const existingFiles = await drive.files.list({
					q: `'${subfolderId}' in parents and name='${config.backupFileName}' and trashed=false`,
					fields: 'files(id, name)',
					supportsAllDrives: true,
					includeItemsFromAllDrives: true
				});
				
				// Upload file (will overwrite if exists)
				const fileMetadata = {
					name: config.backupFileName,
					parents: [subfolderId]
				};
				
				const media = {
					mimeType: 'application/json',
					body: fileContent
				};
				
				if (existingFiles.data.files && existingFiles.data.files.length > 0) {
					// Update existing file
					const updateResult = await drive.files.update({
						fileId: existingFiles.data.files[0].id,
						media: media,
						supportsAllDrives: true
					});
					// logActivity(`Successfully updated backup: ${config.subfolderName}/${config.backupFileName}`);
				} else {
					// Create new file
					const createResult = await drive.files.create({
						resource: fileMetadata,
						media: media,
						supportsAllDrives: true
					});
					// logActivity(`Successfully created backup: ${config.subfolderName}/${config.backupFileName} (ID: ${createResult.data.id})`);
				}
			} catch (error) {
				// logActivity(`Error backing up ${config.subfolderName}: ${error.message}`);
				// logActivity(`Full error details: ${JSON.stringify(error)}`);
				// Continue with other files
			}
		}
		
		// Backup active events files
		try {
			const activeEventsDir = path.join(__dirname, 'events', 'active');
			if (!fs.existsSync(activeEventsDir)) {
				// logActivity('Error: Active events directory does not exist, skipping backup');
			} else {
				// Find existing active events subfolder (must be created manually by user)
				const activeEventsSubfolderId = await findSubfolder(drive, backupFolderId, 'active events');
				
				if (!activeEventsSubfolderId) {
					// logActivity('Skipping active events backup: subfolder does not exist in Google Drive');
					return;
				}
				
				// Get all JSON files in active directory
				const activeFiles = fs.readdirSync(activeEventsDir).filter(file => file.endsWith('.json'));
				
				for (const fileName of activeFiles) {
					try {
						const filePath = path.join(activeEventsDir, fileName);
						const fileContent = fs.readFileSync(filePath, 'utf8');
						
						// Format: originalFilename_YYYY-MM-DD.json
						const backupFileName = `${fileName.replace('.json', '')}_${dateString}.json`;
						
						// Check if file with same name already exists
						const existingFiles = await drive.files.list({
							q: `'${activeEventsSubfolderId}' in parents and name='${backupFileName}' and trashed=false`,
							fields: 'files(id, name)',
							supportsAllDrives: true,
							includeItemsFromAllDrives: true
						});
						
						const fileMetadata = {
							name: backupFileName,
							parents: [activeEventsSubfolderId]
						};
						
						const media = {
							mimeType: 'application/json',
							body: fileContent
						};
						
						if (existingFiles.data.files && existingFiles.data.files.length > 0) {
							// Update existing file
							const updateResult = await drive.files.update({
								fileId: existingFiles.data.files[0].id,
								media: media,
								supportsAllDrives: true
							});
							// logActivity(`Successfully updated active event backup: ${backupFileName}`);
						} else {
							// Create new file
							const createResult = await drive.files.create({
								resource: fileMetadata,
								media: media,
								supportsAllDrives: true
							});
							// logActivity(`Successfully created active event backup: ${backupFileName} (ID: ${createResult.data.id})`);
						}
					} catch (error) {
						// logActivity(`Error backing up active event ${fileName}: ${error.message}`);
						// logActivity(`Full error details: ${JSON.stringify(error)}`);
						// Continue with other files
					}
				}
			}
		} catch (error) {
			// logActivity(`Error backing up active events: ${error.message}`);
		}
		
	} catch (error) {
		// logActivity(`Error in backupJsonFiles: ${error.message}`);
	}
}

// Cleanup function for archived active events (removes backups of files that no longer exist locally)
async function cleanupArchivedActiveEvents(drive, activeEventsSubfolderId) {
	try {
		// Get current local active files (without .json extension for comparison)
		const activeEventsDir = path.join(__dirname, 'events', 'active');
		if (!fs.existsSync(activeEventsDir)) {
			return; // Nothing to clean if directory doesn't exist
		}
		
		const localFiles = fs.readdirSync(activeEventsDir)
			.filter(file => file.endsWith('.json'))
			.map(file => file.replace('.json', ''));
		
		// Get all backup files in active events subfolder
		let allBackups = [];
		let nextPageToken = null;
		
		do {
			const response = await drive.files.list({
				q: `'${activeEventsSubfolderId}' in parents and trashed=false`,
				fields: 'nextPageToken, files(id, name)',
				pageSize: 1000,
				pageToken: nextPageToken,
				supportsAllDrives: true,
				includeItemsFromAllDrives: true
			});
			
			if (response.data.files) {
				allBackups = allBackups.concat(response.data.files);
			}
			
			nextPageToken = response.data.nextPageToken || null;
		} while (nextPageToken);
		
		// For each backup file, extract original filename and check if it exists locally
		let deletedCount = 0;
		for (const backupFile of allBackups) {
			try {
				// Extract original filename: remove the _YYYY-MM-DD.json suffix
				const fileNameMatch = backupFile.name.match(/^(.+)_\d{4}-\d{2}-\d{2}\.json$/);
				if (fileNameMatch) {
					const originalFileName = fileNameMatch[1];
					
					// If original file doesn't exist locally, delete the backup
					if (!localFiles.includes(originalFileName)) {
						await drive.files.delete({
							fileId: backupFile.id,
							supportsAllDrives: true
						});
						deletedCount++;
						// logActivity(`Deleted archived event backup: ${backupFile.name}`);
					}
				}
			} catch (error) {
				// logActivity(`Error checking/deleting backup file ${backupFile.name}: ${error.message}`);
			}
		}
		
	} catch (error) {
		// logActivity(`Error in cleanupArchivedActiveEvents: ${error.message}`);
	}
}

// Cleanup function that removes backups older than 14 days
async function cleanupOldBackups() {
	try {
		
		// Authenticate with Google Drive API
		const auth = new google.auth.GoogleAuth({
			keyFile: './src/service-account.json',
			scopes: ['https://www.googleapis.com/auth/drive'],
		});
		
		const drive = google.drive({ version: 'v3', auth });
		
		// Backup folder ID (Discord Backup folder)
		const backupFolderId = '18og58SathrgEcHd9lyTSiropfRgcltlH';
		
		// Calculate cutoff date (14 days ago at midnight local time)
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - 14);
		cutoffDate.setHours(0, 0, 0, 0);
		
		// List all subfolders in backup folder
		const subfolders = await drive.files.list({
			q: `'${backupFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			fields: 'files(id, name)',
			supportsAllDrives: true,
			includeItemsFromAllDrives: true
		});
		
		if (!subfolders.data.files) {
			return;
		}
		
		let totalDeleted = 0;
		
		// Process each subfolder
		for (const subfolder of subfolders.data.files) {
			try {
				// Get all files in subfolder (with pagination)
				let allFiles = [];
				let nextPageToken = null;
				
				do {
					const response = await drive.files.list({
						q: `'${subfolder.id}' in parents and trashed=false`,
						fields: 'nextPageToken, files(id, name)',
						pageSize: 1000,
						pageToken: nextPageToken,
						supportsAllDrives: true,
						includeItemsFromAllDrives: true
					});
					
					if (response.data.files) {
						allFiles = allFiles.concat(response.data.files);
					}
					
					nextPageToken = response.data.nextPageToken || null;
				} while (nextPageToken);
				
				// Process each file
				for (const file of allFiles) {
					try {
						let fileDate = null;
						
						// Extract date from filename
						// Format 1: YYYY-MM-DD.json (for single files)
						const dateMatch1 = file.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
						// Format 2: originalFilename_YYYY-MM-DD.json (for active events)
						const dateMatch2 = file.name.match(/.+_(\d{4}-\d{2}-\d{2})\.json$/);
						
						if (dateMatch1) {
							// Parse date string and create date at local midnight
							const dateParts = dateMatch1[1].split('-');
							fileDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
							fileDate.setHours(0, 0, 0, 0);
						} else if (dateMatch2) {
							// Parse date string and create date at local midnight
							const dateParts = dateMatch2[1].split('-');
							fileDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
							fileDate.setHours(0, 0, 0, 0);
						}
						
						// If we found a date and it's older than 14 days, delete it
						if (fileDate && fileDate < cutoffDate) {
							await drive.files.delete({
								fileId: file.id,
								supportsAllDrives: true
							});
							totalDeleted++;
							// logActivity(`Deleted old backup: ${subfolder.name}/${file.name}`);
						}
					} catch (error) {
						// logActivity(`Error processing file ${file.name} in ${subfolder.name}: ${error.message}`);
					}
				}
				
				// Special cleanup for active events subfolder
				if (subfolder.name === 'active events') {
					await cleanupArchivedActiveEvents(drive, subfolder.id);
				}
			} catch (error) {
				// logActivity(`Error processing subfolder ${subfolder.name}: ${error.message}`);
			}
		}
		
	} catch (error) {
		// logActivity(`Error in cleanupOldBackups: ${error.message}`);
	}
}

// Schedule a task to run twice daily at specified times
function scheduleTwiceDailyTask(time1Hour, time1Minute, time2Hour, time2Minute, task) {
	// Schedule first time
	const now = new Date();
	const targetTime1 = new Date();
	targetTime1.setHours(time1Hour);
	targetTime1.setMinutes(time1Minute);
	targetTime1.setSeconds(0);
	targetTime1.setMilliseconds(0);
	
	if (targetTime1 < now) {
		targetTime1.setDate(targetTime1.getDate() + 1);
	}
	
	const delay1 = targetTime1 - now;
	
	setTimeout(() => {
		task();
		// Schedule to run every 24 hours
		setInterval(task, 24 * 60 * 60 * 1000);
	}, delay1);
	
	// Schedule second time
	const targetTime2 = new Date();
	targetTime2.setHours(time2Hour);
	targetTime2.setMinutes(time2Minute);
	targetTime2.setSeconds(0);
	targetTime2.setMilliseconds(0);
	
	if (targetTime2 < now) {
		targetTime2.setDate(targetTime2.getDate() + 1);
	}
	
	const delay2 = targetTime2 - now;
	
	setTimeout(() => {
		task();
		// Schedule to run every 24 hours
		setInterval(task, 24 * 60 * 60 * 1000);
	}, delay2);
	
}

async function logActivity(...args) {
    const activity = args.map(arg => {
        if (arg instanceof Error) {
            return arg.stack ? arg.stack : arg.toString();
        }
        if (typeof arg === 'object' && arg !== null) {
            try {
                // Handle Discord API error objects specifically for better logging
                if (arg.rawError) {
                    return JSON.stringify({
                        message: arg.message,
                        method: arg.method,
                        path: arg.path,
                        code: arg.code,
                        httpStatus: arg.httpStatus,
                        rawError: arg.rawError,
                    }, null, 2);
                }
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return '[Unserializable Object]';
            }
        }
        return String(arg);
    }).join(' ');

	const logTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'short', hourCycle: 'h24', timeZone: 'Europe/Stockholm'}).format(new Date());
	
	// Categorize log messages with emojis
	let emoji = '';
	let logType = '';

	let activityLower = activity.toLowerCase();
	
	if (activityLower.includes('joined the Discord')) {
		emoji = '🌟'; // Server join
	} else if (activityLower.includes('updated their status') || 
	           activityLower.includes('changed their nickname') || 
	           activityLower.includes(' left the workgroup ') || 
	           activityLower.includes(' joined the workgroup ') || 
	           activityLower.includes(' left the instrument ') || 
	           activityLower.includes(' joined the instrument ') || 
	           activityLower.includes('updated their details') || 
	           activityLower.includes('failed to update details')) {
		emoji = '👤'; // User personal activity
	} else if (activityLower.includes('thread')) {
		emoji = '🧵'; // Thread-related activity
	} else if (activityLower.includes('signup')) {
		emoji = '📝'; // Signup-related activity
	} else if (activityLower.includes('cleanupsignups') || 
	           activityLower.includes('was created by') || 
	           activityLower.includes('was removed by') || 
	           activityLower.includes('was renamed by') || 
	           activityLower.includes('permission')) {
		emoji = '🔧'; // Moderator tools
	} else if (activityLower.includes('archiv') || 
	           activityLower.includes('cleanup') || 
	           activityLower.includes('scheduled') || 
	           activityLower.includes('move') || 
	           activityLower.includes('sync') || 
	           activityLower.includes('post') || 
	           activityLower.includes('update') || 
	           activityLower.includes('remove')) {
		emoji = '🔄'; // Auto features and archiving
	} else {
		emoji = 'ℹ️'; // Emoji for other messages
	}

	if (activityLower.includes('failed') || 
	    activityLower.includes('error') || 
	    activityLower.includes('warning') || 
	    activityLower.includes('missing') || 
	    activityLower.includes('not found') || 
	    activityLower.includes('could not') || 
	    activityLower.includes('unable') || 
	    activityLower.includes('invalid') || 
	    activityLower.includes('fatal') || 
	    activityLower.includes('exception') ||
	    activityLower.includes('rate limited') ||
	    activityLower.includes('invalid request warning') ||
	    activityLower.includes('disconnect') ||
	    activityLower.includes('unhandled rejection') ||
	    activityLower.includes('uncaught exception')) {
		logType = '🔴';
	} else {
		logType = '🟢';
	}
	
	const logMessage = `${logTime}: ${logType} ${emoji} ${activity}`;
	
	// Console output
	console.log(logMessage);
	
	// File output
	try {
		const logsDir = path.join(__dirname, '..', 'logs');
		if (!fs.existsSync(logsDir)) {
			fs.mkdirSync(logsDir, { recursive: true });
		}
		
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const logFileName = `kiribot-${year}-${month}.log`;
		const logFilePath = path.join(logsDir, logFileName);
		
		fs.appendFileSync(logFilePath, logMessage + '\n');
	} catch (error) {
		// Fail silently to avoid cascading errors
		console.error('Failed to write to log file:', error.message);
	}
}

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

// Add error handlers to prevent crashes
client.on('error', (error) => {
    logActivity('Discord client error:', error);
});

// Handle Gateway rate limit errors specifically to prevent unhandled rejections
client.on('rateLimit', (rateLimitInfo) => {
    // This handles rate limit events from the gateway
    logActivity(`Gateway rate limit: ${rateLimitInfo.method} ${rateLimitInfo.path} - Retry after ${rateLimitInfo.timeout}ms`);
});

// Handle REST API errors specifically
client.rest.on('rateLimited', (rateLimitInfo) => {
    logActivity('Rate limited by Discord API:', rateLimitInfo);
});

client.rest.on('invalidRequestWarning', (invalidRequestWarningData) => {
    logActivity('Invalid request warning from Discord API:', invalidRequestWarningData);
});

client.on('disconnect', () => {
    logActivity('Discord client disconnected. Will attempt to reconnect.');
});

process.on('unhandledRejection', (reason, promise) => {
    let errorDetails = '';
    if (reason instanceof Error) {
        errorDetails = `Error: ${reason.name} - ${reason.message}${reason.code ? ` (code: ${reason.code})` : ''}`;
        if (reason.stack) {
            errorDetails += `\nStack: ${reason.stack.split('\n').slice(0, 5).join('\n')}`;
        }
    } else {
        errorDetails = `Reason: ${String(reason)}`;
    }
    logActivity(`Unhandled Rejection: ${errorDetails}`);
});

process.on('uncaughtException', (error) => {
    logActivity('Uncaught Exception:', error);
    logActivity('WARNING: Uncaught exception detected. The application may be in an unstable state.');
});

client.on('ready', () => {
    logActivity(`Logged in as ${client.user.tag}!`);
});

// Log in to Discord with your client's token
client.login(token);

// Nyckel button
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || interaction.customId !== 'nyckel') return;

    const detailsFilePath = 'src/detailsList.json';
    let detailsData;
    let userNyckelStatus = 'Nej'; // Default status

    try {
        if (fs.existsSync(detailsFilePath)) {
            detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
            const userDetails = [...detailsData.aktiv, ...detailsData.inaktiv].find(user => user.id === interaction.user.id);
            if (userDetails && userDetails.nyckel) {
                userNyckelStatus = userDetails.nyckel;
            }
        }

        const btn_ja = new ButtonBuilder()
            .setCustomId('nyckel_ja')
            .setLabel('Ja')
            .setStyle(userNyckelStatus === 'Ja' ? ButtonStyle.Primary : ButtonStyle.Secondary);

        const btn_nej = new ButtonBuilder()
            .setCustomId('nyckel_nej')
            .setLabel('Nej')
            .setStyle(userNyckelStatus === 'Nej' ? ButtonStyle.Primary : ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(btn_ja, btn_nej);

        await interaction.reply({
            content: 'Har du en nyckel till replokalen?',
            components: [row],
            flags: MessageFlags.Ephemeral
        });

    } catch (error) {
        logActivity('Error handling "nyckel" interaction:', error);
        await interaction.reply({
            content: 'Ett fel uppstod när din nyckelstatus skulle hämtas.',
            flags: MessageFlags.Ephemeral
        });
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() || !['nyckel_ja', 'nyckel_nej'].includes(interaction.customId)) return;

    const detailsFilePath = 'src/detailsList.json';
    const newStatus = interaction.customId === 'nyckel_ja' ? 'Ja' : 'Nej';

    try {
        let detailsData = { aktiv: [], inaktiv: [] };
        if (fs.existsSync(detailsFilePath)) {
            detailsData = JSON.parse(fs.readFileSync(detailsFilePath, 'utf8'));
        }

        let userFound = false;
        ['aktiv', 'inaktiv'].forEach(status => {
            const userIndex = detailsData[status].findIndex(user => user.id === interaction.user.id);
            if (userIndex !== -1) {
                detailsData[status][userIndex].nyckel = newStatus;
                userFound = true;
            }
        });

        if (!userFound) {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const isActive = member.roles.cache.some(role => role.name === 'aktiv');
            const newUser = {
                id: interaction.user.id,
                namn: member.displayName,
                kost: "-",
                korkort: "-",
                bil: "-",
                nyckel: newStatus
            };
            if (isActive) {
                detailsData.aktiv.push(newUser);
            } else {
                detailsData.inaktiv.push(newUser);
            }
        }

        fs.writeFileSync(detailsFilePath, JSON.stringify(detailsData, null, 2));

        // Update the nyckellista channel
        postNyckelList(true);

        const btn_ja = new ButtonBuilder()
            .setCustomId('nyckel_ja')
            .setLabel('Ja')
            .setStyle(newStatus === 'Ja' ? ButtonStyle.Primary : ButtonStyle.Secondary);

        const btn_nej = new ButtonBuilder()
            .setCustomId('nyckel_nej')
            .setLabel('Nej')
            .setStyle(newStatus === 'Nej' ? ButtonStyle.Primary : ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(btn_ja, btn_nej);

        await interaction.update({
            content: 'Din nyckelstatus har uppdaterats.',
            components: [row]
        });

    } catch (error) {
        logActivity(`Error updating nyckel status for ${interaction.user.id}:`, error);
        await interaction.followUp({
            content: 'Ett fel uppstod när din nyckelstatus skulle uppdateras.',
            flags: MessageFlags.Ephemeral
        });
    }
});

