// Test Phase 6b - Normalization and Deduplication Functions
const fs = require('fs');

// Mock globals
global.chrome = {
  storage: {
    local: {
      get: (keys, cb) => cb({}),
      set: (items, cb) => cb && cb()
    }
  }
};

// Load schema.js
eval(fs.readFileSync('core/schema.js', 'utf8'));
console.log('Loaded schema module\n');

// Test Suite
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('PASS: ' + name);
    passed++;
  } catch (e) {
    console.log('FAIL: ' + name);
    console.log('  Error: ' + e.message);
    failed++;
  }
}

// ========== NORMALIZATION TESTS ==========
console.log('=== Normalization Tests ===\n');

test('normalizeEntityName - lowercase', () => {
  const result = normalizeEntityName('microsoft');
  if (result !== 'Microsoft') throw new Error('Expected Microsoft, got ' + result);
});

test('normalizeEntityName - uppercase', () => {
  const result = normalizeEntityName('MICROSOFT');
  if (result !== 'Microsoft') throw new Error('Expected Microsoft, got ' + result);
});

test('normalizeEntityName - mixed case', () => {
  const result = normalizeEntityName('MicroSoft');
  if (result !== 'Microsoft') throw new Error('Expected Microsoft, got ' + result);
});

test('normalizeKeywordName - capitalize', () => {
  const result = normalizeKeywordName('Learning');
  if (result !== 'learning') throw new Error('Expected learning, got ' + result);
});

test('normalizeKeywordName - uppercase', () => {
  const result = normalizeKeywordName('LEARNING');
  if (result !== 'learning') throw new Error('Expected learning, got ' + result);
});

test('normalizeKeywordName - already lowercase', () => {
  const result = normalizeKeywordName('learning');
  if (result !== 'learning') throw new Error('Expected learning, got ' + result);
});

test('normalizeConceptName - spaces to dashes', () => {
  const result = normalizeConceptName('Machine Learning');
  if (result !== 'machine-learning') throw new Error('Expected machine-learning, got ' + result);
});

test('normalizeConceptName - multiple spaces', () => {
  const result = normalizeConceptName('deep neural networks');
  if (result !== 'deep-neural-networks') throw new Error('Expected deep-neural-networks, got ' + result);
});

test('normalizeEntityName - empty string', () => {
  const result = normalizeEntityName('');
  if (result !== '') throw new Error('Expected empty string');
});

test('normalizeKeywordName - whitespace trim', () => {
  const result = normalizeKeywordName('  learning  ');
  if (result !== 'learning') throw new Error('Expected learning, got "' + result + '"');
});

// ========== DEDUPLICATION LOGIC TESTS ==========
console.log('\n=== Deduplication Logic Tests ===\n');

// Copy deduplication functions
function deduplicateEntities(allNodes) {
  const entityMap = {};
  const entityNodes = allNodes.filter(n => n.type === 'entity');
  
  entityNodes.forEach(node => {
    const normalized = normalizeEntityName(node.title, node.entity_type);
    if (!entityMap[normalized]) {
      entityMap[normalized] = {
        node: {
          ...node,
          title: normalized,
          merged_from: [],
          id: 'entity_dedup_' + normalized.replace(/\s+/g, '_').toLowerCase()
        },
        parents: new Set()
      };
    }
    if (node.parent) {
      entityMap[normalized].parents.add(node.parent);
      entityMap[normalized].node.merged_from.push(node.id);
    }
  });
  
  return Object.values(entityMap).map(e => ({
    ...e.node,
    parents: Array.from(e.parents)
  }));
}

function deduplicateKeywords(allNodes) {
  const keywordMap = {};
  const keywordNodes = allNodes.filter(n => n.type === 'keyword');
  
  keywordNodes.forEach(node => {
    const normalized = normalizeKeywordName(node.title);
    if (!keywordMap[normalized]) {
      keywordMap[normalized] = {
        node: {
          ...node,
          title: normalized,
          merged_from: [],
          id: 'keyword_dedup_' + normalized
        },
        parents: new Set()
      };
    }
    if (node.parent) {
      keywordMap[normalized].parents.add(node.parent);
      keywordMap[normalized].node.merged_from.push(node.id);
    }
  });
  
  return Object.values(keywordMap).map(k => ({
    ...k.node,
    parents: Array.from(k.parents)
  }));
}

