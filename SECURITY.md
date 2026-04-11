# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.16.x  | ✅ Yes     |
| < 0.16  | ❌ No      |

## Reporting a Vulnerability

If you discover a security vulnerability in naoTab, **please do not open a public GitHub issue**.

Instead, report it privately by emailing: **bsq@estuary.solutions**

Include in your report:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (optional)

You can expect a response within **7 days**. If the issue is confirmed, a fix will be prioritized and released as soon as possible. You will be credited in the release notes unless you prefer to remain anonymous.

## Scope

naoTab runs entirely locally inside your browser — there is no server, no backend, and no data transmission except for optional AI API calls that you configure yourself. The main security considerations are:

- **AI API keys** — stored in `chrome.storage.local`, never transmitted except to the AI provider you configure
- **Tab data** — bookmarks stay on your device in `chrome.storage.local`
- **`scripting` + `host_permissions`** — used only to read SEO meta tags from pages you explicitly save; no background script runs on pages

## Out of Scope

- Vulnerabilities in third-party AI providers (OpenAI, Anthropic, Groq, etc.)
- Issues in bundled libraries (`d3.min.js`, `jszip.min.js`) — please report those upstream
- General Chrome/browser security issues
