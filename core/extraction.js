// extraction.js — Knowledge extraction engine
// Provides helper functions for extracting concepts, entities, keywords from content

/**
 * extractConcepts(text)
 * Extract high-level concepts from text using frequency + importance heuristics.
 * Returns array of {name, relevance (0-1), type}.
 */
function extractConcepts(text) {
  if (!text || typeof text !== 'string') return [];
  
  const concepts = [];
  
  // Extract noun phrases (2-3 word sequences)
  const phrases = extractPhrases(text, 2, 3);
  
  // Filter for content-rich phrases
  const filtered = phrases.filter(p => {
    const word = p.toLowerCase();
    return !isStopWord(word) && word.length > 3;
  });
  
  // Calculate relevance based on frequency
  const freq = {};
  filtered.forEach(p => {
    freq[p] = (freq[p] || 0) + 1;
  });
  
  // Take top 7 concepts
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([name, count]) => ({
      name,
      relevance: Math.min(1, count / 5), // normalize to 0-1
      type: detectConceptType(name)
    }));
  
  return top;
}

/**
 * extractEntities(text)
 * Extract named entities (people, orgs, places) using heuristics.
 * Returns array of {name, type ('person'|'org'|'place'|'product'), value}.
 */
function extractEntities(text) {
  if (!text || typeof text !== 'string') return [];
  
  const entities = [];
  
  // Capitalized phrases (likely proper nouns)
  const capitalizedPhrases = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  
  const freq = {};
  capitalizedPhrases.forEach(p => {
    if (!isStopWord(p) && p.length > 2) {
      freq[p] = (freq[p] || 0) + 1;
    }
  });
  
  // Take top entities and classify them
  Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([name, count]) => {
      entities.push({
        name,
        type: detectEntityType(name, text),
        value: name
      });
    });
  
  return entities;
}

/**
 * extractKeywords(text)
 * Extract important keywords and technical terms.
 * Returns array of {word, frequency (0-1), relevance (0-1)}.
 */
function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  
  // Split into words and filter
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const filtered = words.filter(w => !isStopWord(w) && w.length > 3);
  
  // Calculate frequency
  const freq = {};
  filtered.forEach(w => {
    freq[w] = (freq[w] || 0) + 1;
  });
  
  const maxFreq = Math.max(...Object.values(freq), 1);
  
  // Top 10 keywords
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({
      word,
      frequency: count / maxFreq,
      relevance: calculateKeywordRelevance(word, text)
    }));
  
  return top;
}

/**
 * parseMetadata(pageMeta)
 * Extract publication metadata from page meta tags.
 * Returns {publish_date, author, source}.
 */
function parseMetadata(pageMeta) {
  if (!pageMeta) {
    return { publish_date: null, author: '', source: '' };
  }
  
  return {
    publish_date: pageMeta.publish_date || pageMeta.publishDate || pageMeta.date || null,
    author: pageMeta.author || pageMeta.creator || '',
    source: pageMeta.siteName || pageMeta.publisher || ''
  };
}

/**
 * analyzeContentStructure(text)
 * Analyze overall content structure and extract key messages.
 * Returns {purpose, thesis, key_message}.
 */
function analyzeContentStructure(text) {
  if (!text || typeof text !== 'string') {
    return { purpose: '', thesis: '', key_message: '' };
  }
  
  // Extract first meaningful paragraph (usually intro/purpose)
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20);
  const firstPara = paragraphs[0] || '';
  
  // Extract first 1-2 sentences for thesis
  const sentences = text.match(/[^.!?]*[.!?]+/g) || [];
  const thesis = sentences[0] ? sentences[0].trim() : '';
  
  // Determine purpose based on content patterns
  const purpose = detectContentPurpose(text);
  
  // Extract key message (usually the title or first sentence)
  const keyMessage = extractKeyMessage(text, thesis);
  
  return {
    purpose,
    thesis: thesis.substring(0, 200),
    key_message: keyMessage.substring(0, 100)
  };
}

// ─────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────

/**
 * extractPhrases(text, minWords, maxWords)
 * Extract n-gram phrases from text.
 */
function extractPhrases(text, minWords, maxWords) {
  if (!text) return [];
  const words = text.match(/\b\w+\b/g) || [];
  const phrases = [];
  
  for (let i = 0; i < words.length; i++) {
    for (let len = minWords; len <= maxWords && i + len <= words.length; len++) {
      phrases.push(words.slice(i, i + len).join(' '));
    }
  }
  
  return phrases;
}

