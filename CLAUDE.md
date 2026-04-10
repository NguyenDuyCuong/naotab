# naoTab — Chrome Extension

## Tổng quan dự án

Chrome Extension (Manifest V3) giúp developer quản lý và tổ chức browser tabs thành một **personal knowledge base**. Không cần server, không cần backend — toàn bộ chạy trong extension, data lưu tại `chrome.storage.local`.

---

## Cấu trúc file

```
Chrome Extension Tabs Explore/
├── manifest.json       # Manifest V3, permissions: tabs + storage + unlimitedStorage
├── popup.html/css/js   # Popup chính — xem tabs, save, copy, export
├── app.html            # Knowledge Base full-page — list view + graph view + search
├── settings.html       # Cấu hình AI provider (URL, key, model) + toggle features
├── storage.js          # Module dùng chung: bookmarks CRUD + settings + AI call
├── icons/              # icon16/48/128.png
└── CLAUDE.md           # File này
```

---

## Kiến trúc & Data flow

```
popup.js  ──────────────────────┐
settings.html  ─────────────────┤──► storage.js ──► chrome.storage.local
app.html (inline script)  ──────┘         │
                                          └──► External AI API (optional)
```

### Data schema — bookmark object

```json
{
  "id": "1712345678901",
  "url": "https://...",
  "title": "Page title",
  "reason": "Lý do lưu — do người dùng nhập",
  "summary": "Tóm tắt — do AI generate hoặc người dùng nhập",
  "tags": ["rust", "async", "performance"],
  "favIconUrl": "https://...",
  "status": "unread | reading | done | revisit",
  "savedAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Data schema — settings object

```json
{
  "aiEnabled": false,
  "aiBaseUrl": "https://api.openai.com/v1",
  "aiApiKey": "sk-...",
  "aiModel": "gpt-4o-mini",
  "featTags": true,
  "featSummary": true
}
```

---

## Các file chính và trách nhiệm

### `storage.js`
Module dùng chung, được load vào cả popup và app.html bằng `<script src>`.

Exports (global functions):
- `getBookmarks()` — đọc toàn bộ bookmarks
- `saveBookmark({url, title, reason, summary, tags, favIconUrl})` — lưu mới, tự dedup theo URL
- `updateBookmark(id, changes)` — update partial
- `deleteBookmark(id)` — xoá theo id
- `suggestTags(title, url)` — offline keyword matching, trả về array tags
- `getSettings()` / `saveSettings(settings)` — đọc/ghi settings
- `callAI(title, url)` — gọi AI API, trả về `{tags, summary}` hoặc `null`
- `exportJSON()` / `importJSON(jsonString)` — export/import toàn bộ data

### `popup.js`
- Load tất cả tabs qua `chrome.tabs.query({})`
- Group tabs theo `windowId`
- Nút 💾 per-tab mở Save Modal
- Nút 💾 per-window lưu cả window
- Nút ✕ per-tab/window đóng tab/window
- Save Modal: offline tags suggest + optional AI Suggest nếu AI bật
- Toolbar: Copy All / JSON / Markdown / CSV export

### `app.html`
Single-file app (HTML + inline CSS + inline JS + D3.js CDN).
- **List view**: card per bookmark, filter sidebar (status + tags), full-text search
- **Graph view**: D3 force-directed graph, nodes = bookmarks, edges = shared tags, zoom/drag, tooltip on hover, double-click mở URL
- **Edit modal**: chỉnh summary, reason, tags
- Export JSON / Import JSON

### `settings.html`
- Toggle AI on/off (default: off)
- Preset buttons: OpenAI, Claude, Ollama, Groq, OpenRouter
- Fields: API Base URL, API Key, Model
- Nút "Test kết nối" — gọi thực API với 1 message ngắn
- Lưu vào `chrome.storage.local`

---

## AI Integration

`callAI()` trong `storage.js` hỗ trợ 2 format:

**OpenAI-compatible** (OpenAI, Groq, Ollama, OpenRouter, v.v.):
- Endpoint: `{baseUrl}/chat/completions`
- Header: `Authorization: Bearer {apiKey}`

**Anthropic native**:
- Detect: `baseUrl.includes('anthropic.com')`
- Endpoint: `{baseUrl}/messages`
- Header: `x-api-key: {apiKey}` + `anthropic-version: 2023-06-01`

Prompt gửi lên: title + URL → AI trả về JSON `{tags: [], summary: ""}`.

---

## Permissions

| Permission | Lý do |
|---|---|
| `tabs` | Đọc title, URL, favIconUrl của tất cả tabs |
| `storage` | Lưu bookmarks và settings vào chrome.storage.local |
| `unlimitedStorage` | Không giới hạn 10MB mặc định |

Không dùng: `activeTab`, `scripting`, `host_permissions` — extension không inject vào trang.

---

## Hướng phát triển tiếp theo

- [ ] **Content script** — đọc thêm nội dung trang để AI summarize chính xác hơn
- [ ] **Google Drive sync** — Export/import tự động qua Drive API
- [ ] **AI Group** trong Knowledge Base — AI tự gom nhóm bookmarks theo topic
- [ ] **Duplicate detector** — phát hiện tab trùng URL đang mở
- [ ] **Dark mode**
- [ ] **Browser history integration** — gợi ý save các trang đã visit nhiều

---

## Cách load extension để dev

1. Mở `chrome://extensions/`
2. Bật **Developer mode**
3. Click **Load unpacked** → chọn thư mục này
4. Sau khi sửa code: mở popup → click **🔄** (nút reload ở header)

## Quy ước khi làm việc với Claude

- Sau mỗi thay đổi, Claude sửa trực tiếp file trong thư mục này
- Người dùng reload extension bằng nút 🔄 trong popup để lấy code mới
- `storage.js` là file dùng chung — khi thêm function mới nhớ cập nhật cả popup.js và app.html nếu cần
- Không dùng ES modules (`import/export`) vì Chrome Extension load script kiểu classic
