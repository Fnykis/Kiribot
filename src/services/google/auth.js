const { google } = require('googleapis');

function createAuth(scopes) {
	return new google.auth.GoogleAuth({
		keyFile: './src/services/service-account.json',
		scopes,
	});
}

module.exports = { createAuth };
