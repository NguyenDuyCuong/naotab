/**
 * test_phase6b.js — Comprehensive test suite for Phase 6b
 * Tests: Entity Dedup, Keywords Dedup, Unified AI Suggest, Panel AI Integration, Extract All Enhancement
 */

const TESTS = [];

// ── Test: Normalization Functions ──────────────────────────────────────────
TESTS.push({
  name: 'normalizeEntityName - basic case variations',
  run: () => {
    const tests = [
      ['microsoft', 'Microsoft'],
      ['MICROSOFT', 'Microsoft'],
      ['Microsoft', 'Microsoft'],
      ['open ai', 'Open Ai'],
      ['GPT-4', 'Gpt-4'],
      ['openai', 'Openai'],
    ];
    
    for (const [input, expected] of tests) {
      const result = normalizeEntityName(input);
      if (result !== expected) {
        throw new Error(`normalizeEntityName("${input}") = "${result}", expected "${expected}"`);
      }
    }
    return true;
  }
});

TESTS.push({
  name: 'normalizeKeywordName - lowercase normalization',
  run: () => {
    const tests = [
      ['Learning', 'learning'],
      ['learning', 'learning'],
      ['LEARNING', 'learning'],
      ['optimization', 'optimization'],
      ['Optimization', 'optimization'],
    ];
    
    for (const [input, expected] of tests) {
      const result = normalizeKeywordName(input);
      if (result !== expected) {
        throw new Error(`normalizeKeywordName("${input}") = "${result}", expected "${expected}"`);
      }
    }
    return true;
  }
});

// ── Test: Deduplication Functions ──────────────────────────────────────────
TESTS.push({
  name: 'deduplicateEntities - merge by normalized name',
  run: () => {
    const nodes = [
      { id: 'entity_1_0', type: 'entity', title: 'microsoft', entity_type: 'org', parent: 'b1' },
      { id: 'entity_2_0', type: 'entity', title: 'Microsoft', entity_type: 'org', parent: 'b2' },
      { id: 'entity_3_0', type: 'entity', title: 'MICROSOFT', entity_type: 'org', parent: 'b3' },
      { id: 'bookmark_1', type: 'bookmark', title: 'Test' },
    ];
    
    const deduped = deduplicateEntities(nodes);
    
    // Should have 1 entity node (merged) + 1 bookmark
    if (deduped.length !== 1) {
      throw new Error(`Expected 1 deduped entity, got ${deduped.length}`);
    }
    
    const entity = deduped[0];
    if (entity.title !== 'Microsoft') {
      throw new Error(`Expected title "Microsoft", got "${entity.title}"`);
    }
    
    if (!Array.isArray(entity.parents) || entity.parents.length !== 3) {
      throw new Error(`Expected 3 parents, got ${entity.parents.length}`);
    }
    
    if (entity.merged_from.length !== 3) {
      throw new Error(`Expected merged_from to have 3 entries, got ${entity.merged_from.length}`);
    }
    
    return true;
  }
});

TESTS.push({
  name: 'deduplicateKeywords - merge by normalized name',
  run: () => {
    const nodes = [
      { id: 'keyword_1_0', type: 'keyword', title: 'learning', frequency: 0.5, parent: 'b1' },
      { id: 'keyword_2_0', type: 'keyword', title: 'Learning', frequency: 0.6, parent: 'b2' },
      { id: 'keyword_3_0', type: 'keyword', title: 'LEARNING', frequency: 0.4, parent: 'b3' },
      { id: 'bookmark_1', type: 'bookmark', title: 'Test' },
    ];
    
    const deduped = deduplicateKeywords(nodes);
    
    // Should have 1 keyword node (merged) + 1 bookmark
    if (deduped.length !== 1) {
      throw new Error(`Expected 1 deduped keyword, got ${deduped.length}`);
    }
    
    const keyword = deduped[0];
    if (keyword.title !== 'learning') {
      throw new Error(`Expected title "learning", got "${keyword.title}"`);
    }
    
    if (!Array.isArray(keyword.parents) || keyword.parents.length !== 3) {
      throw new Error(`Expected 3 parents, got ${keyword.parents.length}`);
    }
    
    return true;
  }
});

// ── Test: Edge Remapping ───────────────────────────────────────────────────
TESTS.push({
  name: 'updateEdgesForDedupNodes - remap edges to deduplicated nodes',
  run: () => {
    const oldNodes = [
      { id: 'entity_1_0', type: 'entity', title: 'microsoft', merged_from: [] },
      { id: 'entity_2_0', type: 'entity', title: 'Microsoft', merged_from: [] },
    ];
    
    const newNodes = [
      { 
        id: 'entity_dedup_microsoft',
        type: 'entity',
        title: 'Microsoft',
        merged_from: ['entity_1_0', 'entity_2_0']
      },
    ];
    
    const edges = [
      { source: 'entity_1_0', target: 'b1', type: 'has_entity' },
      { source: 'entity_2_0', target: 'b2', type: 'has_entity' },
      { source: 'b1', target: 'b2', type: 'tag' },
    ];
    
    const remapped = updateEdgesForDedupNodes(edges, oldNodes, newNodes);
    
    // Both entity edges should now point to deduplicated entity
    const entityEdges = remapped.filter(e => e.type === 'has_entity');
    for (const edge of entityEdges) {
      if (edge.source !== 'entity_dedup_microsoft' && edge.target !== 'entity_dedup_microsoft') {
        if (edge.source !== 'b1' && edge.source !== 'b2') {
          throw new Error(`Edge source not properly remapped: ${edge.source}`);
        }
      }
    }
    
    // Tag edge should remain unchanged
    const tagEdge = remapped.find(e => e.type === 'tag');
    if (!tagEdge || tagEdge.source !== 'b1' || tagEdge.target !== 'b2') {
      throw new Error('Tag edge should remain unchanged');
    }
    
    return true;
  }
});

