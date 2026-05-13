// ── State ──────────────────────────────────────────────────────────────────────
let allBookmarks = [];
let activeTag = null;
let excludedTags = new Set(); // tags excluded from graph edges
let searchQuery = '';
let currentView = 'list';
let currentGraphLevel = 'overview'; // overview|neighborhood|evidence
let editingId = null;
let panelId = null; // id bookmark đang hiển thị trong panel
let panelNodeType = 'bookmark';
let panelDirty = false;
let currentNetwork = null; // D3 graph instance (simulation, svg, links, nodes)
let runtimeSettings = {
  graphDefaultView: 'list',
  graphQualityMode: 'auto',
  graphMaxNodesPerLevel: 1200,
  graphMaxEdgesPerLevel: 4000,
};

// NEW in v5: Multi-layer graph support
let layerToggles = {
  concepts: JSON.parse(localStorage.getItem('layer_concepts') ?? 'true'),
  entities: JSON.parse(localStorage.getItem('layer_entities') ?? 'true'),
  keywords: JSON.parse(localStorage.getItem('layer_keywords') ?? 'false'),
};
const LAYER_COLORS = {
  bookmark: '#2563eb',
  concept: '#16a34a',
  entity: '#ea580c',
  keyword: '#eab308',
};
const MIN_RELEVANCE = 0.7; // Only show nodes with relevance >= 0.7

// ── vis.js Color Constants [Removed - No longer needed with D3.js migration] ──

// ── vis.js Data Transformation ─────────────────────────────────────────────────
// [Removed: These functions are no longer needed with D3.js migration]

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  const [bookmarks, settings] = await Promise.all([getBookmarks(), getSettings()]);
  allBookmarks = bookmarks;
  runtimeSettings = {
    ...runtimeSettings,
    graphDefaultView: settings.graphDefaultView === 'graph' ? 'graph' : 'list',
    graphQualityMode: ['auto', 'balanced', 'high'].includes(settings.graphQualityMode)
      ? settings.graphQualityMode
      : 'auto',
    graphMaxNodesPerLevel: Math.min(10000, Math.max(100, Number(settings.graphMaxNodesPerLevel || 1200))),
    graphMaxEdgesPerLevel: Math.min(30000, Math.max(500, Number(settings.graphMaxEdgesPerLevel || 4000))),
  };
  setViewMode(runtimeSettings.graphDefaultView, { render: false });
  renderAll();
}

function setViewMode(view, options = {}) {
  const { render = true } = options;
  currentView = view === 'graph' ? 'graph' : 'list';

  const isList = currentView === 'list';
  document.getElementById('btn-list-view').classList.toggle('active', isList);
  document.getElementById('btn-graph-view').classList.toggle('active', !isList);
  document.getElementById('list-view').style.display = isList ? '' : 'none';
  document.getElementById('graph-view').style.display = isList ? 'none' : 'block';
  document.getElementById('graph-level-toggle').classList.toggle('visible', !isList);

  if (render) renderView();
}

function setGraphLevel(level, options = {}) {
  const { render = true } = options;
  const normalized = ['overview', 'neighborhood', 'evidence'].includes(level) ? level : 'overview';
  currentGraphLevel = normalized;
  document.getElementById('btn-graph-level-overview').classList.toggle('active', normalized === 'overview');
  document.getElementById('btn-graph-level-neighborhood').classList.toggle('active', normalized === 'neighborhood');
  document.getElementById('btn-graph-level-evidence').classList.toggle('active', normalized === 'evidence');
  if (render && currentView === 'graph') renderView();
}

function renderAll() {
  updateSidebar();
  renderView();
}

// ── Filter logic ───────────────────────────────────────────────────────────────
function getFiltered() {
  let filtered = allBookmarks.filter(b => {
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

  // NEW in v3: Filter by content type
  const selectedTypes = new Set();
  document.querySelectorAll('.content-filter:checked').forEach(el => {
    selectedTypes.add(el.dataset.type);
  });
  
  if (selectedTypes.size > 0 && selectedTypes.size < 6) { // 6 total content types
    filtered = filtered.filter(b => selectedTypes.has(b.content_type || 'article'));
  }

  return filtered;
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
function updateSidebar() {
  const filtered = getFiltered();

  // Tag cloud
  const tagCount = {};
  allBookmarks.forEach(b => b.tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; }));
  const sorted = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
  const cloud = document.getElementById('tag-cloud');
  cloud.innerHTML = sorted.map(function([tag, cnt]) {
    const isActive = activeTag === tag;
    const isExcluded = excludedTags.has(tag);
    const cls = 'tag-pill' + (isActive ? ' active' : '') + (isExcluded ? ' excluded' : '');
    return (
      '<span class="' + cls + '" data-tag="' + escapeHtml(tag) + '">' +
        escapeHtml(tag) + ' <small>' + cnt + '</small>' +
        '<button class="tag-exclude-btn" data-tag="' + escapeHtml(tag) + '" title="' + (isExcluded ? 'Re-enable in graph' : 'Hide connections in graph') + '">' +
          (isExcluded ? '↩' : '✕') +
        '</button>' +
      '</span>'
    );
  }).join('');

  // Click pill → filter
  cloud.querySelectorAll('.tag-pill').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('tag-exclude-btn')) return;
      activeTag = activeTag === el.dataset.tag ? null : el.dataset.tag;
      renderAll();
    });
  });

  // Click ✕ → exclude/unexclude from graph edges
  cloud.querySelectorAll('.tag-exclude-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = btn.dataset.tag;
      if (excludedTags.has(tag)) {
        excludedTags.delete(tag);
      } else {
        excludedTags.add(tag);
      }
      renderAll();
    });
  });

  // Layer usage summary (visible scope)
  const layerCounts = {
    concepts: 0,
    entities: 0,
    keywords: 0,
  };
  filtered.forEach((b) => {
    layerCounts.concepts += Array.isArray(b.concepts) ? b.concepts.filter(c => (c?.relevance || 0) >= MIN_RELEVANCE).length : 0;
    layerCounts.entities += Array.isArray(b.entities) ? b.entities.length : 0;
    layerCounts.keywords += Array.isArray(b.keywords) ? b.keywords.filter(k => (k?.relevance || 0) >= MIN_RELEVANCE).length : 0;
  });
  const conceptLabel = document.getElementById('layer-concepts-label');
  const entityLabel = document.getElementById('layer-entities-label');
  const keywordLabel = document.getElementById('layer-keywords-label');
  if (conceptLabel) conceptLabel.textContent = `🟢 Concepts (${layerCounts.concepts})`;
  if (entityLabel) entityLabel.textContent = `🟠 Entities (${layerCounts.entities})`;
  if (keywordLabel) keywordLabel.textContent = `🟡 Keywords (${layerCounts.keywords})`;

  const layerSummaryEl = document.getElementById('layer-impact-summary');
  if (layerSummaryEl) {
    const enabled = [
      layerToggles.concepts ? 'concepts' : null,
      layerToggles.entities ? 'entities' : null,
      layerToggles.keywords ? 'keywords' : null,
    ].filter(Boolean);
    layerSummaryEl.textContent =
      `Layer impact: ${enabled.length}/3 enabled · graph mode ${currentGraphLevel}`;
  }

  const tagSummaryEl = document.getElementById('tag-impact-summary');
  if (tagSummaryEl) {
    const visibleTagCount = sorted.length;
    const excludedCount = excludedTags.size;
    const activeText = activeTag ? `active tag "${activeTag}"` : 'no active tag';
    tagSummaryEl.textContent =
      `Tag scope: ${activeText} · ${excludedCount} excluded · ${filtered.length}/${allBookmarks.length} visible`;
    if (visibleTagCount === 0) tagSummaryEl.textContent = 'Tag scope: no tags available yet';
  }
}

// ── Sidebar node list ──────────────────────────────────────────────────────────
function updateSidebarNodeList() {
  const filtered = getFiltered();
  const list = document.getElementById('sidebar-node-list');
  const count = document.getElementById('sidebar-node-count');
  count.textContent = filtered.length;

  if (filtered.length === 0) {
    list.innerHTML = '<div style="padding:10px 14px;font-size:11px;color:#9aa0a6">No nodes</div>';
    return;
  }

  list.innerHTML = filtered.map(b => {
    const isActive = b.id === panelId;
    const dotColor = b.summary ? '#1a73e8' : '#bdc1c6';
    return (
      '<div class="sidebar-node-item' + (isActive ? ' active' : '') + '" data-id="' + b.id + '">' +
        '<span class="sidebar-node-dot" style="background:' + dotColor + ';border:1.5px solid ' + dotColor + '"></span>' +
        '<span class="sidebar-node-name" title="' + escapeHtml(b.title) + '">' + escapeHtml(b.title) + '</span>' +
      '</div>'
    );
  }).join('');

  const snt = document.getElementById('sidebar-node-tooltip');

  list.querySelectorAll('.sidebar-node-item').forEach(el => {
    el.addEventListener('click', () => openNodePanel(el.dataset.id));

    el.addEventListener('mouseenter', (e) => {
      const b = allBookmarks.find(x => x.id === el.dataset.id);
      if (!b) return;
      snt.innerHTML =
        '<div class="snt-title">' + escapeHtml(b.title) + '</div>' +
        (b.summary
          ? '<div class="snt-summary">' + escapeHtml(b.summary) + '</div>'
          : '<div class="snt-no-summary">No summary yet</div>');
      const rect = el.getBoundingClientRect();
      snt.style.display = 'block';
      // Position to the right of sidebar
      snt.style.left = (rect.right + 8) + 'px';
      snt.style.top = Math.min(rect.top, window.innerHeight - snt.offsetHeight - 8) + 'px';
    });

    el.addEventListener('mouseleave', () => { snt.style.display = 'none'; });
  });
}

// ── Views ──────────────────────────────────────────────────────────────────────
function renderView() {
  const filtered = getFiltered();
  const levelSuffix = currentView === 'graph' ? ` · ${currentGraphLevel}` : '';
  document.getElementById('result-count').textContent = filtered.length + ' bookmark' + levelSuffix;
  if (currentView === 'list') renderList(filtered);
  else renderGraph(filtered);
  updateSidebarNodeList();
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
          : 'No results found.') + '</p>' +
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
    const date = new Date(b.savedAt).toLocaleDateString('en-US');

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

  // Click card → open side panel (ignore clicks on links/buttons)
  container.querySelectorAll('.bookmark-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if (e.target.closest('a, button, select')) return;
      openNodePanel(card.dataset.id);
    });
  });

  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this bookmark?')) return;
      await deleteBookmark(btn.dataset.id);
      allBookmarks = await getBookmarks();
      renderAll();
      showToast('🗑️ Deleted');
    });
  });
}

// ── Graph Data Building ────────────────────────────────────────────────────────
/**
 * buildEdgesFromTags(bookmarks)
 *
 * Extracts graph edges from bookmark tags. When multiple bookmarks share a tag,
 * creates an edge between them.
 *
 * @param {Array} bookmarks - Array of bookmark objects with tags property
 * @returns {Array} Array of edge objects { from, to, type, label, confidence }
 *
 * Algorithm:
 *  1. Build a map of tag -> [bookmarkIds]
 *  2. For each tag, create edges between all pairs of bookmarks with that tag
 *  3. Deduplicate edges by (from, to) pair
 *  4. Skip self-loops (from === to)
 */
function buildEdgesFromTags(bookmarks) {
  const edgeWeightMap = new Map(); // key => {from,to,weight,label}

  // Build tag -> [bookmarkIds] map
  const tagMap = {};
  bookmarks.forEach(b => {
    if (b.tags && Array.isArray(b.tags)) {
      b.tags.forEach(tag => {
        if (excludedTags.has(tag)) return;
        if (!tagMap[tag]) tagMap[tag] = [];
        tagMap[tag].push(b.id);
      });
    }
  });

  // For each tag, connect all bookmarks with that tag
  Object.entries(tagMap).forEach(([tag, bookmarkIds]) => {
    // Create edges between all pairs of bookmarks with this tag
    for (let i = 0; i < bookmarkIds.length; i++) {
      for (let j = i + 1; j < bookmarkIds.length; j++) {
        const from = bookmarkIds[i];
        const to = bookmarkIds[j];

        // Skip self-loops
        if (from === to) continue;

        // Normalize key ordering for undirected graph edges
        const key = from < to ? `${from}-${to}` : `${to}-${from}`;
        const existing = edgeWeightMap.get(key);
        if (existing) {
          existing.weight += 1;
        } else {
          edgeWeightMap.set(key, { from, to, weight: 1, label: tag });
        }
      }
    }
  });

  return Array.from(edgeWeightMap.values()).map((edge) => ({
    from: edge.from,
    to: edge.to,
    type: 'tag',
    label: edge.label,
    confidence: Math.min(1, edge.weight / 3),
    weight: edge.weight,
  }));
}

/**
 * computeNodeMetrics(bookmarks, edges)
 *
 * Calculates node properties for graph visualization:
 * - Degree: number of edges connected to each node (centrality)
 * - Communities: groups related bookmarks based on primary tag
 * - Value: degree + 1 (for node sizing in D3/vis.js)
 *
 * @param {Array} bookmarks - Array of bookmark objects with id, tags properties
 * @param {Array} edges - Array of edge objects from buildEdgesFromTags()
 * @returns {Object} { nodes: [...enhanced nodes], communities: {nodeId: communityId} }
 *
 * Algorithm:
 *  1. Initialize degree map with all bookmarks (0 initial degree)
 *  2. For each edge, increment degree of both nodes
 *  3. Detect communities using simplified tag-based clustering (primary tag per bookmark)
 *  4. Enhance each bookmark with: value (degree+1), degree, group (community)
 *  5. Return enhanced nodes and community map
 */
