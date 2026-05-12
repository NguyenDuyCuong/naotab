const PRESETS = {
  openai:     { url: 'https://api.openai.com/v1',        model: 'gpt-4o-mini' },
  claude:     { url: 'https://api.anthropic.com/v1',     model: 'claude-haiku-4-5-20251001' },
  ollama:     { url: 'http://localhost:11434/v1',         model: 'llama3.2' },
  groq:       { url: 'https://api.groq.com/openai/v1',   model: 'llama-3.1-8b-instant' },
  openrouter: { url: 'https://openrouter.ai/api/v1',     model: 'meta-llama/llama-3.1-8b-instruct:free' },
  custom:     { url: '',                                  model: '' },
};

let settings = {};
let driveBusy = false;

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

  // Mark preset button active if URL matches
  const currentUrl = settings.aiBaseUrl || '';
  document.querySelectorAll('.preset-btn').forEach(btn => {
    const p = PRESETS[btn.dataset.provider];
    if (p && p.url === currentUrl) btn.classList.add('active');
  });

  updateConfigVisibility();
  renderDriveStatus();
}

function updateConfigVisibility() {
  const enabled = document.getElementById('ai-enabled').checked;
  document.getElementById('ai-config-body').classList.toggle('disabled', !enabled);
  document.getElementById('ai-features-body').classList.toggle('disabled', !enabled);
}

document.getElementById('ai-enabled').addEventListener('change', updateConfigVisibility);
document.getElementById('drive-enabled').addEventListener('change', renderDriveStatus);

// Provider presets
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const p = PRESETS[btn.dataset.provider];
    if (!p) return;
    // Custom: clear fields so user can type their own, do not overwrite
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

// Test connection
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
    // OpenRouter requires these 2 extra headers
    if (isOpenRouter) {
      headers['HTTP-Referer'] = 'https://github.com/bsquang/bookmark-vault';
      headers['X-Title'] = 'bookmark-vault';
    }

    const endpoint = isAnthropic
      ? baseUrl + '/messages'
      : baseUrl + '/chat/completions';

    const body = { model, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

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

// Save
document.getElementById('btn-save').addEventListener('click', async () => {
  const newSettings = {
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
  };
  await saveSettings(newSettings);
  settings = newSettings;
  showToast('✅ Settings saved!');
  renderDriveStatus();
});

document.getElementById('btn-back').addEventListener('click', (e) => {
  e.preventDefault();
  window.close();
});

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), 2500);
}

function formatTime(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString();
  } catch (_) {
    return iso;
  }
}

function getDriveButtons() {
  return {
    authorize: document.getElementById('btn-drive-authorize'),
    backup: document.getElementById('btn-drive-backup'),
    restore: document.getElementById('btn-drive-restore'),
  };
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

loadSettings();
