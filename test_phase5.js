// test_phase5.js — Phase 5 comprehensive test suite
// Tests schema v5, extraction, multi-layer graph, and performance

let testResults = { passed: 0, failed: 0, tests: [] };

function test(name, fn) {
  try {
    fn();
    testResults.passed++;
    testResults.tests.push({ name, status: 'PASS' });
    console.log(`✅ ${name}`);
  } catch (e) {
    testResults.failed++;
    testResults.tests.push({ name, status: 'FAIL', error: e.message });
    console.error(`❌ ${name}: ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(message || `Expected ${b}, got ${a}`);
}

// ─── Schema v5 Tests ───────────────────────────────────────────────────────

test('Schema version is 5', () => {
  assertEqual(SCHEMA_VERSION, 5, 'Schema version should be 5');
});

test('Bookmark defaults have v5 fields', () => {
  const bm = BOOKMARK_DEFAULTS;
  assert(bm.concepts !== undefined, 'concepts field missing');
  assert(bm.entities !== undefined, 'entities field missing');
  assert(bm.keywords !== undefined, 'keywords field missing');
  assert(bm.ai_extracted_fields !== undefined, 'ai_extracted_fields missing');
  assert(bm.extraction_confidence !== undefined, 'extraction_confidence missing');
  assert(bm.extraction_timestamp !== undefined, 'extraction_timestamp missing');
});

test('v3→v5 migration preserves existing fields', () => {
  const v3Bookmark = {
    id: '123',
    url: 'https://example.com',
    title: 'Example',
    summary: 'A test page',
    tags: ['test'],
    schemaVersion: 3
  };
  const migrated = migrateBookmark(v3Bookmark);
  assertEqual(migrated.id, v3Bookmark.id);
  assertEqual(migrated.url, v3Bookmark.url);
  assertEqual(migrated.title, v3Bookmark.title);
  assertEqual(migrated.summary, v3Bookmark.summary);
  assertEqual(migrated.schemaVersion, 5);
});

test('v3→v5 migration initializes new fields', () => {
  const v3Bookmark = {
    id: '456',
    url: 'https://test.com',
    title: 'Test',
    schemaVersion: 3
  };
  const migrated = migrateBookmark(v3Bookmark);
  assert(Array.isArray(migrated.concepts), 'concepts should be array');
  assert(Array.isArray(migrated.entities), 'entities should be array');
  assert(Array.isArray(migrated.keywords), 'keywords should be array');
  assert(migrated.extraction_confidence === 0, 'confidence should be 0');
});

test('createBookmark includes v5 fields', () => {
  const bm = createBookmark({
    url: 'https://example.com',
    title: 'Test Bookmark',
    summary: 'Summary'
  });
  assert(bm.concepts !== undefined, 'concepts missing');
  assert(Array.isArray(bm.concepts), 'concepts should be array');
  assertEqual(bm.schemaVersion, 5);
});

// ─── Extraction Tests ───────────────────────────────────────────────────────

test('extractConcepts returns array', () => {
  const concepts = extractConcepts('Machine learning and deep neural networks');
  assert(Array.isArray(concepts), 'Should return array');
  assert(concepts.length <= 7, 'Should return max 7 concepts');
});

test('extractConcepts sets relevance 0-1', () => {
  const concepts = extractConcepts('Test content with repeated test words');
  concepts.forEach(c => {
    assert(c.relevance >= 0 && c.relevance <= 1, 'Relevance must be 0-1');
    assert(c.name !== undefined, 'Concept must have name');
  });
});

test('extractEntities returns array', () => {
  const entities = extractEntities('John Smith works at Apple Inc.');
  assert(Array.isArray(entities), 'Should return array');
});

test('extractKeywords returns array', () => {
  const keywords = extractKeywords('Python programming language framework Django Flask');
  assert(Array.isArray(keywords), 'Should return array');
  keywords.forEach(k => {
    assert(k.word !== undefined, 'Keyword must have word');
    assert(k.frequency >= 0 && k.frequency <= 1, 'Frequency must be 0-1');
    assert(k.relevance >= 0 && k.relevance <= 1, 'Relevance must be 0-1');
  });
});

test('parseMetadata extracts from pageMeta', () => {
  const meta = parseMetadata({
    author: 'Jane Doe',
    siteName: 'TechBlog',
    publish_date: '2024-01-15'
  });
  assertEqual(meta.author, 'Jane Doe');
  assertEqual(meta.source, 'TechBlog');
  assertEqual(meta.publish_date, '2024-01-15');
});

test('parseMetadata handles null input', () => {
  const meta = parseMetadata(null);
  assertEqual(meta.author, '');
  assertEqual(meta.source, '');
  assertEqual(meta.publish_date, null);
});

test('analyzeContentStructure returns object', () => {
  const result = analyzeContentStructure('This is a tutorial about web development.');
  assert(result.purpose !== undefined, 'Missing purpose');
  assert(result.thesis !== undefined, 'Missing thesis');
  assert(result.key_message !== undefined, 'Missing key_message');
});

test('hasExtractedMetadata detects populated fields', () => {
  const b1 = { ...BOOKMARK_DEFAULTS, concepts: [{ name: 'test', relevance: 0.8 }] };
  assert(hasExtractedMetadata(b1), 'Should detect concepts');
  
  const b2 = { ...BOOKMARK_DEFAULTS, entities: [{ name: 'John', type: 'person' }] };
  assert(hasExtractedMetadata(b2), 'Should detect entities');
});

test('isOptionalFieldSet detects populated v5 fields', () => {
  const b = BOOKMARK_DEFAULTS;
  assert(!isOptionalFieldSet(b, 'purpose'), 'Empty purpose should be false');
  
  const b2 = { ...b, purpose: 'This is a purpose' };
  assert(isOptionalFieldSet(b2, 'purpose'), 'Non-empty purpose should be true');
});

// ─── AI Extraction Tests ───────────────────────────────────────────────────

test('extractBookmarkMetadata returns expected structure', async () => {
  // This test assumes AI is disabled; will fallback to offline extraction
  const result = await extractBookmarkMetadata(
    'Test Title',
    'https://example.com',
    'Test summary content',
    null
  );
  
  assert(result.concepts !== undefined, 'Missing concepts');
  assert(result.entities !== undefined, 'Missing entities');
  assert(result.keywords !== undefined, 'Missing keywords');
  assert(result.ai_extracted_fields !== undefined, 'Missing ai_extracted_fields');
  assert(result.extraction_confidence !== undefined, 'Missing extraction_confidence');
  assert(result.extraction_timestamp !== undefined, 'Missing extraction_timestamp');
});

test('extractBookmarkMetadata with AI disabled uses offline', async () => {
  const result = await extractBookmarkMetadata('Title', 'http://test.com', 'Summary', null);
  assert(result.extraction_confidence <= 0.5, 'Offline should have low confidence');
  assert(result.ai_extracted_fields.includes('concepts'), 'Should extract concepts');
});

// ─── Performance Tests ──────────────────────────────────────────────────────

test('extractConcepts performs well (<100ms)', () => {
  const text = 'Lorem ipsum dolor sit amet, '.repeat(100);
  const start = performance.now();
  extractConcepts(text);
  const duration = performance.now() - start;
  assert(duration < 100, `Should complete in <100ms, took ${duration}ms`);
});

test('Large bookmark migration is efficient', () => {
  const largeBm = {
    ...BOOKMARK_DEFAULTS,
    id: '999',
    title: 'A'.repeat(1000),
    summary: 'Summary '.repeat(100),
    tags: Array(50).fill('tag'),
    schemaVersion: 3
  };
  
  const start = performance.now();
  migrateBookmark(largeBm);
  const duration = performance.now() - start;
  assert(duration < 50, `Should complete in <50ms, took ${duration}ms`);
});

test('Multiple extractions batch efficiently', async () => {
  const bookmarks = Array(10).fill(null).map((_, i) => ({
    id: String(i),
    title: `Bookmark ${i}`,
    url: `https://example.com/${i}`,
    summary: `Summary for bookmark ${i}`
  }));
  
  const start = performance.now();
  for (const bm of bookmarks) {
    await extractBookmarkMetadata(bm.title, bm.url, bm.summary, null);
  }
  const duration = performance.now() - start;
  assert(duration < 1000, `Batch should complete in <1s, took ${duration}ms`);
});