function computeNodeMetrics(bookmarks, edges) {
  // 1. Initialize degree map for all bookmarks
  const degreeMap = {};
  bookmarks.forEach(b => {
    degreeMap[b.id] = 0;
  });

  // 2. Count degree for each node
  edges.forEach(e => {
    if (degreeMap[e.from] !== undefined) {
      degreeMap[e.from]++;
    }
    if (degreeMap[e.to] !== undefined) {
      degreeMap[e.to]++;
    }
  });

  // 3. Detect communities using tag-based clustering
  const communities = {};
  const tagToComm = {}; // Map from primary tag to community ID
  let commId = 0;

  bookmarks.forEach(b => {
    if (b.tags && b.tags.length > 0) {
      const primaryTag = b.tags[0];
      if (!(primaryTag in tagToComm)) {
        tagToComm[primaryTag] = commId++;
      }
      communities[b.id] = tagToComm[primaryTag];
    } else {
      // Bookmarks with no tags get their own community
      communities[b.id] = commId++;
    }
  });

  // 4. Enhance nodes with computed properties
  const nodes = bookmarks.map(b => ({
    ...b,
    value: degreeMap[b.id] + 1, // +1 so isolated nodes (degree 0) have value 1 (still visible)
    degree: degreeMap[b.id],
    group: communities[b.id]
  }));

  return { nodes, communities };
}

// ── Community Coloring ─────────────────────────────────────────────────────────
const COMMUNITY_COLORS = [
  "#E91E63", "#00BCD4", "#8BC34A", "#FF5722", "#673AB7",
  "#FFC107", "#009688", "#F44336", "#3F51B5", "#CDDC39",
];

/**
 * assignCommunityColors(nodes)
 *
 * Assigns vibrant colors to nodes based on their community (topic cluster).
 * Bookmarks with the same primary tag get the same color.
 *
 * @param {Array} nodes - Array of node objects with group property (from computeNodeMetrics)
 * @returns {Array} Array of nodes with added color property
 */
function assignCommunityColors(nodes) {
  return nodes.map(n => ({
    ...n,
    color: COMMUNITY_COLORS[n.group % COMMUNITY_COLORS.length]
  }));
}

/**
 * generateStaticHTML(nodes, edges)
 *
 * Generates a self-contained HTML file with embedded vis.js graph visualization.
 * The HTML includes all necessary styling and JavaScript for a fully functional graph.
 *
 * @param {Array} nodes - Array of node objects with id, title, value, degree, group properties
 * @param {Array} edges - Array of edge objects with from, to, type, label, confidence properties
 * @returns {string} Complete HTML string ready to save to file
 */
function generateStaticHTML(nodes, edges) {
  // Prepare nodes: add color, size, label
  const preparedNodes = nodes.map(n => ({
    id: n.id,
    label: n.title,
    title: n.title, // vis.js uses title for tooltip
    value: n.value || 1,
    size: Math.sqrt(n.value || 1) * 15, // Size by degree
    color: COMMUNITY_COLORS[n.group % COMMUNITY_COLORS.length],
    group: n.group,
    degree: n.degree,
    tags: n.tags,
  }));

  // Prepare edges: add colors and styling
  const preparedEdges = edges.map(e => ({
    from: e.from,
    to: e.to,
    type: e.type,
    label: e.label,
    confidence: e.confidence,
    color: e.type === 'tag' ? '#555555' : '#FF5722', // Grey for tags, orange for inferred
    width: e.type === 'tag' ? 1 : 2,
    title: `${e.label} (${e.confidence ? e.confidence.toFixed(2) : '1.00'})`,
  }));

  // Serialize to JSON
  const nodesJson = JSON.stringify(preparedNodes, null, 2);
  const edgesJson = JSON.stringify(preparedEdges, null, 2);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>bookmark-vault Graph Export</title>
    <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1a1a2e;
            color: #eee;
        }

        #graph {
            width: 100vw;
            height: 100vh;
        }

        #controls {
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(10, 10, 30, 0.88);
            padding: 14px;
            border-radius: 10px;
            z-index: 10;
            max-width: 300px;
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            font-size: 13px;
        }

        #controls h3 {
            margin: 0 0 10px 0;
            font-size: 15px;
            letter-spacing: 0.5px;
        }

        #controls p {
            margin: 10px 0 0 0;
            font-size: 11px;
            color: #9ea3b0;
            line-height: 1.5;
        }

        #stats {
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(10, 10, 30, 0.88);
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 12px;
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .stat-item {
            margin: 4px 0;
        }

        .stat-label {
            color: #9ea3b0;
        }

        .stat-value {
            color: #FF5722;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div id="graph"></div>
    <div id="controls">
        <h3>bookmark-vault Graph</h3>
        <p>Click and drag to move nodes. Scroll to zoom. Physics simulation creates organic layout.</p>
    </div>
    <div id="stats">
        <div class="stat-item"><span class="stat-label">Nodes:</span> <span class="stat-value" id="stat-nodes">0</span></div>
        <div class="stat-item"><span class="stat-label">Edges:</span> <span class="stat-value" id="stat-edges">0</span></div>
    </div>

    <script>
        const originalNodes = ${nodesJson};
        const originalEdges = ${edgesJson};

        const nodes = new vis.DataSet(originalNodes);
        const edges = new vis.DataSet(originalEdges);

        // Update stats
        document.getElementById('stat-nodes').textContent = nodes.length;
        document.getElementById('stat-edges').textContent = edges.length;

        const options = {
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -26000,
                    centralGravity: 0.3,
                    springLength: 200,
                    springConstant: 0.04,
                }
            },
            nodes: {
                physics: true,
                scaling: {
                    label: true
                },
                widthConstraint: {
                    maximum: 200
                },
                font: {
                    size: 14,
                    color: '#eee'
                }
            },
            edges: {
                smooth: {
                    type: 'continuous'
                },
                font: {
                    size: 12,
                    color: '#9ea3b0'
                }
            }
        };

        const container = document.getElementById('graph');
        new vis.Network(container, { nodes, edges }, options);
    </script>
