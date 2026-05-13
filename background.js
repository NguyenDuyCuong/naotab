importScripts('core/schema.js', 'core/storage.js', 'core/ai.js', 'core/ingest.js');

let ingestRunner = null;
let initialized = false;

async function ensureRunner() {
  if (ingestRunner) return ingestRunner;
  ingestRunner = createLegacyIngestRunner({
    onStateChange: async (state) => {
      await updateLegacyIngestState({
        legacyIngestState: state.status,
        legacyIngestPhase: state.phase,
        legacyIngestProcessed: state.stats?.processed || 0,
        legacyIngestTotal: state.stats?.total || 0,
        legacyIngestImported: state.stats?.imported || 0,
        legacyIngestSkipped: state.stats?.skipped || 0,
        legacyIngestFailed: state.stats?.failed || 0,
        legacyIngestCurrentUrl: state.stats?.currentUrl || '',
        legacyIngestStartedAt: state.startedAt || '',
        legacyIngestUpdatedAt: state.updatedAt || '',
        legacyIngestLastError: state.failures?.[0]?.message || '',
        legacyIngestFailures: Array.isArray(state.failures) ? state.failures.slice(0, 200) : [],
      });
    },
  });
  await ingestRunner.hydrateFromCheckpoint();
  return ingestRunner;
}

async function initBackground() {
  if (initialized) return;
  initialized = true;
  const runner = await ensureRunner();
  const state = runner.getState();
  if (state.status === 'running') {
    const queueHasWork = Array.isArray(state.queue) && state.queueCursor < state.queue.length;
    const streamHasWork = !(state.cursor?.done?.bookmark && state.cursor?.done?.history);
    const statsHasWork = Number(state.stats?.processed || 0) < Number(state.stats?.total || 0);
    const shouldResume = queueHasWork || streamHasWork || statsHasWork;
    if (shouldResume) {
      await runner.resume({ waitForCompletion: false });
    } else {
      await runner.pause();
    }
  }
}

chrome.runtime.onStartup.addListener(() => {
  initBackground().catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => {
  initBackground().catch(() => {});
});
initBackground().catch(() => {});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.scope !== 'legacy_ingest') return;

  (async () => {
    const runner = await ensureRunner();
    const action = message.action;
    if (action === 'status') {
      sendResponse({ ok: true, state: runner.getState() });
      return;
    }
    if (action === 'start') {
      const state = await runner.start(message.options || {}, { waitForCompletion: false });
      sendResponse({ ok: true, state });
      return;
    }
    if (action === 'pause') {
      const state = await runner.pause();
      sendResponse({ ok: true, state });
      return;
    }
    if (action === 'resume') {
      const state = await runner.resume({ waitForCompletion: false });
      sendResponse({ ok: true, state });
      return;
    }
    if (action === 'cancel') {
      const state = await runner.cancel();
      sendResponse({ ok: true, state });
      return;
    }
    if (action === 'retry_failed') {
      const state = await runner.retryFailed({ waitForCompletion: false });
      sendResponse({ ok: true, state });
      return;
    }
    sendResponse({ ok: false, error: 'Unsupported action' });
  })().catch((e) => {
    sendResponse({ ok: false, error: e.message || 'Legacy ingest message error' });
  });

  return true;
});
