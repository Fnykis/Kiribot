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

function parseEventDate(dateString) {
    if (!dateString) return null;
    let parts = dateString.split('/');
    if (parts.length !== 3) return null;
    let formattedDate = `20${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    let d = new Date(formattedDate);
    return isNaN(d.getTime()) ? null : d;
}

module.exports = { parseSwedishTime, checkDateFormat, formatTimeInput, parseEventDate };