</body>
</html>`;

  return html;
}

// ── Export helpers ──────────────────────────────────────────────────────────────

/**
 * downloadFile(htmlContent, filename)
 * Trigger browser download of HTML file
 *
 * @param {string} htmlContent - Complete HTML string to download
 * @param {string} filename - Output filename (e.g. 'bookmark-vault-graph.html')
 * @returns {void}
 */
function downloadFile(htmlContent, filename) {
  try {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (err) {
    console.error('Download failed:', err);
  }
}

/**
 * showExportModal()
 * Display modal with export options
 */
function showExportModal() {
  const existingModal = document.getElementById('export-modal');
  if (existingModal) existingModal.remove();

  const today = new Date().toISOString().split('T')[0];
  const modal = document.createElement('div');
  modal.id = 'export-modal';
  modal.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-content export-modal">
        <h3>📊 Export Graph Options</h3>
        <div class="export-options">
          <label>
            <input type="checkbox" id="export-include-filters" checked>
            Include current filters (tags, search)
          </label>
          <label>
            <input type="checkbox" id="export-colors" checked>
            Use community colors
          </label>
          <label>
            Filename
            <input type="text" id="export-filename" placeholder="bookmark-vault-graph.html" value="bookmark-vault-graph-${today}.html">
          </label>
        </div>
        <div class="export-info">
          <p id="export-count">Preparing...</p>
        </div>
        <div class="export-actions">
          <button id="export-cancel" class="btn-secondary">Cancel</button>
          <button id="export-confirm" class="btn-primary">📥 Export</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const includeFilters = document.getElementById('export-include-filters');
  const confirm = document.getElementById('export-confirm');
  const cancel = document.getElementById('export-cancel');
  const filename = document.getElementById('export-filename');
  const countDisplay = document.getElementById('export-count');

  // Show count of bookmarks to be exported
  const bookmarksToExport = includeFilters.checked ? getFiltered() : allBookmarks;
  countDisplay.textContent = `${bookmarksToExport.length} node(s) will be exported`;

  includeFilters.addEventListener('change', () => {
    const count = includeFilters.checked ? getFiltered() : allBookmarks;
    countDisplay.textContent = `${count.length} node(s) will be exported`;
  });

  confirm.addEventListener('click', async () => {
    try {
      confirm.disabled = true;
      confirm.textContent = '⏳ Exporting...';

      const bookmarks = includeFilters.checked ? getFiltered() : allBookmarks;
      const edges = buildEdgesFromTags(bookmarks);
      const { nodes: metricNodes } = computeNodeMetrics(bookmarks, edges);
      const nodes = assignCommunityColors(metricNodes);

      const html = generateStaticHTML(nodes, edges);
      downloadFile(html, filename.value || 'bookmark-vault-graph.html');

      modal.remove();
      showToast('✅ Graph exported successfully!');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('❌ Export failed');
      confirm.disabled = false;
      confirm.textContent = '📥 Export';
    }
  });

  cancel.addEventListener('click', () => modal.remove());

  // Close on background click
  modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
    if (e.target === modal.querySelector('.modal-overlay')) {
      modal.remove();
    }
  });
}

// ── Deduplication functions ────────────────────────────────────────────────────
/**
 * deduplicateEntities(allNodes)
 * Merge entity nodes by normalized name. Consolidates all parent bookmarks
 * into a single entity node.
 *
 * @param {Array} allNodes - All nodes from graph rendering
 * @returns {Array} Deduplicated entity nodes
 */
function deduplicateEntities(allNodes) {
  const entityMap = {}; // normalized_name → {node, parents}
  const entityNodes = allNodes.filter(n => n.type === 'entity');
  
  entityNodes.forEach(node => {
    const normalized = normalizeEntityName(node.title, node.entity_type);
    if (!entityMap[normalized]) {
      entityMap[normalized] = {
        node: {
          ...node,
          title: normalized,
          merged_from: [],
          id: 'entity_dedup_' + normalized.replace(/\s+/g, '_').toLowerCase()
        },
        parents: new Set()
      };
    }
    if (node.parent) {
      entityMap[normalized].parents.add(node.parent);
      entityMap[normalized].node.merged_from.push(node.id);
    }
  });
  
  return Object.values(entityMap).map(e => ({
    ...e.node,
    parents: Array.from(e.parents)
  }));
}

/**
 * deduplicateKeywords(allNodes)
 * Merge keyword nodes by normalized name. Consolidates all parent bookmarks
 * into a single keyword node.
 *
 * @param {Array} allNodes - All nodes from graph rendering
 * @returns {Array} Deduplicated keyword nodes
 */
function deduplicateKeywords(allNodes) {
  const keywordMap = {}; // normalized_word → {node, parents}
  const keywordNodes = allNodes.filter(n => n.type === 'keyword');
  
  keywordNodes.forEach(node => {
    const normalized = normalizeKeywordName(node.title);
    if (!keywordMap[normalized]) {
      keywordMap[normalized] = {
        node: {
          ...node,
          title: normalized,
          merged_from: [],
          id: 'keyword_dedup_' + normalized
        },
        parents: new Set()
      };
    }
    if (node.parent) {
      keywordMap[normalized].parents.add(node.parent);
      keywordMap[normalized].node.merged_from.push(node.id);
    }
  });
  
  return Object.values(keywordMap).map(k => ({
    ...k.node,
    parents: Array.from(k.parents)
  }));
}

/**
 * updateEdgesForDedupNodes(edges, oldNodes, newNodes)
 * Update edges to point to deduplicated nodes instead of original nodes.
 *
 * @param {Array} edges - Original edges
 * @param {Array} oldNodes - Original nodes before dedup
 * @param {Array} newNodes - Deduplicated nodes
 * @returns {Array} Updated edges
 */
function updateEdgesForDedupNodes(edges, oldNodes, newNodes) {
  // Create mapping from old node ID to new node ID for dedup nodes
  const oldToNewMap = {};
  
  newNodes.forEach(newNode => {
    if (newNode.merged_from && Array.isArray(newNode.merged_from)) {
      newNode.merged_from.forEach(oldId => {
        oldToNewMap[oldId] = newNode.id;
      });
    }
  });
  
  // Update edges to use new node IDs
  return edges.map(e => {
    const source = e.source ?? e.from;
    const target = e.target ?? e.to;
    const newSource = oldToNewMap[source] || source;
    const newTarget = oldToNewMap[target] || target;
    
    return {
      ...e,
      source: newSource,
      target: newTarget,
      from: newSource,
      to: newTarget
    };
  });
}

function getGraphRenderBudget(level) {
  const baseNodeBudget = runtimeSettings.graphMaxNodesPerLevel || 1200;
  const baseEdgeBudget = runtimeSettings.graphMaxEdgesPerLevel || 4000;
  const quality = runtimeSettings.graphQualityMode || 'auto';

  let qualityFactor = 1;
  if (quality === 'balanced') qualityFactor = 0.85;
  if (quality === 'auto') qualityFactor = allBookmarks.length > 2000 ? 0.6 : (allBookmarks.length > 1000 ? 0.75 : 1);

  const levelFactors = {
    overview: { nodes: 0.45, edges: 0.35, includeMetadata: false, hideLabels: true },
    neighborhood: { nodes: 1, edges: 1, includeMetadata: true, hideLabels: false },
    evidence: { nodes: 0.7, edges: 0.45, includeMetadata: false, hideLabels: false },
  };
  const levelCfg = levelFactors[level] || levelFactors.overview;
  return {
    maxNodes: Math.max(100, Math.floor(baseNodeBudget * levelCfg.nodes * qualityFactor)),
    maxEdges: Math.max(200, Math.floor(baseEdgeBudget * levelCfg.edges * qualityFactor)),
    includeMetadata: levelCfg.includeMetadata,
    hideLabels: levelCfg.hideLabels,
  };
}

function capBookmarksForGraph(bookmarks, maxNodes) {
  if (bookmarks.length <= maxNodes) return bookmarks;
  const scored = bookmarks
    .map((b) => ({
      bookmark: b,
      score:
        (Array.isArray(b.tags) ? b.tags.length : 0) * 3 +
        (Array.isArray(b.concepts) ? b.concepts.length : 0) * 2 +
        (Array.isArray(b.entities) ? b.entities.length : 0) +
        (b.summary ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, maxNodes).map(x => x.bookmark);
}

function pruneEdgesByBudget(edges, maxEdges) {
  if (edges.length <= maxEdges) return edges;
  const sorted = [...edges].sort((a, b) => (b.weight || b.confidence || 0) - (a.weight || a.confidence || 0));
  return sorted.slice(0, maxEdges);
}

function getPrimaryClusterKey(bookmark) {
  const tags = Array.isArray(bookmark.tags) ? bookmark.tags.filter(Boolean) : [];
  const preferredTag = tags.find(t => !excludedTags.has(t));
  if (preferredTag) return { key: `tag:${preferredTag}`, label: preferredTag, tag: preferredTag, kind: 'tag' };
  try {
    const host = new URL(bookmark.url).hostname.replace(/^www\./, '');
    if (host) return { key: `domain:${host}`, label: host, tag: '', kind: 'domain' };
  } catch (_) {
    // no-op
  }
  return { key: 'misc:untagged', label: 'untagged', tag: '', kind: 'misc' };
}

function buildOverviewGraphData(bookmarks, budget) {
  const selected = capBookmarksForGraph(bookmarks, budget.maxNodes * 2);
  const clusterMap = new Map();
  const bookmarkToCluster = new Map();

  selected.forEach((b) => {
    const cluster = getPrimaryClusterKey(b);
    if (!clusterMap.has(cluster.key)) {
      clusterMap.set(cluster.key, {
        id: `cluster_${cluster.key.replace(/[^a-zA-Z0-9:_-]/g, '_')}`,
        type: 'cluster',
        title: cluster.label,
        clusterTag: cluster.tag,
        clusterKind: cluster.kind,
        memberCount: 0,
        degree: 0,
        value: 1,
        summary: '',
        url: '',
        reading_time: 8,
      });
    }
    const node = clusterMap.get(cluster.key);
    node.memberCount += 1;
    node.value = Math.max(1, node.memberCount);
    bookmarkToCluster.set(b.id, node.id);
  });

  const rawEdges = buildEdgesFromTags(selected);
  const interCluster = new Map();
  rawEdges.forEach((e) => {
    const a = bookmarkToCluster.get(e.from);
    const b = bookmarkToCluster.get(e.to);
    if (!a || !b || a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const item = interCluster.get(key) || { source: a, target: b, weight: 0, confidence: 0.4, type: 'cluster' };
    item.weight += (e.weight || 1);
    item.confidence = Math.min(1, 0.25 + item.weight / 8);
    interCluster.set(key, item);
  });

  const nodes = Array.from(clusterMap.values())
    .sort((a, b) => b.memberCount - a.memberCount)
    .slice(0, Math.max(30, Math.floor(budget.maxNodes * 0.65)));
  const nodeIds = new Set(nodes.map(n => n.id));
  const links = pruneEdgesByBudget(
    Array.from(interCluster.values()).filter(e => nodeIds.has(e.source) && nodeIds.has(e.target)),
    Math.max(80, Math.floor(budget.maxEdges * 0.5))
  );
  return { nodes, links };
}

function buildNeighborhoodScope(bookmarks, budget) {
  const selected = capBookmarksForGraph(bookmarks, budget.maxNodes * 2);
  if (selected.length <= budget.maxNodes) return selected;
  const edges = buildEdgesFromTags(selected);

  let centerId = panelId && selected.some(b => String(b.id) === String(panelId))
    ? String(panelId)
    : String(selected[0]?.id || '');
  if (!centerId) return selected.slice(0, budget.maxNodes);

  const adjacency = new Map();
  edges.forEach((e) => {
    const a = String(e.from);
    const b = String(e.to);
    const w = Number(e.weight || 1);
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a).push({ id: b, w });
    adjacency.get(b).push({ id: a, w });
  });

  const picked = new Set([centerId]);
  const neighbors = (adjacency.get(centerId) || []).sort((x, y) => y.w - x.w);
  for (let i = 0; i < neighbors.length && picked.size < budget.maxNodes; i++) picked.add(neighbors[i].id);

  // Fill remaining slots with high-degree nodes from current adjacency scope
  if (picked.size < budget.maxNodes) {
    const degreeRank = selected
      .map(b => ({ id: String(b.id), degree: (adjacency.get(String(b.id)) || []).length }))
      .sort((a, b) => b.degree - a.degree);
    degreeRank.forEach((entry) => {
      if (picked.size >= budget.maxNodes) return;
      picked.add(entry.id);
    });
  }

  return selected.filter(b => picked.has(String(b.id)));
}

function buildEvidenceScope(bookmarks, budget) {
  const scored = bookmarks
    .map((b) => ({
      bookmark: b,
      score:
        (b.summary ? 4 : 0) +
        (Array.isArray(b.concepts) ? b.concepts.length : 0) * 2 +
        (Array.isArray(b.entities) ? b.entities.length : 0) +
        (Array.isArray(b.keywords) ? b.keywords.length : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, budget.maxNodes).map(x => x.bookmark);
  return selected.length > 0 ? selected : capBookmarksForGraph(bookmarks, budget.maxNodes);
}

// ── Graph view (D3.js) ─────────────────────────────────────────────────────────
function renderGraph(bookmarks) {
  if (bookmarks.length === 0) return;

  const container = document.getElementById('graph-view');
  if (!container) return;

  const budget = getGraphRenderBudget(currentGraphLevel);
  if (currentGraphLevel === 'overview') {
    const overview = buildOverviewGraphData(bookmarks, budget);
    const chart = createD3Chart({
      nodes: overview.nodes,
      links: overview.links.map(e => ({
        source: e.source,
        target: e.target,
        value: e.confidence || 0.4,
        type: 'cluster',
      })),
    }, overview.nodes, budget);
    container.innerHTML = '';
    container.appendChild(chart);
    return;
  }

  const scopedBookmarks = currentGraphLevel === 'neighborhood'
    ? buildNeighborhoodScope(bookmarks, budget)
    : buildEvidenceScope(bookmarks, budget);
  const selectedBookmarks = capBookmarksForGraph(scopedBookmarks, budget.maxNodes);

  // Build edges and compute metrics for bookmarks only
  const rawEdges = buildEdgesFromTags(selectedBookmarks);
  const edges = pruneEdgesByBudget(rawEdges, budget.maxEdges);
  const { nodes: metricNodes } = computeNodeMetrics(selectedBookmarks, edges);
  // Normalize bookmark graph node type.
  // Note: bookmark records already have domain "type" (source/entity/...) from schema.
  // For graph rendering, we must keep bookmark nodes as type='bookmark'.
  const bookmarkNodes = metricNodes.map(n => ({
    ...n,
    bookmark_type: n.type || 'unknown',
    type: 'bookmark'
  }));

  // NEW in v5: Build multi-layer nodes (concepts, entities, keywords)
  const allNodes = [...bookmarkNodes]; // Start with normalized bookmark nodes
  const nodeMap = {};
  bookmarkNodes.forEach(n => { nodeMap[n.id] = n; });
  
  // Extract concept/entity/keyword nodes (disabled for overview/evidence modes)
  if (budget.includeMetadata) {
    selectedBookmarks.forEach((b) => {
      if (b.concepts && Array.isArray(b.concepts)) {
        b.concepts.forEach((concept, idx) => {
          if (concept.relevance >= MIN_RELEVANCE) {
            const conceptId = `concept_${b.id}_${idx}`;
            allNodes.push({
              id: conceptId,
              type: 'concept',
              title: concept.name,
              relevance: concept.relevance,
              parent: b.id,
              value: 0.5,
              degree: 0,
              group: 999,
              summary: '',
              url: '',
              reading_time: 0,
              layerEnabled: layerToggles.concepts
            });
          }
        });
      }

      if (b.entities && Array.isArray(b.entities)) {
        b.entities.forEach((entity, idx) => {
          const entityId = `entity_${b.id}_${idx}`;
          allNodes.push({
            id: entityId,
            type: 'entity',
            title: entity.name,
            entity_type: entity.type,
            parent: b.id,
            value: 0.3,
            degree: 0,
            group: 999,
            summary: '',
            url: '',
            reading_time: 0,
            layerEnabled: layerToggles.entities
          });
        });
      }

      if (b.keywords && Array.isArray(b.keywords)) {
        b.keywords.forEach((kw, idx) => {
          if (kw.relevance >= MIN_RELEVANCE) {
            const kwId = `keyword_${b.id}_${idx}`;
            allNodes.push({
              id: kwId,
              type: 'keyword',
              title: kw.word,
              frequency: kw.frequency,
              relevance: kw.relevance,
              parent: b.id,
              value: 0.2,
              degree: 0,
              group: 999,
              summary: '',
              url: '',
              reading_time: 0,
              layerEnabled: layerToggles.keywords
            });
          }
        });
      }
    });
  }

  // NEW in v5: Build edges between bookmarks and their metadata nodes
  const allEdges = [...edges];
  allNodes.forEach(node => {
    if (node.parent) {
      // Connect metadata nodes to their parent bookmark
      allEdges.push({
        source: node.parent,
        target: node.id,
        type: node.type === 'concept' ? 'has_concept' : (node.type === 'entity' ? 'has_entity' : 'has_keyword'),
        label: '',
        confidence: node.relevance || 0.8
      });
    }
  });

  // NEW in v6: Deduplicate entities and keywords
  const nonDedupNodes = allNodes.filter(n => n.type === 'bookmark' || n.type === 'concept');
  const entityNodes = deduplicateEntities(allNodes);
  const keywordNodes = deduplicateKeywords(allNodes);
  
  // Combine dedup entities and keywords with other nodes
  const dedupAllNodes = [...nonDedupNodes, ...entityNodes, ...keywordNodes];
  
  // Update edges to point to deduplicated nodes
  const dedupAllEdges = updateEdgesForDedupNodes(allEdges, allNodes, dedupAllNodes);

  // Prepare D3 data format (using deduplicated nodes)
  const data = {
    nodes: dedupAllNodes.map(n => ({
      ...n,
      id: n.id,
      // Ensure graph type remains in the supported set
      type: (n.type === 'concept' || n.type === 'entity' || n.type === 'keyword') ? n.type : 'bookmark',
      group: n.group,
      value: n.value,
      degree: n.degree,
      tags: n.tags || [],
      title: n.title || n.id,
      summary: n.summary || '',
      url: n.url || '',
      reading_time: n.reading_time || 5,
      relevance: n.relevance || 1
    })),
    links: dedupAllEdges.map(e => ({
      source: e.source || e.from,
      target: e.target || e.to,
      value: e.confidence || 1.0,
      label: e.label,
      type: e.type
    }))
  };

  // Create D3 chart with multi-layer support
  const chart = createD3Chart(data, dedupAllNodes, budget);

  // Render
  container.innerHTML = '';
  container.appendChild(chart);
}

function truncateLabel(text, maxLen = 25) {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
}

function computeFitTransform(nodes, width, height, padding = 0.85) {
  if (!nodes || nodes.length === 0) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }

  if (nodes.length === 1) {
    // Single node: center it
    return { scale: 1, translateX: 0, translateY: 0 };
  }

  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const extentX = maxX - minX || 1;
  const extentY = maxY - minY || 1;

  const scale = Math.min(width / extentX, height / extentY) * padding;
  const translateX = -((minX + maxX) / 2) * scale;
  const translateY = -((minY + maxY) / 2) * scale;

  return { scale, translateX, translateY };
}

function tuneForces(simulation, nodeCount, edgeCount, links) {
  const edgeRatio = edgeCount / Math.max(nodeCount, 1);

  // Auto-tune based on graph density and size
  const chargeStrength = nodeCount > 50 ? -400 : -300;
  const linkDistance = edgeRatio > 2 ? 40 : 50;
  const centerStrength = edgeCount > nodeCount * 1.5 ? 0.08 : 0.05;

  simulation
    .force("link", d3.forceLink(links).id(d => d.id).distance(linkDistance))
    .force("charge", d3.forceManyBody().strength(chargeStrength))
    .force("collide", d3.forceCollide(d => 3 + (d.reading_time || 5) / 2 + 3))
    .force("x", d3.forceX(0).strength(centerStrength))
    .force("y", d3.forceY(0).strength(centerStrength));
}

function createD3Chart(data, allNodes, budget = {}) {
  const container = document.getElementById('graph-view');
  const width = container.clientWidth || 928;
  const height = container.clientHeight || 680;

  const links = data.links.map(d => ({...d}));
  const nodes = data.nodes.map(d => ({...d}));
  
  // Normalize by string key to avoid number/string ID mismatches
  const canonicalNodeIdByKey = new Map(nodes.map(n => [String(n.id), n.id]));
  
  // Filter and remap links to canonical node IDs used by the current graph nodes
  const validLinks = links
    .map(link => {
      const sourceRaw = (link.source && typeof link.source === 'object') ? link.source.id : link.source;
      const targetRaw = (link.target && typeof link.target === 'object') ? link.target.id : link.target;
      const sourceId = canonicalNodeIdByKey.get(String(sourceRaw));
      const targetId = canonicalNodeIdByKey.get(String(targetRaw));

      if (sourceId === undefined || targetId === undefined) {
        console.warn(`Skipping orphaned link: ${String(sourceRaw)} -> ${String(targetRaw)}`);
        return null;
      }

      return {
        ...link,
        source: sourceId,
        target: targetId
      };
    })
    .filter(Boolean);

  if (validLinks.length === 0 && links.length > 0) {
    console.warn(`All ${links.length} links were filtered out. Check ID consistency between nodes and links.`);
  } else if (links.length > validLinks.length) {
    console.warn(`Filtered ${links.length - validLinks.length} invalid links out of ${links.length}.`);
  }

  // D3 force simulation with initial tuning
  const simulation = d3.forceSimulation(nodes);
  tuneForces(simulation, nodes.length, validLinks.length, validLinks);

  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .attr("style", "width: 100%; height: 100%; background: #f8f9fa;");

  // Zoom and pan functionality (TODO 2)
  const g = svg.append("g").attr("class", "graph-content");
  
  const zoom = d3.zoom()
    .scaleExtent([0.5, 3])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });

  svg.call(zoom);

  // Links - NEW in v5: Style by relationship type
  const link = g.append("g")
    .selectAll("line")
    .data(validLinks)
    .join("line")
    .attr("stroke", d => {
      if (d.type === 'has_concept' || d.type === 'has_entity' || d.type === 'has_keyword') {
        return '#ccc'; // Lighter color for metadata edges
      }
      return '#999'; // Regular edges between bookmarks
    })
    .attr("stroke-opacity", d => {
      if (d.type === 'has_concept' || d.type === 'has_entity' || d.type === 'has_keyword') {
        return 0.3; // Lower opacity for metadata edges
      }
      return 0.6;
    })
    .attr("stroke-dasharray", d => {
      if (d.type === 'has_concept') return '5,5'; // Dashed for concepts
      if (d.type === 'has_entity') return '3,3'; // Dotted for entities
      if (d.type === 'has_keyword') return '2,2'; // Fine dots for keywords
      return null;
    })
    .attr("stroke-width", d => Math.sqrt(d.value || 1));

  // NEW in v5: Node sizing and coloring by type
  function getNodeRadius(d) {
    if (d.type === 'bookmark') return 3 + (d.reading_time || 5) / 2; // Large
    if (d.type === 'concept') return 5; // Medium
    if (d.type === 'entity') return 3; // Small
    if (d.type === 'keyword') return 2; // Tiny
    if (d.type === 'cluster') return 7 + Math.min(18, Math.sqrt(d.memberCount || d.value || 1));
    return 3;
  }

  function getNodeColor(d) {
    // If layer is disabled, render as gray
    if (d.layerEnabled === false) {
      return '#d0d0d0';
    }
    if (d.type === 'cluster') {
      if (d.clusterKind === 'tag') return '#4338ca';
      if (d.clusterKind === 'domain') return '#0f766e';
      return '#6b7280';
    }
    return LAYER_COLORS[d.type] || COMMUNITY_COLORS[d.group % COMMUNITY_COLORS.length];
  }

  // Nodes
  const node = g.append("g")
    .attr("stroke", "#fff")
    .attr("stroke-width", 1.5)
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", getNodeRadius)
    .attr("fill", getNodeColor)
    .style("cursor", "pointer");

  // Node tooltips
  node.append("title")
    .text(d => d.title || d.id);

  // NEW in v5: Node labels with type awareness
  const labels = g.append("g")
    .attr("class", "graph-labels")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .attr("class", "graph-label")
    .attr("text-anchor", "middle")
    .attr("pointer-events", "none")
    .style("font-size", d => d.type === 'keyword' ? '8px' : '10px')
    .style("fill", d => {
      if (d.type === 'concept') return '#166534';
      if (d.type === 'entity') return '#92400e';
      if (d.type === 'keyword') return '#ca8a04';
      return '#666';
    })
    .style("opacity", budget.hideLabels ? 0 : 0.8)
    .text(d => truncateLabel(d.title || d.id, d.type === 'keyword' ? 15 : 25));

  // Drag behavior
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  node.call(d3.drag()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended));

  // NEW in v5: Node click handling for all node types (bookmarks, concepts, entities, keywords)
  node.on("click", (event, d) => {
    event.stopPropagation();
    highlightNodeAndNeighbors(svg, d.id, validLinks);
    if (d.type === 'cluster') {
      if (d.clusterTag) {
        activeTag = activeTag === d.clusterTag ? null : d.clusterTag;
        setViewMode('list');
        showToast(activeTag ? `🎯 Scoped to tag: ${activeTag}` : '🔎 Cleared cluster scope');
      } else {
        searchQuery = d.title || '';
        document.getElementById('search-input').value = searchQuery;
        setViewMode('list');
        showToast(`🔎 Scoped to cluster: ${d.title}`);
      }
      return;
    }
    // Open panel for bookmark/metadata nodes
    openNodePanel(d.id, d.type || 'bookmark');
  });

  // Background click: reset highlight + close panel
  svg.on("click", () => {
    resetGraphHighlight(svg);
    closeNodePanel();
  });

  // Double-click node: open URL (bookmarks only)
  node.on("dblclick", (event, d) => {
    if (d.type === 'bookmark' && d.url) window.open(d.url, '_blank');
  });

  // Track tick count for fit-to-bounds (TODO 3)
  let tickCount = 0;
  const maxTicks = budget.hideLabels ? 200 : 300;
  let fitApplied = false;

  // Simulation tick
  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);

    labels
      .attr("x", d => d.x)
      .attr("y", d => d.y + 3 + getNodeRadius(d) + 10);

    // Apply fit-to-bounds when simulation stabilizes
    tickCount++;
    if (!fitApplied && (simulation.alpha() < 0.01 || tickCount >= maxTicks)) {
      fitApplied = true;
      const fitTransform = computeFitTransform(nodes, width, height, 0.85);
      const t = d3.zoomIdentity
        .translate(fitTransform.translateX, fitTransform.translateY)
        .scale(fitTransform.scale);
      svg.transition()
        .duration(budget.hideLabels ? 280 : 500)
        .call(zoom.transform, t);
    }
  });

  currentNetwork = { simulation, svg, validLinks, nodes, data, zoom, g, labels };
  return svg.node();
}

function highlightNodeAndNeighbors(svg, nodeId, links) {
  const neighbors = new Set();
  links.forEach(link => {
    if (link.source.id === nodeId) neighbors.add(link.target.id);
    if (link.target.id === nodeId) neighbors.add(link.source.id);
  });

  svg.selectAll("circle")
    .attr("opacity", d => (d.id === nodeId || neighbors.has(d.id)) ? 1 : 0.3);

  svg.selectAll(".graph-label")
    .attr("opacity", d => (d.id === nodeId || neighbors.has(d.id)) ? 0.9 : 0.2);

  svg.selectAll("line")
    .attr("stroke", d =>
      (d.source.id === nodeId || d.target.id === nodeId) ? '#1a73e8' : '#999'
    )
    .attr("stroke-width", d =>
      (d.source.id === nodeId || d.target.id === nodeId) ? 2 : Math.sqrt(d.value || 1)
    );
}

function resetGraphHighlight(svg) {
  svg.selectAll("circle").attr("opacity", 1);
  svg.selectAll(".graph-label").attr("opacity", 0.8);
  svg.selectAll("line")
    .attr("stroke", "#999")
    .attr("stroke-width", d => Math.sqrt(d.value || 1));
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
  showToast('✅ Updated!');
});

// ── Toolbar events ─────────────────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderView();
});

document.getElementById('btn-list-view').addEventListener('click', () => {
  setViewMode('list');
});

document.getElementById('btn-graph-view').addEventListener('click', () => {
  setViewMode('graph');
});

document.getElementById('btn-graph-level-overview').addEventListener('click', () => {
  setGraphLevel('overview');
});
document.getElementById('btn-graph-level-neighborhood').addEventListener('click', () => {
  setGraphLevel('neighborhood');
});
document.getElementById('btn-graph-level-evidence').addEventListener('click', () => {
  setGraphLevel('evidence');
});

document.getElementById('btn-refresh').addEventListener('click', async () => {
  const [bookmarks, settings] = await Promise.all([getBookmarks(), getSettings()]);
  allBookmarks = bookmarks;
  runtimeSettings = {
    ...runtimeSettings,
    graphDefaultView: settings.graphDefaultView === 'graph' ? 'graph' : 'list',
    graphQualityMode: ['auto', 'balanced', 'high'].includes(settings.graphQualityMode)
      ? settings.graphQualityMode
      : 'auto',
    graphMaxNodesPerLevel: Math.min(10000, Math.max(100, Number(settings.graphMaxNodesPerLevel || 1200))),
    graphMaxEdgesPerLevel: Math.min(30000, Math.max(500, Number(settings.graphMaxEdgesPerLevel || 4000))),
  };
  closeNodePanel();
  setViewMode(runtimeSettings.graphDefaultView, { render: false });
  renderAll();
  await refreshAIToolsState();
  showToast('🔄 Refreshed');
});

function initToolbarDropdowns() {
  const dropdowns = Array.from(document.querySelectorAll('.toolbar-dropdown'));

  function closeAll(except = null) {
    dropdowns.forEach(dd => {
      if (dd !== except) dd.classList.remove('open');
    });
  }

  document.getElementById('btn-export-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('export-dropdown');
    const isOpen = dd.classList.contains('open');
    closeAll();
    if (!isOpen) dd.classList.add('open');
  });

  document.getElementById('btn-ai-toggle').addEventListener('click', async (e) => {
    e.stopPropagation();
    await refreshAIToolsState();
    const dd = document.getElementById('ai-dropdown');
    const isOpen = dd.classList.contains('open');
    closeAll();
    if (!isOpen) dd.classList.add('open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.toolbar-dropdown')) closeAll();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });

  // Close dropdown when selecting an action
  [
    'btn-export-graph',
    'btn-export-obsidian',
    'btn-open-settings',
    'btn-extract-all',
    'btn-lint',
    'btn-health'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => closeAll());
    }
  });
}

async function refreshAIToolsState() {
  const settings = await getSettings();
  const aiReady = !!settings.aiEnabled;

  const extractBtn = document.getElementById('btn-extract-all');
  const aiToggleBtn = document.getElementById('btn-ai-toggle');
  const lintBtn = document.getElementById('btn-lint');
  const aiMenuHint = document.getElementById('ai-menu-hint');

  if (extractBtn) {
    extractBtn.disabled = !aiReady;
    extractBtn.title = aiReady
      ? 'Extract metadata for all bookmarks'
      : 'AI not configured';
  }
  if (lintBtn) {
    lintBtn.disabled = !aiReady;
    lintBtn.title = aiReady
      ? 'Run lint check (AI-powered)'
      : 'AI not configured';
  }
  if (aiToggleBtn) {
    aiToggleBtn.disabled = false; // Keep dropdown accessible so Health remains reachable
  }
  if (aiMenuHint) {
    aiMenuHint.classList.toggle('hidden', aiReady);
  }
}

function openSettingsPage() {
  const fallbackUrl = chrome?.runtime?.getURL
    ? chrome.runtime.getURL('settings.html')
    : 'settings.html';
  if (chrome?.runtime?.openOptionsPage) {
    Promise.resolve(chrome.runtime.openOptionsPage())
      .catch(() => {
        window.location.href = fallbackUrl;
      });
    return;
  }
  window.location.href = fallbackUrl;
}

function setTopbarAsyncStatus(label, progressPercent = null) {
  const wrap = document.getElementById('topbar-async-status');
  const text = document.getElementById('topbar-async-label');
  const progress = document.getElementById('topbar-async-progress');
  const fill = document.getElementById('topbar-async-fill');
  if (!wrap || !text || !progress || !fill) return;
  text.textContent = label || '';
  if (typeof progressPercent === 'number') {
    progress.classList.add('visible');
    fill.style.width = `${Math.max(0, Math.min(100, progressPercent))}%`;
  } else {
    progress.classList.remove('visible');
    fill.style.width = '0%';
  }
  wrap.classList.remove('hidden');
}

function clearTopbarAsyncStatus() {
  const wrap = document.getElementById('topbar-async-status');
  const text = document.getElementById('topbar-async-label');
  const progress = document.getElementById('topbar-async-progress');
  const fill = document.getElementById('topbar-async-fill');
  if (!wrap || !text || !progress || !fill) return;
  wrap.classList.add('hidden');
  text.textContent = '';
  progress.classList.remove('visible');
  fill.style.width = '0%';
}

document.getElementById('btn-open-settings').addEventListener('click', () => {
  openSettingsPage();
});

// NEW in v5: Layer toggle buttons
['concepts', 'entities', 'keywords'].forEach(layer => {
  const btn = document.getElementById(`btn-layer-${layer}`);
  if (btn) {
    btn.classList.toggle('active', layerToggles[layer]);
    btn.addEventListener('click', () => {
      layerToggles[layer] = !layerToggles[layer];
      localStorage.setItem(`layer_${layer}`, layerToggles[layer]);
      btn.classList.toggle('active', layerToggles[layer]);
      renderAll();
    });
  }
});

// NEW in v5: Batch extraction button
const btnExtractAll = document.getElementById('btn-extract-all');
if (btnExtractAll) {
  btnExtractAll.addEventListener('click', async () => {
    const settings = await getSettings();
    if (!settings.aiEnabled) {
      showToast('❌ AI not configured');
      openSettingsPage();
      return;
    }

    const toExtract = allBookmarks.filter((b) =>
      (!b.ai_extracted_fields || b.ai_extracted_fields.length === 0)
      && !!(b.ingest_snapshot || b.pageMeta || b.summary)
    );
    if (toExtract.length === 0) {
      showToast('✅ No prepared snapshots waiting for AI extract.');
      return;
    }

    if (!confirm(`Extract metadata for ${toExtract.length} bookmarks? This may take a few minutes.`)) return;

    btnExtractAll.disabled = true;
    btnExtractAll.textContent = '⏳ 0/' + toExtract.length;
    setTopbarAsyncStatus(`AI Extract 0/${toExtract.length}`, 0);

    try {
      const summary = await runAIExtractAll(toExtract, {
        updateBookmarkFn: updateBookmark,
        appendFailuresFn: appendLegacyIngestFailures,
        consumeFailuresFn: consumeLegacyIngestFailures,
        onProgress: (progress) => {
          const done = Number(progress.done || 0);
          const total = Number(progress.total || toExtract.length);
          btnExtractAll.textContent = `⏳ ${done}/${total}`;
          const percent = total > 0 ? (done / total) * 100 : 0;
          setTopbarAsyncStatus(`AI Extract ${done}/${total}`, percent);
        },
      });

      allBookmarks = await getBookmarks();
      renderAll();
      const queuedMsg = summary.queued > 0 ? ` (${summary.queued} queued for retry)` : '';
      showToast(`✅ AI extract done: ${summary.succeeded}/${summary.total}${queuedMsg}`);
    } catch (e) {
      console.warn('AI Extract All failed:', e);
      showToast('❌ AI Extract All failed: ' + (e.message || 'unknown error'));
    } finally {
      btnExtractAll.disabled = false;
      btnExtractAll.textContent = '✨ AI Extract All';
      clearTopbarAsyncStatus();
    }
  });
}

// ── AI Batch Processing Helper ────────────────────────────────────────────────

document.getElementById('btn-export-graph').addEventListener('click', () => {
  if (allBookmarks.length === 0) {
    showToast('⚠️ No bookmarks to export!');
    return;
  }
  showExportModal();
});

document.getElementById('btn-export').addEventListener('click', async () => {
  const json = await exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bookmark-vault-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ JSON exported!');
});

// Export Obsidian vault (ZIP of .md files)
document.getElementById('btn-export-obsidian').addEventListener('click', async () => {
  const btn = document.getElementById('btn-export-obsidian');
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';
  setTopbarAsyncStatus('Exporting Obsidian vault...');

  try {
    const files = await exportObsidian();
    if (files.length === 0) {
      showToast('⚠️ No bookmarks to export!');
      return;
    }

    const zip = new JSZip();
    const vault = zip.folder('bookmark-vault-vault');

    files.forEach(({ filename, content }) => {
      vault.file(filename, content);
    });

    // Add README with Obsidian import guide
    vault.file('_README.md', [
      '# bookmark-vault Vault',
      '',
      'This vault was exported from [bookmark-vault](https://github.com/bsquang/bookmark-vault).',
      '',
      '## How to import into Obsidian',
      '',
      '1. Unzip this ZIP file',
      '2. Open Obsidian → **Open folder as vault**',
      '3. Select the `bookmark-vault-vault` folder you just unzipped',
      '4. Install the **Dataview** plugin to query bookmarks by tag, status, etc.',
      '',
      '## Example Dataview query',
      '',
      '````',
      '```dataview',
      'TABLE url, status, date_saved',
      'FROM ""',
      'WHERE status = "unread"',
      'SORT date_saved DESC',
      '```',
      '````',
      '',
      `*Exported ${files.length} bookmarks on ${new Date().toLocaleDateString('en-US')}*`,
    ].join('\n'));

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookmark-vault-obsidian-' + new Date().toISOString().slice(0, 10) + '.zip';
    a.click();
    URL.revokeObjectURL(url);

    showToast('✅ Exported ' + files.length + ' notes for Obsidian!');
  } catch (e) {
    showToast('❌ Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🟣 Export Obsidian';
    clearTopbarAsyncStatus();
  }
});

