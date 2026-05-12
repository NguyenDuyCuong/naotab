// lint.js — Semantic lint check engine for bookmarks
// Requires AI enabled; identifies generic summaries, missing entities, etc.

/**
 * runLintCheck(allBookmarks, settings)
 * Semantic analysis function that checks for quality issues.
 * May call AI if enabled to suggest improvements.
 * Returns a report with lint issues.
 */
async function runLintCheck(allBookmarks, settings) {
  const issues = [];
  const timestamp = new Date();
  
  if (!allBookmarks || !Array.isArray(allBookmarks)) {
    return {
      timestamp,
      issues: [],
      summary: { total_issues: 0 }
    };
  }
  
  // Check if AI is enabled
  if (!settings?.aiEnabled) {
    return {
      timestamp,
      issues: [{
        type: 'ai_disabled',
        severity: 'info',
        message: 'Lint check requires AI enabled in Settings'
      }],
      summary: { total_issues: 1 }
    };
  }
  
  // 1. Generic/sparse summaries (too generic + too short)
  const genericWords = [
    'important', 'interesting', 'useful', 'good', 'helpful', 'nice',
    'awesome', 'cool', 'neat', 'great', 'relevant'
  ];
  
  allBookmarks.forEach(b => {
    if (b.summary) {
      const lowerSummary = b.summary.toLowerCase();
      const hasGeneric = genericWords.some(w => lowerSummary.includes(w));
      
      if (hasGeneric && b.summary.trim().length < 60) {
        issues.push({
          type: 'generic_summary',
          severity: 'low',
          id: b.id,
          message: 'Summary is too generic and short (< 60 chars)',
          suggestion: 'Run AI Suggest to generate more specific summary',
          current_length: b.summary.trim().length
        });
      }
    }
  });
  
  // 2. Missing entities for technical content
  const techKeywords = [
    'code', 'coding', 'api', 'algorithm', 'framework', 'library', 'library',
    'tool', 'software', 'database', 'server', 'client', 'protocol',
    'function', 'class', 'module', 'package', 'npm', 'pip'
  ];
  
  allBookmarks.forEach(b => {
    const titleLower = (b.title || '').toLowerCase();
    const summaryLower = (b.summary || '').toLowerCase();
    const contentLower = titleLower + ' ' + summaryLower;
    
    const hasTechContent = techKeywords.some(k => contentLower.includes(k));
    
    if (hasTechContent && !b.entities?.length) {
      issues.push({
        type: 'missing_technical_entities',
        severity: 'low',
        id: b.id,
        message: 'Technical content without extracted named entities',
        suggestion: 'Run AI Extract All to extract tools, frameworks, and products',
        tech_indicators: techKeywords.filter(k => contentLower.includes(k))
      });
    }
  });
  
  // 3. Very high extraction confidence with many concepts (possible hallucination)
  allBookmarks.forEach(b => {
    const confidence = b.extraction_confidence || 1;
    const conceptCount = b.concepts?.length || 0;
    
    if (confidence > 0.95 && conceptCount > 10) {
      issues.push({
        type: 'suspicious_high_confidence',
        severity: 'low',
        id: b.id,
        confidence: confidence,
        concept_count: conceptCount,
        message: `Very high extraction confidence (${(confidence * 100).toFixed(0)}%) with ${conceptCount} concepts`,
        suggestion: 'May indicate hallucination. Review concept list manually.'
      });
    }
  });
  
  // 4. No summary but has concepts (suggests AI was run but summary wasn't generated)
  allBookmarks.forEach(b => {
    if (!b.summary?.trim() && (b.concepts?.length || b.entities?.length)) {
      issues.push({
        type: 'missing_summary_with_extraction',
        severity: 'low',
        id: b.id,
        message: 'Has extracted concepts/entities but no summary',
        suggestion: 'Run AI Suggest to generate summary from extracted metadata'
      });
    }
  });
  
  // 5. Conflicting entity types (entity with multiple types across bookmarks)
  const entityTypeMap = new Map();
  allBookmarks.forEach(b => {
    (b.entities || []).forEach(e => {
      if (!e.name) return;
      const normalized = normalizeEntityName(e.name, e.type);
      if (!entityTypeMap.has(normalized)) {
        entityTypeMap.set(normalized, new Set());
      }
      entityTypeMap.get(normalized).add(e.type || 'unknown');
    });
  });
  
  entityTypeMap.forEach((types, normalized) => {
    if (types.size > 1) {
      issues.push({
        type: 'conflicting_entity_types',
        severity: 'low',
        normalized,
        types: Array.from(types),
        message: `Entity "${normalized}" has conflicting types: ${Array.from(types).join(', ')}`,
        suggestion: 'Consider standardizing entity type across bookmarks'
      });
    }
  });
  
  // 6. URL changed but metadata outdated (savedAt vs extraction_timestamp)
  allBookmarks.forEach(b => {
    if (b.extraction_timestamp) {
      const extractTime = new Date(b.extraction_timestamp).getTime();
      const savedTime = new Date(b.updatedAt || b.savedAt).getTime();
      
      // If bookmark was updated after last extraction
      if (savedTime > extractTime + 60000) { // 1 minute buffer
        issues.push({
          type: 'outdated_extraction',
          severity: 'low',
          id: b.id,
          message: 'Bookmark was updated after metadata extraction',
          suggestion: 'Run AI Extract All to refresh metadata'
        });
      }
    }
  });
  
  // 7. Duplicate keywords within same bookmark
  allBookmarks.forEach(b => {
    if (b.keywords?.length > 1) {
      const normalizedKeywords = new Map();
      b.keywords.forEach(k => {
        const normalized = normalizeKeywordName(k.word);
        if (!normalizedKeywords.has(normalized)) {
          normalizedKeywords.set(normalized, []);
        }
        normalizedKeywords.get(normalized).push(k.word);
      });
      
      normalizedKeywords.forEach((originals, normalized) => {
        if (originals.length > 1) {
          issues.push({
            type: 'duplicate_keywords_in_bookmark',
            severity: 'low',
            id: b.id,
            keyword: normalized,
            duplicates: originals,
            message: `Bookmark has duplicate keyword "${normalized}": ${originals.join(', ')}`
          });
        }
      });
    }
  });
  
  return {
    timestamp,
    issues,
    summary: {
      generic_summaries: issues.filter(i => i.type === 'generic_summary').length,
      missing_entities: issues.filter(i => i.type === 'missing_technical_entities').length,
      high_confidence_alerts: issues.filter(i => i.type === 'suspicious_high_confidence').length,
      missing_summary_with_extraction: issues.filter(i => i.type === 'missing_summary_with_extraction').length,
      conflicting_entity_types: issues.filter(i => i.type === 'conflicting_entity_types').length,
      outdated_extraction: issues.filter(i => i.type === 'outdated_extraction').length,
      duplicate_keywords: issues.filter(i => i.type === 'duplicate_keywords_in_bookmark').length,
      total_issues: issues.length
    }
  };
}