/**
 * isStopWord(word)
 * Check if word is a common stop word.
 */
function isStopWord(word) {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'can', 'could', 'should', 'would', 'may', 'might', 'must', 'shall',
    'will', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their',
    'this', 'that', 'these', 'those', 'in', 'on', 'at', 'to', 'from',
    'for', 'of', 'with', 'by', 'about', 'as', 'if', 'then', 'so', 'what',
    'which', 'where', 'when', 'why', 'how', 'all', 'each', 'every',
    'both', 'more', 'most', 'other', 'some', 'any', 'several', 'one',
    'two', 'three', 'first', 'second', 'third', 'new', 'old', 'just'
  ]);
  return stopwords.has(word.toLowerCase());
}

/**
 * detectConceptType(phrase)
 * Classify a concept phrase.
 */
function detectConceptType(phrase) {
  const lower = phrase.toLowerCase();
  
  if (lower.includes('pattern') || lower.includes('methodology') || lower.includes('approach')) {
    return 'methodology';
  }
  if (lower.includes('framework') || lower.includes('architecture') || lower.includes('design')) {
    return 'architecture';
  }
  if (lower.includes('principle') || lower.includes('rule') || lower.includes('law')) {
    return 'principle';
  }
  if (lower.includes('theory') || lower.includes('concept') || lower.includes('idea')) {
    return 'theory';
  }
  
  return 'topic';
}

/**
 * detectEntityType(name, context)
 * Classify an entity.
 */
function detectEntityType(name, context) {
  const lower = name.toLowerCase();
  const contextLower = (context || '').toLowerCase();
  
  // Person indicators
  if (contextLower.includes(lower + ' is ') || 
      contextLower.includes(lower + ' wrote') ||
      contextLower.includes(lower + ' created')) {
    return 'person';
  }
  
  // Org indicators
  if (lower.includes('inc') || lower.includes('llc') || lower.includes('corp') ||
      lower.includes('company') || lower.includes('foundation')) {
    return 'org';
  }
  
  // Place indicators
  if (lower.match(/\b(country|city|town|state|province|region)\b/)) {
    return 'place';
  }
  
  // Product indicators
  if (lower.match(/\b(os|app|tool|service|platform)\b/) ||
      contextLower.includes(lower + ' is a')) {
    return 'product';
  }
  
  return 'org'; // default
}

/**
 * calculateKeywordRelevance(word, text)
 * Calculate keyword relevance based on position and context.
 */
function calculateKeywordRelevance(word, text) {
  if (!text) return 0;
  
  // Frequency in text
  const regex = new RegExp('\\b' + word + '\\b', 'gi');
  const matches = text.match(regex) || [];
  const frequency = Math.min(matches.length / 5, 1); // normalize
  
  // Position (appearance near start is more relevant)
  const pos = text.toLowerCase().indexOf(word.toLowerCase());
  const textLength = text.length;
  const positionBoost = Math.max(0, 1 - (pos / textLength) * 0.5);
  
  return Math.min(1, (frequency + positionBoost) / 2);
}

/**
 * detectContentPurpose(text)
 * Detect the purpose/category of content.
 */
function detectContentPurpose(text) {
  if (!text) return '';
  
  const lower = text.toLowerCase();
  
  if (lower.includes('tutorial') || lower.includes('how to') || lower.includes('guide')) {
    return 'Educational';
  }
  if (lower.includes('research') || lower.includes('study') || lower.includes('findings')) {
    return 'Research';
  }
  if (lower.includes('analysis') || lower.includes('overview') || lower.includes('review')) {
    return 'Analysis';
  }
  if (lower.includes('news') || lower.includes('announcement') || lower.includes('release')) {
    return 'News';
  }
  if (lower.includes('documentation') || lower.includes('reference') || lower.includes('spec')) {
    return 'Documentation';
  }
  
  return 'Article';
}

/**
 * extractKeyMessage(text, thesis)
 * Extract the most important single message.
 */
function extractKeyMessage(text, thesis) {
  // Use thesis if available
  if (thesis && thesis.length > 10) {
    return thesis.substring(0, 100);
  }
  
  // Otherwise take first 100 chars of text
  return text.substring(0, 100);
}