document.getElementById('btn-import-trigger').addEventListener('click', () => {
  document.getElementById('btn-import').click();
});
document.getElementById('btn-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const summary = await previewImportJSON(text);
    const proceed = await showImportPreflightModal(summary, file.name);
    if (!proceed) {
      e.target.value = '';
      return;
    }
    setTopbarAsyncStatus('Importing JSON...');
    const result = await importJSON(text);
    allBookmarks = await getBookmarks();
    renderAll();
    showToast('✅ Imported ' + result.imported + ' bookmarks (skipped ' + result.skipped + ' duplicates)');
  } catch (err) {
    showToast('❌ Invalid JSON file');
  } finally {
    clearTopbarAsyncStatus();
  }
  e.target.value = '';
});

// ── Helper Functions ───────────────────────────────────────────────────────────
/**
 * getContentTypeEmoji(type)
 * Return emoji for content type badge
 */
function getContentTypeEmoji(type) {
  const emojis = {
    'article': '📰',
    'video': '🎥',
    'guide': '📚',
    'tool': '🛠️',
    'paper': '📄',
    'bookmark': '🔖'
  };
  return emojis[type] || '📄';
}

function findBookmarkById(id) {
  const key = String(id);
  return allBookmarks.find(x => String(x.id) === key);
}

