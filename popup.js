let allTabs = [];
let savedUrls = new Set(); // track saved URLs
let modalTab = null;     // tab currently being saved
let modalPageMeta = {};  // page meta tags read from tab

// ─── Load tabs ───────────────────────────────────────────────────────────────

async function loadTabs() {
  const [tabs, bookmarks] = await Promise.all([
    chrome.tabs.query({}),
    getBookmarks(),
  ]);

  savedUrls = new Set(bookmarks.map(b => b.url));

  allTabs = tabs.map(tab => ({
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title || '(No title)',
    url: tab.url || '',
    favIconUrl: tab.favIconUrl || '',
    active: tab.active,
    pinned: tab.pinned,
  }));

  updateTabCount(allTabs.length);
  renderTabs(allTabs);
}

function updateTabCount(count) {
  document.getElementById('tab-count').textContent = count;
}

function getFavicon(tab) {
  if (tab.favIconUrl && tab.favIconUrl.startsWith('http')) {
    return `<img class="favicon" src="${tab.favIconUrl}" onerror="this.style.display='none'" />`;
  }
  return `<span class="favicon-placeholder">🌐</span>`;
}

// ─── Render tabs ──────────────────────────────────────────────────────────────

function renderTabs(tabs) {
  const list = document.getElementById('tab-list');

  if (tabs.length === 0) {
    list.innerHTML = `<div class="empty">No tabs found</div>`;
    return;
  }

  const windows = {};
  tabs.forEach(tab => {
    if (!windows[tab.windowId]) windows[tab.windowId] = [];
    windows[tab.windowId].push(tab);
  });

  let html = '';
  let windowIndex = 1;

  for (const [windowId, windowTabs] of Object.entries(windows)) {
    const wIdx = windowIndex++;
    html += `<div class="window-group">
      <div class="window-header">
        🪟 Window ${wIdx} <span class="window-count">${windowTabs.length} tab</span>
        <div class="window-header-actions">
          <button class="btn-window-save" data-windowid="${windowId}" title="Save all tabs in this window">💾 Save window</button>
          <button class="btn-window-close" data-windowid="${windowId}" title="Close this window">✕ Close window</button>
        </div>
      </div>`;

    windowTabs.forEach(tab => {
      const titleEscaped = escapeHtml(tab.title);
      const urlEscaped = escapeHtml(tab.url);
      const isSaved = savedUrls.has(tab.url);

      html += `
        <div class="tab-item ${tab.active ? 'active-tab' : ''} ${isSaved ? 'saved-tab' : ''}" data-id="${tab.id}">
          <div class="tab-favicon">${getFavicon(tab)}</div>
          <div class="tab-info">
            <div class="tab-title" title="${titleEscaped}">${titleEscaped}</div>
            <div class="tab-url" title="${urlEscaped}">${urlEscaped}</div>
          </div>
          <div class="tab-actions">
            ${isSaved
              ? `<button class="btn-saved" disabled title="Already saved">✅</button>`
              : `<button class="btn-save-tab" data-id="${tab.id}" title="Save to Knowledge Base">💾</button>`
            }
            <button class="btn-copy-tab" data-title="${titleEscaped}" data-url="${urlEscaped}" title="Copy URL">📋</button>
            <button class="btn-goto-tab" data-id="${tab.id}" data-windowid="${tab.windowId}" title="Switch to this tab">↗</button>
            <button class="btn-close-tab" data-id="${tab.id}" title="Close tab">✕</button>
          </div>
        </div>`;
    });

    html += `</div>`;
  }

  list.innerHTML = html;

  // Save whole window
  list.querySelectorAll('.btn-window-save').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wid = parseInt(btn.dataset.windowid);
      const windowTabs = allTabs.filter(t => t.windowId === wid && !savedUrls.has(t.url));
      if (windowTabs.length === 0) { showToast('⚠️ All tabs already saved!'); return; }
      btn.textContent = `⏳ 0/${windowTabs.length}`;
      btn.disabled = true;
      let count = 0;
      for (const tab of windowTabs) {
        const meta = await getPageMeta(tab.id);
        await saveBookmark({
          url: tab.url,
          title: tab.title,
          reason: '',
          tags: suggestTags(tab.title, tab.url),
          favIconUrl: tab.favIconUrl,
          pageMeta: meta._aiText ? meta : undefined,
        });
        savedUrls.add(tab.url);
        count++;
        btn.textContent = `⏳ ${count}/${windowTabs.length}`;
      }
      btn.textContent = '💾 Save window';
      btn.disabled = false;
      showToast(`✅ Saved ${windowTabs.length} tabs!`);
      renderTabs(allTabs);
    });
  });

  // Close whole window
  list.querySelectorAll('.btn-window-close').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wid = parseInt(btn.dataset.windowid);
      await chrome.windows.remove(wid);
      allTabs = allTabs.filter(t => t.windowId !== wid);
      updateTabCount(allTabs.length);
      renderTabs(allTabs);
    });
  });

  // Close single tab
  list.querySelectorAll('.btn-close-tab').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const tabId = parseInt(btn.dataset.id);
      await chrome.tabs.remove(tabId);
      allTabs = allTabs.filter(t => t.id !== tabId);
      updateTabCount(allTabs.length);
      renderTabs(allTabs);
    });
  });

  // Bind events
  list.querySelectorAll('.btn-save-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tab = allTabs.find(t => t.id === parseInt(btn.dataset.id));
      if (tab) openSaveModal(tab);
    });
  });

  list.querySelectorAll('.btn-copy-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(`${btn.dataset.title}\n${btn.dataset.url}`);
    });
  });

  list.querySelectorAll('.btn-goto-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.windows.update(parseInt(btn.dataset.windowid), { focused: true });
      chrome.tabs.update(parseInt(btn.dataset.id), { active: true });
    });
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────

