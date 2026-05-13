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
const STORAGE_MODE_KEY = 'tab_bookmarks_mode';
const STORAGE_SHARD_META_KEY = 'tab_bookmarks_shard_meta';
const STORAGE_SHARD_PREFIX = 'tab_bookmarks_shard_';
const SETTINGS_KEY = 'tab_explorer_settings';
const LEGACY_SETTINGS_KEYS = ['tab_settings', 'settings', 'bookmark-vault_settings'];

// ─── Settings ──────────────────────────────────────────────────────────────────

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const current = result[SETTINGS_KEY];
  if (current && typeof current === 'object') {
    return { ...SETTINGS_DEFAULTS, ...current };
  }

  const legacy = await chrome.storage.local.get(LEGACY_SETTINGS_KEYS);
  const legacySettings = LEGACY_SETTINGS_KEYS
    .map(k => legacy[k])
    .find(v => v && typeof v === 'object');

  if (legacySettings) {
    const merged = { ...SETTINGS_DEFAULTS, ...legacySettings };
    await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
    return merged;
  }

  return { ...SETTINGS_DEFAULTS };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

async function getLegacyIngestState() {
  const settings = await getSettings();
  return {
    includeBookmarks: settings.legacyIngestIncludeBookmarks !== false,
    includeHistory: settings.legacyIngestIncludeHistory !== false,
    strategy: settings.legacyIngestStrategy || SETTINGS_DEFAULTS.legacyIngestStrategy,
    skipExisting: settings.legacyIngestSkipExisting !== false,
    retryCount: Number.isFinite(settings.legacyIngestRetryCount) ? settings.legacyIngestRetryCount : SETTINGS_DEFAULTS.legacyIngestRetryCount,
    safeMode: settings.legacyIngestSafeMode !== false,
    batchSize: Number.isFinite(settings.legacyIngestBatchSize) ? settings.legacyIngestBatchSize : SETTINGS_DEFAULTS.legacyIngestBatchSize,
    maxConcurrency: Number.isFinite(settings.legacyIngestMaxConcurrency) ? settings.legacyIngestMaxConcurrency : SETTINGS_DEFAULTS.legacyIngestMaxConcurrency,
    perItemTimeoutMs: Number.isFinite(settings.legacyIngestPerItemTimeoutMs) ? settings.legacyIngestPerItemTimeoutMs : SETTINGS_DEFAULTS.legacyIngestPerItemTimeoutMs,
    checkpointInterval: Number.isFinite(settings.legacyIngestCheckpointInterval) ? settings.legacyIngestCheckpointInterval : SETTINGS_DEFAULTS.legacyIngestCheckpointInterval,
    state: settings.legacyIngestState || SETTINGS_DEFAULTS.legacyIngestState,
    phase: settings.legacyIngestPhase || SETTINGS_DEFAULTS.legacyIngestPhase,
    processed: Number(settings.legacyIngestProcessed || 0),
    total: Number(settings.legacyIngestTotal || 0),
    imported: Number(settings.legacyIngestImported || 0),
    skipped: Number(settings.legacyIngestSkipped || 0),
    failed: Number(settings.legacyIngestFailed || 0),
    currentUrl: settings.legacyIngestCurrentUrl || '',
    startedAt: settings.legacyIngestStartedAt || '',
    updatedAt: settings.legacyIngestUpdatedAt || '',
    lastError: settings.legacyIngestLastError || '',
    failures: Array.isArray(settings.legacyIngestFailures) ? settings.legacyIngestFailures : [],
    checkpointCursor: settings.legacyIngestCheckpointCursor && typeof settings.legacyIngestCheckpointCursor === 'object'
      ? settings.legacyIngestCheckpointCursor
      : null,
    checkpointStats: settings.legacyIngestCheckpointStats && typeof settings.legacyIngestCheckpointStats === 'object'
      ? settings.legacyIngestCheckpointStats
      : null,
    checkpointUpdatedAt: settings.legacyIngestCheckpointUpdatedAt || '',
  };
}