async function previewImportJSON(jsonString) {
  const data = JSON.parse(jsonString);
  const incomingRaw = Array.isArray(data) ? data : (data.bookmarks || []);
  if (!Array.isArray(incomingRaw)) throw new Error('Invalid import payload');

  const existing = await getBookmarks();
  const existingUrls = new Set(existing.map(b => b.url));

  let valid = 0;
  let duplicates = 0;
  let invalid = 0;
  const newUrls = new Set();

  incomingRaw.forEach(raw => {
    try {
      const b = migrateBookmark(raw);
      if (!b || !b.url) {
        invalid++;
        return;
      }
      valid++;
      if (existingUrls.has(b.url) || newUrls.has(b.url)) {
        duplicates++;
      } else {
        newUrls.add(b.url);
      }
    } catch {
      invalid++;
    }
  });

  return {
    total: incomingRaw.length,
    valid,
    duplicates,
    invalid,
    toImport: Math.max(0, valid - duplicates)
  };
}

function showImportPreflightModal(summary, fileName = '') {
  const modal = document.getElementById('import-preflight-modal');
  const summaryEl = document.getElementById('import-preflight-summary');
  const cancelBtn = document.getElementById('import-preflight-cancel');
  const confirmBtn = document.getElementById('import-preflight-confirm');

  summaryEl.innerHTML =
    `<div><strong>File:</strong> ${escapeHtml(fileName || 'Selected file')}</div>` +
    `<div><strong>Total records:</strong> ${summary.total}</div>` +
    `<div><strong>Valid records:</strong> ${summary.valid}</div>` +
    `<div><strong>Will import:</strong> ${summary.toImport}</div>` +
    `<div><strong>Duplicates:</strong> ${summary.duplicates}</div>` +
    `<div><strong>Invalid records:</strong> ${summary.invalid}</div>`;

  modal.classList.remove('hidden');

  return new Promise(resolve => {
    const close = (result) => {
      modal.classList.add('hidden');
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      modal.onclick = null;
      resolve(result);
    };

    cancelBtn.onclick = () => close(false);
    confirmBtn.onclick = () => close(true);
    modal.onclick = (ev) => {
      if (ev.target.classList.contains('overlay-modal-backdrop')) close(false);
    };
  });
}

function showDeleteAllModal(total) {
  const modal = document.getElementById('delete-all-modal');
  const input = document.getElementById('delete-all-confirm-input');
  const cancelBtn = document.getElementById('delete-all-cancel');
  const confirmBtn = document.getElementById('delete-all-confirm');

  input.value = '';
  confirmBtn.disabled = true;
  input.placeholder = `Type DELETE to remove ${total} bookmarks`;
  modal.classList.remove('hidden');
  input.focus();

  return new Promise(resolve => {
    const onInput = () => {
      confirmBtn.disabled = input.value.trim().toUpperCase() !== 'DELETE';
    };

    const close = (result) => {
      modal.classList.add('hidden');
      input.removeEventListener('input', onInput);
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      modal.onclick = null;
      resolve(result);
    };

    input.addEventListener('input', onInput);
    cancelBtn.onclick = () => close(false);
    confirmBtn.onclick = () => close(true);
    modal.onclick = (ev) => {
      if (ev.target.classList.contains('overlay-modal-backdrop')) close(false);
    };
  });
}

// ── Node detail panel ──────────────────────────────────────────────────────────
/**
 * openNodePanel(nodeId, nodeType = 'bookmark')
 * Universal panel that displays bookmarks, concepts, or entities.
 * 
 * For bookmarks: shows URL, summary, reason, tags, concepts, entities
 * For concepts: shows AI + manual definitions, linked bookmarks, related entities
 * For entities: shows type, AI + manual profiles, linked bookmarks, related concepts
 */
function openNodePanel(nodeId, nodeType = 'bookmark') {
  const targetId = String(nodeId);
  const isSwitchingNode = panelId !== null && (String(panelId) !== targetId || panelNodeType !== nodeType);
  if (isSwitchingNode && panelDirty) {
    const ok = confirm('You have unsaved changes in the detail panel. Switch node and discard changes?');
    if (!ok) return;
  }

  // Show/hide sections based on node type
  const bookmarkSection = document.getElementById('panel-bookmark-section');
  const conceptSection = document.getElementById('panel-concept-section');
  const entitySection = document.getElementById('panel-entity-section');
  
  bookmarkSection.classList.add('hidden');
  conceptSection.classList.add('hidden');
  entitySection.classList.add('hidden');
  
  const openBtn = document.getElementById('panel-open-url');
  const deleteBtn = document.getElementById('panel-delete');
  const saveBtn = document.getElementById('panel-save');
  const conceptManualEl = document.getElementById('panel-concept-manual-def');

  const tryOpen = (type, id) => {
    if (type === 'bookmark') {
      bookmarkSection.classList.remove('hidden');
      openBtn.style.display = 'block';
      deleteBtn.style.display = 'block';
      saveBtn.style.display = 'block';
      conceptManualEl.readOnly = false;
      return openBookmarkPanel(id);
    }
    if (type === 'concept') {
      conceptSection.classList.remove('hidden');
      openBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      saveBtn.style.display = 'block';
      conceptManualEl.readOnly = false;
      return openConceptPanel(id);
    }
    if (type === 'entity') {
      entitySection.classList.remove('hidden');
      openBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      saveBtn.style.display = 'block';
      conceptManualEl.readOnly = false;
      return openEntityPanel(id);
    }
    if (type === 'keyword') {
      conceptSection.classList.remove('hidden');
      openBtn.style.display = 'none';
      deleteBtn.style.display = 'none';
      saveBtn.style.display = 'none';
      conceptManualEl.readOnly = true;
      return openKeywordPanel(id);
    }
    return false;
  };

  let resolvedType = nodeType;
  let opened = tryOpen(resolvedType, targetId);

  // Fallback when caller type and ID format are inconsistent
  if (!opened && targetId.startsWith('concept_')) {
    bookmarkSection.classList.add('hidden');
    conceptSection.classList.remove('hidden');
    entitySection.classList.add('hidden');
    openBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    resolvedType = 'concept';
    opened = openConceptPanel(targetId);
  } else if (!opened && targetId.startsWith('entity_')) {
    bookmarkSection.classList.add('hidden');
    conceptSection.classList.add('hidden');
    entitySection.classList.remove('hidden');
    openBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    resolvedType = 'entity';
    opened = openEntityPanel(targetId);
  } else if (!opened && targetId.startsWith('keyword_')) {
    bookmarkSection.classList.add('hidden');
    conceptSection.classList.remove('hidden');
    entitySection.classList.add('hidden');
    openBtn.style.display = 'none';
    deleteBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    conceptManualEl.readOnly = true;
    resolvedType = 'keyword';
    opened = openKeywordPanel(targetId);
  } else if (!opened && /^\d+$/.test(targetId)) {
    bookmarkSection.classList.remove('hidden');
    conceptSection.classList.add('hidden');
    entitySection.classList.add('hidden');
    openBtn.style.display = 'block';
    deleteBtn.style.display = 'block';
    resolvedType = 'bookmark';
    opened = openBookmarkPanel(targetId);
  }

  if (!opened) {
    showToast('⚠️ Could not load node details');
    return;
  }

  panelId = targetId;
  panelNodeType = resolvedType;
  panelDirty = false;
  document.getElementById('node-panel').classList.add('open');
  updateSidebarNodeList();
}

