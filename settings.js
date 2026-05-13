const PRESETS = {
  openai:     { url: 'https://api.openai.com/v1',        model: 'gpt-4o-mini' },
  claude:     { url: 'https://api.anthropic.com/v1',     model: 'claude-haiku-4-5-20251001' },
  ollama:     { url: 'http://localhost:11434/v1',        model: 'llama3.2' },
  groq:       { url: 'https://api.groq.com/openai/v1',   model: 'llama-3.1-8b-instant' },
  openrouter: { url: 'https://openrouter.ai/api/v1',     model: 'meta-llama/llama-3.1-8b-instruct:free' },
  custom:     { url: '',                                  model: '' },
};

let settings = {};
let driveBusy = false;
let legacyIngestBusy = false;
let legacyRunner = null;
let legacyStatusPollTimer = null;
let legacyFailuresPage = 1;
let legacyFailuresFilter = 'all';
const LEGACY_FAILURES_PAGE_SIZE = 10;

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function formatTime(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return iso;
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), 2500);
}

function updateConfigVisibility() {
  const enabled = document.getElementById('ai-enabled').checked;
  document.getElementById('ai-config-body').classList.toggle('disabled', !enabled);
  document.getElementById('ai-features-body').classList.toggle('disabled', !enabled);
}

function getDriveButtons() {
  return {
    authorize: document.getElementById('btn-drive-authorize'),
    backup: document.getElementById('btn-drive-backup'),
    restore: document.getElementById('btn-drive-restore'),
  };
}

function getLegacyIngestViewState(inputSettings, isBusy) {
  const state = inputSettings.legacyIngestState || 'idle';
  const failures = Array.isArray(inputSettings.legacyIngestFailures) ? inputSettings.legacyIngestFailures : [];
  const hasSource = !!inputSettings.legacyIngestIncludeBookmarks || !!inputSettings.legacyIngestIncludeHistory;
  const hasFailedItems = failures.length > 0 || Number(inputSettings.legacyIngestFailed || 0) > 0;

  return {
    state,
    failures,
    fieldsDisabled: isBusy || state === 'running' || state === 'paused',
    startDisabled: isBusy || state === 'running' || !hasSource,
    pauseDisabled: isBusy || state !== 'running',
    resumeDisabled: isBusy || state !== 'paused',
    cancelDisabled: isBusy || !['running', 'paused'].includes(state),
    retryFailedDisabled: isBusy || state === 'running' || !hasFailedItems,
  };
}

function groupLegacyFailures(failures) {
  const grouped = {};
  (Array.isArray(failures) ? failures : []).forEach((failure) => {
    const key = failure?.category || failure?.type || failure?.code || 'unknown';
    grouped[key] = (grouped[key] || 0) + 1;
  });
  return grouped;
}

function getLegacyFailuresPage(failures, filterKey, page, pageSize = LEGACY_FAILURES_PAGE_SIZE) {
  const list = (Array.isArray(failures) ? failures : []).filter((failure) => {
    if (!filterKey || filterKey === 'all') return true;
    const key = failure?.category || failure?.type || failure?.code || 'unknown';
    return key === filterKey;
  });
  const safeSize = Math.max(1, Number(pageSize || LEGACY_FAILURES_PAGE_SIZE));
  const totalPages = Math.max(1, Math.ceil(list.length / safeSize));
  const safePage = Math.min(totalPages, Math.max(1, Number(page || 1)));
  const from = (safePage - 1) * safeSize;
  const items = list.slice(from, from + safeSize);
  return { items, totalItems: list.length, totalPages, page: safePage };
}

