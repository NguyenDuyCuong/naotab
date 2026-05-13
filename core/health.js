// health.js — Health check engine for bookmarks
// Identifies issues: empty bookmarks, missing metadata, naming inconsistencies, stale data

/**
 * runHealthCheck(allBookmarks)
 * Comprehensive health check function that identifies all issues in the bookmark collection.
 * Returns a report with issues grouped by severity and type.
 */
async function runHealthCheck(allBookmarks) {
  const issues = [];
  const timestamp = new Date();
  
  if (!allBookmarks || !Array.isArray(allBookmarks)) {
    return {
      timestamp,
      total_bookmarks: 0,
      issues: [],
      summary: { total_issues: 0 }
    };
  }
  
  // 1. Empty/stub bookmarks (no title, summary, or reason)
  allBookmarks.forEach(b => {
    if (!b.title?.trim() && !b.summary?.trim() && !b.reason?.trim()) {
      issues.push({
        type: 'empty_bookmark',
        severity: 'high',
        id: b.id,
        message: 'Bookmark has no title, summary, or reason'
      });
    }
  });
  
  // 2. Missing metadata (no summary and no extracted knowledge)
  allBookmarks.forEach(b => {
    if (!b.summary && !b.concepts?.length && !b.entities?.length && !b.keywords?.length) {
      issues.push({
        type: 'no_metadata',
        severity: 'medium',
        id: b.id,
        message: 'No summary or extracted metadata'
      });
    }
  });
  
  // 3. Inconsistent naming (concepts)
  const conceptMap = new Map();
  allBookmarks.forEach(b => {
    (b.concepts || []).forEach(c => {
      if (!c.name) return;
      const normalized = normalizeConceptName(c.name);
      if (!conceptMap.has(normalized)) {
        conceptMap.set(normalized, new Set());
      }
      conceptMap.get(normalized).add(c.name);
    });
  });
  
  conceptMap.forEach((variations, normalized) => {
    if (variations.size > 1) {
      issues.push({
        type: 'inconsistent_concept_naming',
        severity: 'medium',
        normalized,
        variations: Array.from(variations),
        message: `Concept "${normalized}" has ${variations.size} name variations`,
        affected_count: variations.size
      });
    }
  });
  
  // 4. Inconsistent naming (entities)
  const entityMap = new Map();
  allBookmarks.forEach(b => {
    (b.entities || []).forEach(e => {
      if (!e.name) return;
      const normalized = normalizeEntityName(e.name, e.type);
      if (!entityMap.has(normalized)) {
        entityMap.set(normalized, new Set());
      }
      entityMap.get(normalized).add(e.name);
    });
  });
  
  entityMap.forEach((variations, normalized) => {
    if (variations.size > 1) {
      issues.push({
        type: 'inconsistent_entity_naming',
        severity: 'medium',
        normalized,
        variations: Array.from(variations),
        message: `Entity "${normalized}" has ${variations.size} name variations`,
        affected_count: variations.size
      });
    }
  });
  
  // 5. Inconsistent naming (keywords)
  const keywordMap = new Map();
  allBookmarks.forEach(b => {
    (b.keywords || []).forEach(k => {
      if (!k.word) return;
      const normalized = normalizeKeywordName(k.word);
      if (!keywordMap.has(normalized)) {
        keywordMap.set(normalized, new Set());
      }
      keywordMap.get(normalized).add(k.word);
    });
  });
  
  keywordMap.forEach((variations, normalized) => {
    if (variations.size > 1) {
      issues.push({
        type: 'inconsistent_keyword_naming',
        severity: 'low',
        normalized,
        variations: Array.from(variations),
        message: `Keyword "${normalized}" has ${variations.size} variations`,
        affected_count: variations.size
      });
    }
  });
  
  // 6. Low extraction confidence
  allBookmarks.forEach(b => {
    const confidence = b.extraction_confidence || 1;
    if (confidence > 0 && confidence < 0.6) {
      issues.push({
        type: 'low_confidence_extraction',
        severity: 'low',
        id: b.id,
        confidence: confidence,
        message: `Low extraction confidence: ${(confidence * 100).toFixed(0)}%`
      });
    }
  });
  
  // 7. Stale metadata (not updated in 30 days)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  allBookmarks.forEach(b => {
    if (b.extraction_timestamp) {
      const extractTime = new Date(b.extraction_timestamp).getTime();
      if (extractTime < thirtyDaysAgo && (b.concepts?.length || b.entities?.length)) {
        const daysOld = Math.floor((Date.now() - extractTime) / (24 * 60 * 60 * 1000));
        issues.push({
          type: 'stale_metadata',
          severity: 'low',
          id: b.id,
          days_old: daysOld,
          message: `Metadata not updated in ${daysOld}+ days`
        });
      }
    }
  });
  
  // 8. Missing URL (likely imported or malformed)
  allBookmarks.forEach(b => {
    if (!b.url?.trim()) {
      issues.push({
        type: 'missing_url',
        severity: 'high',
        id: b.id,
        message: 'Bookmark has no valid URL'
      });
    }
  });

  // 9. Duplicate URL candidates (canonical URL)
  const canonicalMap = new Map();
  allBookmarks.forEach((b) => {
    const canonical = canonicalizeUrlForHealth(b.url);
    if (!canonical) return;
    if (!canonicalMap.has(canonical)) canonicalMap.set(canonical, []);
    canonicalMap.get(canonical).push(b);
  });
  canonicalMap.forEach((rows, canonical) => {
    if (rows.length < 2) return;
    issues.push({
      type: 'duplicate_url',
      severity: 'medium',
      canonical_url: canonical,
      affected_count: rows.length,
      ids: rows.map(x => x.id),
      message: `Canonical URL appears ${rows.length} times`
    });
  });
  
  return {
    timestamp,
    total_bookmarks: allBookmarks.length,
    issues,
    summary: {
      empty_bookmarks: issues.filter(i => i.type === 'empty_bookmark').length,
      missing_urls: issues.filter(i => i.type === 'missing_url').length,
      no_metadata: issues.filter(i => i.type === 'no_metadata').length,
      concept_inconsistencies: issues.filter(i => i.type === 'inconsistent_concept_naming').length,
      entity_inconsistencies: issues.filter(i => i.type === 'inconsistent_entity_naming').length,
      keyword_inconsistencies: issues.filter(i => i.type === 'inconsistent_keyword_naming').length,
      low_confidence: issues.filter(i => i.type === 'low_confidence_extraction').length,
      stale_metadata: issues.filter(i => i.type === 'stale_metadata').length,
      duplicate_urls: issues.filter(i => i.type === 'duplicate_url').length,
      total_issues: issues.length
    }
  };
}

function canonicalizeUrlForHealth(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = '';
    const blocked = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'gclid', 'fbclid', 'ref', 'ref_src'
    ];
    blocked.forEach((key) => parsed.searchParams.delete(key));
    const normalizedSearch = new URLSearchParams([...parsed.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    parsed.search = normalizedSearch.toString() ? `?${normalizedSearch.toString()}` : '';
    return parsed.toString();
  } catch (_) {
    return rawUrl.trim();
  }
}