/**
 * openBookmarkPanel(bookmarkId)
 * Render bookmark details in the panel.
 */
function openBookmarkPanel(bookmarkId) {
  const b = findBookmarkById(bookmarkId);
  if (!b) return false;

  const faviconEl = document.getElementById('panel-favicon');
  if (b.favIconUrl && b.favIconUrl.startsWith('http')) {
    faviconEl.innerHTML = '<img src="' + escapeHtml(b.favIconUrl) + '" onerror="this.textContent=\'🌐\'" />';
  } else {
    faviconEl.textContent = '🌐';
  }

  document.getElementById('panel-title').textContent = b.title;
  document.getElementById('panel-url').textContent = b.url;
  document.getElementById('panel-summary').value = b.summary || '';
  document.getElementById('panel-reason').value = b.reason || '';
  document.getElementById('panel-tags').value = (b.tags || []).join(', ');

  // Show AI attribution and content type badges
  const badgesEl = document.getElementById('panel-badges');
  let badgesHtml = '<div class="panel-badges">';
  
  if (b.ai_generated) {
    badgesHtml += '<span class="badge badge-ai-summary">🤖 AI Summary</span>';
  } else if (b.summary) {
    badgesHtml += '<span class="badge badge-manual">✍️ Manual</span>';
  }
  
  if (b.ai_tags) {
    badgesHtml += '<span class="badge badge-ai-tags">🤖 AI Tags</span>';
  }
  
  if (b.content_type) {
    const emoji = getContentTypeEmoji(b.content_type);
    badgesHtml += '<span class="badge badge-content-type">' + emoji + ' ' + escapeHtml(b.content_type) + '</span>';
  }
  
  if (b.reading_time && b.reading_time > 0) {
    badgesHtml += '<span class="badge badge-reading-time">⏱️ ' + b.reading_time + ' min read</span>';
  }
  
  badgesHtml += '</div>';
  badgesEl.innerHTML = badgesHtml;

  // Show AI row only if AI is enabled
  getSettings().then(settings => {
    const aiRow = document.getElementById('panel-ai-row');
    if (settings.aiEnabled) {
      aiRow.classList.remove('hidden');
    } else {
      aiRow.classList.add('hidden');
    }
  });
  document.getElementById('panel-ai-status').textContent = '';
  document.getElementById('panel-ai-status').className = 'panel-ai-status';

  // Render metadata
  const fmt = iso => iso ? new Date(iso).toLocaleString('en-US') : '—';
  const metaRows = [
    ['ID', b.id],
    ['Saved', fmt(b.savedAt)],
    ['Updated', fmt(b.updatedAt)],
    ['URL', b.url],
  ];

  const metaLabels = {
    description: 'Description', ogTitle: 'OG Title', ogType: 'OG Type',
    keywords: 'Keywords', author: 'Author', siteName: 'Site Name',
    ogImage: 'OG Image', lang: 'Language', canonical: 'Canonical',
  };
  const pageMetaRows = b.pageMeta
    ? Object.entries(b.pageMeta)
        .filter(([k, v]) => v && metaLabels[k])
        .map(([k, v]) => [metaLabels[k], v])
    : [];

  document.getElementById('panel-meta').innerHTML =
    '<div class="panel-meta-label">Metadata</div>' +
    metaRows.map(([k, v]) =>
      '<div class="panel-meta-row">' +
        '<span class="panel-meta-key">' + k + '</span>' +
        '<span class="panel-meta-val">' + escapeHtml(String(v)) + '</span>' +
      '</div>'
    ).join('') +
    (pageMetaRows.length
      ? '<div class="panel-meta-label" style="margin-top:10px">Page Meta</div>' +
        pageMetaRows.map(([k, v]) =>
          '<div class="panel-meta-row">' +
            '<span class="panel-meta-key">' + k + '</span>' +
            '<span class="panel-meta-val">' + escapeHtml(String(v)) + '</span>' +
          '</div>'
        ).join('')
      : '');

  // Render connected nodes — only among currently visible (filtered) bookmarks
  const connectedEl = document.getElementById('panel-connected');
  const visibleIds = new Set(getFiltered().map(x => x.id));
  const connected = allBookmarks
    .filter(x => x.id !== b.id && visibleIds.has(x.id))
    .map(x => {
      const sharedTags = (b.tags || []).filter(t => (x.tags || []).includes(t) && !excludedTags.has(t));
      return { bookmark: x, sharedTags };
    })
    .filter(x => x.sharedTags.length > 0)
    .sort((a, b) => b.sharedTags.length - a.sharedTags.length);

  if (connected.length === 0) {
    connectedEl.innerHTML = '';
  } else {
    const CONNECTED_PREVIEW_LIMIT = 30;
    const renderConnected = (expanded) => {
      const shown = expanded ? connected : connected.slice(0, CONNECTED_PREVIEW_LIMIT);
      const hiddenCount = Math.max(0, connected.length - shown.length);
      connectedEl.innerHTML =
        '<div class="panel-connected-label">🔗 Connected (' + connected.length + ')</div>' +
        shown.map(({ bookmark: c, sharedTags }) => {
          const favicon = c.favIconUrl && c.favIconUrl.startsWith('http')
            ? '<img src="' + escapeHtml(c.favIconUrl) + '" onerror="this.style.display=\'none\'" />'
            : '🌐';
          const tagPills = sharedTags.slice(0, 3).map(t =>
            '<span class="connected-node-tag">' + escapeHtml(t) + '</span>'
          ).join('');
          return (
            '<div class="connected-node-item" data-id="' + c.id + '" title="' + escapeHtml(c.title) + '">' +
              '<span class="connected-node-favicon">' + favicon + '</span>' +
              '<span class="connected-node-title">' + escapeHtml(c.title) + '</span>' +
              '<span class="connected-node-tags">' + tagPills + '</span>' +
            '</div>'
          );
        }).join('') +
        (
          connected.length > CONNECTED_PREVIEW_LIMIT
            ? '<button class="btn-secondary" id="panel-connected-toggle" style="margin-top:6px;font-size:11px;padding:4px 8px">' +
              (expanded ? 'Collapse' : `Show more (${hiddenCount})`) +
              '</button>'
            : ''
        );

      connectedEl.querySelectorAll('.connected-node-item').forEach(el => {
        el.addEventListener('click', () => openNodePanel(el.dataset.id, 'bookmark'));
      });
      const toggleBtn = document.getElementById('panel-connected-toggle');
      if (toggleBtn) toggleBtn.addEventListener('click', () => renderConnected(!expanded));
    };
    renderConnected(false);
  }

  // Display extracted metadata if available
  const extractedEl = document.getElementById('panel-extracted');
  if (extractedEl && b.ai_extracted_fields && b.ai_extracted_fields.length > 0) {
    let extractedHtml = '<div class="panel-extracted-label">✨ AI Extracted Metadata</div>';
    
    if (b.extraction_confidence) {
      extractedHtml += '<div class="panel-meta-row">' +
        '<span class="panel-meta-key">Confidence</span>' +
        '<span class="panel-meta-val">' + Math.round(b.extraction_confidence * 100) + '%</span>' +
        '</div>';
    }
    
    // Concepts
    if (b.concepts && b.concepts.length > 0) {
      extractedHtml += '<div class="panel-meta-label" style="margin-top:8px">Concepts</div>';
      extractedHtml += b.concepts.map(c =>
        '<div class="panel-meta-row">' +
          '<span class="panel-meta-key" style="color:#166534">🟢 ' + escapeHtml(c.name) + '</span>' +
          '<span class="panel-meta-val" style="color:#9aa0a6">' + Math.round(c.relevance * 100) + '%</span>' +
        '</div>'
      ).join('');
    }
    
    // Entities
    if (b.entities && b.entities.length > 0) {
      extractedHtml += '<div class="panel-meta-label" style="margin-top:8px">Entities</div>';
      extractedHtml += b.entities.map(e =>
        '<div class="panel-meta-row">' +
          '<span class="panel-meta-key" style="color:#92400e">🟠 ' + escapeHtml(e.name) + '</span>' +
          '<span class="panel-meta-val" style="color:#9aa0a6">' + escapeHtml(e.type) + '</span>' +
        '</div>'
      ).join('');
    }
    
    // Keywords
    if (b.keywords && b.keywords.length > 0) {
      extractedHtml += '<div class="panel-meta-label" style="margin-top:8px">Keywords</div>';
      extractedHtml += b.keywords.slice(0, 5).map(k =>
        '<div class="panel-meta-row">' +
          '<span class="panel-meta-key" style="color:#ca8a04">🟡 ' + escapeHtml(k.word) + '</span>' +
          '<span class="panel-meta-val" style="color:#9aa0a6">' + Math.round(k.relevance * 100) + '%</span>' +
        '</div>'
      ).join('');
    }
    
    // Purpose, thesis, key message
    if (b.purpose || b.thesis || b.key_message) {
      extractedHtml += '<div class="panel-meta-label" style="margin-top:8px">Content Analysis</div>';
      if (b.purpose) {
        extractedHtml += '<div class="panel-meta-row">' +
          '<span class="panel-meta-key">Purpose</span>' +
          '<span class="panel-meta-val">' + escapeHtml(b.purpose) + '</span>' +
          '</div>';
      }
      if (b.thesis) {
        extractedHtml += '<div class="panel-meta-row">' +
          '<span class="panel-meta-key">Thesis</span>' +
          '<span class="panel-meta-val">' + escapeHtml(b.thesis) + '</span>' +
          '</div>';
      }
      if (b.key_message) {
        extractedHtml += '<div class="panel-meta-row">' +
          '<span class="panel-meta-key">Key Message</span>' +
          '<span class="panel-meta-val">' + escapeHtml(b.key_message) + '</span>' +
          '</div>';
      }
    }
    
    extractedEl.innerHTML = extractedHtml;
  } else if (extractedEl) {
    extractedEl.innerHTML = '';
  }
  return true;
}

/**
 * openConceptPanel(conceptId)
 * Render concept details (concept_bookmarkId_index format).
 */
function openConceptPanel(conceptId) {
  // Parse concept ID: concept_bookmarkId_index
  const parts = conceptId.split('_');
  const bookmarkId = parts[1];
  const index = parseInt(parts[2]);
  
  const b = findBookmarkById(bookmarkId);
  if (!b || !b.concepts || !b.concepts[index]) return false;
  
  const concept = b.concepts[index];
  
  document.getElementById('panel-favicon').textContent = '🟢';
  document.getElementById('panel-title').textContent = concept.name;
  document.getElementById('panel-url').textContent = 'From: ' + escapeHtml(b.title);
  
  // Show badges
  document.getElementById('panel-badges').innerHTML = 
    '<div class="panel-badges">' +
    '<span class="badge badge-content-type">🟢 Concept</span>' +
    '<span class="badge badge-content-type">Relevance: ' + Math.round(concept.relevance * 100) + '%</span>' +
    '</div>';
  
  // AI definition (read-only) and manual definition (editable)
  document.getElementById('panel-concept-ai-def').value = concept.ai_definition || '';
  document.getElementById('panel-concept-manual-def').value = concept.manual_definition || '';
  
  // Show related bookmarks (all concepts from same bookmark or related)
  const metaEl = document.getElementById('panel-concept-meta');
  metaEl.innerHTML = '<div class="panel-meta-label">Source</div>' +
    '<div class="panel-meta-row">' +
    '<span class="panel-meta-key">Bookmark</span>' +
    '<span class="panel-meta-val">' + escapeHtml(b.title) + '</span>' +
    '</div>';
  
  // Show related entities from same bookmark
  const connectedEl = document.getElementById('panel-concept-connected');
  if (b.entities && b.entities.length > 0) {
    connectedEl.innerHTML =
      '<div class="panel-connected-label">🔗 Related Entities (' + b.entities.length + ')</div>' +
      b.entities.slice(0, 5).map((entity, idx) => {
        return (
          '<div class="connected-node-item" data-id="' + 'entity_' + b.id + '_' + idx + '">' +
            '<span class="connected-node-favicon">🟠</span>' +
            '<span class="connected-node-title">' + escapeHtml(entity.name) + '</span>' +
            '<span class="connected-node-tags">' +
            '<span class="connected-node-tag">' + escapeHtml(entity.type) + '</span>' +
            '</span>' +
          '</div>'
        );
      }).join('');
    
    connectedEl.querySelectorAll('.connected-node-item').forEach(el => {
      el.addEventListener('click', () => openNodePanel(el.dataset.id, 'entity'));
    });
  } else {
    connectedEl.innerHTML = '';
  }
  return true;
}

/**
 * openEntityPanel(entityId)
 * Render entity details (entity_bookmarkId_index format).
 */
