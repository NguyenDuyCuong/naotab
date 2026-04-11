// storage.js — Bookmark CRUD + Settings
// Depends on: schema.js (migrateBookmark, createBookmark, SETTINGS_DEFAULTS)
//
// This file intentionally contains ONLY:
//   - Storage keys
//   - Settings read/write
//   - Bookmark CRUD (get/save/update/delete)
//
// AI logic  → ai.js
// Export    → export.js
// Sync      → sync/*.js (future)

const STORAGE_KEY  = 'tab_bookmarks';
const SETTINGS_KEY = 'tab_explorer_settings';

// ─── Settings ──────────────────────────────────────────────────────────────────

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...SETTINGS_DEFAULTS, ...(result[SETTINGS_KEY] || {}) };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// ─── Bookmarks CRUD ────────────────────────────────────────────────────────────

/**
 * getBookmarks()
 * Reads all bookmarks and runs migration on each — safe for old data.
 */
async function getBookmarks() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] || []).map(migrateBookmark);
}

/**
 * saveBookmark(fields)
 * Creates and persists a new bookmark. Deduplicates by URL.
 * Returns { duplicate: true, bookmark } or { duplicate: false, bookmark }.
 */
async function saveBookmark(fields) {
  const bookmarks = await getBookmarks();
  const exists = bookmarks.find(b => b.url === fields.url);
  if (exists) return { duplicate: true, bookmark: exists };

  const bookmark = createBookmark(fields);
  bookmarks.unshift(bookmark);
  await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks });
  return { duplicate: false, bookmark };
}

/**
 * updateBookmark(id, changes)
 * Partial update — merges changes into existing bookmark.
 */
async function updateBookmark(id, changes) {
  const bookmarks = await getBookmarks();
  const idx = bookmarks.findIndex(b => b.id === id);
  if (idx === -1) return false;
  bookmarks[idx] = { ...bookmarks[idx], ...changes, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks });
  return true;
}

/**
 * deleteBookmark(id)
 */
async function deleteBookmark(id) {
  const bookmarks = await getBookmarks();
  await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks.filter(b => b.id !== id) });
}
