# Kiribot

Kiribot is a Discord bot built for the Kiriaka music organization. It manages member profiles, event signups, lists, and external integrations (Google Sheets/Drive) to keep operations in sync.

## Features (high level)
- Member profile flows (name, status, instruments, workgroups, details).
- Event signups with threads, calendar updates, and reminders.
- Automated lists (sections, workgroups, details, key holders).
- Contact flows for sections/workgroups.
- Google Sheets + Drive integrations (fika list, calendar sync, event folders).

For feature behavior, moderator flows, and the full deep‑dive, see `DEEPDIVE.md`.

## Setup

### Prerequisites
- Node.js (v16 or higher)
- Discord Bot Token
- Discord Server (Guild) ID
- Discord Client ID
- Google Cloud Service Account (Sheets + Drive APIs enabled)
- Google Sheets with tabs for fika list and calendar

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Fnykis/Kiribot
   cd Kiribot
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up Google Cloud Service Account:
   - Enable Google Sheets API and Google Drive API
   - Create a service account and download the credentials JSON
   - Place it at `src/service-account.json`
   - Share your Sheets with the service account email (edit access)
4. Configure the bot in `config.json`:
   ```json
   {
     "token": "YOUR_BOT_TOKEN",
     "clientId": "YOUR_CLIENT_ID",
     "guildId": "YOUR_GUILD_ID",
     "spreadsheetId": "YOUR_FIKA_SPREADSHEET_ID",
     "sheetsTab": "YOUR_FIKA_TAB_NAME",
     "calendarSpreadsheetId": "YOUR_CALENDAR_SPREADSHEET_ID",
     "calendarTab": "YOUR_CALENDAR_TAB_NAME",
     "googleCredsPath": "./src/service-account.json"
   }
   ```
5. Required Discord roles:
   - Status roles: `aktiv`, `inaktiv`
   - Instrument roles: color `#e91e63`
   - Workgroup roles: color `#f1c40f`
6. Required Discord channels (IDs are hardcoded in `src/index.js`):
   - `din-profil`, `kalender`, `signups`, `spelningar`, `verktyg-signup`
   - `medlemsdetaljer`, `sektionslista`, `arbetsgruppslista`
   - `kontakta-sektion`, `kontakta-arbetsgrupp`
   - `fikalista`, `nyckellista`, `moderatorverktyg`, `allmänt-spelningar`
   - `privata-meddelanden`
7. Run the bot:
   ```bash
   npm start
   ```

## File structure
```
kiribot/
├── config.json              # Bot configuration
├── package.json             # Dependencies and scripts
├── logs/                    # Monthly log files (auto-generated)
└── src/
    ├── index.js             # Main bot logic
    ├── service-account.json # Google Cloud service account credentials
    ├── detailsList.json     # Member details storage
    ├── instrumentList.json  # Instrument section lists
    ├── groupList.json       # Workgroup member lists
    ├── data/
    │   └── permissions.json # Permission configuration
    └── events/              # Event data storage
        ├── active/          # Current events
        └── archived/        # Past events
```

## Contributing
This bot was created by Olle Lindberg (Fnykis) for the Kiriaka organization. For questions or contributions, please contact the developer.

## License
This project is licensed under the Apache License 2.0.