document.getElementById('search-input').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const filtered = allTabs.filter(tab =>
    tab.title.toLowerCase().includes(query) ||
    tab.url.toLowerCase().includes(query)
  );
  updateTabCount(filtered.length);
  renderTabs(filtered);
});

// ─── Toolbar buttons ──────────────────────────────────────────────────────────

document.getElementById('btn-copy-all').addEventListener('click', () => {
  const text = allTabs.map((t, i) => `${i + 1}. ${t.title}\n   ${t.url}`).join('\n\n');
  copyToClipboard(text);
});

document.getElementById('btn-copy-json').addEventListener('click', () => {
  copyToClipboard(JSON.stringify(allTabs.map(t => ({ title: t.title, url: t.url })), null, 2));
});

document.getElementById('btn-copy-markdown').addEventListener('click', () => {
  copyToClipboard(allTabs.map(t => `- [${t.title}](${t.url})`).join('\n'));
});

document.getElementById('btn-export-csv').addEventListener('click', () => {
  const rows = [['#', 'Title', 'URL', 'Window']];
  allTabs.forEach((t, i) => {
    rows.push([i + 1, `"${t.title.replace(/"/g, '""')}"`, `"${t.url.replace(/"/g, '""')}"`, t.windowId]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  downloadText('\uFEFF' + csv, `tabs_${today()}.csv`, 'text/csv');
  showToast('✅ CSV exported!');
});

// ─── Save Modal ───────────────────────────────────────────────────────────────

let selectedTags = [];

// Read SEO meta tags — returns object with AI string and raw fields to store
async function getPageMeta(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const getMeta = (selectors) => {
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            const val = el?.getAttribute('content') || el?.getAttribute('value');
            if (val && val.trim()) return val.trim();
          }
          return '';
        };

        const title = document.title || '';
        const description = getMeta(['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']);
        const ogTitle = getMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]']);
        const keywords = getMeta(['meta[name="keywords"]']);
        const ogType = getMeta(['meta[property="og:type"]']);
        const author = getMeta(['meta[name="author"]', 'meta[property="article:author"]']);
        const siteName = getMeta(['meta[property="og:site_name"]']);
        const ogImage = getMeta(['meta[property="og:image"]', 'meta[name="twitter:image"]']);
        const lang = document.documentElement.lang || '';
        const canonical = document.querySelector('link[rel="canonical"]')?.href || '';

        return { title, description, ogTitle, keywords, ogType, author, siteName, ogImage, lang, canonical };
      },
    });
    const meta = results?.[0]?.result || {};

    // Build compact string for AI prompt
    const parts = [];
    if (meta.ogTitle && meta.ogTitle !== meta.title) parts.push(`Title: ${meta.ogTitle}`);
    if (meta.description) parts.push(`Description: ${meta.description}`);
    if (meta.keywords) parts.push(`Keywords: ${meta.keywords}`);
    if (meta.ogType) parts.push(`Type: ${meta.ogType}`);
    if (meta.author) parts.push(`Author: ${meta.author}`);
    if (meta.siteName) parts.push(`Site: ${meta.siteName}`);
    meta._aiText = parts.join('\n');

    return meta;
  } catch (e) {
    return { _aiText: '' };
  }
}