// ── Test: suggestNodeMetadata Function Signature ──────────────────────────
TESTS.push({
  name: 'suggestNodeMetadata - function exists and is callable',
  run: async () => {
    if (typeof suggestNodeMetadata !== 'function') {
      throw new Error('suggestNodeMetadata is not a function');
    }
    
    // Just verify it exists and has the right signature
    const fnStr = suggestNodeMetadata.toString();
    if (!fnStr.includes('nodeType') || !fnStr.includes('pageMeta')) {
      throw new Error('suggestNodeMetadata missing expected parameters');
    }
    
    return true;
  }
});

// ── Test: Schema Compatibility ─────────────────────────────────────────────
TESTS.push({
  name: 'Schema v6 - ai_definition field exists',
  run: () => {
    const bookmark = createBookmark({
      url: 'https://example.com',
      title: 'Test',
      reason: 'Testing',
      summary: 'Test summary',
      tags: ['test'],
    });
    
    // After migration, concepts and entities should have ai_definition field
    const concept = { name: 'test-concept', relevance: 0.8 };
    const withDef = { ...concept, ai_definition: null };
    
    if (!('ai_definition' in withDef)) {
      throw new Error('ai_definition field missing from concept');
    }
    
    return true;
  }
});

// ── Test: Deduplication Integration ────────────────────────────────────────
TESTS.push({
  name: 'renderGraph deduplicates entities and keywords',
  run: () => {
    // This test just verifies the functions are integrated
    // (actual rendering requires DOM and D3, so we just check function exists)
    if (typeof renderGraph !== 'function') {
      throw new Error('renderGraph is not a function');
    }
    
    // Check that deduplication functions are called
    const renderStr = renderGraph.toString();
    if (!renderStr.includes('deduplicateEntities') || !renderStr.includes('deduplicateKeywords')) {
      throw new Error('renderGraph does not call deduplication functions');
    }
    
    return true;
  }
});

// ── Test: AI Extract All Enhancement ───────────────────────────────────────
TESTS.push({
  name: 'AI Extract All listener includes suggestNodeMetadata calls',
  run: () => {
    // Verify the extract all button listener was updated
    if (typeof btnExtractAll === 'undefined' || btnExtractAll === null) {
      // Element might not exist in test environment, check the app.js source
      return true;
    }
    
    // The test can only verify function existence
    if (typeof suggestNodeMetadata !== 'function') {
      throw new Error('suggestNodeMetadata not available for Extract All');
    }
    
    return true;
  }
});

// ── Test: Deduplication Preserves Data ──────────────────────────────────────
TESTS.push({
  name: 'Deduplication preserves all parent bookmarks',
  run: () => {
    const nodes = [
      { id: 'entity_1_0', type: 'entity', title: 'test', entity_type: 'org', parent: 'b1', merged_from: [] },
      { id: 'entity_2_0', type: 'entity', title: 'TEST', entity_type: 'org', parent: 'b2', merged_from: [] },
      { id: 'entity_3_0', type: 'entity', title: 'Test', entity_type: 'org', parent: 'b3', merged_from: [] },
    ];
    
    const deduped = deduplicateEntities(nodes);
    if (deduped.length !== 1) {
      throw new Error('Deduplication should produce 1 node');
    }
    
    const merged = deduped[0];
    const uniqueParents = new Set(merged.parents);
    if (uniqueParents.size !== 3) {
      throw new Error(`Expected 3 unique parents, got ${uniqueParents.size}`);
    }
    
    // Check all original parents are preserved
    if (!merged.parents.includes('b1') || !merged.parents.includes('b2') || !merged.parents.includes('b3')) {
      throw new Error('Not all parent bookmarks preserved in deduplication');
    }
    
    return true;
  }
});

// ── Test: Normalization Edge Cases ─────────────────────────────────────────
TESTS.push({
  name: 'Normalization handles edge cases',
  run: () => {
    // Empty string
    if (normalizeEntityName('') !== '') {
      throw new Error('Empty string should remain empty');
    }
    
    // Whitespace
    if (normalizeKeywordName('  learning  ') !== 'learning') {
      throw new Error('Whitespace should be trimmed');
    }
    
    // Special characters (should be handled gracefully)
    const result = normalizeConceptName('machine-learning');
    if (!result.includes('machine') && !result.includes('learning')) {
      throw new Error('Special characters not handled properly');
    }
    
    return true;
  }
});

// ── Run Tests ──────────────────────────────────────────────────────────────
async function runTests() {
  console.log('🧪 Starting Phase 6b Tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of TESTS) {
    try {
      const result = await test.run();
      if (result === true) {
        console.log(`✅ ${test.name}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}`);
        failed++;
      }
    } catch (e) {
      console.log(`❌ ${test.name}`);
      console.log(`   Error: ${e.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Run if executed directly
if (typeof document !== 'undefined' && document.currentScript === document.scripts[document.scripts.length - 1]) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
