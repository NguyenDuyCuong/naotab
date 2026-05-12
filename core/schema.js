// schema.js — Single source of truth for bookmark data structure
//
// ⚠️  IMPORTANT: Never remove or rename existing fields.
//     Only ADD new fields with a safe default value.
//     Increment SCHEMA_VERSION when adding fields.
//     Add a migration case in migrateBookmark() for each new version.

const SCHEMA_VERSION = 3;

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
  
  // NEW in v2: Graph visualization fields
  type:          'unknown',  // 'entity'|'concept'|'source'|'synthesis'|'unknown'
  markdown:      '',         // Pre-computed for UI performance
  preview:       '',         // Pre-computed for UI performance
  
  // NEW in v3: AI Attribution & Content Metadata
  ai_generated:  false,      // Was summary made by AI?
  ai_tags:       false,      // Were tags suggested by AI?
  content_type:  'article',  // Detect: article|video|guide|tool|paper|bookmark
  reading_time:  0,          // Estimated minutes to read
  
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

  // v1 → v2: Graph visualization fields (NEW!)
  if (v < 2) {
    b.type = detectType(b.tags, b.title, b.url);
    b.markdown = generateMarkdown(b);
    b.preview = b.markdown.substring(0, 150);
  }

  // v2 → v3: AI Attribution & Content Metadata (NEW!)
  if (v < 3) {
    b.ai_generated = false;
    b.ai_tags = false;
    b.content_type = detectContentType(b.url, b.tags, b.pageMeta);
    b.reading_time = estimateReadingTime(b.summary);
  }

  b.schemaVersion = SCHEMA_VERSION;
  return b;
}

/**
 * createBookmark(fields)
 * Build a new bookmark object with all required fields populated.
 * Strips _aiText from pageMeta before storing.
 */
function createBookmark({ url, title, reason, summary, tags, favIconUrl, pageMeta, ai_generated, ai_tags }) {
  let cleanMeta = null;
  if (pageMeta) {
    const { _aiText, ...rest } = pageMeta;
    const filtered = Object.fromEntries(Object.entries(rest).filter(([, v]) => v));
    cleanMeta = Object.keys(filtered).length ? filtered : null;
  }

  const bookmark = {
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

  // NEW in v2: Compute graph fields for new bookmarks
  bookmark.type = detectType(bookmark.tags, bookmark.title, bookmark.url);
  bookmark.markdown = generateMarkdown(bookmark);
  bookmark.preview = bookmark.markdown.substring(0, 150);

  // NEW in v3: Compute AI Attribution & Content Metadata for new bookmarks
  bookmark.ai_generated = ai_generated || false;
  bookmark.ai_tags = ai_tags || false;
  bookmark.content_type = detectContentType(bookmark.url, bookmark.tags, pageMeta);
  bookmark.reading_time = estimateReadingTime(bookmark.summary);

  return bookmark;
}

// ──────────────────────────────────────────────────────────────
// NEW FUNCTIONS FOR v2: Graph Visualization
// ──────────────────────────────────────────────────────────────

/**
 * detectType(tags, title, url)
 * 
 * Heuristic-based node type detection for graph visualization.
 * Returns one of: 'entity', 'concept', 'source', 'synthesis', 'unknown'
 */
function detectType(tags, title, url) {
  tags = tags || [];
  title = title || '';
  url = url || '';

  // Normalize for comparison
  const tagsLower = tags.map(t => t.toLowerCase());
  const titleLower = title.toLowerCase();
  const urlLower = url.toLowerCase();

  // Check for SOURCE (reference, article, paper)
  if (urlLower.includes('/paper') || 
      urlLower.includes('/article') || 
      urlLower.includes('/blog') ||
      urlLower.includes('arxiv') ||
      tagsLower.includes('source') ||
      tagsLower.includes('paper') ||
      tagsLower.includes('article') ||
      tagsLower.includes('reference') ||
      titleLower.includes('guide') ||
      titleLower.includes('tutorial')) {
    return 'source';
  }

  // Check for ENTITY (person, company, organization)
  if (tagsLower.includes('person') ||
      tagsLower.includes('entity') ||
      tagsLower.includes('company') ||
      tagsLower.includes('organization') ||
      tagsLower.includes('author') ||
      titleLower.includes(' by ') ||
      urlLower.includes('linkedin') ||
      urlLower.includes('github.com')) {
    return 'entity';
  }

  // Check for SYNTHESIS (summary, guide, personal note)
  if (titleLower.includes('summary') ||
      titleLower.includes('notes') ||
      titleLower.includes('my ') ||
      tagsLower.includes('synthesis') ||
      tagsLower.includes('summary') ||
      tagsLower.includes('guide')) {
    return 'synthesis';
  }

  // Check for CONCEPT (theory, framework, topic)
  if (tags.length >= 3 ||
      tagsLower.includes('concept') ||
      tagsLower.includes('theory') ||
      tagsLower.includes('framework') ||
      tagsLower.includes('pattern') ||
      tagsLower.includes('technique')) {
    return 'concept';
  }

  // Default
  return 'unknown';
}

/**
 * generateMarkdown(bookmark)
 * 
 * Generates formatted markdown from bookmark fields.
 * Template: Title + Summary + Reason + Tags + Source Link
 */
function generateMarkdown(bookmark) {
  let md = '';

  // Title
  if (bookmark.title) {
    md += `# ${bookmark.title}\n\n`;
  }

  // Summary (main content)
  if (bookmark.summary) {
    md += `${bookmark.summary}\n\n`;
  }

  // Reason (why saved)
  if (bookmark.reason) {
    md += `**Reason:** ${bookmark.reason}\n\n`;
  }

  // Tags
  if (bookmark.tags && bookmark.tags.length > 0) {
    md += `**Tags:** ${bookmark.tags.join(', ')}\n\n`;
  }

  // Link to original (for reference)
  if (bookmark.url) {
    md += `**Source:** [${new URL(bookmark.url).hostname}](${bookmark.url})\n`;
  }

  return md.trim();
}

/**
 * detectContentType(url, tags, pageMeta)
 * 
 * Heuristic-based content type detection for bookmarks.
 * Returns one of: 'article', 'video', 'guide', 'tool', 'paper', 'bookmark'
 */
function detectContentType(url, tags, pageMeta) {
  if (!url) return 'bookmark';
  
  const urlLower = url.toLowerCase();
  const tagsLower = (tags || []).map(t => t.toLowerCase());
  
  // Check for VIDEO
  if (urlLower.includes('youtube.com') || 
      urlLower.includes('youtu.be') || 
      urlLower.includes('vimeo.com') ||
      tagsLower.includes('video')) {
    return 'video';
  }
  
  // Check for PAPER
  if (urlLower.includes('arxiv') || 
      urlLower.includes('scholar.google') ||
      urlLower.includes('/pdf') ||
      tagsLower.includes('paper')) {
    return 'paper';
  }
  
  // Check for GUIDE
  if (urlLower.includes('/guide') || 
      urlLower.includes('tutorial') || 
      urlLower.includes('how-to') ||
      tagsLower.includes('guide')) {
    return 'guide';
  }
  
  // Check for TOOL
  if (urlLower.includes('github.com') || 
      tagsLower.includes('tool') || 
      urlLower.includes('tool')) {
    return 'tool';
  }
  
  // Default to article
  return 'article';
}

/**
 * estimateReadingTime(summary)
 * 
 * Estimate reading time in minutes based on word count.
 * Average reading speed: 200 words per minute.
 */
function estimateReadingTime(summary) {
  if (!summary) return 0;
  const wordCount = summary.split(/\s+/).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}
