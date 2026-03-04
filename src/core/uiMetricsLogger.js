const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ch_ContactWorkgroup, ch_ContactInstrument, hex_arbet } = require('./constants');

const SKIP_CUSTOM_IDS = new Set(['ja', 'nej', 'kanske']);
const SIGNUP_DROPDOWN_ACTIONS = {
	listaSvar: 'Lista svar',
	listaInstrument: 'Lista instrument',
	listaKost: 'Lista kost',
	listaKorkort: 'Lista körkort',
	listaBil: 'Lista bil',
};

function shouldSkip(customId) {
	if (SKIP_CUSTOM_IDS.has(customId)) {
		return true;
	}

	return (
		customId.startsWith('reminder_ja_') ||
		customId.startsWith('reminder_nej_') ||
		customId.startsWith('reminder_kanske_')
	);
}

function sanitize(text) {
	if (typeof text !== 'string') {
		return '';
	}

	return text.trim().replace(/\s+/g, ' ');
}

function getShortUserHash(userId, guildId) {
	const source = `${guildId || 'no-guild'}:${userId || 'no-user'}:ui-metrics-v1`;
	return crypto.createHash('sha1').update(source).digest('hex').slice(0, 12);
}

function getWorkgroupLabel(interaction) {
	const roles = interaction?.member?.roles?.cache;
	if (!roles) {
		return 'none';
	}

	const targetHex = String(hex_arbet).toLowerCase();
	const workgroups = roles
		.filter(role => typeof role.hexColor === 'string' && role.hexColor.toLowerCase() === targetHex)
		.map(role => sanitize(role.name))
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b, 'sv'));

	if (workgroups.length === 0) {
		return 'none';
	}

	return workgroups.join(' | ');
}

function getSelectedLabels(interaction) {
	const values = Array.isArray(interaction.values) ? interaction.values : [];
	const options = interaction.component?.options;

	if (!Array.isArray(options) || values.length === 0) {
		return values.map(value => sanitize(String(value))).filter(Boolean);
	}

	const labelsByValue = new Map();
	for (const option of options) {
		if (!option || typeof option.value !== 'string') continue;
		labelsByValue.set(option.value, sanitize(option.label) || option.value);
	}

	return values
		.map(value => labelsByValue.get(value) || sanitize(String(value)))
		.filter(Boolean);
}

function buildButtonFlow(interaction) {
	const customId = interaction.customId;
	const buttonLabel = sanitize(interaction.component?.label);

	if (customId === 'contactWorkgroup') return 'Kontakta Arbetsgrupp';
	if (customId === 'contactInstrument') return 'Kontakta Sektion';

	if (customId.startsWith('selectChannel-')) {
		const root = interaction.channelId === ch_ContactWorkgroup
			? 'Kontakta Arbetsgrupp'
			: interaction.channelId === ch_ContactInstrument
				? 'Kontakta Sektion'
				: 'Kontakta';
		return buttonLabel ? `${root} > ${buttonLabel}` : root;
	}

	if (customId === 'btn_newSignup') return 'Signupverktyg > Skapa ny signup';
	if (customId === 'btn_signupHowTo') return 'Signupverktyg > Hur gör jag';
	if (customId.startsWith('redigera_')) return 'Signupverktyg > Redigera signup';
	if (customId.startsWith('avboj_')) return 'Signupverktyg > Avböj signup';
	if (customId.startsWith('oppna_')) return 'Signupverktyg > Öppna signup';
	if (customId.startsWith('tabort_') || customId.startsWith('tryckigen_')) return 'Signupverktyg > Ta bort signup';
	if (customId.startsWith('sendReminder_')) return 'Signupverktyg > Skicka påminnelse';

	if (customId === 'permissions_signup-creation') return 'Moderatorverktyg > Justera behörigheter > Skapa signup';

	if (buttonLabel) return buttonLabel;
	return customId;
}

function buildSelectMenuFlow(interaction) {
	const customId = interaction.customId;
	const selectedLabels = getSelectedLabels(interaction);

	if (customId.startsWith('signupDropdown_')) {
		const actionKey = customId.split('_')[1] || 'val';
		const actionLabel = SIGNUP_DROPDOWN_ACTIONS[actionKey] || actionKey;
		return `Signuplistor > ${actionLabel}`;
	}

	return selectedLabels.length > 0 ? `${customId}` : customId;
}

function writeMetricsEntry(entry) {
	const logsDir = path.join(__dirname, '..', '..', 'logs', 'metrics', 'buttons');
	if (!fs.existsSync(logsDir)) {
		fs.mkdirSync(logsDir, { recursive: true });
	}

	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const fileName = `ui-interactions-${year}-${month}.log`;
	const filePath = path.join(logsDir, fileName);

	fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`);
}

function cleanupOldUiMetricsLogs() {
	try {
		const logsDir = path.join(__dirname, '..', '..', 'logs', 'metrics', 'buttons');
		if (!fs.existsSync(logsDir)) {
			return;
		}

		const files = fs.readdirSync(logsDir);
		const now = new Date();
		const currentDate = new Date(now.getFullYear(), now.getMonth(), 1);

		for (const file of files) {
			const match = file.match(/^ui-interactions-(\d{4})-(\d{2})\.log$/);
			if (!match) {
				continue;
			}

			const fileYear = Number(match[1]);
			const fileMonth = Number(match[2]);

			if (!Number.isInteger(fileYear) || !Number.isInteger(fileMonth) || fileMonth < 1 || fileMonth > 12) {
				continue;
			}

			const fileDate = new Date(fileYear, fileMonth - 1, 1);
			const monthsDiff = (currentDate.getFullYear() - fileDate.getFullYear()) * 12
				+ (currentDate.getMonth() - fileDate.getMonth());

			// Keep monthly files for 12 months; remove older.
			if (monthsDiff > 12) {
				fs.unlinkSync(path.join(logsDir, file));
			}
		}
	} catch (_) {
		// Keep this silent to avoid impacting bot startup tasks.
	}
}

function logUiInteraction(interaction) {
	try {
		const customId = interaction?.customId;
		if (typeof customId !== 'string' || shouldSkip(customId)) {
			return;
		}

		let flow = '';
		if (interaction.isButton()) {
			flow = buildButtonFlow(interaction);
		} else if (interaction.isStringSelectMenu()) {
			flow = buildSelectMenuFlow(interaction);
		}

		if (!flow) {
			return;
		}

		writeMetricsEntry({
			ts: new Date().toISOString(),
			flow,
			user_hash: getShortUserHash(interaction.user?.id, interaction.guildId),
			workgroup: getWorkgroupLabel(interaction),
		});
	} catch (_) {
		// Do not fail interaction handling if metrics logging has issues.
	}
}

module.exports = logUiInteraction;
module.exports.cleanupOldUiMetricsLogs = cleanupOldUiMetricsLogs;
