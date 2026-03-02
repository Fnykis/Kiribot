const { guildId } = require('../../config.json');

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

module.exports = {
	guildId,
	hex_instr,
	hex_arbet,
	ch_YourProfile,
	ch_Calendar,
	ch_Allmant,
	ch_Signup,
	ch_Medlemsdetaljer,
	ch_Sektionlista,
	ch_Arbetsgruppslista,
	ch_ContactWorkgroup,
	ch_ContactInstrument,
	ch_Verktyg_Signup,
	ch_Spelningar,
	ch_FikaList,
	ch_ModeratorVerktyg,
	ch_Nyckellista,
	ch_PrivataMeddelanden,
	ch_BotTest,
	cat_Arbetsgrupper,
	cat_Sektioner,
	role_discordgruppen,
	role_moderator,
	dir_EventsActive,
	dir_EventsArchived,
};
