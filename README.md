# 🗂️ Tab Explorer

> Turn your browser tabs into a personal knowledge base — with context, tags, AI summaries, and a visual network graph.

Chrome Extension (Manifest V3) built for developers who open too many tabs and forget why they opened them.

---

## The Problem

You open a GitHub repo, an article, a Stack Overflow answer. You *know* it's useful. You bookmark it. Three weeks later you open the bookmark — just a title, no context, no memory of why you saved it. Sound familiar?

**Tab Explorer** solves this by letting you save tabs *with context*: why you saved it, a summary of what it is, and tags so you can find it later. Everything is organized in a knowledge base you can search, filter, and visualize as a network graph.

---

## Features

### Popup — Tab Manager
- View all open tabs across all windows, grouped by window
- Save any tab to your knowledge base with one click
- Save an entire window at once
- Close tabs/windows directly from the popup
- Export all open tabs as plain text, JSON, Markdown, or CSV

### Save Modal
- Write a short note on *why* you're saving this tab
- Add a summary of what the page is about
- Tags are suggested automatically from the title and URL (offline)
- Optional: one-click AI suggest for tags + summary (if AI is configured)

### Knowledge Base (`app.html`)
- Full-page app — no server needed, opens as a Chrome tab
- **List view**: cards with title, URL, summary, reason, tags, and read status
- **Graph view**: D3.js force-directed network — nodes are bookmarks, edges connect items sharing tags. Drag, zoom, double-click to open.
- Filter by read status: `Unread`, `Reading`, `Revisit`, `Done`
- Filter by tag
- Full-text search across title, URL, reason, and tags
- Edit any bookmark inline
- Export / Import as JSON

### AI Integration (optional, off by default)
- Works with any OpenAI-compatible provider: OpenAI, Claude (Anthropic), Ollama (local), Groq, OpenRouter
- When enabled: one-click **✨ AI Suggest** in the save modal fills in tags and summary automatically
- API key is stored locally in `chrome.storage.local` — never sent anywhere except your chosen provider

### Settings (`settings.html`)
- Toggle AI on/off
- One-click presets for popular providers
- Test connection before saving
- Choose which AI features to enable (tags, summary, or both)

---

## Installation

> No build step required. Pure HTML/CSS/JS.

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the project folder
5. The extension icon appears in your Chrome toolbar

To reload after code changes, click the **🔄** button inside the popup.

---

## Usage

**Saving a tab:**
1. Click the extension icon to open the popup
2. Click 💾 on any tab
3. Write why you're saving it (optional but recommended)
4. Confirm or edit the suggested tags
5. Click **Save**

**Browsing your knowledge base:**
1. Click **📚 KB** in the popup header
2. Use the sidebar to filter by status or tag
3. Search with the top search bar
4. Switch to graph view with the ⬡ button to see topic clusters visually

**Setting up AI:**
1. Click **⚙️** in the popup header
2. Enable AI and pick a provider preset
3. Paste your API key and click **Test**
4. Save — the **✨ AI Suggest** button will now appear when saving tabs

---

## Data & Privacy

- All data is stored in `chrome.storage.local` on your machine
- No external server, no analytics, no tracking
- AI calls go directly from your browser to your chosen provider
- Export your data anytime as a JSON file for backup or migration

---

## Project Structure

```
├── manifest.json     # Manifest V3 — permissions: tabs, storage, unlimitedStorage
├── popup.html/css/js # Popup — tab list, save modal, export tools
├── app.html          # Knowledge Base — list view, graph view, search, filter
├── settings.html     # AI provider configuration
├── storage.js        # Shared module: bookmarks CRUD, settings, AI call
└── icons/            # Extension icons (16/48/128px)
```

---

## Roadmap

- [ ] Content script — let AI read actual page content for better summaries
- [ ] Google Drive sync — auto backup/restore bookmarks
- [ ] AI Group — auto-cluster bookmarks by topic
- [ ] Duplicate tab detector
- [ ] Dark mode

---

## Tech Stack

- **Manifest V3** Chrome Extension API
- **D3.js v7** for the graph view
- **chrome.storage.local** for persistence (unlimited storage)
- No build tools, no frameworks, no dependencies to install

---

## License

MIT
