// Helper function to format channel names like Discord does
function formatChannelName(name) {
	return name
		.toLowerCase() // Convert to lowercase
		.replace(/\s+/g, '-') // Replace spaces with hyphens
		.replace(/[^a-z0-9-]/g, ''); // Remove disallowed characters (keep only alphanumeric and hyphens)
}

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

module.exports = { formatChannelName, makeFileNameFriendly };
