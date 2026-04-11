// schema.js — Single source of truth for bookmark data structure
//
// ⚠️  IMPORTANT: Never remove or rename existing fields.
//     Only ADD new fields with a safe default value.
//     Increment SCHEMA_VERSION when adding fields.
//     Add a migration case in migrateBookmark() for each new version.

const SCHEMA_VERSION = 1;

// Canonical shape of a bookmark object.
// All fields must have a default value so old data is safe to migrate.
const BOOKMARK_DEFAULTS = {
  id:            '',
  url:           '',
  title:         '',
  reason:        '',
  summary:       '',
  tags:          [],
  favIconUrl:    '',
  pageMeta:      null,   // { description, ogTitle, ogType, keywords, author, siteName, ogImage, lang, canonical }
  savedAt:       '',
  updatedAt:     '',
  schemaVersion: SCHEMA_VERSION,
};

// Canonical shape of the settings object.
const SETTINGS_DEFAULTS = {
  aiEnabled:  false,
  aiBaseUrl:  '',
  aiApiKey:   '',
  aiModel:    '',
  featTags:   true,
  featSummary: true,
};

/**
 * migrateBookmark(raw)
 *
 * Takes a raw bookmark object from storage (may be from any past version)
 * and returns a fully-populated bookmark conforming to BOOKMARK_DEFAULTS.
 *
 * Rules:
 *  - Missing fields are filled with defaults (never throws)
 *  - Unknown/extra fields are preserved (forward-compat)
 *  - schemaVersion is bumped to current
 *
 * Add a new `case` block here whenever SCHEMA_VERSION is incremented.
 */
function migrateBookmark(raw) {
  if (!raw || typeof raw !== 'object') return { ...BOOKMARK_DEFAULTS };

  // Start from defaults, overlay with whatever exists in raw
  const b = { ...BOOKMARK_DEFAULTS, ...raw };

  const v = raw.schemaVersion || 0;

  // v0 → v1: pageMeta field introduced; status field removed
  if (v < 1) {
    if (!b.pageMeta) b.pageMeta = null;
    // status was removed — drop it if still present
    delete b.status;
  }

  // v1 → v2: (future) add new fields here
  // if (v < 2) { b.newField = defaultValue; }

  b.schemaVersion = SCHEMA_VERSION;
  return b;
}

/**
 * createBookmark(fields)
 * Build a new bookmark object with all required fields populated.
 * Strips _aiText from pageMeta before storing.
 */
function createBookmark({ url, title, reason, summary, tags, favIconUrl, pageMeta }) {
  let cleanMeta = null;
  if (pageMeta) {
    const { _aiText, ...rest } = pageMeta;
    const filtered = Object.fromEntries(Object.entries(rest).filter(([, v]) => v));
    cleanMeta = Object.keys(filtered).length ? filtered : null;
  }

  return {
    ...BOOKMARK_DEFAULTS,
    id:        Date.now().toString(),
    url:       url || '',
    title:     title || '',
    reason:    reason || '',
    summary:   summary || '',
    tags:      Array.isArray(tags) ? tags : [],
    favIconUrl: favIconUrl || '',
    pageMeta:  cleanMeta,
    savedAt:   new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  };
}
