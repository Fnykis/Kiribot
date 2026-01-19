# Kiribot

A comprehensive Discord bot designed specifically for the Kiriaka music organization. This bot provides event management, member organization, and communication tools to streamline the operations of music groups and ensembles.

## 🤖 Bot Features

### 🎯 **Member Profile Management**
- **Interactive Profile System**: Members can manage their profiles through button-based interfaces
- **Nickname Management**: Easy nickname changes with validation
- **Member Status**: Toggle between "Aktiv" (Active) and "Inaktiv" (Inactive) status
- **Instrument Assignment**: Assign/remove instrument roles with color-coded organization
- **Workgroup Management**: Join/leave various workgroups (booking, carnival, tour, etc.)
- **Personal Details**: Store and manage additional member information (dietary restrictions, driver's license, car availability)

### 📅 **Event Management System**
- **Signup Creation**: Authorized members can create new performance events
- **Interactive Signups**: Members respond with Yes/No/Maybe buttons
- **Event Editing**: Modify event details, cancel events, or reopen cancelled events
- **Automatic Archiving**: Past events are automatically moved to archived status
- **Calendar Integration**: Automatic calendar updates with upcoming performances
- **Event Discussion Threads**: Automatic thread creation in `spelningar` channel for each event
  - Each thread includes a pinned "Information:" message for important event details
  - Use `/info` command in event threads to add or edit information
- **Google Drive Integration**: Automatic folder creation in Google Drive for events
  - Drive links are automatically appended to the information message when folders are created
  - Prevents duplicate Drive link messages and keeps all event info in one place
- **Calendar Synchronization**: Events synced to Google Sheets for calendar export
- **Help System**: "Hur gör jag?" button provides quick access to help threads for signup creation and editing

### 📊 **Organization Tools**
- **Section Lists**: Automatic generation of instrument section member lists
- **Workgroup Lists**: Current active members in various workgroups
- **Member Details**: Quick access to member information (dietary needs, transportation, etc.)
- **Role-based Access**: Different permission levels for different member types
- **Fika List Management**: Automatic hourly updates of fika responsibilities from Google Sheets
- **Permission Management**: JSON-based permission system for controlling feature access (e.g., signup creation)

### 💬 **Communication Features**
- **Contact System**: Members can contact specific sections or workgroups
- **Private Threads**: Contact requests create private threads for focused discussions
- **Automatic Mentions**: Relevant members are automatically notified based on their roles
- **Channel Management**: Restricted channels with automatic message forwarding

### 🛠 **Administrative Tools**
- **Context Menu Commands**: Right-click commands for posting lists and contact forms
- **Automatic Updates**: Daily scheduled tasks for maintaining lists and calendars
- **File Management**: JSON-based data storage with automatic backup and archiving
- **Activity Logging**: Comprehensive logging of all bot activities

## 🚀 Setup Instructions

### Prerequisites
- Node.js (v16 or higher)
- Discord Bot Token
- Discord Server (Guild) ID
- Discord Client ID
- Google Cloud Service Account (for Google Sheets and Drive integration)
- Google Sheets with configured tabs for fika list and calendar

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd kiribot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Google Cloud Service Account**
   - Create a Google Cloud project and enable Google Sheets API and Google Drive API
   - Create a service account and download the credentials JSON file
   - Place the credentials file at `src/service-account.json`
   - Share your Google Sheets with the service account email (edit access)

4. **Configure the bot**
   - Fill in your Discord bot credentials and Google Sheets configuration in config.json:
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

5. **Set up required Discord roles**
   - **Member Status Roles**: `aktiv`, `inaktiv`
   - **Instrument Roles**: Color-coded with hex `#e91e63`
   - **Workgroup Roles**: Color-coded with hex `#f1c40f`

6. **Configure permissions** (optional)
   - Edit `src/data/permissions.json` to customize who can create signups
   - Add role IDs to the `signup-creation` array
   - This can also be done through #moderatorverktyg

7. **Run the bot**
   ```bash
   npm start
   ```

## 📋 Usage Guide

### Recent Improvements

#### Help Button ("Hur gör jag?")
- Added to the `verktyg-signup` channel alongside the "Signupverktyg" button
- Provides quick access to help threads for:
  - Creating new signups
  - Editing existing signups
- Click the button to see links to relevant help threads

#### Google Drive Integration Enhancement
- **Previous Behavior**: Google Drive links were posted as separate pinned messages in event threads
- **New Behavior**: Google Drive links are now automatically appended to the pinned "Information:" message
- **Benefits**:
  - All event information is centralized in one location
  - Reduces message clutter in threads
  - Easier to find all event details
  - Prevents duplicate Drive link messages
- **How it Works**:
  - When a Google Drive folder is created for an event, the bot checks if an information message exists
  - If found, the Drive link is appended to the information text
  - The event JSON file is updated to reflect the new information
  - A notification message is sent with a link to the information message
  - If no information message exists (legacy events), it falls back to the old behavior

### Information Management (`/info` Command)

The `/info` command allows authorized users to manage important information in event threads:

1. **Using the Command**:
   - Navigate to an event discussion thread in the `spelningar` channel
   - Type `/info` and press Enter
   - You'll see two buttons: "Lägg till info" (Add info) and "Ändra info" (Edit info)

2. **Adding Information**:
   - Click "Lägg till info"
   - Enter new information in the modal (character limit: 1200 minus current text length)
   - Submit the form
   - Choose how to notify participants:
     - **Meddela i tråden utan att tagga medverkande**: Posts a message without @mentions
     - **Tagga medverkande i ett meddelande i tråden**: Posts a message with @mentions for all participants
     - **Uppdatera tyst - inget nytt meddelande**: Silent update, no notification

3. **Editing Information**:
   - Click "Ändra info"
   - The modal will be pre-filled with current information
   - Edit the text (character limit: 1200)
   - Submit and choose notification option

4. **Information Message**:
   - The information is displayed in a pinned message at the top of the thread
   - Always the second message in the thread (first is the event starter message)
   - Format: "Information:\n[your text here]"
   - Google Drive links are automatically appended when folders are created

### For Members

#### Managing Your Profile
1. Go to the `din-profil` channel
2. Use the buttons to:
   - Set your display name
   - Choose your member status (Active/Inactive)
   - Select your instruments
   - Join workgroups
   - Add personal details

#### Participating in Events
1. Check the `signup-spelningar` channel for upcoming events
2. Click Yes/No/Maybe buttons to respond
3. Add optional notes about your participation
4. View event details and participant lists
5. Access event discussion threads in the `spelningar` channel
6. View pinned information message in each event thread for important details
7. Use `/info` command in event threads to add or edit information (if authorized)

#### Contacting Groups
1. Use the contact buttons in `kontakta-sektion` or `kontakta-arbetsgrupp`
2. Select the group you want to contact
3. Fill out the contact form
4. A private thread will be created with relevant members

### For Moderators

#### Creating Events
1. Use the "Signupverktyg" button in `verktyg-signup`
2. Click "Hur gör jag?" if you need help with creating or editing signups (links to help threads)
3. Fill out event details (name, date, time, location, info)
4. The bot will:
   - Create a signup post in the signup channel
   - Update the calendar
   - Create a discussion thread in `spelningar` channel with a pinned "Information:" message
   - Create a Google Drive folder for the event when the event has passed
   - Automatically append the Google Drive link to the information message
   - Sync the event to Google Sheets for calendar export

#### Managing Events
1. Right-click on event messages to access management options
2. Edit event details, cancel events, or delete them
3. View participant lists and details

#### Updating Lists
- Use context menu commands to refresh section and workgroup lists
- Lists are automatically updated daily at 3:00 AM
- Fika list updates automatically every hour from Google Sheets

## 🔧 Technical Details

### Architecture
- **Framework**: Discord.js v14
- **Language**: JavaScript (Node.js)
- **Data Storage**: JSON files with file locking for concurrent access
- **Scheduling**: Custom task scheduler for daily and hourly operations
- **External Integrations**: Google Sheets API, Google Drive API

### Key Components
- **Event Manager**: Handles event creation, signups, and lifecycle
- **Role Manager**: Manages Discord roles and member assignments
- **Contact System**: Facilitates communication between members and groups
- **Calendar System**: Maintains and displays upcoming events, syncs to Google Sheets
- **Fika List Manager**: Pulls and displays fika responsibilities from Google Sheets
- **Permission System**: JSON-based role permission management
- **Logging System**: Comprehensive activity logging with monthly log files
- **Data Persistence**: File-based storage with automatic archiving

### Scheduled Tasks
- **Daily at 3:00 AM**: Update member lists, refresh calendar, clean up locks and old logs
- **Hourly**: Update fika list from Google Sheets, check and archive past events
- **Automatic**: Archive past events, update active lists, sync events to Google Sheets

## 📁 File Structure

```
kiribot/
├── config.json              # Bot configuration
├── package.json             # Dependencies and scripts
├── SheetsToICS.js           # Google Apps Script for calendar ICS export
├── logs/                    # Monthly log files (auto-generated)
├── src/
│   ├── index.js            # Main bot logic
│   ├── service-account.json # Google Cloud service account credentials
│   ├── detailsList.json    # Member details storage
│   ├── instrumentList.json # Instrument section lists
│   ├── groupList.json      # Workgroup member lists
│   ├── data/
│   │   └── permissions.json # Permission configuration
│   └── events/             # Event data storage
│       ├── active/         # Current events
│       └── archived/       # Past events
```

## 🚨 Important Notes

- **File Locks**: The bot uses file locking to prevent data corruption during concurrent access
- **Automatic Cleanup**: Lock files and old log files are automatically cleaned up daily
- **Data Backup**: Event data is automatically archived when events pass
- **Permission System**: Different features require different role permissions (managed via `src/data/permissions.json` or #moderatorverktyg)
- **Swedish Language**: The bot interface is primarily in Swedish
- **Event Information System**:
  - New events automatically include an `information` field in their JSON data
  - Each event thread has a pinned "Information:" message (always the second message)
  - Use `/info` command in event threads to add or edit information
  - Google Drive links are automatically appended to the information message when folders are created
  - Information is stored in event JSON files and synced with the pinned message
- **Google Drive Integration**:
  - Drive folders are created automatically when events pass
  - Drive links are added to the information message instead of separate messages
  - This keeps all event information in one centralized location
  - The bot checks for existing Drive links to prevent duplicates
- **Google Sheets Requirements**: 
  - Fika spreadsheet must have a tab with fika assignments
  - Calendar spreadsheet must be properly formatted for event sync
  - Service account must have edit access to both spreadsheets
- **Logging**: Bot activities are logged to monthly files in the `logs/` directory
- **Calendar Export**: The `SheetsToICS.js` file provides an iCalendar export for the Google Sheets calendar (requires Google Apps Script deployment)
- **Help System**: The "Hur gör jag?" button in `verktyg-signup` provides links to help threads for signup creation and editing

## 🤝 Contributing

This bot was created by Olle Lindberg (Fnykis) for the Kiriaka organization. For questions or contributions, please contact the developer.

## 📄 License

This project is licensed under the Apache License 2.0.

