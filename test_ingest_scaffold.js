const assert = require('assert');
const {
  LEGACY_INGEST_DEFAULTS,
  LEGACY_INGEST_LIMITS,
  clampIngestOptions,
  makeInitialLegacyIngestState,
  createLegacyIngestRunner,
} = require('./core/ingest.js');

function createMemoryStorage(seed = {}) {
  const db = { ...seed };
  return {
    async get(key) {
      if (Array.isArray(key)) {
        return key.reduce((acc, k) => ({ ...acc, [k]: db[k] }), {});
      }
      return { [key]: db[key] };
    },
    async set(payload) {
      Object.assign(db, payload || {});
    },
    async remove(key) {
      delete db[key];
    },
    _db: db,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testStateTransitions() {
  let calls = 0;
  const runner = createLegacyIngestRunner({
    storage: createMemoryStorage(),
    getNextBookmarkBatchFn: async (cursor, limit) => {
      if (calls > 0) return { items: [], nextCursor: cursor, done: true };
      calls += 1;
      return {
        items: Array.from({ length: Math.min(2, limit) }, (_, i) => ({ url: `https://example.com/${i}` })),
        nextCursor: 2,
        done: false,
      };
    },
    processBatchFn: async (items) => {
      await delay(25);
      return { processed: items.length, imported: 0, skipped: items.length, failed: 0, failures: [] };
    },
  });

  const startPromise = runner.start({ includeBookmarks: true, includeHistory: false, batchSize: 2 });
  await delay(5);
  const paused = await runner.pause();
  assert.equal(paused.status, 'paused', 'Runner should transition running -> paused');
  await startPromise;
  const resumed = await runner.resume();
  assert.equal(resumed.status, 'completed', 'Runner should transition paused -> running -> completed');
  const canceled = await runner.cancel();
  assert.equal(canceled.status, 'completed', 'Cancel should not mutate completed state');
}

async function testCheckpointSaveRestore() {
  const storage = createMemoryStorage();
  const updates = [];
  const runner = createLegacyIngestRunner({
    storage,
    updateLegacyStateFn: async (patch) => {
      updates.push(patch);
      return patch;
    },
    getNextBookmarkBatchFn: async () => ({ items: [{ url: 'https://saved.local' }], nextCursor: 1, done: true }),
    processBatchFn: async (items) => ({ processed: items.length, imported: 0, skipped: items.length, failed: 0, failures: [] }),
  });

  await runner.start({ includeBookmarks: true, includeHistory: false, checkpointInterval: 1 });
  const restored = createLegacyIngestRunner({ storage });
  const hydrated = await restored.hydrateFromCheckpoint();
  assert.ok(hydrated.cursor, 'Hydrated state should include cursor');
  assert.ok(hydrated.stats, 'Hydrated state should include stats');
  assert.ok(updates.length > 0, 'Checkpoint should persist into settings patch');
}

async function testCursorProgression() {
  const runner = createLegacyIngestRunner({
    storage: createMemoryStorage(),
    getNextBookmarkBatchFn: async (cursor, limit) => {
      const from = Number.isFinite(cursor) ? cursor : 0;
      if (from >= 4) return { items: [], nextCursor: from, done: true, totalEstimate: 4 };
      const size = Math.min(limit, 2);
      const items = Array.from({ length: size }, (_, i) => ({ url: `https://cursor.test/${from + i}` }));
      return { items, nextCursor: from + items.length, done: from + items.length >= 4, totalEstimate: 4 };
    },
    processBatchFn: async (items) => ({ processed: items.length, imported: 0, skipped: items.length, failed: 0, failures: [] }),
  });

  const done = await runner.start({ includeBookmarks: true, includeHistory: false, batchSize: 2 });
  assert.equal(done.stats.processed, 4, 'All mocked items should be processed');
  assert.equal(done.cursor.bookmark, 4, 'Bookmark cursor should advance to final offset');
  assert.equal(done.cursor.done.bookmark, true, 'Bookmark cursor should mark done');
}

function testClampingDefaults() {
  const clamped = clampIngestOptions({
    retryCount: 999,
    batchSize: 10_000,
    maxConcurrency: -10,
    perItemTimeoutMs: 1,
    checkpointInterval: 999,
  });

  assert.equal(clamped.retryCount, LEGACY_INGEST_LIMITS.retryCount.max);
  assert.equal(clamped.batchSize, LEGACY_INGEST_LIMITS.batchSize.max);
  assert.equal(clamped.maxConcurrency, LEGACY_INGEST_LIMITS.maxConcurrency.min);
  assert.equal(clamped.perItemTimeoutMs, LEGACY_INGEST_LIMITS.perItemTimeoutMs.min);
  assert.equal(clamped.checkpointInterval, LEGACY_INGEST_LIMITS.checkpointInterval.max);

  const initial = makeInitialLegacyIngestState();
  assert.equal(initial.options.batchSize, LEGACY_INGEST_DEFAULTS.batchSize);
  assert.equal(initial.options.maxConcurrency, LEGACY_INGEST_DEFAULTS.maxConcurrency);
}

async function run() {
  await testStateTransitions();
  await testCheckpointSaveRestore();
  await testCursorProgression();
  testClampingDefaults();
  console.log('✅ ingest scaffold tests passed');
}

run().catch((error) => {
  console.error('❌ ingest scaffold tests failed:', error);
  process.exit(1);
});
