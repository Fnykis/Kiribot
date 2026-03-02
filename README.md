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
   - Place it at `src/services/service-account.json`
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
     "googleCredsPath": "./src/services/service-account.json"
   }
   ```
5. Required Discord roles:
   - Status roles: `aktiv`, `inaktiv`
   - Instrument roles: color `#e91e63`
   - Workgroup roles: color `#f1c40f`
6. Required Discord channels (IDs are hardcoded in `src/core/constants.js`):
   - `din-profil`, `kalender`, `signups`, `spelningar`, `verktyg-signup`
   - `medlemsdetaljer`, `sektionslista`, `arbetsgruppslista`
   - `kontakta-sektion`, `kontakta-arbetsgrupp`
   - `fikalista`, `nyckellista`, `moderatorverktyg`, `allmänt-spelningar`
   - `privata-meddelanden`
7. Register slash commands (run once, or after adding new commands):
   ```bash
   npm run register
   ```
8. Run the bot:
   ```bash
   npm start
   ```

## File structure
```
kiribot/
├── config.json              # Bot configuration (gitignored)
├── package.json             # Dependencies and scripts
├── logs/                    # Monthly log files — gitignored, auto-generated
└── src/
    ├── index.js             # Entry point — loads events and logs in
    ├── core/
    │   ├── client.js        # Discord Client singleton
    │   ├── constants.js     # All channel/role/category IDs and colors
    │   └── logger.js        # logActivity + log cleanup
    ├── state/
    │   └── store.js         # Shared mutable state (requiredFields, permissionSettings, etc.)
    ├── utils/
    │   ├── dateUtils.js     # Date/time parsing utilities
    │   ├── stringUtils.js   # String formatting utilities
    │   └── interactionUtils.js  # getNickname, safeReply
    ├── services/
    │   ├── registerCommands.js  # Slash command registration script
    │   ├── service-account.json # Google Cloud credentials (gitignored)
    │   ├── scheduler.js     # Task scheduling (daily, hourly, twice-daily)
    │   ├── lockUtils.js     # Lock file cleanup
    │   ├── permissions.js   # Load/save permission settings
    │   └── google/
    │       ├── auth.js      # Google service account auth factory
    │       ├── sheets.js    # Fika list, calendar sync (Google Sheets)
    │       └── drive.js     # Event folders, backups (Google Drive)
    ├── features/
    │   ├── profile.js       # postYourProfile, instrument/workgroup notifications
    │   ├── details.js       # updateDetails, postDetailsButtons
    │   ├── lists.js         # checkRoles, instrument/workgroup/nyckel list posts
    │   ├── calendar.js      # postCalendar, postSignupButtons
    │   ├── signup.js        # Event/signup business logic
    │   ├── eventThread.js   # Spelningar threads, info messages
    │   └── moderator.js     # postModeratorTools
    ├── commands/
    │   └── info.js          # /info slash command
    ├── interactions/
    │   ├── buttons/         # profile, contact, signup, moderator, nyckel, info, misc
    │   ├── modals/          # profile, workgroups, signup, info
    │   └── menus/           # signupDropdowns, editSignupDropdown, reminderDropdown
    ├── events/
    │   ├── ready.js         # Startup tasks and scheduler setup
    │   ├── interactionCreate.js  # Routes interactions to handlers
    │   ├── messageCreate.js # Deletes messages in restricted channels
    │   ├── guildMemberAdd.js    # Updates lists when a member joins
    │   └── errorHandlers.js # Client error, rate limit, process exceptions
    └── data/
        ├── permissions.json     # Permission config — gitignored, auto-generated
        ├── detailsList.json     # Member details — gitignored, auto-generated
        ├── instrumentList.json  # Instrument section lists — gitignored, auto-generated
        └── groupList.json       # Workgroup member lists — gitignored, auto-generated
```

## Contributing
This bot was created by Olle Lindberg (Fnykis) for the Kiriaka organization. For questions or contributions, please contact the developer.

## License
This project is licensed under the Apache License 2.0.