function collectLegacyIngestSettingsFromUI() {
  const retriesInput = Number(document.getElementById('legacy-ingest-retries').value);
  const safeRetries = Number.isFinite(retriesInput) ? Math.min(10, Math.max(0, Math.floor(retriesInput))) : 0;
  return {
    legacyIngestIncludeBookmarks: document.getElementById('legacy-ingest-bookmarks').checked,
    legacyIngestIncludeHistory: document.getElementById('legacy-ingest-history').checked,
    legacyIngestStrategy: document.getElementById('legacy-ingest-strategy').value || 'fetch-first',
    legacyIngestSkipExisting: document.getElementById('legacy-ingest-skip-existing').checked,
    legacyIngestRetryCount: safeRetries,
    legacyIngestSafeMode: settings.legacyIngestSafeMode !== false,
    legacyIngestBatchSize: Number(settings.legacyIngestBatchSize || 200),
    legacyIngestMaxConcurrency: Number(settings.legacyIngestMaxConcurrency || 2),
    legacyIngestPerItemTimeoutMs: Number(settings.legacyIngestPerItemTimeoutMs || 8000),
    legacyIngestCheckpointInterval: Number(settings.legacyIngestCheckpointInterval || 3),
  };
}

function patchLegacyIngestState(changes = {}) {
  settings = {
    ...settings,
    ...changes,
    legacyIngestUpdatedAt: new Date().toISOString(),
  };
}

function applyLegacyRunnerStateToSettings(runnerState) {
  if (!runnerState || typeof runnerState !== 'object') return;
  const stats = runnerState.stats || {};
  patchLegacyIngestState({
    legacyIngestState: runnerState.status || settings.legacyIngestState || 'idle',
    legacyIngestPhase: runnerState.phase || settings.legacyIngestPhase || 'ready',
    legacyIngestProcessed: Number(stats.processed || 0),
    legacyIngestTotal: Number(stats.total || 0),
    legacyIngestImported: Number(stats.imported || 0),
    legacyIngestSkipped: Number(stats.skipped || 0),
    legacyIngestFailed: Number(stats.failed || 0),
    legacyIngestCurrentUrl: stats.currentUrl || '',
    legacyIngestFailures: Array.isArray(runnerState.failures) ? runnerState.failures : [],
    legacyIngestCheckpointCursor: runnerState.cursor || null,
    legacyIngestCheckpointStats: stats,
    legacyIngestCheckpointUpdatedAt: runnerState.updatedAt || '',
  });
}

