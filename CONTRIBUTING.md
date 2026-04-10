# Contributing to naoTab

Thanks for your interest in contributing! Here's how to get started.

## Setup

1. Fork this repo and clone it locally
2. Open `chrome://extensions/` → enable **Developer mode**
3. Click **Load unpacked** → select the cloned folder
4. After editing any file, click **🔄** in the popup to reload the extension

## Project structure

```
naoTab/
├── popup.html / popup.css / popup.js   # Extension popup
├── app.html / app.js                   # Full-page Knowledge Base
├── settings.html / settings.js         # AI provider settings
├── storage.js                          # Shared: bookmarks CRUD + settings + AI
├── d3.min.js                           # D3.js v7 (bundled — CSP compliance)
└── jszip.min.js                        # JSZip (bundled — CSP compliance)
```

## Key constraints

- **No ES modules** — Chrome Extension uses classic `<script src>` loading
- **No inline scripts** — Manifest V3 CSP blocks them; all JS must be in `.js` files
- **No CDN scripts** — bundle libraries locally for CSP compliance
- **No backend** — everything runs inside the extension using `chrome.storage.local`
- **UI language: English** — all user-facing text should be in English

## Making changes

- `storage.js` is shared across popup, app, and settings — update all callers when adding/changing functions
- Test both popup and Knowledge Base (`app.html`) after any change to `storage.js`
- AI is optional — changes must not break the offline (no-AI) experience

## Submitting a PR

1. Create a branch: `git checkout -b feat/your-feature`
2. Make your changes and test manually in Chrome
3. Open a pull request with a clear description of what changed and why

## Reporting bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template — include Chrome version, steps to reproduce, and any console errors.
