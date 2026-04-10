// ── State ──────────────────────────────────────────────────────────────────────
let allBookmarks = [];
let activeStatus = 'all';
let activeTag = null;
let searchQuery = '';
let currentView = 'graph';
let editingId = null;

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  allBookmarks = await getBookmarks();
  renderAll();
}

function renderAll() {
  updateSidebar();
  renderView();
}

// ── Filter logic ───────────────────────────────────────────────────────────────
function getFiltered() {
  return allBookmarks.filter(b => {
    if (activeStatus !== 'all' && b.status !== activeStatus) return false;
    if (activeTag && !b.tags.includes(activeTag)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inTitle = b.title.toLowerCase().includes(q);
      const inUrl = b.url.toLowerCase().includes(q);
      const inReason = (b.reason || '').toLowerCase().includes(q);
      const inTags = b.tags.some(t => t.toLowerCase().includes(q));
      if (!inTitle && !inUrl && !inReason && !inTags) return false;
    }
    return true;
  });
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
function updateSidebar() {
  const counts = { all: allBookmarks.length, unread: 0, reading: 0, revisit: 0, done: 0 };
  allBookmarks.forEach(b => { if (counts[b.status] !== undefined) counts[b.status]++; });
  Object.entries(counts).forEach(([k, v]) => {
    const el = document.getElementById('count-' + k);
    if (el) el.textContent = v;
  });

  // Tag cloud
  const tagCount = {};
  allBookmarks.forEach(b => b.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
  const sorted = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
  const cloud = document.getElementById('tag-cloud');
  cloud.innerHTML = sorted.map(function([tag, cnt]) {
    return '<span class="tag-pill ' + (activeTag === tag ? 'active' : '') + '" data-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + ' <small>' + cnt + '</small></span>';
  }).join('');
  cloud.querySelectorAll('.tag-pill').forEach(el => {
    el.addEventListener('click', () => {
      activeTag = activeTag === el.dataset.tag ? null : el.dataset.tag;
      renderAll();
    });
  });
}

// ── Views ──────────────────────────────────────────────────────────────────────
function renderView() {
  const filtered = getFiltered();
  document.getElementById('result-count').textContent = filtered.length + ' bookmark';
  if (currentView === 'list') renderList(filtered);
  else renderGraph(filtered);
}

// ── List view ──────────────────────────────────────────────────────────────────
function renderList(bookmarks) {
  const container = document.getElementById('list-view');

  if (bookmarks.length === 0) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<span class="emoji">' + (allBookmarks.length === 0 ? '📭' : '🔍') + '</span>' +
        '<p>' + (allBookmarks.length === 0
          ? 'Chưa có bookmark nào.\nMở popup extension và click 💾 trên tab muốn lưu!'
          : 'Không tìm thấy kết quả nào.') + '</p>' +
      '</div>';
    return;
  }

  container.innerHTML = bookmarks.map(b => {
    const favicon = b.favIconUrl && b.favIconUrl.startsWith('http')
      ? '<img src="' + escapeHtml(b.favIconUrl) + '" onerror="this.style.display=\'none\'" />'
      : '🌐';
    const tags = (b.tags || []).map(t =>
      '<span class="card-tag" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</span>'
    ).join('');
    const date = new Date(b.savedAt).toLocaleDateString('vi-VN');
    const statusClass = 'status-' + b.status;

    return (
      '<div class="bookmark-card" data-id="' + b.id + '">' +
        '<div class="card-header">' +
          '<div class="card-favicon">' + favicon + '</div>' +
          '<div class="card-main">' +
            '<a class="card-title" href="' + escapeHtml(b.url) + '" target="_blank" title="' + escapeHtml(b.title) + '">' + escapeHtml(b.title) + '</a>' +
            '<div class="card-url">' + escapeHtml(b.url) + '</div>' +
          '</div>' +
        '</div>' +
        (b.summary ? '<div class="card-summary">' + escapeHtml(b.summary) + '</div>' : '') +
        (b.reason ? '<div class="card-reason">' + escapeHtml(b.reason) + '</div>' : '') +
        '<div class="card-footer">' +
          '<div class="card-tags">' + tags + '</div>' +
          '<span class="card-date">' + date + '</span>' +
          '<select class="status-select ' + statusClass + '" data-id="' + b.id + '">' +
            '<option value="unread"' + (b.status === 'unread' ? ' selected' : '') + '>🔵 Chưa đọc</option>' +
            '<option value="reading"' + (b.status === 'reading' ? ' selected' : '') + '>📖 Đang đọc</option>' +
            '<option value="revisit"' + (b.status === 'revisit' ? ' selected' : '') + '>🔁 Xem lại</option>' +
            '<option value="done"' + (b.status === 'done' ? ' selected' : '') + '>✅ Xong</option>' +
          '</select>' +
          '<div class="card-actions">' +
            '<button class="btn-edit" data-id="' + b.id + '" title="Chỉnh sửa">✏️</button>' +
            '<button class="btn-delete" data-id="' + b.id + '" title="Xoá">🗑️</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  // Events
  container.querySelectorAll('.card-tag').forEach(el => {
    el.addEventListener('click', () => {
      activeTag = el.dataset.tag;
      renderAll();
    });
  });

  container.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      await updateBookmark(sel.dataset.id, { status: sel.value });
      allBookmarks = await getBookmarks();
      renderAll();
    });
  });

  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Xoá bookmark này?')) return;
      await deleteBookmark(btn.dataset.id);
      allBookmarks = await getBookmarks();
      renderAll();
      showToast('🗑️ Đã xoá');
    });
  });
}

