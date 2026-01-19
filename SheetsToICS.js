/**
 * Google Sheet -> iCalendar (.ics) feed (no Timezone column, no AllDay column)
 * - All events are non–all-day.
 * - Parses DD/MM/YY, DD/MM/YYYY, or YYYY-MM-DD; time cells or "HH:MM" strings.
 * - Emits timed events in UTC (…Z) for maximum compatibility.
 *
 * Headers (first row, exact names):
 *   Title | Description | Location | Start Date | Start Time | End Date | End Time | UID | URL
 *
 * Deploy: Web app → Execute as: Me; Who has access: Anyone (or Anyone with the link)
 */

// ====== REQUIRED CONFIG ======
const SHEET_ID = "[YOUR SPREADSHEET ID]";

// ====== CALENDAR DEFAULTS ======
const CAL_NAME  = "[YOUR CALENDAR NAME]";
const CAL_DESC  = "[YOUR CALENDAR DESCRIPTION]";
const CAL_COLOR = "[YOUR CALENDAR HEX COLOR]";
// 1-hour refresh hint (clients may ignore; still worth advertising)
const REFRESH_ISO8601 = "P1H";               // RFC 7986 duration format

// OPTIONAL: If many events lack End time, you can enable a default duration.
// Set to true to auto-apply when End is missing.
const ENABLE_DEFAULT_DURATION_MIN = true;
const DEFAULT_DURATION_MIN = 0; // No default duration - use explicit end times

// OPTIONAL: A fallback URL for events lacking a URL cell value (signups channel in Discord)
const ENABLE_DEFAULT_EVENT_URL = true;
const DEFAULT_EVENT_URL =
  "[YOUR DISCORD CHANNEL URL]";

// ====== SHEET HEADERS ======
const HEADER = {
  TITLE: "Title",
  DESC: "Description",
  LOC:  "Location",
  SDATE:"Start Date",
  STIME:"Start Time",
  EDATE:"End Date",
  ETIME:"End Time",
  UID:  "UID",
  URL:  "URL" // optional
};

// ---------- Utilities ----------
function icsEscape(s) {
  if (s == null) return "";
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
function foldLines(text) {
  const CRLF = "\r\n";
  return text
    .split(CRLF)
    .map(line => {
      const chunks = [];
      let l = line;
      while (l.length > 75) {
        chunks.push(l.slice(0, 75));
        l = " " + l.slice(75);
      }
      chunks.push(l);
      return chunks.join(CRLF);
    })
    .join(CRLF);
}
function toIcsDateUTC(dateObj) {
  return Utilities.formatDate(dateObj, "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

// Parse time cell: either a real Date (time-of-day) or "HH:MM"
function parseTimeCell(val) {
  if (val == null || val === "") return null;

  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val)) {
    // A Sheets "time" cell is a Date with an epoch day; read HH:mm in project TZ
    const zone = Session.getScriptTimeZone();
    const hh = parseInt(Utilities.formatDate(val, zone, "HH"), 10);
    const mm = parseInt(Utilities.formatDate(val, zone, "mm"), 10);
    return { hh, mm };
  }

  const s = String(val).trim().replace(/^'/, ''); // Remove leading apostrophe that Google Sheets adds
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Math.min(23, parseInt(m[1], 10));
    const mm = Math.min(59, parseInt(m[2], 10));
    return { hh, mm };
  }
  return null;
}

// Parse date cell: Date object, DD/MM/YY, DD/MM/YYYY, or YYYY-MM-DD
function parseDateCell(val) {
  if (!val) return null;

  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val)) {
    return new Date(val.getTime());
  }

  const s = String(val).trim().replace(/^'/, ''); // Remove leading apostrophe that Google Sheets adds

  // DD/MM/YY or DD/MM/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    let d  = parseInt(m[1], 10);
    let mo = parseInt(m[2], 10);
    let y  = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, mo - 1, d);
  }

  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y  = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d  = parseInt(m[3], 10);
    return new Date(y, mo - 1, d);
  }

  const dflt = new Date(s);
  return isNaN(dflt) ? null : dflt;
}

// Combine a date-only with an optional time into a Date in project timezone.
function combineDateAndTime(dateOnly, timeHM) {
  if (!dateOnly) return null;
  const dt = new Date(dateOnly.getTime());
  if (timeHM) dt.setHours(timeHM.hh, timeHM.mm, 0, 0);
  else dt.setHours(0, 0, 0, 0);
  return dt;
}

// ---------- Sheet access ----------
function openSheet_(gid) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  if (gid) {
    const sheet = ss.getSheets().find(s => String(s.getSheetId()) === String(gid));
    if (sheet) return sheet;
  }
  return ss.getSheets()[0];
}