function renderLegacyIngestUI() {
  const viewState = getLegacyIngestViewState(settings, legacyIngestBusy);

  document.getElementById('legacy-ingest-bookmarks').checked = !!settings.legacyIngestIncludeBookmarks;
  document.getElementById('legacy-ingest-history').checked = !!settings.legacyIngestIncludeHistory;
  document.getElementById('legacy-ingest-strategy').value = settings.legacyIngestStrategy || 'fetch-first';
  document.getElementById('legacy-ingest-skip-existing').checked = settings.legacyIngestSkipExisting !== false;
  document.getElementById('legacy-ingest-retries').value = String(settings.legacyIngestRetryCount ?? 0);

  document.getElementById('legacy-status-state').textContent = settings.legacyIngestState || 'idle';
  document.getElementById('legacy-status-phase').textContent = settings.legacyIngestPhase || 'ready';
  document.getElementById('legacy-status-progress').textContent = `${settings.legacyIngestProcessed || 0} / ${settings.legacyIngestTotal || 0}`;
  document.getElementById('legacy-status-imported').textContent = String(settings.legacyIngestImported || 0);
  document.getElementById('legacy-status-skipped').textContent = String(settings.legacyIngestSkipped || 0);
  document.getElementById('legacy-status-failed').textContent = String(settings.legacyIngestFailed || 0);
  document.getElementById('legacy-status-current-url').textContent = settings.legacyIngestCurrentUrl || '—';
  document.getElementById('legacy-status-started-at').textContent = formatTime(settings.legacyIngestStartedAt);
  document.getElementById('legacy-status-updated-at').textContent = formatTime(settings.legacyIngestUpdatedAt);
  document.getElementById('legacy-status-last-error').textContent = settings.legacyIngestLastError || '—';

  const failuresListEl = document.getElementById('legacy-failures-list');
  const failuresEmptyEl = document.getElementById('legacy-failures-empty');
  const failuresFilterEl = document.getElementById('legacy-failures-filter');
  const failuresMetaEl = document.getElementById('legacy-failures-meta');
  const failuresPageInfoEl = document.getElementById('legacy-failures-page-info');
  const grouped = groupLegacyFailures(viewState.failures);

  if (failuresFilterEl) {
    const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
    const options = ['<option value="all">All categories</option>']
      .concat(entries.map(([key, count]) => `<option value="${key}">${key} (${count})</option>`))
      .join('');
    failuresFilterEl.innerHTML = options;
    if (legacyFailuresFilter !== 'all' && !grouped[legacyFailuresFilter]) {
      legacyFailuresFilter = 'all';
      legacyFailuresPage = 1;
    }
    failuresFilterEl.value = legacyFailuresFilter;
  }

  if (failuresMetaEl) {
    const meta = Object.entries(grouped)
      .map(([key, count]) => `${key}: ${count}`)
      .join(' · ');
    failuresMetaEl.textContent = meta || 'No failures grouped yet';
  }

  const paged = getLegacyFailuresPage(viewState.failures, legacyFailuresFilter, legacyFailuresPage, LEGACY_FAILURES_PAGE_SIZE);
  legacyFailuresPage = paged.page;
  failuresListEl.innerHTML = '';
  if (viewState.failures.length > 0) {
    failuresEmptyEl.style.display = 'none';
    paged.items.forEach((failure) => {
      const li = document.createElement('li');
      if (typeof failure === 'string') {
        li.textContent = failure;
      } else {
        const category = failure?.category || failure?.type || failure?.code || 'unknown';
        const retryMark = failure?.retryable === false ? 'non-retryable' : 'retryable';
        li.textContent = `[${category}] (${retryMark}) ${failure?.url || '(no url)'} — ${failure?.message || ''}`;
      }
      failuresListEl.appendChild(li);
    });
  } else {
    failuresEmptyEl.style.display = '';
  }
  if (failuresPageInfoEl) {
    failuresPageInfoEl.textContent = `${paged.page}/${paged.totalPages} (${paged.totalItems} item${paged.totalItems === 1 ? '' : 's'})`;
  }
  const btnPrev = document.getElementById('legacy-failures-prev');
  const btnNext = document.getElementById('legacy-failures-next');
  if (btnPrev) btnPrev.disabled = paged.page <= 1;
  if (btnNext) btnNext.disabled = paged.page >= paged.totalPages;

  document.getElementById('legacy-ingest-bookmarks').disabled = viewState.fieldsDisabled;
  document.getElementById('legacy-ingest-history').disabled = viewState.fieldsDisabled;
  document.getElementById('legacy-ingest-strategy').disabled = viewState.fieldsDisabled;
  document.getElementById('legacy-ingest-skip-existing').disabled = viewState.fieldsDisabled;
  document.getElementById('legacy-ingest-retries').disabled = viewState.fieldsDisabled;

  document.getElementById('btn-legacy-start').disabled = viewState.startDisabled;
  document.getElementById('btn-legacy-pause').disabled = viewState.pauseDisabled;
  document.getElementById('btn-legacy-resume').disabled = viewState.resumeDisabled;
  document.getElementById('btn-legacy-cancel').disabled = viewState.cancelDisabled;
  document.getElementById('btn-legacy-retry-failed').disabled = viewState.retryFailedDisabled;
}

async function persistLegacyIngestSettingsAndRender() {
  const uiSettings = collectLegacyIngestSettingsFromUI();
  settings = { ...settings, ...uiSettings };
  if (typeof updateLegacyIngestState === 'function') {
    settings = await updateLegacyIngestState(uiSettings);
  } else {
    await saveSettings(settings);
  }
  renderLegacyIngestUI();
}

async function runLegacyIngestMockTransition(nextState, toastMessage, patch = {}) {
  void nextState;
  void toastMessage;
  void patch;
}

