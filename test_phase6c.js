// test_phase6c.js — Health & Lint Check Tests
// Run via Chrome DevTools console in app.html

console.log('🧪 Phase 6c Test Suite Started\n');

const testResults = [];

function test(name, condition) {
  const pass = condition;
  testResults.push({ name, pass });
  console.log(pass ? '✅' : '❌', name);
  if (!pass) console.log('   ^ FAILED');
}

async function runTests() {
  console.log('\n=== HEALTH CHECK TESTS ===\n');
  
  // Test 1: Empty bookmarks detection
  const testBookmark1 = {
    id: 'test1',
    url: 'https://example.com',
    title: '',
    summary: '',
    reason: '',
    concepts: [],
    entities: [],
    keywords: []
  };
  
  let report = await runHealthCheck([testBookmark1]);
  test('Health: Detects empty bookmarks', 
    report.issues.some(i => i.type === 'empty_bookmark'));
  test('Health: Empty bookmark has high severity',
    report.issues.find(i => i.type === 'empty_bookmark')?.severity === 'high');
  
  // Test 2: Missing URL detection
  const testBookmark2 = {
    id: 'test2',
    url: '',
    title: 'Valid Title',
    summary: 'Has content'
  };
  
  report = await runHealthCheck([testBookmark2]);
  test('Health: Detects missing URLs',
    report.issues.some(i => i.type === 'missing_url'));
  
  // Test 3: No metadata detection
  const testBookmark3 = {
    id: 'test3',
    url: 'https://example.com',
    title: 'Title',
    summary: 'Summary',
    concepts: [],
    entities: [],
    keywords: []
  };
  
  report = await runHealthCheck([testBookmark3]);
  test('Health: Detects missing metadata',
    report.issues.some(i => i.type === 'no_metadata'));
  
  // Test 4: Inconsistent concept naming
  const testBookmark4 = {
    id: 'test4',
    url: 'https://example.com',
    title: 'Title',
    summary: 'Summary',
    concepts: [
      { name: 'Machine Learning', relevance: 0.8 },
      { name: 'machine-learning', relevance: 0.7 },
      { name: 'Machine learning', relevance: 0.6 }
    ],
    entities: [],
    keywords: []
  };
  
  report = await runHealthCheck([testBookmark4]);
  test('Health: Detects inconsistent concept naming',
    report.issues.some(i => i.type === 'inconsistent_concept_naming'));
  test('Health: Inconsistent concepts have medium severity',
    report.issues.find(i => i.type === 'inconsistent_concept_naming')?.severity === 'medium');
  
  // Test 5: Inconsistent entity naming
  const testBookmark5 = {
    id: 'test5',
    url: 'https://example.com',
    title: 'Title',
    summary: 'Summary',
    concepts: [],
    entities: [
      { name: 'OpenAI', type: 'organization' },
      { name: 'openai', type: 'organization' },
      { name: 'OPENAI', type: 'organization' }
    ],
    keywords: []
  };
  
  report = await runHealthCheck([testBookmark5]);
  test('Health: Detects inconsistent entity naming',
    report.issues.some(i => i.type === 'inconsistent_entity_naming'));
  
  // Test 6: Low confidence extraction
  const testBookmark6 = {
    id: 'test6',
    url: 'https://example.com',
    title: 'Title',
    summary: 'Summary',
    extraction_confidence: 0.45,
    concepts: [{ name: 'test' }],
    entities: [],
    keywords: []
  };
  
  report = await runHealthCheck([testBookmark6]);
  test('Health: Detects low confidence extraction',
    report.issues.some(i => i.type === 'low_confidence_extraction'));
  
  // Test 7: Stale metadata detection
  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  const testBookmark7 = {
    id: 'test7',
    url: 'https://example.com',
    title: 'Title',
    summary: 'Summary',
    extraction_timestamp: thirtyOneDaysAgo,
    concepts: [{ name: 'test' }],
    entities: [],
    keywords: []
  };
  
  report = await runHealthCheck([testBookmark7]);
  test('Health: Detects stale metadata',
    report.issues.some(i => i.type === 'stale_metadata'));
  
  // Test 8: Summary counts
  test('Health: Summary counts match issues',
    report.summary.total_issues === report.issues.length);
  
  // Test 9: Large collection performance
  const largeCollection = Array.from({ length: 100 }, (_, i) => ({
    id: `large-${i}`,
    url: `https://example.com/${i}`,
    title: `Title ${i}`,
    summary: i % 2 === 0 ? 'Has summary' : '',
    concepts: i % 3 === 0 ? [{ name: 'test' }] : [],
    entities: [],
    keywords: []
  }));
  
  const startTime = performance.now();
  report = await runHealthCheck(largeCollection);
  const endTime = performance.now();
  
  test('Health: Processes 100 bookmarks < 1 second',
    endTime - startTime < 1000);
  test('Health: Large collection has reasonable issues',
    report.issues.length > 0 && report.issues.length < 200);
  
  console.log('\n=== LINT CHECK TESTS ===\n');
  
  const settings = await getSettings();
  
  if (!settings.aiEnabled) {
    console.log('⚠️  Skipping lint tests: AI not enabled in Settings');
    console.log('   To enable AI for testing:');
    console.log('   1. Open popup.html');
    console.log('   2. Go to Settings tab');
    console.log('   3. Enable AI and select a provider');
  } else {
    // Test 1: Generic summary detection
    const genericBookmark = {
      id: 'generic1',
      url: 'https://example.com',
      title: 'Some Article',
      summary: 'This is a useful and important article about stuff.',
      concepts: [],
      entities: [],
      keywords: []
    };
    
    let lintReport = await runLintCheck([genericBookmark], settings);
    test('Lint: Detects generic summaries',
      lintReport.issues.some(i => i.type === 'generic_summary'));
    
    // Test 2: Missing entities for technical content
    const techBookmark = {
      id: 'tech1',
      url: 'https://example.com',
      title: 'Building APIs with Node.js',
      summary: 'Learn how to code APIs using frameworks.',
      concepts: [],
      entities: [],
      keywords: []
    };
    
    lintReport = await runLintCheck([techBookmark], settings);
    test('Lint: Detects missing technical entities',
      lintReport.issues.some(i => i.type === 'missing_technical_entities'));
    
    // Test 3: Very high confidence with many concepts
    const hallucination = {
      id: 'halluc1',
      url: 'https://example.com',
      title: 'Article',
      summary: 'Summary',
      extraction_confidence: 0.99,
      concepts: Array.from({ length: 15 }, (_, i) => ({ name: `Concept ${i}` })),
      entities: [],
      keywords: []
    };
    
    lintReport = await runLintCheck([hallucination], settings);
    test('Lint: Detects suspicious high confidence',
      lintReport.issues.some(i => i.type === 'suspicious_high_confidence'));
    
    // Test 4: AI disabled returns info message
    const disabledSettings = { ...settings, aiEnabled: false };
    lintReport = await runLintCheck([genericBookmark], disabledSettings);
    test('Lint: Returns info when AI disabled',
      lintReport.issues.some(i => i.type === 'ai_disabled'));
  }
  
  console.log('\n=== NORMALIZATION TESTS ===\n');
  
  // Test normalization functions used by health check
  test('Normalize: Concept name normalization',
    normalizeConceptName('Machine Learning') === 'machine-learning');
  
  test('Normalize: Entity name normalization',
    normalizeEntityName('microsoft', 'org') === 'Microsoft');
  
  test('Normalize: Keyword name normalization',
    normalizeKeywordName('Learning') === 'learning');
  
  console.log('\n=== TEST SUMMARY ===\n');
  
  const passed = testResults.filter(r => r.pass).length;
  const failed = testResults.filter(r => !r.pass).length;
  
  console.log(`Results: ${passed}/${testResults.length} passed`);
  
  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) failed:`);
    testResults.filter(r => !r.pass).forEach(r => console.log(`  - ${r.name}`));
  } else {
    console.log('\n✅ All tests passed!');
  }
  
  console.log('\n=== END OF TEST SUITE ===\n');
  
  return { passed, failed };
}

// Run tests
runTests().then(result => {
  if (result.failed === 0) {
    console.log('🎉 Phase 6c implementation verified!');
  }
}).catch(e => console.error('Test error:', e));