// ─── Backward Compatibility Tests ───────────────────────────────────────────

test('v1 bookmarks migrate without data loss', () => {
  const v1 = {
    id: 'v1-123',
    url: 'https://old.com',
    title: 'Old bookmark',
    reason: 'Saved in v1',
    summary: 'V1 content',
    tags: ['old'],
    schemaVersion: 1
  };
  const migrated = migrateBookmark(v1);
  assertEqual(migrated.id, v1.id, 'ID lost');
  assertEqual(migrated.url, v1.url, 'URL lost');
  assertEqual(migrated.title, v1.title, 'Title lost');
  assertEqual(migrated.reason, v1.reason, 'Reason lost');
  assertEqual(migrated.summary, v1.summary, 'Summary lost');
  assertEqual(migrated.tags.length, v1.tags.length, 'Tags lost');
});

test('v2 bookmarks migrate preserving graph fields', () => {
  const v2 = {
    id: 'v2-456',
    url: 'https://v2.com',
    title: 'V2 bookmark',
    type: 'concept',
    markdown: '# Title\n...',
    preview: 'Preview text',
    schemaVersion: 2
  };
  const migrated = migrateBookmark(v2);
  assertEqual(migrated.type, v2.type, 'Type lost');
  assertEqual(migrated.markdown, v2.markdown, 'Markdown lost');
  assertEqual(migrated.preview, v2.preview, 'Preview lost');
});