async function sendLegacyIngestMessage(action, payload = {}) {
  const fallbackToLocalRunner = async () => {
    if (typeof createLegacyIngestRunner !== 'function') {
      throw new Error('Legacy ingest worker is unavailable. Please reload extension.');
    }
    if (!legacyRunner) {
      legacyRunner = createLegacyIngestRunner();
      await legacyRunner.hydrateFromCheckpoint();
    }
    if (action === 'status') return legacyRunner.getState();
    if (action === 'start') return legacyRunner.start(payload.options || {}, { waitForCompletion: false });
    if (action === 'pause') return legacyRunner.pause();
    if (action === 'resume') return legacyRunner.resume({ waitForCompletion: false });
    if (action === 'cancel') return legacyRunner.cancel();
    if (action === 'retry_failed') return legacyRunner.retryFailed({ waitForCompletion: false });
    throw new Error('Unsupported legacy ingest action');
  };

  if (!chrome?.runtime?.sendMessage) {
    return fallbackToLocalRunner();
  }
  let response = null;
  try {
    response = await chrome.runtime.sendMessage({
      scope: 'legacy_ingest',
      action,
      ...payload,
    });
  } catch (e) {
    const msg = String(e?.message || '');
    if (msg.includes('Receiving end does not exist')) {
      showToast('⚠️ Background worker unavailable, using local fallback. Reload extension for full background mode.');
      return fallbackToLocalRunner();
    }
    throw e;
  }
  if (!response?.ok) {
    throw new Error(response?.error || 'Legacy ingest command failed');
  }
  return response.state || null;
}

async function onLegacyStart() {
  const selected = collectLegacyIngestSettingsFromUI();
  if (!selected.legacyIngestIncludeBookmarks && !selected.legacyIngestIncludeHistory) {
    showToast('⚠️ Select at least one source: bookmarks or history');
    return;
  }
  legacyIngestBusy = true;
  renderLegacyIngestUI();
  try {
    await persistLegacyIngestSettingsAndRender();
    const runState = await sendLegacyIngestMessage('start', { options: {
      includeBookmarks: selected.legacyIngestIncludeBookmarks,
      includeHistory: selected.legacyIngestIncludeHistory,
      strategy: selected.legacyIngestStrategy,
      skipExisting: selected.legacyIngestSkipExisting,
      retryCount: selected.legacyIngestRetryCount,
      safeMode: selected.legacyIngestSafeMode,
      batchSize: selected.legacyIngestBatchSize,
      maxConcurrency: selected.legacyIngestMaxConcurrency,
      perItemTimeoutMs: selected.legacyIngestPerItemTimeoutMs,
      checkpointInterval: selected.legacyIngestCheckpointInterval,
    }});
    applyLegacyRunnerStateToSettings(runState);
    if (typeof updateLegacyIngestState === 'function') {
      settings = await updateLegacyIngestState({
        ...collectLegacyIngestSettingsFromUI(),
        legacyIngestState: settings.legacyIngestState,
        legacyIngestPhase: settings.legacyIngestPhase,
        legacyIngestProcessed: settings.legacyIngestProcessed,
        legacyIngestTotal: settings.legacyIngestTotal,
        legacyIngestImported: settings.legacyIngestImported,
        legacyIngestSkipped: settings.legacyIngestSkipped,
        legacyIngestFailed: settings.legacyIngestFailed,
        legacyIngestCurrentUrl: settings.legacyIngestCurrentUrl,
        legacyIngestFailures: settings.legacyIngestFailures,
        legacyIngestCheckpointCursor: settings.legacyIngestCheckpointCursor,
        legacyIngestCheckpointStats: settings.legacyIngestCheckpointStats,
        legacyIngestCheckpointUpdatedAt: settings.legacyIngestCheckpointUpdatedAt,
        legacyIngestStartedAt: settings.legacyIngestStartedAt || new Date().toISOString(),
        legacyIngestLastError: '',
      });
    } else {
      await saveSettings(settings);
    }
    showToast('▶️ Legacy ingest started in background');
  } catch (e) {
    showToast('❌ ' + (e.message || 'Failed to start legacy ingest'));
  } finally {
    legacyIngestBusy = false;
    renderLegacyIngestUI();
  }
}