function openEntityPanel(entityId) {
  if (entityId.startsWith('entity_dedup_')) {
    const dedupKey = entityId.replace('entity_dedup_', '').toLowerCase();
    const displayFromNode = currentNetwork?.nodes?.find(n => String(n.id) === String(entityId) && n.type === 'entity');
    const normalized = (displayFromNode?.title || entityId.replace('entity_dedup_', '').replace(/_/g, ' ')).trim();
    const matches = [];
    allBookmarks.forEach(b => {
      (b.entities || []).forEach((entity, idx) => {
        const entityKey = normalizeEntityName(entity.name, entity.type).replace(/\s+/g, '_').toLowerCase();
        if (entityKey === dedupKey) {
          matches.push({ bookmark: b, entity, idx });
        }
      });
    });
    if (matches.length === 0) return false;

    const uniqueTypes = [...new Set(matches.map(m => m.entity.type).filter(Boolean))];
    const firstAi = matches.map(m => m.entity.ai_profile).find(Boolean) || '';
    const firstManual = matches.map(m => m.entity.manual_definition).find(Boolean) || '';

    document.getElementById('panel-favicon').textContent = '🟠';
    document.getElementById('panel-title').textContent = normalized;
    document.getElementById('panel-url').textContent = `Appears in ${matches.length} bookmark(s)`;
    document.getElementById('panel-badges').innerHTML =
      '<div class="panel-badges">' +
      '<span class="badge badge-content-type">🟠 Entity</span>' +
      '<span class="badge badge-content-type">Merged</span>' +
      '</div>';
    document.getElementById('panel-entity-type').value = uniqueTypes.join(', ');
    document.getElementById('panel-entity-ai-profile').value = firstAi;
    document.getElementById('panel-entity-manual-profile').value = firstManual;

    const metaEl = document.getElementById('panel-entity-meta');
    metaEl.innerHTML = '<div class="panel-meta-label">Metadata</div>' +
      '<div class="panel-meta-row"><span class="panel-meta-key">Node ID</span><span class="panel-meta-val">' + escapeHtml(entityId) + '</span></div>' +
      '<div class="panel-meta-row"><span class="panel-meta-key">Merged entries</span><span class="panel-meta-val">' + matches.length + '</span></div>';

    const connectedEl = document.getElementById('panel-entity-connected');
    connectedEl.innerHTML =
      '<div class="panel-connected-label">🔗 Source Bookmarks (' + matches.length + ')</div>' +
      matches.slice(0, 10).map(m => (
        '<div class="connected-node-item" data-id="' + m.bookmark.id + '">' +
          '<span class="connected-node-favicon">🌐</span>' +
          '<span class="connected-node-title">' + escapeHtml(m.bookmark.title) + '</span>' +
        '</div>'
      )).join('');
    connectedEl.querySelectorAll('.connected-node-item').forEach(el => {
      el.addEventListener('click', () => openNodePanel(el.dataset.id, 'bookmark'));
    });
    return true;
  }

  function openKeywordPanel(keywordId) {
    const aiEl = document.getElementById('panel-concept-ai-def');
    const manualEl = document.getElementById('panel-concept-manual-def');
    const metaEl = document.getElementById('panel-concept-meta');
    const connectedEl = document.getElementById('panel-concept-connected');

    let keyword = '';
    let matches = [];
    let avgRelevance = 0;

    if (keywordId.startsWith('keyword_dedup_')) {
      const key = keywordId.replace('keyword_dedup_', '').toLowerCase().trim();
      keyword = key;
      allBookmarks.forEach(b => {
        (b.keywords || []).forEach((kw, idx) => {
          if (normalizeKeywordName(kw.word) === key) {
            matches.push({ bookmark: b, keyword: kw, idx });
          }
        });
      });
    } else {
      const parts = keywordId.split('_');
      const bookmarkId = parts[1];
      const index = parseInt(parts[2]);
      const b = findBookmarkById(bookmarkId);
      if (!b || !Array.isArray(b.keywords) || !b.keywords[index]) return false;
      const kw = b.keywords[index];
      keyword = normalizeKeywordName(kw.word);
      matches.push({ bookmark: b, keyword: kw, idx: index });
    }

    if (matches.length === 0) return false;

    avgRelevance = matches.reduce((s, m) => s + (m.keyword.relevance || 0), 0) / matches.length;
    const maxFrequency = matches.reduce((m, x) => Math.max(m, x.keyword.frequency || 0), 0);

    document.getElementById('panel-favicon').textContent = '🟡';
    document.getElementById('panel-title').textContent = keyword;
    document.getElementById('panel-url').textContent = `Appears in ${matches.length} bookmark(s)`;
    document.getElementById('panel-badges').innerHTML =
      '<div class="panel-badges">' +
      '<span class="badge badge-content-type">🟡 Keyword</span>' +
      '<span class="badge badge-content-type">Relevance: ' + Math.round(avgRelevance * 100) + '%</span>' +
      '</div>';

    aiEl.value = `Top frequency: ${Math.round(maxFrequency * 100)}%\nAverage relevance: ${Math.round(avgRelevance * 100)}%`;
    manualEl.value = 'Keyword nodes are read-only in this view.';
    manualEl.readOnly = true;

    metaEl.innerHTML = '<div class="panel-meta-label">Metadata</div>' +
      '<div class="panel-meta-row"><span class="panel-meta-key">Node ID</span><span class="panel-meta-val">' + escapeHtml(keywordId) + '</span></div>' +
      '<div class="panel-meta-row"><span class="panel-meta-key">Sources</span><span class="panel-meta-val">' + matches.length + ' bookmark(s)</span></div>';

    connectedEl.innerHTML =
      '<div class="panel-connected-label">🔗 Source Bookmarks (' + matches.length + ')</div>' +
      matches.slice(0, 10).map(m => (
        '<div class="connected-node-item" data-id="' + m.bookmark.id + '">' +
          '<span class="connected-node-favicon">🌐</span>' +
          '<span class="connected-node-title">' + escapeHtml(m.bookmark.title) + '</span>' +
        '</div>'
      )).join('');
    connectedEl.querySelectorAll('.connected-node-item').forEach(el => {
      el.addEventListener('click', () => openNodePanel(el.dataset.id, 'bookmark'));
    });

    return true;
  }

  // Parse entity ID: entity_bookmarkId_index
  const parts = entityId.split('_');
  const bookmarkId = parts[1];
  const index = parseInt(parts[2]);
  
  const b = findBookmarkById(bookmarkId);
  if (!b || !b.entities || !b.entities[index]) return false;
  
  const entity = b.entities[index];
  
  document.getElementById('panel-favicon').textContent = '🟠';
  document.getElementById('panel-title').textContent = entity.name;
  document.getElementById('panel-url').textContent = 'From: ' + escapeHtml(b.title);
  
  // Show badges
  document.getElementById('panel-badges').innerHTML = 
    '<div class="panel-badges">' +
    '<span class="badge badge-content-type">🟠 Entity</span>' +
    '<span class="badge badge-content-type">' + escapeHtml(entity.type) + '</span>' +
    '</div>';
  
  // Entity type (read-only)
  document.getElementById('panel-entity-type').value = entity.type || '';
  
  // AI profile (read-only) and manual profile (editable)
  document.getElementById('panel-entity-ai-profile').value = entity.ai_profile || '';
  document.getElementById('panel-entity-manual-profile').value = entity.manual_definition || '';
  
  // Show source bookmark
  const metaEl = document.getElementById('panel-entity-meta');
  metaEl.innerHTML = '<div class="panel-meta-label">Source</div>' +
    '<div class="panel-meta-row">' +
    '<span class="panel-meta-key">Bookmark</span>' +
    '<span class="panel-meta-val">' + escapeHtml(b.title) + '</span>' +
    '</div>';
  
  // Show related concepts from same bookmark
  const connectedEl = document.getElementById('panel-entity-connected');
  if (b.concepts && b.concepts.length > 0) {
    connectedEl.innerHTML =
      '<div class="panel-connected-label">🔗 Related Concepts (' + b.concepts.length + ')</div>' +
      b.concepts.slice(0, 5).map((concept, idx) => {
        return (
          '<div class="connected-node-item" data-id="' + 'concept_' + b.id + '_' + idx + '">' +
            '<span class="connected-node-favicon">🟢</span>' +
            '<span class="connected-node-title">' + escapeHtml(concept.name) + '</span>' +
            '<span class="connected-node-tags">' +
            '<span class="connected-node-tag">' + Math.round(concept.relevance * 100) + '%</span>' +
            '</span>' +
          '</div>'
        );
      }).join('');
    
    connectedEl.querySelectorAll('.connected-node-item').forEach(el => {
      el.addEventListener('click', () => openNodePanel(el.dataset.id, 'concept'));
    });
  } else {
    connectedEl.innerHTML = '';
  }
  return true;
}

function closeNodePanel() {
  document.getElementById('node-panel').classList.remove('open');
  panelId = null;
  panelNodeType = 'bookmark';
  panelDirty = false;
  updateSidebarNodeList();
}

document.getElementById('panel-close').addEventListener('click', closeNodePanel);

// Track unsaved edits in detail panel inputs
[
  'panel-summary',
  'panel-reason',
  'panel-tags',
  'panel-concept-manual-def',
  'panel-entity-manual-profile'
].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      if (panelId) panelDirty = true;
    });
  }
});

// AI Suggest in panel
document.getElementById('panel-btn-ai').addEventListener('click', async () => {
  if (!panelId) return;
  
  const btn = document.getElementById('panel-btn-ai');
  const status = document.getElementById('panel-ai-status');
  btn.disabled = true;
  status.textContent = '⏳ Asking AI...';
  status.className = 'panel-ai-status';

  try {
    // Determine node type from visible panel sections
    const bookmarkSection = document.getElementById('panel-bookmark-section');
    const conceptSection = document.getElementById('panel-concept-section');
    const entitySection = document.getElementById('panel-entity-section');
    
    const isBookmark = !bookmarkSection.classList.contains('hidden');
    const isConcept = !conceptSection.classList.contains('hidden');
    const isEntity = !entitySection.classList.contains('hidden');
    
    if (isBookmark) {
      // Existing bookmark logic
      const b = allBookmarks.find(x => x.id === panelId);
      if (!b) throw new Error('Bookmark not found');
      
      // Rebuild AI text from saved pageMeta if available
      const meta = b.pageMeta || {};
      const parts = [];
      if (meta.ogTitle && meta.ogTitle !== b.title) parts.push('Title: ' + meta.ogTitle);
      if (meta.description) parts.push('Description: ' + meta.description);
      if (meta.keywords) parts.push('Keywords: ' + meta.keywords);
      if (meta.ogType) parts.push('Type: ' + meta.ogType);
      if (meta.author) parts.push('Author: ' + meta.author);
      if (meta.siteName) parts.push('Site: ' + meta.siteName);
      const aiText = parts.join('\n');

      const result = await suggestNodeMetadata(b, 'bookmark', { _aiText: aiText });
      if (result) {
        const settings = await getSettings();
        if (settings.featTags && result.tags?.length) {
          const existing = document.getElementById('panel-tags').value
            .split(',').map(t => t.trim()).filter(Boolean);
          const merged = [...new Set([...result.tags, ...existing])].slice(0, 8);
          document.getElementById('panel-tags').value = merged.join(', ');
        }
        if (settings.featSummary && result.summary) {
          document.getElementById('panel-summary').value = result.summary;
        }
        status.textContent = '✅ Done!';
      }
    } else if (isConcept) {
      // Parse concept ID to get concept object
      const parts = panelId.split('_');
      const bookmarkId = parts[1];
      const index = parseInt(parts[2]);
      const b = allBookmarks.find(x => x.id === bookmarkId);
      if (!b || !b.concepts || !b.concepts[index]) throw new Error('Concept not found');
      
      const concept = b.concepts[index];
      const result = await suggestNodeMetadata(concept, 'concept');
      if (result) {
        document.getElementById('panel-concept-ai-def').value = result.definition || '';
        status.textContent = '✅ Definition generated!';
      }
    } else if (isEntity) {
      // Parse entity ID to get entity object
      const parts = panelId.split('_');
      const bookmarkId = parts[1];
      const index = parseInt(parts[2]);
      const b = allBookmarks.find(x => x.id === bookmarkId);
      if (!b || !b.entities || !b.entities[index]) throw new Error('Entity not found');
      
      const entity = b.entities[index];
      const result = await suggestNodeMetadata(entity, 'entity');
      if (result) {
        document.getElementById('panel-entity-ai-profile').value = result.profile || '';
        status.textContent = '✅ Profile generated!';
      }
    }
  } catch (e) {
    status.textContent = '❌ ' + e.message;
    status.className = 'panel-ai-status error';
  } finally {
    btn.disabled = false;
  }
});

// NEW in v3: Content type filter event listeners
document.querySelectorAll('.content-filter').forEach(checkbox => {
  checkbox.addEventListener('change', () => {
    renderAll();
  });
});

document.getElementById('panel-open-url').addEventListener('click', () => {
  const b = allBookmarks.find(x => x.id === panelId);
  if (b) window.open(b.url, '_blank');
});

