const assert = require('assert');
const {
  detectAIProvider,
  classifyAIFailure,
  runAIExtractAll,
} = require('./core/ai.js');

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

async function testProviderDetection() {
  test('detectAIProvider identifies anthropic', detectAIProvider({ aiBaseUrl: 'https://api.anthropic.com/v1' }) === 'anthropic');
  test('detectAIProvider identifies openai-compatible', detectAIProvider({ aiBaseUrl: 'https://example.ai/v1' }) === 'openai-compatible');
}

async function testFailureClassifier() {
  const classified = classifyAIFailure({ status: 429, code: 'http-429' }, 'openai');
  test('classifyAIFailure marks 429 retryable', classified.retryable === true && classified.type === 'rate-limit');
}

async function testRunAIExtractAllRetryQueue() {
  let callCount = 0;
  global.fetch = async (_endpoint, payload) => {
    callCount++;
    const body = JSON.parse(payload.body);
    const text = body?.messages?.[0]?.content || '';
    if (text.includes('Title: "Will Fail"')) {
      return { ok: false, status: 429, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              concepts: [{ name: 'concept', relevance: 0.8, type: 'topic' }],
              entities: [],
              keywords: [],
              key_statistics: [],
              purpose: 'test',
              thesis: 'test',
              key_message: 'test',
              confidence: 0.8,
            }),
          },
        }],
      }),
    };
  };

  const updates = [];
  const failures = [];
  const summary = await runAIExtractAll([
    { id: '1', title: 'Will Pass', url: 'https://ok.example', summary: 'ok', pageMeta: { description: 'ok' } },
    { id: '2', title: 'Will Fail', url: 'https://fail.example', summary: 'bad', pageMeta: { description: 'bad' } },
  ], {
    settingsOverride: {
      aiEnabled: true,
      aiBaseUrl: 'https://api.openai.com/v1',
      aiApiKey: 'k',
      aiModel: 'gpt-4o-mini',
      aiExtractMaxConcurrency: 1,
      aiExtractRateCapPerMinute: 1000,
      aiExtractBackoffBaseMs: 1,
      aiExtractCircuitBreakerThreshold: 10,
      aiExtractCircuitBreakerCooldownMs: 100,
    },
    updateBookmarkFn: async (id, patch) => { updates.push({ id, patch }); return true; },
    appendFailuresFn: async (items) => { failures.push(...items); },
    consumeFailuresFn: async () => [],
    waitFn: async () => {},
    randomFn: () => 0,
  });

  test('runAIExtractAll succeeds for successful item', summary.succeeded === 1);
  test('runAIExtractAll queues retryable ai failures', summary.queued >= 1 && failures.some((f) => f.category === 'ai-failure'));
  test('runAIExtractAll updates bookmark status', updates.some((u) => u.patch.ingest_ai_status === 'done') && updates.some((u) => u.patch.ingest_ai_status === 'failed'));
  test('runAIExtractAll performed retries', callCount >= 4);
}

(async () => {
  await testProviderDetection();
  await testFailureClassifier();
  await testRunAIExtractAllRetryQueue();
  console.log('\nSummary:', { passed, failed });
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});