async function onLegacyPause() {
  legacyIngestBusy = true;
  renderLegacyIngestUI();
  try {
    const runState = await sendLegacyIngestMessage('pause');
    applyLegacyRunnerStateToSettings(runState);
    if (typeof updateLegacyIngestState === 'function') {
      settings = await updateLegacyIngestState({
        legacyIngestState: settings.legacyIngestState,
        legacyIngestPhase: settings.legacyIngestPhase,
        legacyIngestCurrentUrl: settings.legacyIngestCurrentUrl,
      });
    } else {
      await saveSettings(settings);
    }
    showToast('⏸️ Legacy ingest paused');
  } finally {
    legacyIngestBusy = false;
    renderLegacyIngestUI();
  }
}

async function onLegacyResume() {
  legacyIngestBusy = true;
  renderLegacyIngestUI();
  try {
    const runState = await sendLegacyIngestMessage('resume');
    applyLegacyRunnerStateToSettings(runState);
    if (typeof updateLegacyIngestState === 'function') {
      settings = await updateLegacyIngestState({
        legacyIngestState: settings.legacyIngestState,
        legacyIngestPhase: settings.legacyIngestPhase,
      });
    } else {
      await saveSettings(settings);
    }
    showToast('⏯️ Legacy ingest resumed');
  } finally {
    legacyIngestBusy = false;
    renderLegacyIngestUI();
  }
}

async function onLegacyCancel() {
  legacyIngestBusy = true;
  renderLegacyIngestUI();
  try {
    const runState = await sendLegacyIngestMessage('cancel');
    applyLegacyRunnerStateToSettings(runState);
    if (typeof updateLegacyIngestState === 'function') {
      settings = await updateLegacyIngestState({
        legacyIngestState: settings.legacyIngestState,
        legacyIngestPhase: settings.legacyIngestPhase,
        legacyIngestCurrentUrl: '',
      });
    } else {
      await saveSettings(settings);
    }
    showToast('⛔ Legacy ingest cancelled');
  } finally {
    legacyIngestBusy = false;
    renderLegacyIngestUI();
  }
}

async function onLegacyRetryFailed() {
  legacyIngestBusy = true;
  renderLegacyIngestUI();
  try {
    const runState = await sendLegacyIngestMessage('retry_failed');
    applyLegacyRunnerStateToSettings(runState);
    if (typeof updateLegacyIngestState === 'function') {
      settings = await updateLegacyIngestState({
        legacyIngestState: settings.legacyIngestState,
        legacyIngestPhase: settings.legacyIngestPhase,
      });
    } else {
      await saveSettings(settings);
    }
    showToast('🔁 Legacy ingest retry triggered');
  } finally {
    legacyIngestBusy = false;
    renderLegacyIngestUI();
  }
}

async function initLegacyIngestRunner() {
  try {
    const state = await sendLegacyIngestMessage('status');
    if (state) {
      applyLegacyRunnerStateToSettings(state);
      await updateLegacyIngestState({
        legacyIngestState: settings.legacyIngestState,
        legacyIngestPhase: settings.legacyIngestPhase,
        legacyIngestProcessed: settings.legacyIngestProcessed,
        legacyIngestTotal: settings.legacyIngestTotal,
        legacyIngestImported: settings.legacyIngestImported,
        legacyIngestSkipped: settings.legacyIngestSkipped,
        legacyIngestFailed: settings.legacyIngestFailed,
        legacyIngestCurrentUrl: settings.legacyIngestCurrentUrl,
        legacyIngestStartedAt: settings.legacyIngestStartedAt,
        legacyIngestLastError: settings.legacyIngestLastError,
        legacyIngestFailures: settings.legacyIngestFailures,
      });
    }
  } catch (_) {
    // Keep UI usable even if worker is not ready yet.
  }
  if (legacyStatusPollTimer) clearInterval(legacyStatusPollTimer);
  legacyStatusPollTimer = setInterval(async () => {
    try {
      const state = await sendLegacyIngestMessage('status');
      if (!state) return;
      applyLegacyRunnerStateToSettings(state);
      renderLegacyIngestUI();
    } catch (_) {
      // noop
    }
  }, 1500);
}