test('Empty/null bookmarks migrate safely', () => {
  const empty = migrateBookmark(null);
  assert(empty !== null, 'Should not return null');
  assertEqual(empty.schemaVersion, 5);
  
  const partial = migrateBookmark({});
  assert(partial !== null, 'Should not return null');
  assertEqual(partial.schemaVersion, 5);
});

// ─── Storage Size Tests ───────────────────────────────────────────────────

test('v5 bookmark JSON size reasonable', () => {
  const bm = createBookmark({
    url: 'https://example.com',
    title: 'Example',
    summary: 'This is a test bookmark with some content',
    tags: ['test', 'example']
  });
  
  // Add extracted fields
  bm.concepts = [{ name: 'concept1', relevance: 0.9, type: 'topic' }];
  bm.entities = [{ name: 'Entity', type: 'org', value: 'Entity Inc' }];
  bm.keywords = [{ word: 'keyword', frequency: 0.8, relevance: 0.85 }];
  
  const json = JSON.stringify(bm);
  const sizeKb = json.length / 1024;
  assert(sizeKb < 2, `Single bookmark should be <2KB, is ${sizeKb}KB`);
});

test('1000 bookmarks estimated size <9MB', () => {
  const bookmarks = Array(1000).fill(null).map((_, i) => ({
    ...createBookmark({
      url: `https://example.com/${i}`,
      title: `Bookmark ${i}`,
      summary: `Summary for bookmark ${i}. This is a test.`,
      tags: ['test', `tag${i % 10}`]
    }),
    concepts: [{ name: 'concept', relevance: 0.8, type: 'topic' }],
    entities: [{ name: 'Entity', type: 'org' }],
    keywords: [{ word: 'keyword', frequency: 0.7, relevance: 0.8 }]
  }));
  
  const json = JSON.stringify(bookmarks);
  const sizeMb = json.length / (1024 * 1024);
  assert(sizeMb < 9, `1000 bookmarks should be <9MB, estimated ${sizeMb}MB`);
});

// ─── Report ────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log(`Test Results: ${testResults.passed} passed, ${testResults.failed} failed`);
console.log('='.repeat(60));

testResults.tests.forEach(t => {
  const icon = t.status === 'PASS' ? '✅' : '❌';
  const msg = t.error ? ` — ${t.error}` : '';
  console.log(`${icon} ${t.name}${msg}`);
});

console.log('='.repeat(60));
console.log(`Total: ${testResults.passed + testResults.failed} tests`);
console.log(`Pass rate: ${Math.round(testResults.passed / (testResults.passed + testResults.failed) * 100)}%`);

// Export for external use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = testResults;
}