// ── Graph view ─────────────────────────────────────────────────────────────────
function renderGraph(bookmarks) {
  const svg = d3.select('#graph-svg');
  svg.selectAll('*').remove();

  if (bookmarks.length === 0) return;

  const w = document.getElementById('graph-view').clientWidth;
  const h = document.getElementById('graph-view').clientHeight;

  const nodes = bookmarks.map(b => ({ ...b, id: b.id }));
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const shared = nodes[i].tags.filter(t => nodes[j].tags.includes(t));
      if (shared.length > 0) {
        links.push({ source: nodes[i].id, target: nodes[j].id, shared });
      }
    }
  }

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(120))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(w / 2, h / 2))
    .force('collision', d3.forceCollide(40));

  const g = svg.append('g');

  svg.call(d3.zoom().scaleExtent([0.2, 3]).on('zoom', e => g.attr('transform', e.transform)));

  const link = g.append('g').selectAll('line').data(links).join('line')
    .attr('stroke', '#dadce0').attr('stroke-width', 1.5).attr('stroke-opacity', 0.6);

  const nodeColor = { unread: '#1a73e8', reading: '#fbbc04', done: '#34a853', revisit: '#e37400' };

  const node = g.append('g').selectAll('g').data(nodes).join('g')
    .attr('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

  node.append('circle')
    .attr('r', 18)
    .attr('fill', d => nodeColor[d.status] || '#1a73e8')
    .attr('fill-opacity', 0.15)
    .attr('stroke', d => nodeColor[d.status] || '#1a73e8')
    .attr('stroke-width', 2);

  node.append('text')
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
    .attr('font-size', '14px').text('🔗');

  node.append('text')
    .attr('text-anchor', 'middle').attr('y', 28)
    .attr('font-size', '10px').attr('fill', '#3c4043')
    .text(d => d.title.length > 22 ? d.title.slice(0, 22) + '…' : d.title);

  const tooltip = document.getElementById('graph-tooltip');
  node
    .on('mouseover', (e, d) => {
      tooltip.style.display = 'block';
      tooltip.innerHTML =
        '<strong>' + escapeHtml(d.title) + '</strong>' +
        '<div class="tt-url">' + escapeHtml(d.url) + '</div>' +
        (d.reason ? '<div class="tt-reason">"' + escapeHtml(d.reason) + '"</div>' : '') +
        '<div class="tt-tags">' + d.tags.map(t => '<span class="tt-tag">' + escapeHtml(t) + '</span>').join('') + '</div>';
    })
    .on('mousemove', (e) => {
      tooltip.style.left = (e.offsetX + 14) + 'px';
      tooltip.style.top = (e.offsetY - 10) + 'px';
    })
    .on('mouseout', () => { tooltip.style.display = 'none'; })
    .on('dblclick', (e, d) => { window.open(d.url, '_blank'); });

  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
  });
}

// ── Edit modal ─────────────────────────────────────────────────────────────────
function openEditModal(id) {
  const b = allBookmarks.find(x => x.id === id);
  if (!b) return;
  editingId = id;
  document.getElementById('edit-summary').value = b.summary || '';
  document.getElementById('edit-reason').value = b.reason || '';
  document.getElementById('edit-tags').value = (b.tags || []).join(', ');
  document.getElementById('edit-modal').classList.remove('hidden');
  document.getElementById('edit-reason').focus();
}

document.getElementById('edit-cancel').addEventListener('click', () => {
  document.getElementById('edit-modal').classList.add('hidden');
});
document.getElementById('edit-modal').addEventListener('click', e => {
  if (e.target.classList.contains('edit-modal-backdrop'))
    document.getElementById('edit-modal').classList.add('hidden');
});
document.getElementById('edit-save').addEventListener('click', async () => {
  if (!editingId) return;
  const summary = document.getElementById('edit-summary').value.trim();
  const reason = document.getElementById('edit-reason').value.trim();
  const tags = document.getElementById('edit-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  await updateBookmark(editingId, { summary, reason, tags });
  allBookmarks = await getBookmarks();
  document.getElementById('edit-modal').classList.add('hidden');
  renderAll();
  showToast('✅ Đã cập nhật!');
});

// ── Toolbar events ─────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeStatus = btn.dataset.status;
    renderView();
  });
});

document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderView();
});

document.getElementById('btn-list-view').addEventListener('click', () => {
  currentView = 'list';
  document.getElementById('btn-list-view').classList.add('active');
  document.getElementById('btn-graph-view').classList.remove('active');
  document.getElementById('list-view').style.display = '';
  document.getElementById('graph-view').style.display = 'none';
  renderView();
});

document.getElementById('btn-graph-view').addEventListener('click', () => {
  currentView = 'graph';
  document.getElementById('btn-graph-view').classList.add('active');
  document.getElementById('btn-list-view').classList.remove('active');
  document.getElementById('list-view').style.display = 'none';
  document.getElementById('graph-view').style.display = 'block';
  renderView();
});

document.getElementById('btn-export').addEventListener('click', async () => {
  const json = await exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'naotab-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Đã xuất JSON!');
});

document.getElementById('btn-import-trigger').addEventListener('click', () => {
  document.getElementById('btn-import').click();
});
document.getElementById('btn-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const result = await importJSON(text);
    allBookmarks = await getBookmarks();
    renderAll();
    showToast('✅ Đã import ' + result.imported + ' bookmark (bỏ qua ' + result.skipped + ' trùng)');
  } catch (err) {
    showToast('❌ File JSON không hợp lệ');
  }
  e.target.value = '';
});

// ── Toast ──────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.add('hidden'), 2500);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Init — default graph view
document.getElementById('list-view').style.display = 'none';
document.getElementById('graph-view').style.display = 'block';
document.getElementById('btn-graph-view').classList.add('active');
document.getElementById('btn-list-view').classList.remove('active');
init();
