// export.js — Data export and import utilities
// Depends on: storage.js (getBookmarks, chrome.storage.local), schema.js (migrateBookmark, STORAGE_KEY)

/**
 * exportJSON()
 * Returns full bookmark list as a formatted JSON string for download/backup.
 */
async function exportJSON() {
  const bookmarks = await getBookmarks();
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), bookmarks }, null, 2);
}

/**
 * importJSON(jsonString)
 * Merges incoming bookmarks into local storage. Deduplicates by URL.
 * Returns { imported, skipped }.
 */
async function importJSON(jsonString) {
  const data = JSON.parse(jsonString);
  const incoming = (data.bookmarks || data).map(migrateBookmark); // migrate on import
  const existing = await getBookmarks();
  const existingUrls = new Set(existing.map(b => b.url));
  const newOnes = incoming.filter(b => !existingUrls.has(b.url));
  const merged = [...newOnes, ...existing];
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  return { imported: newOnes.length, skipped: incoming.length - newOnes.length };
}

/**
 * bookmarkToObsidianMd(bookmark)
 * Converts a single bookmark to an Obsidian-compatible .md string.
 */
function bookmarkToObsidianMd(bookmark) {
  const safeName = (bookmark.title || 'Untitled')
    .replace(/[\/\\:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  const filename = safeName + '.md';

  const tagsYaml = (bookmark.tags || []).length > 0
    ? '  - ' + bookmark.tags.join('\n  - ')
    : '';

  const savedAt  = bookmark.savedAt  ? bookmark.savedAt.slice(0, 10)  : new Date().toISOString().slice(0, 10);
  const updatedAt = bookmark.updatedAt ? bookmark.updatedAt.slice(0, 10) : savedAt;

  const frontmatter = [
    '---',
    `title: "${(bookmark.title || '').replace(/"/g, "'")}"`,
    `url: "${bookmark.url}"`,
    `tags:`,
    tagsYaml,
    `date_saved: ${savedAt}`,
    `date_updated: ${updatedAt}`,
    `source: naoTab`,
    '---',
  ].filter(line => line !== '').join('\n');

  const parts = [];
  parts.push(`# [${bookmark.title || 'Untitled'}](${bookmark.url})\n`);
  if (bookmark.summary) parts.push(`## Summary\n\n${bookmark.summary}\n`);
  if (bookmark.reason)  parts.push(`## Why I saved this\n\n> ${bookmark.reason}\n`);
  if (bookmark.tags && bookmark.tags.length > 0) {
    parts.push(`## Tags\n\n${bookmark.tags.map(t => `#${t}`).join(' ')}\n`);
  }
  parts.push(`---\n*Saved via [naoTab](https://github.com/bsquang/naotab) on ${savedAt}*`);

  return { filename, content: frontmatter + '\n\n' + parts.join('\n') };
}

/**
 * exportObsidian()
 * Returns array of { filename, content } for all bookmarks.
 */
async function exportObsidian() {
  const bookmarks = await getBookmarks();
  return bookmarks.map(b => bookmarkToObsidianMd(b));
}
