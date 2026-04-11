const PRESETS = {
  openai:     { url: 'https://api.openai.com/v1',        model: 'gpt-4o-mini' },
  claude:     { url: 'https://api.anthropic.com/v1',     model: 'claude-haiku-4-5-20251001' },
  ollama:     { url: 'http://localhost:11434/v1',         model: 'llama3.2' },
  groq:       { url: 'https://api.groq.com/openai/v1',   model: 'llama-3.1-8b-instant' },
  openrouter: { url: 'https://openrouter.ai/api/v1',     model: 'meta-llama/llama-3.1-8b-instruct:free' },
  custom:     { url: '',                                  model: '' },
};

let settings = {};

async function loadSettings() {
  settings = await getSettings();
  document.getElementById('ai-enabled').checked = settings.aiEnabled || false;
  document.getElementById('ai-base-url').value = settings.aiBaseUrl || '';
  document.getElementById('ai-api-key').value = settings.aiApiKey || '';
  document.getElementById('ai-model').value = settings.aiModel || '';
  document.getElementById('feat-tags').checked = settings.featTags !== false;
  document.getElementById('feat-summary').checked = settings.featSummary !== false;

  // Mark preset button active if URL matches
  const currentUrl = settings.aiBaseUrl || '';
  document.querySelectorAll('.preset-btn').forEach(btn => {
    const p = PRESETS[btn.dataset.provider];
    if (p && p.url === currentUrl) btn.classList.add('active');
  });

  updateConfigVisibility();
}

function updateConfigVisibility() {
  const enabled = document.getElementById('ai-enabled').checked;
  document.getElementById('ai-config-body').classList.toggle('disabled', !enabled);
  document.getElementById('ai-features-body').classList.toggle('disabled', !enabled);
}

document.getElementById('ai-enabled').addEventListener('change', updateConfigVisibility);

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
      headers['HTTP-Referer'] = 'https://github.com/bsquang/naotab';
      headers['X-Title'] = 'naoTab';
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
  };
  await saveSettings(newSettings);
  settings = newSettings;
  showToast('✅ Settings saved!');
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

// ── Google Drive Sync UI ───────────────────────────────────────────────────────

async function loadDriveStatus() {
  const ds = await getDriveSyncSettings();
  const signedIn = !!ds.email;

  document.getElementById('drive-signed-out').style.display = signedIn ? 'none' : 'block';
  document.getElementById('drive-signed-in').style.display  = signedIn ? 'flex' : 'none';

  if (signedIn) {
    document.getElementById('drive-email').textContent = ds.email;
    document.getElementById('drive-enabled').checked = ds.enabled || false;
    document.getElementById('drive-last-synced').textContent = ds.lastSynced
      ? new Date(ds.lastSynced).toLocaleString('en-US')
      : 'Never';
  }
}

document.getElementById('btn-drive-signin').addEventListener('click', async () => {
  const btn = document.getElementById('btn-drive-signin');
  btn.disabled = true;
  btn.textContent = '⏳ Signing in...';
  try {
    const token = await getDriveToken(true);
    // Get user info
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const info = await res.json();
    const ds = await getDriveSyncSettings();
    await saveDriveSyncSettings({ ...ds, enabled: true, email: info.email || 'Connected' });
    await loadDriveStatus();
    showToast('✅ Signed in as ' + (info.email || 'Google account'));
  } catch (e) {
    showToast('❌ ' + e.message);
  }
  btn.disabled = false;
  btn.textContent = '🔑 Sign in with Google';
});

document.getElementById('drive-enabled').addEventListener('change', async (e) => {
  const ds = await getDriveSyncSettings();
  await saveDriveSyncSettings({ ...ds, enabled: e.target.checked });
  showToast(e.target.checked ? '✅ Auto-sync enabled' : '⏸️ Auto-sync paused');
});

document.getElementById('btn-drive-sync-now').addEventListener('click', async () => {
  const btn = document.getElementById('btn-drive-sync-now');
  const result = document.getElementById('drive-sync-result');
  btn.disabled = true;
  result.textContent = '⏳ Syncing...';
  try {
    const out = await driveSync();
    result.textContent = '✅ Synced ' + out.count + ' bookmarks';
    result.style.color = '#34a853';
    await loadDriveStatus();
  } catch (e) {
    result.textContent = '❌ ' + e.message;
    result.style.color = '#d93025';
  }
  btn.disabled = false;
});

document.getElementById('btn-drive-restore').addEventListener('click', async () => {
  const btn = document.getElementById('btn-drive-restore');
  const result = document.getElementById('drive-sync-result');
  if (!confirm('Restore and merge bookmarks from Google Drive? Local bookmarks will be merged (not deleted).')) return;
  btn.disabled = true;
  result.textContent = '⏳ Restoring...';
  try {
    const token = await getDriveToken(false);
    const remote = await driveDownload(token);
    if (!remote || !remote.bookmarks) {
      result.textContent = '⚠️ No backup found on Drive.';
      result.style.color = '#f9ab00';
    } else {
      const out = await importJSON(JSON.stringify(remote));
      result.textContent = '✅ Restored: ' + out.imported + ' new, ' + out.skipped + ' already existed';
      result.style.color = '#34a853';
    }
  } catch (e) {
    result.textContent = '❌ ' + e.message;
    result.style.color = '#d93025';
  }
  btn.disabled = false;
});

document.getElementById('btn-drive-signout').addEventListener('click', async () => {
  if (!confirm('Sign out from Google Drive sync? Your local bookmarks will not be deleted.')) return;
  await revokeDriveToken();
  await saveDriveSyncSettings({ enabled: false, lastSynced: null, email: null });
  await loadDriveStatus();
  showToast('👋 Signed out from Drive sync');
});

loadSettings();
loadDriveStatus();
