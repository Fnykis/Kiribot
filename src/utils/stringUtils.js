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

function truncateText(text, maxLength = 200) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (collapsed.length <= maxLength) return collapsed;
    const cut = collapsed.slice(0, maxLength);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '...';
}

module.exports = { formatChannelName, makeFileNameFriendly, truncateText };
