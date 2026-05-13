const {
  LEGACY_INGEST_STATE_KEY,
  normalizeIngestUrl,
  flattenBookmarkTree,
  dedupeIngestItems,
  processBatch,
  buildIngestContentSignature,
  createLegacyIngestRunner,
} = require('./core/ingest.js');

let passed = 0;
let failed = 0;

function test(name, condition) {
  if (condition) {
    passed++;
    console.log('PASS:', name);
  } else {
    failed++;
    console.log('FAIL:', name);
  }
}

async function testQueueBuildAndDedupe() {
  const tree = [{
    title: 'Bookmarks Bar',
    children: [
      { title: 'Example 1', url: 'https://example.com/path/?utm_source=x#section' },
      { title: 'Folder A', children: [{ title: 'Example 2', url: 'https://example.com/path' }] },
    ],
  }];

  const flattened = flattenBookmarkTree(tree);
  const deduped = dedupeIngestItems([
    ...flattened,
    { title: 'From history', url: 'https://example.com/path/', source: 'history' },
  ]);

  test('Queue flatten captures folder detail', flattened[1].sourceDetail.includes('Folder A'));
  test('Canonical URL removes tracking/hash', normalizeIngestUrl(flattened[0].url) === 'https://example.com/path');
  test('Canonical dedupe merges bookmark + history', deduped.length === 1 && deduped[0].ingestSource === 'bookmark+history');
}

async function testCheckpointResume() {
  const memory = {};
  const checkpoint = {
    version: 1,
    status: 'paused',
    options: { includeBookmarks: true, includeHistory: false, strategy: 'fetch-only', skipExisting: true, retryCount: 0 },
    queue: [
      { url: 'https://a.com', canonicalUrl: 'https://a.com', source: 'bookmark', ingestSource: 'bookmark' },
      { url: 'https://b.com', canonicalUrl: 'https://b.com', source: 'bookmark', ingestSource: 'bookmark' },
    ],
    cursor: 1,
    stats: { total: 2, processed: 1, saved: 1, skipped: 0, failed: 0, currentUrl: '' },
    failures: [],
    updatedAt: new Date().toISOString(),
  };
  memory[LEGACY_INGEST_STATE_KEY] = checkpoint;

  const runner = createLegacyIngestRunner({
    storage: {
      async get(k) { return { [k]: memory[k] }; },
      async set(v) { Object.assign(memory, v); },
      async remove(k) { delete memory[k]; },
    },
    getBookmarksFn: async () => [],
    saveBookmarkFn: async () => ({ duplicate: false }),
    extractUrlFn: async () => ({ title: 'ok', pageMeta: {}, strategyUsed: 'fetch' }),
  });

  await runner.hydrateFromCheckpoint();
  await runner.resume();
  const state = runner.getState();
  test('Resume processes remaining queue items', state.stats.processed === 2);
  test('Resume reaches completed status', state.status === 'completed');
}

async function testStrategyFallback() {
  let hiddenUsed = false;
  const runner = createLegacyIngestRunner({
    chromeApi: {
      tabs: {
        async create() { return { id: 99 }; },
        async get() { return { id: 99, status: 'complete' }; },
        async remove() { hiddenUsed = true; },
      },
      scripting: {
        async executeScript() {
          return [{ result: { title: 'Rendered title', pageMeta: { description: 'Rendered desc' } } }];
        },
      },
    },
    fetchImpl: async () => {
      const e = new Error('js-required');
      throw e;
    },
    buildQueueFn: async () => [
      { url: 'https://js-heavy.example.com', canonicalUrl: 'https://js-heavy.example.com', source: 'history', ingestSource: 'history' },
    ],
    getBookmarksFn: async () => [],
    saveBookmarkFn: async (fields) => ({ duplicate: false, bookmark: fields }),
    suggestTagsFn: () => [],
    storage: {
      async get() { return {}; },
      async set() {},
      async remove() {},
    },
  });

  await runner.start({ includeBookmarks: false, includeHistory: true, strategy: 'hybrid', retryCount: 0, skipExisting: false });
  const state = runner.getState();
  test('Hybrid fallback saves URL when fetch requires JS', state.stats.saved === 1);
  test('Hidden tab lifecycle is used', hiddenUsed === true);
}

async function testRunnerStats() {
  const queue = [
    { url: 'https://ok.example', canonicalUrl: 'https://ok.example', source: 'history', ingestSource: 'history' },
    { url: 'notaurl', canonicalUrl: '', source: 'history', ingestSource: 'history' },
    { url: 'https://fail.example', canonicalUrl: 'https://fail.example', source: 'history', ingestSource: 'history' },
  ];

  const runner = createLegacyIngestRunner({
    buildQueueFn: async () => queue,
    getBookmarksFn: async () => [],
    saveBookmarkFn: async () => ({ duplicate: false }),
    extractUrlFn: async (item) => {
      if (item.url.includes('fail')) throw new Error('timeout');
      return { title: 'ok', pageMeta: {}, strategyUsed: 'fetch' };
    },
    storage: {
      async get() { return {}; },
      async set() {},
      async remove() {},
    },
  });

  await runner.start({ includeBookmarks: false, includeHistory: true, strategy: 'fetch-only', retryCount: 0, skipExisting: false });
  const state = runner.getState();
  test('Stats total equals queue size', state.stats.total === 3);
  test('Stats saved increments', state.stats.saved === 1);
  test('Stats skipped increments for invalid URL', state.stats.skipped === 1);
  test('Stats failed increments', state.stats.failed === 1);
}

async function testAliasDuplicateSkip() {
  const existingSignature = buildIngestContentSignature({
    title: 'Intro to Rust',
    pageMeta: { description: 'A rust guide' },
    snapshot: { metaText: 'rust guide', contentSample: 'learn rust fast' },
  });
  let saves = 0;
  const result = await processBatch(
    [{ url: 'https://alias.example', canonicalUrl: 'https://alias.example', source: 'history', ingestSource: 'history' }],
    { skipExisting: false, retryCount: 0, maxConcurrency: 1, strategy: 'fetch-only' },
    {
      getBookmarksFn: async () => [{ url: 'https://existing.example', ingest_content_signature: existingSignature }],
      saveBookmarkFn: async () => { saves += 1; return { duplicate: false }; },
      suggestTagsFn: () => [],
      extractUrlFn: async () => ({
        title: 'Intro to Rust',
        pageMeta: { description: 'A rust guide' },
        snapshot: { metaText: 'rust guide', contentSample: 'learn rust fast' },
        contentSignature: existingSignature,
        strategyUsed: 'fetch',
      }),
    }
  );
  test('Alias/content-equivalent items are skipped', result.skipped === 1 && saves === 0);
}

(async () => {
  await testQueueBuildAndDedupe();
  await testCheckpointResume();
  await testStrategyFallback();
  await testRunnerStats();
  await testAliasDuplicateSkip();

  console.log('\nSummary:', { passed, failed });
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
