# Easy LinkedIn Search

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Open-source Chrome extension that adds a LinkedIn icon next to contacts in the apps you already use. Click the icon to search LinkedIn for that person’s **name and company**.

Supported today:

- **Google Calendar** — event guests
- **Gmail** — senders in the inbox, plus senders and recipients in opened mail and compose
- **HubSpot** — contact cards, lists, and records

More apps can be added the same way. Turn each app on or off from the extension popup.

## Features

- One search flow across apps: **display name + company**
- Company from job title (“… at Acme”) or email domain when needed
- **Side window** (resizes the current app and opens LinkedIn beside it) or a **new tab**
- Per-app toggles plus a master enable switch
- Skip contacts on excluded email domains (for example `gmail.com`)

## Install (unpacked)

1. Clone or download this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select this project folder
6. Open a supported app and view contacts

After reloading the extension, refresh any open tabs so the content script picks up changes.

```bash
git clone https://github.com/tschoem/easy-linkedin-search.git
cd easy-linkedin-search
```

## Usage

### Google Calendar

1. Open an event with guests
2. Click the LinkedIn icon beside a guest
3. LinkedIn people search opens for that contact

Example: guest **Doe, Jane** with `jane.doe@acme.com` → search **“Jane Doe Acme”**.

### Gmail

1. Open the inbox, a conversation, or a compose window
2. Click the LinkedIn icon beside a person whose **full name** is shown
3. Search uses the display name plus company from the email domain

Icons are omitted for first-name-only labels (for example “Alex”) and for addresses on excluded domains.

### HubSpot

1. Open a contacts list, association panel, or contact record
2. Click the LinkedIn icon beside the contact name
3. Search uses the contact name plus company from the “Title at Company” line when available

## Settings

Click the extension icon in the toolbar:

| Setting | Description |
| --- | --- |
| **Enable extension** | Master switch for icons |
| **Google Calendar** | Show icons on Calendar guests |
| **Gmail** | Show icons on Gmail senders and recipients |
| **HubSpot** | Show icons on HubSpot contact cards |
| **Excluded email domains** | Hide icons for addresses on these domains |
| **Side window** | Resize the current app and open LinkedIn beside it |
| **New tab** | Open LinkedIn search in a new browser tab |

## Permissions

- `storage` — save settings
- `scripting` — inject into already-open tabs after install/reload
- Host access only to the apps you enable (currently Calendar, Gmail, and HubSpot CRM)

## Project layout

```
manifest.json           Extension manifest (MV3)
background.js           Service worker (side window + injection)
shared.js               Shared LinkedIn helpers
content-calendar.js     Google Calendar adapter
content-gmail.js        Gmail adapter
content-hubspot.js      HubSpot adapter
settings.js             Shared settings helpers
popup.html/js/css       Toolbar settings UI
styles.css              Icon styles
icons/                  Extension icons
LICENSE                 MIT license
```

Each app has its own content script. Shared search, settings, and the side window live in `shared.js` / `background.js`, so a new app is mostly a new adapter plus a popup toggle.

## Notes

- LinkedIn opens in a dedicated side window or a new tab so actions like Connect work normally.
- Host app UIs change often; if icons are missing, refresh the tab or reload the extension.
- This extension does not use the LinkedIn or HubSpot APIs and does not scrape profiles — it only opens LinkedIn’s people search from on-page name/email.
- Not affiliated with Google, HubSpot, or LinkedIn.

## Contributing

Issues and pull requests are welcome. For larger changes, open an issue first so we can align on approach.

## License

This project is licensed under the [MIT License](LICENSE). Copyright (c) 2026 Thomas Schoemaecker.
