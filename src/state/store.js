let requiredFields = ["kost", "körkort", "bil", "nyckel"]; // Fields in the detailsList

let permissionSettings = {
	'signup-creation': []
};

let previousFikaData = null;

module.exports = {
	getRequiredFields: () => requiredFields,
	setRequiredFields: (v) => { requiredFields = v; },
	getPermissionSettings: () => permissionSettings,
	setPermissionSettings: (v) => { permissionSettings = v; },
	getPreviousFikaData: () => previousFikaData,
	setPreviousFikaData: (v) => { previousFikaData = v; },
};