function renderDriveStatus() {
  const availability = getDriveAuthAvailability();
  const enabled = document.getElementById('drive-enabled').checked;

  const statusEl = document.getElementById('drive-status');
  const statusNoteEl = document.getElementById('drive-status-note');
  const lastBackupEl = document.getElementById('drive-last-backup');
  const lastRestoreEl = document.getElementById('drive-last-restore');
  const lastResultEl = document.getElementById('drive-last-result');

  lastBackupEl.textContent = formatTime(settings.driveBackupLastAt);
  lastRestoreEl.textContent = formatTime(settings.driveBackupLastRestoreAt);

  if (settings.driveBackupLastResult === 'error') {
    lastResultEl.textContent = 'Error: ' + (settings.driveBackupLastError || 'Unknown error');
    lastResultEl.style.color = '#d93025';
  } else if (settings.driveBackupLastResult === 'success') {
    lastResultEl.textContent = 'Success';
    lastResultEl.style.color = '#34a853';
  } else {
    lastResultEl.textContent = '—';
    lastResultEl.style.color = '#3c4043';
  }

  if (!availability.available) {
    statusEl.textContent = 'Unavailable';
    statusEl.style.color = '#d93025';
    statusNoteEl.textContent = availability.message;
  } else if (!enabled) {
    statusEl.textContent = 'Disabled';
    statusEl.style.color = '#5f6368';
    statusNoteEl.textContent = 'Turn on "Enable Drive backup" and click Save Settings.';
  } else {
    statusEl.textContent = 'Enabled';
    statusEl.style.color = '#34a853';
    statusNoteEl.textContent = 'Backups are manual in this version. Click "Backup now" anytime.';
  }

  const buttons = getDriveButtons();
  buttons.authorize.disabled = driveBusy || !availability.available;
  buttons.backup.disabled = driveBusy || !availability.available || !enabled;
  buttons.restore.disabled = driveBusy || !availability.available || !enabled;
}

async function syncSettingsFromStorage() {
  settings = await getSettings();
  renderDriveStatus();
  renderLegacyIngestUI();
}

async function withDriveBusy(fn) {
  driveBusy = true;
  renderDriveStatus();
  try {
    return await fn();
  } finally {
    driveBusy = false;
    await syncSettingsFromStorage();
  }
}

async function loadSettings() {
  settings = await getSettings();
  document.getElementById('ai-enabled').checked = settings.aiEnabled || false;
  document.getElementById('ai-base-url').value = settings.aiBaseUrl || '';
  document.getElementById('ai-api-key').value = settings.aiApiKey || '';
  document.getElementById('ai-model').value = settings.aiModel || '';
  document.getElementById('feat-tags').checked = settings.featTags !== false;
  document.getElementById('feat-summary').checked = settings.featSummary !== false;
  document.getElementById('drive-enabled').checked = settings.driveBackupEnabled === true;
  document.getElementById('drive-restore-strategy').value = 'merge';
  document.getElementById('graph-default-view').value = settings.graphDefaultView === 'graph' ? 'graph' : 'list';
  document.getElementById('graph-quality-mode').value = ['auto', 'balanced', 'high'].includes(settings.graphQualityMode)
    ? settings.graphQualityMode
    : 'auto';
  document.getElementById('graph-max-nodes').value = String(clampInt(
    settings.graphMaxNodesPerLevel,
    100,
    10000,
    1200
  ));
  document.getElementById('graph-max-edges').value = String(clampInt(
    settings.graphMaxEdgesPerLevel,
    500,
    30000,
    4000
  ));

  const currentUrl = settings.aiBaseUrl || '';
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.remove('active');
    const p = PRESETS[btn.dataset.provider];
    if (p && p.url === currentUrl) btn.classList.add('active');
  });

  updateConfigVisibility();
  renderDriveStatus();
  renderLegacyIngestUI();
}