async function updateLegacyIngestState(changes) {
  const current = await getSettings();
  const next = {
    ...current,
    ...changes,
    legacyIngestUpdatedAt: new Date().toISOString(),
  };
  await saveSettings(next);
  return next;
}

async function getLegacyIngestCheckpoint() {
  const state = await getLegacyIngestState();
  return {
    cursor: state.checkpointCursor,
    stats: state.checkpointStats,
    updatedAt: state.checkpointUpdatedAt,
  };
}

async function saveLegacyIngestCheckpoint(checkpoint) {
  return updateLegacyIngestState({
    legacyIngestCheckpointCursor: checkpoint?.cursor && typeof checkpoint.cursor === 'object' ? checkpoint.cursor : null,
    legacyIngestCheckpointStats: checkpoint?.stats && typeof checkpoint.stats === 'object' ? checkpoint.stats : null,
    legacyIngestCheckpointUpdatedAt: checkpoint?.updatedAt || new Date().toISOString(),
  });
}

async function clearLegacyIngestCheckpoint() {
  return updateLegacyIngestState({
    legacyIngestCheckpointCursor: null,
    legacyIngestCheckpointStats: null,
    legacyIngestCheckpointUpdatedAt: '',
  });
}

async function appendLegacyIngestFailures(items = [], maxItems = 500) {
  const current = await getSettings();
  const existing = Array.isArray(current.legacyIngestFailures) ? current.legacyIngestFailures : [];
  const incoming = (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .map((item) => ({
      category: item.category || 'ingest-failure',
      type: item.type || item.code || 'unknown',
      code: item.code || item.type || 'unknown',
      retryable: item.retryable !== false,
      source: item.source || '',
      sourceDetail: item.sourceDetail || '',
      url: item.url || '',
      canonicalUrl: item.canonicalUrl || item.url || '',
      message: item.message || 'Unknown error',
      timestamp: item.timestamp || new Date().toISOString(),
      bookmarkId: item.bookmarkId || '',
      provider: item.provider || '',
      attempts: Number(item.attempts || 0),
    }));

  const merged = [...incoming, ...existing].slice(0, Math.max(100, Number(maxItems || 500)));
  return updateLegacyIngestState({
    legacyIngestFailures: merged,
    legacyIngestFailed: merged.length,
    legacyIngestLastError: merged[0]?.message || '',
  });
}

async function consumeLegacyIngestFailures(predicate) {
  const current = await getSettings();
  const failures = Array.isArray(current.legacyIngestFailures) ? current.legacyIngestFailures : [];
  const keep = [];
  const consumed = [];
  failures.forEach((item) => {
    if (typeof predicate === 'function' && predicate(item)) {
      consumed.push(item);
    } else {
      keep.push(item);
    }
  });
  await updateLegacyIngestState({
    legacyIngestFailures: keep,
    legacyIngestFailed: keep.length,
    legacyIngestLastError: keep[0]?.message || '',
  });
  return consumed;
}

function getShardKey(index) {
  return `${STORAGE_SHARD_PREFIX}${index}`;
}

function chunkArray(items, chunkSize) {
  const size = Math.max(1, Number(chunkSize || 500));
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function getShardedBookmarks() {
  const metaResult = await chrome.storage.local.get(STORAGE_SHARD_META_KEY);
  const meta = metaResult[STORAGE_SHARD_META_KEY];
  if (!meta || !Number.isFinite(meta.totalShards) || meta.totalShards <= 0) {
    return { bookmarks: [], meta: null };
  }

  const shardKeys = Array.from({ length: meta.totalShards }, (_, idx) => getShardKey(idx));
  const shardResult = await chrome.storage.local.get(shardKeys);
  const bookmarks = [];
  shardKeys.forEach((key) => {
    const shard = shardResult[key];
    if (Array.isArray(shard)) bookmarks.push(...shard);
  });
  return { bookmarks, meta };
}

async function saveBookmarks(bookmarks) {
  const settings = await getSettings();
  const backend = settings.storageBackend || 'local-auto';
  const shardSize = Math.max(100, Math.min(2000, Number(settings.storageShardSize || 500)));
  const shardThreshold = Math.max(shardSize, Number(settings.storageShardThreshold || 1500));
  const shouldUseShards = backend === 'local-sharded' || (backend === 'local-auto' && bookmarks.length >= shardThreshold);

  if (!shouldUseShards) {
    const metaResult = await chrome.storage.local.get(STORAGE_SHARD_META_KEY);
    const meta = metaResult[STORAGE_SHARD_META_KEY];
    const keysToRemove = [STORAGE_SHARD_META_KEY, STORAGE_MODE_KEY];
    if (meta && Number.isFinite(meta.totalShards) && meta.totalShards > 0) {
      for (let i = 0; i < meta.totalShards; i++) keysToRemove.push(getShardKey(i));
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks });
    await chrome.storage.local.remove(keysToRemove);
    return;
  }

  const chunks = chunkArray(bookmarks, shardSize);
  const payload = {
    [STORAGE_MODE_KEY]: 'sharded',
    [STORAGE_SHARD_META_KEY]: {
      totalItems: bookmarks.length,
      totalShards: chunks.length,
      shardSize,
      updatedAt: new Date().toISOString(),
    },
  };
  chunks.forEach((chunk, idx) => {
    payload[getShardKey(idx)] = chunk;
  });

  const prevMetaResult = await chrome.storage.local.get(STORAGE_SHARD_META_KEY);
  const prevMeta = prevMetaResult[STORAGE_SHARD_META_KEY];
  const keysToRemove = [STORAGE_KEY];
  if (prevMeta && Number.isFinite(prevMeta.totalShards) && prevMeta.totalShards > chunks.length) {
    for (let i = chunks.length; i < prevMeta.totalShards; i++) keysToRemove.push(getShardKey(i));
  }
  await chrome.storage.local.set(payload);
  if (keysToRemove.length > 0) await chrome.storage.local.remove(keysToRemove);
}

// ─── Bookmarks CRUD ────────────────────────────────────────────────────────────

/**
 * getBookmarks()
 * Reads all bookmarks and runs migration on each — safe for old data.
 */
async function getBookmarks() {
  const sharded = await getShardedBookmarks();
  if (sharded.meta) {
    return (sharded.bookmarks || []).map(migrateBookmark);
  }
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
  await saveBookmarks(bookmarks);
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
  await saveBookmarks(bookmarks);
  return true;
}

/**
 * deleteBookmark(id)
 */
async function deleteBookmark(id) {
  const bookmarks = await getBookmarks();
  await saveBookmarks(bookmarks.filter(b => b.id !== id));
}

/**
 * replaceAllBookmarks(bookmarks)
 * Replaces full bookmark collection after running migration.
 */
async function replaceAllBookmarks(bookmarks) {
  const safe = (Array.isArray(bookmarks) ? bookmarks : []).map(migrateBookmark);
  await saveBookmarks(safe);
  return safe.length;
}

/**
 * mergeBookmarks(bookmarks)
 * Merges incoming bookmarks by URL into local storage.
 * Returns { imported, skipped, total }.
 */
async function mergeBookmarks(bookmarks) {
  const incoming = (Array.isArray(bookmarks) ? bookmarks : []).map(migrateBookmark);
  const existing = await getBookmarks();
  const existingUrls = new Set(existing.map(b => b.url));
  const newOnes = incoming.filter(b => !existingUrls.has(b.url));
  const merged = [...newOnes, ...existing];
  await saveBookmarks(merged);
  return { imported: newOnes.length, skipped: incoming.length - newOnes.length, total: merged.length };
}

async function clearAllBookmarks() {
  await saveBookmarks([]);
}