document.getElementById('panel-save').addEventListener('click', async () => {
  if (!panelId) return;
  const bookmarkSection = document.getElementById('panel-bookmark-section');
  const conceptSection = document.getElementById('panel-concept-section');
  const entitySection = document.getElementById('panel-entity-section');

  if (!bookmarkSection.classList.contains('hidden')) {
    const summary = document.getElementById('panel-summary').value.trim();
    const reason = document.getElementById('panel-reason').value.trim();
    const tags = document.getElementById('panel-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    await updateBookmark(panelId, { summary, reason, tags });
  } else if (!conceptSection.classList.contains('hidden')) {
    const parts = String(panelId).split('_');
    const bookmarkId = parts[1];
    const index = parseInt(parts[2]);
    const b = findBookmarkById(bookmarkId);
    if (!b || !b.concepts || !b.concepts[index]) {
      showToast('❌ Concept not found');
      return;
    }
    const manualDefinition = document.getElementById('panel-concept-manual-def').value.trim();
    const concepts = [...b.concepts];
    concepts[index] = { ...concepts[index], manual_definition: manualDefinition || null };
    await updateBookmark(b.id, { concepts });
  } else if (!entitySection.classList.contains('hidden')) {
    const manualProfile = document.getElementById('panel-entity-manual-profile').value.trim();
    const idText = String(panelId);
    if (idText.startsWith('entity_dedup_')) {
      const dedupKey = idText.replace('entity_dedup_', '').toLowerCase();
      const updates = allBookmarks
        .map(b => {
          if (!Array.isArray(b.entities) || b.entities.length === 0) return null;
          let changed = false;
          const entities = b.entities.map(e => {
            const entityKey = normalizeEntityName(e.name, e.type).replace(/\s+/g, '_').toLowerCase();
            if (entityKey === dedupKey) {
              changed = true;
              return { ...e, manual_definition: manualProfile || null };
            }
            return e;
          });
          return changed ? { id: b.id, entities } : null;
        })
        .filter(Boolean);
      for (const u of updates) {
        await updateBookmark(u.id, { entities: u.entities });
      }
    } else {
      const parts = idText.split('_');
      const bookmarkId = parts[1];
      const index = parseInt(parts[2]);
      const b = findBookmarkById(bookmarkId);
      if (!b || !b.entities || !b.entities[index]) {
        showToast('❌ Entity not found');
        return;
      }
      const entities = [...b.entities];
      entities[index] = { ...entities[index], manual_definition: manualProfile || null };
      await updateBookmark(b.id, { entities });
    }
  }

  allBookmarks = await getBookmarks();
  renderAll();
  // Re-open the same node so the panel reflects latest saved values
  openNodePanel(panelId, panelNodeType);
  panelDirty = false;
  showToast('✅ Updated!');
});

document.getElementById('panel-delete').addEventListener('click', async () => {
  if (!panelId) return;
  if (!confirm('Delete this bookmark?')) return;
  await deleteBookmark(panelId);
  allBookmarks = await getBookmarks();
  closeNodePanel();
  renderAll();
  showToast('🗑️ Deleted');
});

// ── AI Batch ───────────────────────────────────────────────────────────────────
// REMOVED: btn-ai-batch listener (merged with Extract All functionality)

// ── Delete all ─────────────────────────────────────────────────────────────────
document.getElementById('btn-delete-all').addEventListener('click', async () => {
  if (allBookmarks.length === 0) { showToast('⚠️ No bookmarks yet!'); return; }
  const approved = await showDeleteAllModal(allBookmarks.length);
  if (!approved) return;
  if (typeof clearAllBookmarks === 'function') {
    await clearAllBookmarks();
  } else {
    await chrome.storage.local.remove('tab_bookmarks');
  }
  allBookmarks = [];
  closeNodePanel();
  renderAll();
  showToast('🗑️ Deleted all bookmarks!');
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

// ── Layer Toggle Handlers (NEW in v5.1: Sidebar integration) ──────────────────
document.getElementById('layer-concepts-toggle').addEventListener('change', (e) => {
  layerToggles.concepts = e.target.checked;
  localStorage.setItem('layer_concepts', layerToggles.concepts);
  renderAll();
});

document.getElementById('layer-entities-toggle').addEventListener('change', (e) => {
  layerToggles.entities = e.target.checked;
  localStorage.setItem('layer_entities', layerToggles.entities);
  renderAll();
});

document.getElementById('layer-keywords-toggle').addEventListener('change', (e) => {
  layerToggles.keywords = e.target.checked;
  localStorage.setItem('layer_keywords', layerToggles.keywords);
  renderAll();
});

// ── Collapsible Layers Section ─────────────────────────────────────────────────
document.getElementById('layers-toggle').addEventListener('click', () => {
  const content = document.getElementById('layers-content');
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'block' : 'none';
  const arrow = document.querySelector('#layers-toggle span');
  if (arrow) {
    arrow.textContent = isHidden ? '▼' : '▶';
  }
  localStorage.setItem('layers-collapsed', isHidden ? 'false' : 'true');
});

// ── Restore Layers collapsed state on page load ──────────────────────────────────
const layersCollapsed = localStorage.getItem('layers-collapsed') === 'true';
if (layersCollapsed) {
  document.getElementById('layers-content').style.display = 'none';
  const arrow = document.querySelector('#layers-toggle span');
  if (arrow) arrow.textContent = '▶';
}

// ── NEW in v6c: Health & Lint Check Handlers ─────────────────────────────────────
document.getElementById('btn-health').addEventListener('click', async () => {
  const btn = document.getElementById('btn-health');
  btn.disabled = true;
  btn.textContent = '⏳ Checking...';
  
  try {
    const report = await runHealthCheck(allBookmarks);
    showHealthLintReport(report, 'health');
  } catch (e) {
    showToast('❌ Health check failed: ' + e.message);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '🏥 Health';
  }
});

document.getElementById('btn-lint').addEventListener('click', async () => {
  const btn = document.getElementById('btn-lint');
  const settings = await getSettings();
  
  if (!settings.aiEnabled) {
    showToast('⚠️ Lint requires AI enabled in Settings');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = '⏳ Linting...';
  
  try {
    const report = await runLintCheck(allBookmarks, settings);
    showHealthLintReport(report, 'lint');
  } catch (e) {
    showToast('❌ Lint check failed: ' + e.message);
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Lint';
  }
});

// Health & Lint Report Display
function showHealthLintReport(report, type) {
  const modal = document.getElementById('health-lint-modal');
  const title = document.getElementById('report-title');
  const summary = document.getElementById('report-summary');
  const list = document.getElementById('issues-list');
  const timestamp = document.getElementById('report-timestamp');
  
  title.textContent = type === 'health' ? 
    '🏥 Health Check Report' : '🔍 Lint Report';
  
  // Set report timestamp
  timestamp.textContent = new Date(report.timestamp).toLocaleString();
  
  // Render summary cards
  const summaryEntries = Object.entries(report.summary)
    .filter(([key]) => key !== 'total_issues')
    .sort((a, b) => b[1] - a[1]);
  
  summary.innerHTML = summaryEntries
    .map(([key, count]) => 
      `<div class="summary-card">
        <span class="label">${formatReportLabel(key)}</span>
        <span class="value">${count}</span>
      </div>`
    ).join('');
  
  // Render issues
  if (report.issues.length === 0) {
    list.innerHTML = '<p style="color: #0d652d; text-align: center; padding: 20px;">✅ No issues found!</p>';
  } else {
    list.innerHTML = report.issues
      .map(issue => {
        let html = `<div class="issue-item severity-${issue.severity}">
          <div class="issue-type">${formatIssueType(issue.type)}</div>
          <div class="issue-message">${escapeHtml(issue.message)}</div>`;
        
        if (issue.suggestion) {
          html += `<div class="issue-suggestion">💡 ${escapeHtml(issue.suggestion)}</div>`;
        }
        
        if (issue.variations) {
          html += `<div style="font-size: 11px; margin-top: 6px; color: #5f6368;">
            Variations: ${issue.variations.map(v => `<code>${escapeHtml(v)}</code>`).join(', ')}
          </div>`;
        }
        
        html += '</div>';
        return html;
      }).join('');
  }
  
  // Show auto-fix button only for health checks
  const autoFixBtn = document.getElementById('report-auto-fix');
  autoFixBtn.style.display = type === 'health' ? 'block' : 'none';
  if (autoFixBtn.style.display === 'block') {
    // Store report for auto-fix
    autoFixBtn._report = report;
    autoFixBtn.onclick = () => autoFixHealthIssues(report);
  }
  
  // Set up tab switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  tabBtns.forEach(btn => {
    btn.onclick = () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    };
  });
  
  // Show modal
  modal.classList.remove('hidden');
}

function formatReportLabel(key) {
  return key
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatIssueType(type) {
  return type
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Auto-fix Health Issues
async function autoFixHealthIssues(report) {
  const btn = document.getElementById('report-auto-fix');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Fixing...';
  
  let fixed = 0;
  
  try {
    // 1. Delete empty bookmarks
    const emptyIds = report.issues
      .filter(i => i.type === 'empty_bookmark')
      .map(i => i.id);
    
    for (const id of emptyIds) {
      await deleteBookmark(id);
      fixed++;
    }
    
    // 2. Delete bookmarks with missing URLs
    const missingUrlIds = report.issues
      .filter(i => i.type === 'missing_url')
      .map(i => i.id);
    
    for (const id of missingUrlIds) {
      await deleteBookmark(id);
      fixed++;
    }
    
    // 3. Normalize concept names
    for (const issue of report.issues) {
      if (issue.type === 'inconsistent_concept_naming') {
        allBookmarks.forEach(b => {
          if (b.concepts) {
            b.concepts.forEach(c => {
              if (normalizeConceptName(c.name) === issue.normalized) {
                c.name = issue.normalized;
              }
            });
          }
        });
        fixed += issue.affected_count || 1;
      }
    }
    
    // 4. Normalize entity names
    for (const issue of report.issues) {
      if (issue.type === 'inconsistent_entity_naming') {
        allBookmarks.forEach(b => {
          if (b.entities) {
            b.entities.forEach(e => {
              if (normalizeEntityName(e.name, e.type) === issue.normalized) {
                e.name = issue.normalized;
              }
            });
          }
        });
        fixed += issue.affected_count || 1;
      }
    }
    
    // 5. Normalize keyword names
    for (const issue of report.issues) {
      if (issue.type === 'inconsistent_keyword_naming') {
        allBookmarks.forEach(b => {
          if (b.keywords) {
            b.keywords.forEach(k => {
              if (normalizeKeywordName(k.word) === issue.normalized) {
                k.word = issue.normalized;
              }
            });
          }
        });
        fixed += issue.affected_count || 1;
      }
    }
    
    // 6. Regenerate stale metadata
    const staleIds = report.issues
      .filter(i => i.type === 'stale_metadata')
      .map(i => i.id);
    
    for (const id of staleIds) {
      const b = allBookmarks.find(x => x.id === id);
      if (b) {
        try {
          const extracted = await extractBookmarkMetadata(b.title, b.url, b.summary, b.pageMeta);
          await updateBookmark(id, {
            concepts: extracted.concepts,
            entities: extracted.entities,
            keywords: extracted.keywords,
            extraction_timestamp: new Date().toISOString(),
            extraction_confidence: extracted.extraction_confidence
          });
          fixed++;
        } catch (e) {
          console.warn('Stale metadata fix failed for', id, e);
        }
      }
    }
    
    // Reload and refresh
    allBookmarks = await getBookmarks();
    renderAll();
    
    btn.textContent = `✅ Fixed ${fixed} issues`;
    showToast(`✅ Auto-fixed ${fixed} items`);
    
    // Close modal after success
    setTimeout(() => {
      document.getElementById('health-lint-modal').classList.add('hidden');
    }, 1500);
  } catch (e) {
    console.error('Auto-fix error:', e);
    btn.textContent = '❌ Error during fix';
    showToast('❌ Auto-fix failed: ' + e.message);
  } finally {
    btn.disabled = false;
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  }
}

// Close health-lint modal
document.getElementById('report-close').addEventListener('click', () => {
  document.getElementById('health-lint-modal').classList.add('hidden');
});

// Close modal on backdrop click
document.getElementById('health-lint-modal').addEventListener('click', (e) => {
  if (e.target.id === 'health-lint-modal' || e.target.classList.contains('modal-overlay')) {
    document.getElementById('health-lint-modal').classList.add('hidden');
  }
});

document.getElementById('report-save').addEventListener('click', () => {
  const title = document.getElementById('report-title').textContent;
  const timestamp = document.getElementById('report-timestamp').textContent;
  const summary = Array.from(document.querySelectorAll('.summary-card'))
    .map(card => `${card.querySelector('.label').textContent}: ${card.querySelector('.value').textContent}`)
    .join('\n');
  
  const issues = Array.from(document.querySelectorAll('.issue-item'))
    .map(item => `- ${item.querySelector('.issue-type').textContent}: ${item.querySelector('.issue-message').textContent}`)
    .join('\n');
  
  const content = `${title}\nGenerated: ${timestamp}\n\nSummary:\n${summary}\n\nIssues:\n${issues || 'None'}`;
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `health-lint-report-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('💾 Report saved!');
});

// Init — startup view is loaded from Settings (default: list)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initToolbarDropdowns();
    refreshAIToolsState();
    setGraphLevel('overview', { render: false });
    setViewMode('list', { render: false });
    init();
  });
} else {
  initToolbarDropdowns();
  refreshAIToolsState();
  setGraphLevel('overview', { render: false });
  setViewMode('list', { render: false });
  init();
}