async function openSaveModal(tab) {
  modalTab = tab;
  modalPageMeta = {};
  selectedTags = suggestTags(tab.title, tab.url);

  // Read meta tags in background (non-blocking)
  getPageMeta(tab.id).then(meta => {
    modalPageMeta = meta;
  });

  // Populate modal
  document.getElementById('modal-title').textContent = tab.title;
  document.getElementById('modal-url').textContent = tab.url;
  document.getElementById('modal-reason').value = '';
  document.getElementById('modal-summary').value = '';
  document.getElementById('modal-tag-input').value = '';
  document.getElementById('ai-suggest-status').textContent = '';
  document.getElementById('ai-suggest-status').className = 'ai-status';

  const faviconEl = document.getElementById('modal-favicon');
  if (tab.favIconUrl && tab.favIconUrl.startsWith('http')) {
    faviconEl.innerHTML = `<img src="${tab.favIconUrl}" style="width:20px;height:20px" onerror="this.parentElement.textContent='🌐'" />`;
  } else {
    faviconEl.textContent = '🌐';
  }

  // Check if AI is enabled
  const settings = await getSettings();
  const aiRow = document.getElementById('modal-ai-row');
  const summaryHint = document.getElementById('summary-hint');
  if (settings.aiEnabled && settings.aiBaseUrl && settings.aiModel) {
    aiRow.classList.remove('hidden');
    summaryHint.textContent = '(AI will fill if enabled)';
  } else {
    aiRow.classList.add('hidden');
    summaryHint.textContent = '(optional)';
  }

  renderModalTags();

  const modal = document.getElementById('save-modal');
  modal.classList.remove('hidden');
  document.getElementById('modal-reason').focus();
}

function renderModalTags() {
  const container = document.getElementById('modal-tags');
  container.innerHTML = selectedTags.map(tag =>
    `<span class="tag tag-selected" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} ✕</span>`
  ).join('');

  container.querySelectorAll('.tag').forEach(el => {
    el.addEventListener('click', () => {
      selectedTags = selectedTags.filter(t => t !== el.dataset.tag);
      renderModalTags();
    });
  });
}

// Add tag on Enter or comma
document.getElementById('modal-tag-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/,$/, '');
    if (val && !selectedTags.includes(val)) {
      selectedTags.push(val);
      renderModalTags();
    }
    e.target.value = '';
  }
});

document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-backdrop') // backdrop click handler
document.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);

document.getElementById('save-modal').addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) closeModal();
});

// AI Suggest button
document.getElementById('btn-ai-suggest').addEventListener('click', async () => {
  if (!modalTab) return;
  const btn = document.getElementById('btn-ai-suggest');
  const status = document.getElementById('ai-suggest-status');

  btn.disabled = true;
  status.textContent = '⏳ Asking AI...';
  status.className = 'ai-status loading';

  try {
    const result = await callAI(modalTab.title, modalTab.url, modalPageMeta._aiText || '');
    if (result) {
      const settings = await getSettings();
      if (settings.featTags && result.tags?.length) {
        selectedTags = [...new Set([...result.tags, ...selectedTags])].slice(0, 8);
        renderModalTags();
      }
      if (settings.featSummary && result.summary) {
        document.getElementById('modal-summary').value = result.summary;
      }
      status.textContent = '✅ Done!';
      status.className = 'ai-status';
    }
  } catch (e) {
    status.textContent = `❌ Error: ${e.message}`;
    status.className = 'ai-status error';
  }

  btn.disabled = false;
});

document.getElementById('modal-save').addEventListener('click', async () => {
  if (!modalTab) return;

  const reason = document.getElementById('modal-reason').value.trim();
  const summary = document.getElementById('modal-summary').value.trim();
  const result = await saveBookmark({
    url: modalTab.url,
    title: modalTab.title,
    reason,
    summary,
    tags: selectedTags,
    favIconUrl: modalTab.favIconUrl,
    pageMeta: modalPageMeta._aiText ? modalPageMeta : undefined,
  });

  if (result.duplicate) {
    showToast('⚠️ Tab already saved!');
  } else {
    savedUrls.add(modalTab.url);
    showToast('✅ Saved to Knowledge Base!');
    renderTabs(allTabs); // refresh to update saved state
  }

  closeModal();
});

function closeModal() {
  document.getElementById('save-modal').classList.add('hidden');
  modalTab = null;
}

// ─── Save current tab ─────────────────────────────────────────────────────────

document.getElementById('btn-save-current').addEventListener('click', async () => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab) { showToast('⚠️ Could not find current tab'); return; }
  if (savedUrls.has(activeTab.url)) { showToast('⚠️ Tab already saved!'); return; }
  const tab = allTabs.find(t => t.id === activeTab.id) || {
    id: activeTab.id,
    windowId: activeTab.windowId,
    title: activeTab.title || '(No title)',
    url: activeTab.url || '',
    favIconUrl: activeTab.favIconUrl || '',
    active: true,
  };
  openSaveModal(tab);
});

// ─── Open Knowledge Base ──────────────────────────────────────────────────────

document.getElementById('btn-open-kb').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});

// ─── Open Settings ────────────────────────────────────────────────────────────

document.getElementById('btn-open-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
});

// ─── Reload extension ─────────────────────────────────────────────────────────

document.getElementById('btn-reload-ext').addEventListener('click', () => {
  chrome.runtime.reload();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast('✅ Copied!')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('✅ Copied!');
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 2200);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
loadTabs();