function bindEvents() {
  document.getElementById('ai-enabled').addEventListener('change', updateConfigVisibility);
  document.getElementById('drive-enabled').addEventListener('change', renderDriveStatus);

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.provider];
      if (!p) return;
      if (btn.dataset.provider !== 'custom') {
        document.getElementById('ai-base-url').value = p.url;
        document.getElementById('ai-model').value = p.model;
      } else {
        document.getElementById('ai-base-url').value = '';
        document.getElementById('ai-model').value = '';
        document.getElementById('ai-base-url').focus();
      }
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('btn-test').addEventListener('click', async () => {
    const btn = document.getElementById('btn-test');
    const resultEl = document.getElementById('test-result');
    const baseUrl = document.getElementById('ai-base-url').value.trim();
    const apiKey = document.getElementById('ai-api-key').value.trim();
    const model = document.getElementById('ai-model').value.trim();

    if (!baseUrl || !model) {
      resultEl.textContent = '⚠️ Please fill in URL and Model first';
      resultEl.className = 'test-err';
      return;
    }

    btn.disabled = true;
    resultEl.textContent = '⏳ Testing...';
    resultEl.className = '';

    try {
      const isAnthropic = baseUrl.includes('anthropic.com');
      const isOpenRouter = baseUrl.includes('openrouter.ai');
      const headers = { 'Content-Type': 'application/json' };
      if (isAnthropic) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = 'Bearer ' + apiKey;
      }
      if (isOpenRouter) {
        headers['HTTP-Referer'] = 'https://github.com/bsquang/bookmark-vault';
        headers['X-Title'] = 'bookmark-vault';
      }

      const endpoint = isAnthropic ? baseUrl + '/messages' : baseUrl + '/chat/completions';
      const body = { model, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] };
      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });

      if (res.ok) {
        resultEl.textContent = '✅ Connection successful!';
        resultEl.className = 'test-ok';
      } else {
        const err = await res.json().catch(() => ({}));
        resultEl.textContent = '❌ ' + res.status + ': ' + (err?.error?.message || res.statusText);
        resultEl.className = 'test-err';
      }
    } catch (e) {
      resultEl.textContent = '❌ ' + e.message;
      resultEl.className = 'test-err';
    }

    btn.disabled = false;
  });

  document.getElementById('btn-save').addEventListener('click', async () => {
    const graphDefaultView = document.getElementById('graph-default-view').value === 'graph' ? 'graph' : 'list';
    const graphQualityMode = ['auto', 'balanced', 'high'].includes(document.getElementById('graph-quality-mode').value)
      ? document.getElementById('graph-quality-mode').value
      : 'auto';
    const graphMaxNodesPerLevel = clampInt(document.getElementById('graph-max-nodes').value, 100, 10000, 1200);
    const graphMaxEdgesPerLevel = clampInt(document.getElementById('graph-max-edges').value, 500, 30000, 4000);

    const newSettings = {
      ...settings,
      aiEnabled: document.getElementById('ai-enabled').checked,
      aiBaseUrl: document.getElementById('ai-base-url').value.trim(),
      aiApiKey: document.getElementById('ai-api-key').value.trim(),
      aiModel: document.getElementById('ai-model').value.trim(),
      featTags: document.getElementById('feat-tags').checked,
      featSummary: document.getElementById('feat-summary').checked,
      driveBackupEnabled: document.getElementById('drive-enabled').checked,
      driveBackupLastAt: settings.driveBackupLastAt || '',
      driveBackupLastResult: settings.driveBackupLastResult || '',
      driveBackupLastError: settings.driveBackupLastError || '',
      driveBackupLastFileId: settings.driveBackupLastFileId || '',
      driveBackupLastRestoreAt: settings.driveBackupLastRestoreAt || '',
      graphDefaultView,
      graphQualityMode,
      graphMaxNodesPerLevel,
      graphMaxEdgesPerLevel,
      ...collectLegacyIngestSettingsFromUI(),
    };
    await saveSettings(newSettings);
    settings = newSettings;
    showToast('✅ Settings saved!');
    renderDriveStatus();
    renderLegacyIngestUI();
  });

  document.getElementById('btn-back').addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });

  document.getElementById('btn-drive-authorize').addEventListener('click', async () => {
    const availability = getDriveAuthAvailability();
    if (!availability.available) {
      showToast('❌ ' + availability.message);
      renderDriveStatus();
      return;
    }

    try {
      await withDriveBusy(async () => {
        await authorizeGoogleDrive(true);
        showToast('✅ Google account connected');
      });
    } catch (e) {
      showToast('❌ ' + (e.message || 'Drive authorization failed'));
    }
  });

  document.getElementById('btn-drive-backup').addEventListener('click', async () => {
    const enabled = document.getElementById('drive-enabled').checked;
    if (!enabled) {
      showToast('⚠️ Enable Drive backup first');
      return;
    }

    try {
      await withDriveBusy(async () => {
        const file = await uploadDriveBackupJSON();
        showToast('✅ Backup uploaded: ' + (file.name || file.id));
      });
    } catch (e) {
      showToast('❌ ' + (e.message || 'Drive backup failed'));
    }
  });

  document.getElementById('btn-drive-restore').addEventListener('click', async () => {
    const enabled = document.getElementById('drive-enabled').checked;
    if (!enabled) {
      showToast('⚠️ Enable Drive backup first');
      return;
    }

    const strategy = document.getElementById('drive-restore-strategy').value || 'merge';
    const isReplace = strategy === 'replace';
    const confirmed = confirm(
      isReplace
        ? 'Replace local bookmarks/settings with latest Drive backup?\n\nThis is destructive.'
        : 'Restore latest Drive backup with safe merge?\n\nThis keeps local bookmarks and only adds missing URLs.'
    );
    if (!confirmed) return;

    try {
      await withDriveBusy(async () => {
        const restored = await restoreLatestDriveBackup(strategy);
        const count = restored?.result?.imported || 0;
        showToast(`✅ Restore complete (${strategy}): ${count} bookmark(s) applied`);
      });
    } catch (e) {
      showToast('❌ ' + (e.message || 'Drive restore failed'));
    }
  });

  document.getElementById('legacy-ingest-bookmarks').addEventListener('change', persistLegacyIngestSettingsAndRender);
  document.getElementById('legacy-ingest-history').addEventListener('change', persistLegacyIngestSettingsAndRender);
  document.getElementById('legacy-ingest-strategy').addEventListener('change', persistLegacyIngestSettingsAndRender);
  document.getElementById('legacy-ingest-skip-existing').addEventListener('change', persistLegacyIngestSettingsAndRender);
  document.getElementById('legacy-ingest-retries').addEventListener('change', persistLegacyIngestSettingsAndRender);

  document.getElementById('btn-legacy-start').addEventListener('click', onLegacyStart);
  document.getElementById('btn-legacy-pause').addEventListener('click', onLegacyPause);
  document.getElementById('btn-legacy-resume').addEventListener('click', onLegacyResume);
  document.getElementById('btn-legacy-cancel').addEventListener('click', onLegacyCancel);
  document.getElementById('btn-legacy-retry-failed').addEventListener('click', onLegacyRetryFailed);

  const filterEl = document.getElementById('legacy-failures-filter');
  if (filterEl) {
    filterEl.addEventListener('change', () => {
      legacyFailuresFilter = filterEl.value || 'all';
      legacyFailuresPage = 1;
      renderLegacyIngestUI();
    });
  }
  const prevEl = document.getElementById('legacy-failures-prev');
  const nextEl = document.getElementById('legacy-failures-next');
  if (prevEl) {
    prevEl.addEventListener('click', () => {
      legacyFailuresPage = Math.max(1, legacyFailuresPage - 1);
      renderLegacyIngestUI();
    });
  }
  if (nextEl) {
    nextEl.addEventListener('click', () => {
      legacyFailuresPage += 1;
      renderLegacyIngestUI();
    });
  }
}

function initSettingsPage() {
  bindEvents();
  loadSettings().then(initLegacyIngestRunner);
}

if (typeof document !== 'undefined' && document.getElementById('btn-save')) {
  initSettingsPage();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getLegacyIngestViewState,
    groupLegacyFailures,
    getLegacyFailuresPage,
  };
}
