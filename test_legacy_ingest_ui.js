const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

vm.runInThisContext(fs.readFileSync('core/schema.js', 'utf8'));
const { getLegacyIngestViewState, groupLegacyFailures, getLegacyFailuresPage } = require('./settings.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS:', name);
  } catch (e) {
    failed++;
    console.log('FAIL:', name, '-', e.message);
  }
}

test('SETTINGS_DEFAULTS exposes legacy ingest UI fields', () => {
  const keys = [
    'legacyIngestIncludeBookmarks',
    'legacyIngestIncludeHistory',
    'legacyIngestStrategy',
    'legacyIngestSkipExisting',
    'legacyIngestRetryCount',
    'legacyIngestState',
    'legacyIngestPhase',
    'legacyIngestProcessed',
    'legacyIngestTotal',
    'legacyIngestImported',
    'legacyIngestSkipped',
    'legacyIngestFailed',
    'legacyIngestCurrentUrl',
    'legacyIngestStartedAt',
    'legacyIngestUpdatedAt',
    'legacyIngestLastError',
    'legacyIngestFailures',
  ];

  keys.forEach((k) => assert.ok(Object.prototype.hasOwnProperty.call(SETTINGS_DEFAULTS, k), `missing ${k}`));
  assert.strictEqual(SETTINGS_DEFAULTS.legacyIngestStrategy, 'fetch-first');
  assert.strictEqual(Array.isArray(SETTINGS_DEFAULTS.legacyIngestFailures), true);
});

test('view state disables Start when no source selected', () => {
  const state = getLegacyIngestViewState({
    legacyIngestState: 'idle',
    legacyIngestIncludeBookmarks: false,
    legacyIngestIncludeHistory: false,
    legacyIngestFailed: 0,
    legacyIngestFailures: [],
  }, false);
  assert.strictEqual(state.startDisabled, true);
  assert.strictEqual(state.pauseDisabled, true);
  assert.strictEqual(state.resumeDisabled, true);
});

test('view state enables running controls correctly', () => {
  const state = getLegacyIngestViewState({
    legacyIngestState: 'running',
    legacyIngestIncludeBookmarks: true,
    legacyIngestIncludeHistory: false,
    legacyIngestFailed: 0,
    legacyIngestFailures: [],
  }, false);
  assert.strictEqual(state.startDisabled, true);
  assert.strictEqual(state.pauseDisabled, false);
  assert.strictEqual(state.cancelDisabled, false);
  assert.strictEqual(state.resumeDisabled, true);
});

test('view state enables retry when failures exist', () => {
  const state = getLegacyIngestViewState({
    legacyIngestState: 'idle',
    legacyIngestIncludeBookmarks: true,
    legacyIngestIncludeHistory: true,
    legacyIngestFailed: 2,
    legacyIngestFailures: [{ url: 'https://example.com' }],
  }, false);
  assert.strictEqual(state.retryFailedDisabled, false);
});

test('groups failures by category with explicit ai-failure support', () => {
  const grouped = groupLegacyFailures([
    { category: 'ai-failure', type: 'rate-limit' },
    { category: 'ai-failure', type: 'timeout' },
    { category: 'ingest-failure', type: 'timeout' },
  ]);
  assert.strictEqual(grouped['ai-failure'], 2);
  assert.strictEqual(grouped['ingest-failure'], 1);
});

test('failed-items pagination and filtering works', () => {
  const failures = Array.from({ length: 23 }, (_, i) => ({
    category: i % 2 === 0 ? 'ai-failure' : 'ingest-failure',
    url: `https://f${i}.example`,
  }));
  const page1 = getLegacyFailuresPage(failures, 'ai-failure', 1, 5);
  const page2 = getLegacyFailuresPage(failures, 'ai-failure', 2, 5);
  assert.strictEqual(page1.items.length, 5);
  assert.strictEqual(page2.page, 2);
  assert.strictEqual(page1.totalItems, 12);
});

console.log('\nSummary:', { passed, failed });
process.exit(failed === 0 ? 0 : 1);
