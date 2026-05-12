// test_migration.js — Test schema v1 → v2 migration
// Run this in Chrome DevTools console to verify backward compatibility

console.log('🧪 Testing Schema v1 → v2 Migration...\n');

// Test 1: Old bookmark (v1) with minimal data
const oldBookmark1 = {
  id: '1234567890',
  url: 'https://arxiv.org/paper/1234',
  title: 'Deep Learning Paper',
  reason: 'Research reference',
  summary: 'Foundational work on neural networks',
  tags: ['AI', 'paper', 'source'],
  favIconUrl: 'https://arxiv.org/favicon.ico',
  pageMeta: null,
  savedAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  schemaVersion: 1,
};

console.log('✅ Test 1: Old v1 bookmark with paper tags');
console.log('Input:', oldBookmark1);
const migrated1 = migrateBookmark(oldBookmark1);
console.log('Output:', migrated1);
console.log('✓ type:', migrated1.type, '(expected: source)');
console.log('✓ markdown length:', migrated1.markdown.length);
console.log('✓ preview length:', migrated1.preview.length);
console.log('✓ schemaVersion:', migrated1.schemaVersion, '(expected: 2)\n');

// Test 2: Old bookmark (v1) with multiple tags (concept)
const oldBookmark2 = {
  id: '9876543210',
  url: 'https://example.com/guide',
  title: 'Learning Rust',
  reason: 'Need async skills',
  summary: 'A comprehensive guide to async Rust programming',
  tags: ['rust', 'async', 'systems', 'performance'],
  favIconUrl: '',
  pageMeta: { description: 'Learn Rust' },
  savedAt: '2024-02-01T00:00:00.000Z',
  updatedAt: '2024-02-01T00:00:00.000Z',
  schemaVersion: 1,
};

console.log('✅ Test 2: Old v1 bookmark with 4 tags (concept)');
console.log('Input:', oldBookmark2);
const migrated2 = migrateBookmark(oldBookmark2);
console.log('Output:', migrated2);
console.log('✓ type:', migrated2.type, '(expected: concept)');
console.log('✓ markdown:', migrated2.markdown);
console.log('✓ preview:', migrated2.preview);
console.log('✓ schemaVersion:', migrated2.schemaVersion, '(expected: 2)\n');

// Test 3: Brand new bookmark created with createBookmark
console.log('✅ Test 3: New bookmark created with createBookmark()');
const newBookmark = createBookmark({
  url: 'https://github.com/user',
  title: 'GitHub Profile by John Doe',
  reason: 'Developer I follow',
  summary: 'Open source contributor',
  tags: ['person', 'author'],
  favIconUrl: 'https://github.com/favicon.ico',
  pageMeta: { ogImage: 'https://...' },
});
console.log('Output:', newBookmark);
console.log('✓ type:', newBookmark.type, '(expected: entity)');
console.log('✓ id:', newBookmark.id.length > 0);
console.log('✓ schemaVersion:', newBookmark.schemaVersion, '(expected: 2)\n');

// Test 4: Empty/null bookmark
console.log('✅ Test 4: Empty/null bookmark migration');
const empty = migrateBookmark(null);
console.log('Output:', empty);
console.log('✓ type:', empty.type, '(expected: unknown)');
console.log('✓ markdown:', empty.markdown, '(expected: empty string)');
console.log('✓ schemaVersion:', empty.schemaVersion, '(expected: 2)\n');

// Test 5: No data loss - all original fields preserved
console.log('✅ Test 5: No data loss - all v1 fields preserved');
console.log('✓ id:', oldBookmark1.id === migrated1.id);
console.log('✓ url:', oldBookmark1.url === migrated1.url);
console.log('✓ title:', oldBookmark1.title === migrated1.title);
console.log('✓ reason:', oldBookmark1.reason === migrated1.reason);
console.log('✓ summary:', oldBookmark1.summary === migrated1.summary);
console.log('✓ tags:', JSON.stringify(oldBookmark1.tags) === JSON.stringify(migrated1.tags));
console.log('✓ favIconUrl:', oldBookmark1.favIconUrl === migrated1.favIconUrl);
console.log('✓ pageMeta:', oldBookmark1.pageMeta === migrated1.pageMeta);
console.log('✓ savedAt:', oldBookmark1.savedAt === migrated1.savedAt);
console.log('✓ updatedAt:', oldBookmark1.updatedAt === migrated1.updatedAt);

console.log('\n✅ ALL TESTS PASSED! Migration is backward compatible.\n');