test('deduplicateEntities - basic 3-way merge', () => {
  const nodes = [
    { id: 'entity_1_0', type: 'entity', title: 'microsoft', entity_type: 'org', parent: 'b1' },
    { id: 'entity_2_0', type: 'entity', title: 'Microsoft', entity_type: 'org', parent: 'b2' },
    { id: 'entity_3_0', type: 'entity', title: 'MICROSOFT', entity_type: 'org', parent: 'b3' },
  ];
  
  const deduped = deduplicateEntities(nodes);
  if (deduped.length !== 1) throw new Error('Expected 1 entity, got ' + deduped.length);
  if (deduped[0].title !== 'Microsoft') throw new Error('Expected Microsoft, got ' + deduped[0].title);
  if (deduped[0].parents.length !== 3) throw new Error('Expected 3 parents, got ' + deduped[0].parents.length);
});

test('deduplicateEntities - preserves merged_from', () => {
  const nodes = [
    { id: 'entity_1_0', type: 'entity', title: 'gpt', entity_type: 'product', parent: 'b1' },
    { id: 'entity_2_0', type: 'entity', title: 'GPT', entity_type: 'product', parent: 'b2' },
  ];
  
  const deduped = deduplicateEntities(nodes);
  if (!deduped[0].merged_from || deduped[0].merged_from.length !== 2) {
    throw new Error('merged_from not properly preserved');
  }
});

test('deduplicateKeywords - basic 2-way merge', () => {
  const nodes = [
    { id: 'kw_1_0', type: 'keyword', title: 'learning', frequency: 0.5, parent: 'b1' },
    { id: 'kw_2_0', type: 'keyword', title: 'Learning', frequency: 0.6, parent: 'b2' },
  ];
  
  const deduped = deduplicateKeywords(nodes);
  if (deduped.length !== 1) throw new Error('Expected 1 keyword, got ' + deduped.length);
  if (deduped[0].title !== 'learning') throw new Error('Expected learning, got ' + deduped[0].title);
  if (deduped[0].parents.length !== 2) throw new Error('Expected 2 parents, got ' + deduped[0].parents.length);
});

test('deduplicateKeywords - preserves all parents', () => {
  const nodes = [
    { id: 'kw_1_0', type: 'keyword', title: 'optimization', frequency: 0.5, parent: 'b1' },
    { id: 'kw_2_0', type: 'keyword', title: 'Optimization', frequency: 0.6, parent: 'b2' },
    { id: 'kw_3_0', type: 'keyword', title: 'OPTIMIZATION', frequency: 0.4, parent: 'b3' },
  ];
  
  const deduped = deduplicateKeywords(nodes);
  if (!deduped[0].parents.includes('b1') || !deduped[0].parents.includes('b2') || !deduped[0].parents.includes('b3')) {
    throw new Error('Not all parent bookmarks preserved');
  }
});

test('deduplicateEntities - different entities not merged', () => {
  const nodes = [
    { id: 'entity_1_0', type: 'entity', title: 'google', entity_type: 'org', parent: 'b1' },
    { id: 'entity_2_0', type: 'entity', title: 'microsoft', entity_type: 'org', parent: 'b2' },
  ];
  
  const deduped = deduplicateEntities(nodes);
  if (deduped.length !== 2) throw new Error('Expected 2 entities, got ' + deduped.length);
});

test('deduplicateKeywords - mixed with non-keywords', () => {
  const nodes = [
    { id: 'kw_1_0', type: 'keyword', title: 'learning', frequency: 0.5, parent: 'b1' },
    { id: 'entity_1_0', type: 'entity', title: 'test', entity_type: 'org', parent: 'b1' },
  ];
  
  const deduped = deduplicateKeywords(nodes);
  if (deduped.length !== 1) throw new Error('Expected 1 keyword (entity should be filtered), got ' + deduped.length);
});

// ========== SUMMARY ==========
console.log('\n=== Test Summary ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Total:  ' + (passed + failed));

if (failed === 0) {
  console.log('\nAll tests PASSED!');
  process.exit(0);
} else {
  console.log('\nSome tests FAILED!');
  process.exit(1);
}