// ---------- ICS builder ----------
function buildIcs_(events, prodId, feedUrl) {
  const CRLF = "\r\n";
  const out = [];
  out.push("BEGIN:VCALENDAR");
  out.push("PRODID:-//Sheets ICS//" + icsEscape(prodId || "Sheets2ICS") + "//EN");
  out.push("VERSION:2.0");
  out.push("CALSCALE:GREGORIAN");

  // Calendar-level presentation (widely supported and RFC 7986)
  if (CAL_NAME) {
    out.push("NAME:" + icsEscape(CAL_NAME));         // RFC 7986
    out.push("X-WR-CALNAME:" + icsEscape(CAL_NAME)); // common extension
  }
  if (CAL_DESC) {
    out.push("DESCRIPTION:" + icsEscape(CAL_DESC));   // RFC 7986 allows DESCRIPTION on VCALENDAR
    out.push("X-WR-CALDESC:" + icsEscape(CAL_DESC));
  }
  if (CAL_COLOR) {
    out.push("COLOR:" + icsEscape(CAL_COLOR));        // RFC 7986 COLOR (#RRGGBB)
  }

  if (feedUrl) {
    out.push("SOURCE:" + icsEscape(feedUrl));         // RFC 7986 (optional)
  }

  const dtstampUTC = toIcsDateUTC(new Date());

  for (const ev of events) {
    out.push("BEGIN:VEVENT");
    out.push("UID:" + icsEscape(ev.uid));
    out.push("DTSTAMP:" + dtstampUTC);

    // Always timed events (non–all-day) in UTC for maximum compatibility
    out.push("DTSTART:" + toIcsDateUTC(ev.start));
    if (ev.end) {
      out.push("DTEND:" + toIcsDateUTC(ev.end));
    } else if (ENABLE_DEFAULT_DURATION_MIN) {
      const defEnd = new Date(ev.start.getTime() + DEFAULT_DURATION_MIN * 60000);
      out.push("DTEND:" + toIcsDateUTC(defEnd));
    }

    if (ev.title) out.push("SUMMARY:" + icsEscape(ev.title));
    out.push("DESCRIPTION:"); // Empty description for Google Calendar compatibility
    if (ev.loc)   out.push("LOCATION:" + icsEscape(ev.loc));
    if (ev.url)   out.push("URL:" + icsEscape(ev.url));

    out.push("END:VEVENT");
  }

  out.push("END:VCALENDAR");
  return foldLines(out.join(CRLF)) + CRLF;
}

// ---------- Read & normalize rows ----------
function readSheetEvents_(sheet) {
  // Read data starting from row 3 (index 2) since row 1 is info text and row 2 is headers
  const values = sheet.getRange(3, 1, sheet.getLastRow() - 2, sheet.getLastColumn()).getValues();
  
  if (values.length < 1) return [];
  
  // Use the hardcoded header since we know the structure
  const header = ["Title", "Description", "Location", "Start Date", "Start Time", "End Date", "End Time", "UID", "URL"];
  const idx = name => header.indexOf(name);

  const out = [];
  for (let r = 0; r < values.length; r++) {
    const row = values[r];
    if (row.every(v => v === "")) continue;

    const title = row[idx(HEADER.TITLE)] || "";
    const desc  = row[idx(HEADER.DESC)]  || "";
    const loc   = row[idx(HEADER.LOC)]   || "";
    const sDateRaw = row[idx(HEADER.SDATE)];
    const sTimeRaw = row[idx(HEADER.STIME)];
    const eDateRaw = row[idx(HEADER.EDATE)];
    const eTimeRaw = row[idx(HEADER.ETIME)];
    const uid  = String(row[idx(HEADER.UID)] || ("row-" + (r + 1) + "@" + sheet.getParent().getId()));
    let url    = idx(HEADER.URL) >= 0 ? (row[idx(HEADER.URL)] || "") : "";
    if (!url && ENABLE_DEFAULT_EVENT_URL) url = DEFAULT_EVENT_URL;

    const sDate = parseDateCell(sDateRaw);
    const eDate = eDateRaw ? parseDateCell(eDateRaw) : null;
    const sHM   = parseTimeCell(sTimeRaw);
    const eHM   = parseTimeCell(eTimeRaw);

    if (!sDate) continue; // require a start date

    // Always non–all-day
    const start = combineDateAndTime(sDate, sHM);
    const end   = eDate ? combineDateAndTime(eDate, eHM) : null;

    out.push({ uid, title, desc, loc, start, end, url });
  }
  return out;
}

// ---------- Web entry ----------
function doGet(e) {
  const gid = e && e.parameter && e.parameter.gid;
  const sheet = openSheet_(gid);
  const events = readSheetEvents_(sheet);

  // If you want to advertise your canonical feed URL, set it here:
  const feedUrl = null; // e.g. "https://script.google.com/.../exec"
  const ics = buildIcs_(events, sheet.getParent().getName(), feedUrl);

  return ContentService.createTextOutput(ics)
    .setMimeType(ContentService.MimeType.ICAL); // text/calendar
}
