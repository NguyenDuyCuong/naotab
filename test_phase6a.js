/**
 * test_phase6a.js
 * Tests for Phase 6a: Schema v6, Universal Node Panel, and Naming Normalization
 * 
 * Tests:
 * 1. Schema v6 created with manual_definition fields
 * 2. v5→v6 migration adds manual_definition to concepts and entities
 * 3. Normalization functions work correctly
 * 4. Universal node panel handles all node types
 */

console.log('🧪 PHASE 6A TESTS STARTING...\n');

// ── TEST 1: Schema v6 Created ──
console.log('TEST 1: Schema v6 version number');
if (SCHEMA_VERSION === 6) {
  console.log('✅ SCHEMA_VERSION = 6');
} else {
  console.log('❌ SCHEMA_VERSION =', SCHEMA_VERSION, '(expected 6)');
}

// ── TEST 2: Normalization Functions ──
console.log('\nTEST 2: Normalization functions');

const normTests = [
  {
    func: 'normalizeConceptName',
    input: 'Machine Learning',
    expected: 'machine-learning'
  },
  {
    func: 'normalizeConceptName',
    input: 'Deep Neural Networks',
    expected: 'deep-neural-networks'
  },
  {
    func: 'normalizeConceptName',
    input: '  Async / Await  ',
    expected: 'async-await'
  },
  {
    func: 'normalizeEntityName',
    args: ['microsoft', 'organization'],
    expected: 'Microsoft'
  },
  {
    func: 'normalizeEntityName',
    args: ['GPT-4', 'acronym'],
    expected: 'GPT-4'
  },
  {
    func: 'normalizeKeywordName',
    input: 'Learning',
    expected: 'learning'
  },
  {
    func: 'normalizeKeywordName',
    input: '  OPTIMIZATION  ',
    expected: 'optimization'
  },
];

normTests.forEach(test => {
  let result;
  if (test.args) {
    result = window[test.func](...test.args);
  } else {
    result = window[test.func](test.input);
  }
  
  if (result === test.expected) {
    console.log(`✅ ${test.func}(${test.input || test.args.join(', ')}) = "${result}"`);
  } else {
    console.log(`❌ ${test.func}(${test.input || test.args.join(', ')}) = "${result}" (expected "${test.expected}")`);
  }
});

// ── TEST 3: V5→V6 Migration ──
console.log('\nTEST 3: V5→V6 migration adds manual_definition fields');

const v5Bookmark = {
  id: 'test-v5',
  url: 'https://example.com',
  title: 'Test V5 Bookmark',
  schemaVersion: 5,
  concepts: [
    { name: 'AI', relevance: 0.9, type: 'topic' },
    { name: 'ML', relevance: 0.8, type: 'topic' }
  ],
  entities: [
    { name: 'OpenAI', type: 'organization', value: 'company' },
    { name: 'GPT-4', type: 'product', value: 'model' }
  ]
};

const migratedBookmark = migrateBookmark(v5Bookmark);

// Check version
if (migratedBookmark.schemaVersion === 6) {
  console.log('✅ schemaVersion bumped to 6');
} else {
  console.log('❌ schemaVersion =', migratedBookmark.schemaVersion, '(expected 6)');
}

// Check concepts have manual_definition
const conceptsHaveManualDef = migratedBookmark.concepts.every(c => c.hasOwnProperty('manual_definition'));
if (conceptsHaveManualDef) {
  console.log('✅ All concepts have manual_definition field');
} else {
  console.log('❌ Some concepts missing manual_definition field');
}

// Check entities have manual_definition
const entitiesHaveManualDef = migratedBookmark.entities.every(e => e.hasOwnProperty('manual_definition'));
if (entitiesHaveManualDef) {
  console.log('✅ All entities have manual_definition field');
} else {
  console.log('❌ Some entities missing manual_definition field');
}

// Check manual_definition is null by default
const conceptsHaveNullDef = migratedBookmark.concepts.every(c => c.manual_definition === null);
const entitiesHaveNullDef = migratedBookmark.entities.every(e => e.manual_definition === null);
if (conceptsHaveNullDef && entitiesHaveNullDef) {
  console.log('✅ manual_definition fields are null by default');
} else {
  console.log('❌ manual_definition fields are not null by default');
}

// Check original data preserved
const hasAI = migratedBookmark.concepts.some(c => c.name === 'AI');
const hasOpenAI = migratedBookmark.entities.some(e => e.name === 'OpenAI');
if (hasAI && hasOpenAI) {
  console.log('✅ Original data preserved during migration');
} else {
  console.log('❌ Original data lost during migration');
}

// ── TEST 4: New Bookmark with v6 Schema ──
console.log('\nTEST 4: New bookmarks created with v6 schema');

const newBookmark = createBookmark({
  url: 'https://test.com',
  title: 'Test Bookmark',
  summary: 'A test bookmark',
  tags: ['test']
});

if (newBookmark.schemaVersion === 6) {
  console.log('✅ New bookmark has schemaVersion = 6');
} else {
  console.log('❌ New bookmark has schemaVersion =', newBookmark.schemaVersion);
}

// ── TEST 5: Universal Node Panel Functions ──
console.log('\nTEST 5: Universal node panel function signatures');

const funcsToCheck = ['openNodePanel', 'openBookmarkPanel', 'openConceptPanel', 'openEntityPanel', 'closeNodePanel'];
const allExist = funcsToCheck.every(fname => typeof window[fname] === 'function');
if (allExist) {
  console.log('✅ All universal panel functions exist:');
  funcsToCheck.forEach(fname => console.log(`   - ${fname}()`));
} else {
  const missing = funcsToCheck.filter(fname => typeof window[fname] !== 'function');
  console.log('❌ Missing functions:', missing.join(', '));
}

// ── TEST 6: Backward Compatibility ──
console.log('\nTEST 6: Backward compatibility with Phase 5');

// Create a v4 bookmark and ensure it migrates properly
const v4Bookmark = {
  id: 'test-v4',
  url: 'https://v4.example.com',
  title: 'V4 Test',
  schemaVersion: 4
};

const migratedV4 = migrateBookmark(v4Bookmark);
if (migratedV4.schemaVersion === 6) {
  console.log('✅ V4→V6 migration works');
  if (Array.isArray(migratedV4.concepts) && Array.isArray(migratedV4.entities)) {
    console.log('✅ V4→V6 migration initializes concepts and entities arrays');
  }
}

console.log('\n🎉 PHASE 6A TEST SUITE COMPLETE!');
console.log('Ready to verify in browser by:');
console.log('  1. Open extension app page');
console.log('  2. Open Developer Console (F12)');
console.log('  3. Look for test results above');
console.log('  4. Test concept/entity panels by clicking graph nodes');
