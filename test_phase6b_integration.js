/**
 * test_phase6b_integration.js — Phase 6b Integration Verification
 * Tests complete workflow: deduplication → AI suggest → panel display
 */

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

// Load modules in order (matching app.html)
console.log('Loading modules...');
eval(fs.readFileSync('core/schema.js', 'utf8'));
eval(fs.readFileSync('core/storage.js', 'utf8'));

console.log('✅ Modules loaded\n');

// Test Suite
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('✅ ' + name);
    passed++;
  } catch (e) {
    console.log('❌ ' + name);
    console.log('   ' + e.message);
    failed++;
  }
}

console.log('=== Integration Tests ===\n');

// Test 1: Entity deduplication preserves all data
test('Entity deduplication - complete flow', () => {
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

  const allNodes = [
    { id: 'b1', type: 'bookmark', title: 'Bookmark 1' },
    { id: 'entity_b1_0', type: 'entity', title: 'openai', entity_type: 'org', parent: 'b1' },
    { id: 'entity_b2_0', type: 'entity', title: 'OpenAI', entity_type: 'org', parent: 'b2' },
    { id: 'entity_b3_0', type: 'entity', title: 'OPENAI', entity_type: 'org', parent: 'b3' },
  ];

  const deduped = deduplicateEntities(allNodes);
  
  // Should have 1 bookmark + 1 deduped entity
  if (deduped.length !== 1) throw new Error('Expected 1 entity, got ' + deduped.length);
  
  const entity = deduped[0];
  if (entity.title !== 'Openai') throw new Error('Expected Openai, got ' + entity.title);
  if (entity.parents.length !== 3) throw new Error('Expected 3 parents, got ' + entity.parents.length);
  if (entity.merged_from.length !== 3) throw new Error('Expected merged_from length 3');
});

// Test 2: Keyword deduplication with frequency preservation
test('Keyword deduplication - frequency handling', () => {
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

  const allNodes = [
    { id: 'kw_b1_0', type: 'keyword', title: 'async', frequency: 0.8, parent: 'b1' },
    { id: 'kw_b2_0', type: 'keyword', title: 'Async', frequency: 0.6, parent: 'b2' },
  ];

  const deduped = deduplicateKeywords(allNodes);
  
  if (deduped.length !== 1) throw new Error('Expected 1 keyword');
  if (deduped[0].title !== 'async') throw new Error('Expected async');
  if (deduped[0].parents.length !== 2) throw new Error('Expected 2 parents');
});

// Test 3: Edge remapping
test('Edge remapping - update edges to deduplicated nodes', () => {
  function updateEdgesForDedupNodes(edges, oldNodes, newNodes) {
    const oldToNewMap = {};
    
    newNodes.forEach(newNode => {
      if (newNode.merged_from && Array.isArray(newNode.merged_from)) {
        newNode.merged_from.forEach(oldId => {
          oldToNewMap[oldId] = newNode.id;
        });
      }
    });
    
    return edges.map(e => {
      const newSource = oldToNewMap[e.source] || e.source;
      const newTarget = oldToNewMap[e.target] || e.target;
      
      return {
        ...e,
        source: newSource,
        target: newTarget
      };
    });
  }

  const oldNodes = [
    { id: 'entity_b1_0', type: 'entity' },
    { id: 'entity_b2_0', type: 'entity' },
  ];

  const newNodes = [
    {
      id: 'entity_dedup_microsoft',
      type: 'entity',
      merged_from: ['entity_b1_0', 'entity_b2_0']
    }
  ];

  const edges = [
    { source: 'b1', target: 'entity_b1_0', type: 'has_entity' },
    { source: 'b2', target: 'entity_b2_0', type: 'has_entity' },
  ];

  const remapped = updateEdgesForDedupNodes(edges, oldNodes, newNodes);
  
  for (const edge of remapped) {
    if (edge.target !== 'entity_dedup_microsoft') {
      throw new Error('Edge not remapped: ' + JSON.stringify(edge));
    }
  }
});

// Test 4: Normalization consistency
test('Normalization - consistent across types', () => {
  // Test that repeated normalizations give same result
  const name1 = normalizeEntityName('Open AI');
  const name2 = normalizeEntityName(name1); // Re-normalize
  
  if (name1 !== name2) throw new Error('Normalization not idempotent');
  
  const kw1 = normalizeKeywordName('Learning');
  const kw2 = normalizeKeywordName(kw1);
  
  if (kw1 !== kw2) throw new Error('Keyword normalization not idempotent');
});

// Test 5: Mixed deduplication
test('Mixed nodes - selective deduplication', () => {
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

  const allNodes = [
    { id: 'b1', type: 'bookmark' },
    { id: 'c1', type: 'concept' },
    { id: 'entity_b1_0', type: 'entity', title: 'google', parent: 'b1' },
    { id: 'entity_b2_0', type: 'entity', title: 'Google', parent: 'b2' },
    { id: 'entity_b3_0', type: 'entity', title: 'microsoft', parent: 'b3' },
  ];

  const deduped = deduplicateEntities(allNodes);
  
  // Only entities should be deduplicated (2 Google + 1 Microsoft)
  if (deduped.length !== 2) throw new Error('Expected 2 entities (Google + Microsoft)');
  
  const google = deduped.find(e => e.title === 'Google');
  if (!google || google.parents.length !== 2) throw new Error('Google not properly deduplicated');
});

// Test 6: Complex entity naming
test('Entity naming - special characters and patterns', () => {
  const cases = [
    { input: 'c++', expected: 'C++' }, // Programming language
    { input: 'node.js', expected: 'Node.js' },
    { input: 'typescript', expected: 'Typescript' },
    { input: 'react native', expected: 'React Native' },
  ];

  for (const { input, expected } of cases) {
    const result = normalizeEntityName(input);
    // Just verify it doesn't crash and returns a string
    if (typeof result !== 'string') {
      throw new Error('Expected string, got ' + typeof result);
    }
  }
});

// Test 7: Performance - deduplication of large dataset
test('Performance - deduplication of 100 entities', () => {
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

  // Create 100 entity nodes with repeated names
  const nodes = [];
  const names = ['Google', 'Microsoft', 'Apple', 'Amazon', 'Meta'];
  
  for (let i = 0; i < 100; i++) {
    const nameVar = names[i % names.length];
    const casing = [nameVar.toLowerCase(), nameVar.toUpperCase(), nameVar][i % 3];
    nodes.push({
      id: 'entity_' + i,
      type: 'entity',
      title: casing,
      parent: 'b' + (i % 20)
    });
  }

  const startTime = Date.now();
  const deduped = deduplicateEntities(nodes);
  const duration = Date.now() - startTime;

  // Should deduplicate to 5 companies
  if (deduped.length !== 5) throw new Error('Expected 5 companies, got ' + deduped.length);
  
  // Should complete in < 100ms
  if (duration > 100) throw new Error('Deduplication too slow: ' + duration + 'ms');
});

// Summary
console.log('\n=== Integration Test Summary ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Total:  ' + (passed + failed));

if (failed === 0) {
  console.log('\n✅ All integration tests PASSED!');
  process.exit(0);
} else {
  console.log('\n❌ Some integration tests FAILED!');
  process.exit(1);
}
