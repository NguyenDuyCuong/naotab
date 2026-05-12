// ── State ──────────────────────────────────────────────────────────────────────
let allBookmarks = [];
let activeTag = null;
let excludedTags = new Set(); // tags excluded from graph edges
let searchQuery = '';
let currentView = 'graph';
let editingId = null;
let panelId = null; // id bookmark đang hiển thị trong panel
let currentNetwork = null; // D3 graph instance (simulation, svg, links, nodes)

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
  allBookmarks = await getBookmarks();
  renderAll();
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
  document.getElementById('result-count').textContent = filtered.length + ' bookmark';
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
  const edges = [];
  const seen = new Set(); // Track (from, to) pairs to avoid duplicates

  // Build tag -> [bookmarkIds] map
  const tagMap = {};
  bookmarks.forEach(b => {
    if (b.tags && Array.isArray(b.tags)) {
      b.tags.forEach(tag => {
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

        // Deduplicate by checking if we've already created an edge for this pair
        const key = `${from}-${to}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            from,
            to,
            type: 'tag',
            label: tag,
            confidence: 1.0
          });
        }
      }
    }
  });

  return edges;
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
    <title>naoTab Graph Export</title>
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
        <h3>naoTab Graph</h3>
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
 * @param {string} filename - Output filename (e.g. 'naotab-graph.html')
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
            <input type="text" id="export-filename" placeholder="naotab-graph.html" value="naotab-graph-${today}.html">
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
      downloadFile(html, filename.value || 'naotab-graph.html');

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

// ── Graph view (D3.js) ─────────────────────────────────────────────────────────
function renderGraph(bookmarks) {
  if (bookmarks.length === 0) return;

  const container = document.getElementById('graph-view');
  if (!container) return;

  // Build edges and compute metrics for bookmarks only
  const edges = buildEdgesFromTags(bookmarks);
  const { nodes: metricNodes } = computeNodeMetrics(bookmarks, edges);

  // NEW in v5: Build multi-layer nodes (concepts, entities, keywords)
  const allNodes = [...metricNodes]; // Start with bookmark nodes
  const nodeMap = {};
  metricNodes.forEach(n => { nodeMap[n.id] = n; });
  
  // Extract concept nodes from bookmarks
  if (layerToggles.concepts) {
    bookmarks.forEach(b => {
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
              reading_time: 0
            });
          }
        });
      }
    });
  }
  
  // Extract entity nodes from bookmarks
  if (layerToggles.entities) {
    bookmarks.forEach(b => {
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
            reading_time: 0
          });
        });
      }
    });
  }
  
  // Extract keyword nodes from bookmarks
  if (layerToggles.keywords) {
    bookmarks.forEach(b => {
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
              reading_time: 0
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

  // Prepare D3 data format
  const data = {
    nodes: allNodes.map(n => ({
      id: n.id,
      type: n.type || 'bookmark',
      group: n.group,
      value: n.value,
      degree: n.degree,
      tags: n.tags || [],
      title: n.title || n.id,
      summary: n.summary || '',
      url: n.url || '',
      reading_time: n.reading_time || 5,
      relevance: n.relevance || 1,
      ...n
    })),
    links: allEdges.map(e => ({
      source: e.source,
      target: e.target,
      value: e.confidence || 1.0,
      label: e.label,
      type: e.type
    }))
  };

  // Create D3 chart with multi-layer support
  const chart = createD3Chart(data, allNodes);

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

function createD3Chart(data, allNodes) {
  const container = document.getElementById('graph-view');
  const width = container.clientWidth || 928;
  const height = container.clientHeight || 680;

  const links = data.links.map(d => ({...d}));
  const nodes = data.nodes.map(d => ({...d}));

  // D3 force simulation with initial tuning
  const simulation = d3.forceSimulation(nodes);
  tuneForces(simulation, nodes.length, links.length, links);

  const svg = d3.create("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height])
    .attr("style", "max-width: 100%; height: auto; background: #f8f9fa;");

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
    .data(links)
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
    return 3;
  }

  function getNodeColor(d) {
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
    .style("opacity", 0.8)
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

  // NEW in v5: Node click handling for both bookmarks and metadata nodes
  node.on("click", (event, d) => {
    event.stopPropagation();
    highlightNodeAndNeighbors(svg, d.id, links);
    // Only open panel for bookmark nodes
    if (d.type === 'bookmark') {
      openNodePanel(d.id);
    }
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
  const maxTicks = 300;
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
        .duration(500)
        .call(zoom.transform, t);
    }
  });

  currentNetwork = { simulation, svg, links, nodes, data, zoom, g, labels };
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

document.getElementById('btn-refresh').addEventListener('click', async () => {
  allBookmarks = await getBookmarks();
  closeNodePanel();
  renderAll();
  showToast('🔄 Refreshed');
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
    if (!settings.aiEnabled || !settings.aiBaseUrl || !settings.aiModel) {
      showToast('❌ AI not configured. Enable in Settings.');
      return;
    }

    const toExtract = allBookmarks.filter(b => !b.ai_extracted_fields || b.ai_extracted_fields.length === 0);
    if (toExtract.length === 0) {
      showToast('✅ All bookmarks already extracted!');
      return;
    }

    if (!confirm(`Extract metadata for ${toExtract.length} bookmarks? This may take a few minutes.`)) return;

    btnExtractAll.disabled = true;
    btnExtractAll.textContent = '⏳ 0/' + toExtract.length;

    for (let i = 0; i < toExtract.length; i++) {
      const b = toExtract[i];
      try {
        const extracted = await extractBookmarkMetadata(b.title, b.url, b.summary, b.pageMeta);
        await updateBookmark(b.id, {
          concepts: extracted.concepts,
          entities: extracted.entities,
          keywords: extracted.keywords,
          key_statistics: extracted.key_statistics,
          purpose: extracted.purpose,
          thesis: extracted.thesis,
          key_message: extracted.key_message,
          ai_extracted_fields: extracted.ai_extracted_fields,
          extraction_confidence: extracted.extraction_confidence,
          extraction_timestamp: extracted.extraction_timestamp
        });
      } catch (e) {
        console.warn('Extraction failed for', b.id, e);
      }
      btnExtractAll.textContent = `⏳ ${i + 1}/${toExtract.length}`;
    }

    allBookmarks = await getBookmarks();
    renderAll();
    btnExtractAll.disabled = false;
    btnExtractAll.textContent = '✨ AI Extract All';
    showToast(`✅ Extracted ${toExtract.length} bookmarks!`);
  });
}

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
  a.download = 'naotab-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ JSON exported!');
});

// Export Obsidian vault (ZIP of .md files)
document.getElementById('btn-export-obsidian').addEventListener('click', async () => {
  const btn = document.getElementById('btn-export-obsidian');
  btn.disabled = true;
  btn.textContent = '⏳ Generating...';

  try {
    const files = await exportObsidian();
    if (files.length === 0) {
      showToast('⚠️ No bookmarks to export!');
      return;
    }

    const zip = new JSZip();
    const vault = zip.folder('naoTab-vault');

    files.forEach(({ filename, content }) => {
      vault.file(filename, content);
    });

    // Add README with Obsidian import guide
    vault.file('_README.md', [
      '# naoTab Vault',
      '',
      'This vault was exported from [naoTab](https://github.com/bsquang/naotab).',
      '',
      '## How to import into Obsidian',
      '',
      '1. Unzip this ZIP file',
      '2. Open Obsidian → **Open folder as vault**',
      '3. Select the `naoTab-vault` folder you just unzipped',
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
    a.download = 'naoTab-obsidian-' + new Date().toISOString().slice(0, 10) + '.zip';
    a.click();
    URL.revokeObjectURL(url);

    showToast('✅ Exported ' + files.length + ' notes for Obsidian!');
  } catch (e) {
    showToast('❌ Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🟣 Export Obsidian';
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
    const result = await importJSON(text);
    allBookmarks = await getBookmarks();
    renderAll();
    showToast('✅ Imported ' + result.imported + ' bookmarks (skipped ' + result.skipped + ' duplicates)');
  } catch (err) {
    showToast('❌ Invalid JSON file');
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

// ── Node detail panel ──────────────────────────────────────────────────────────
function openNodePanel(id) {
  const b = allBookmarks.find(x => x.id === id);
  if (!b) return;
  panelId = id;

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

  // NEW in v3: Show AI attribution and content type badges
  const badgesEl = document.getElementById('panel-badges');
  let badgesHtml = '<div class="panel-badges">';
  
  // AI attribution badge
  if (b.ai_generated) {
    badgesHtml += '<span class="badge badge-ai-summary">🤖 AI Summary</span>';
  } else if (b.summary) {
    badgesHtml += '<span class="badge badge-manual">✍️ Manual</span>';
  }
  
  // AI tags badge
  if (b.ai_tags) {
    badgesHtml += '<span class="badge badge-ai-tags">🤖 AI Tags</span>';
  }
  
  // Content type badge
  if (b.content_type) {
    const emoji = getContentTypeEmoji(b.content_type);
    badgesHtml += '<span class="badge badge-content-type">' + emoji + ' ' + escapeHtml(b.content_type) + '</span>';
  }
  
  // Reading time badge
  if (b.reading_time && b.reading_time > 0) {
    badgesHtml += '<span class="badge badge-reading-time">⏱️ ' + b.reading_time + ' min read</span>';
  }
  
  badgesHtml += '</div>';
  badgesEl.innerHTML = badgesHtml;

  // Show AI row only if AI is enabled
  getSettings().then(settings => {
    const aiRow = document.getElementById('panel-ai-row');
    if (settings.aiEnabled && settings.aiBaseUrl && settings.aiModel) {
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
    connectedEl.innerHTML =
      '<div class="panel-connected-label">🔗 Connected (' + connected.length + ')</div>' +
      connected.map(({ bookmark: c, sharedTags }) => {
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
      }).join('');

    // Click connected item → navigate to that node
    connectedEl.querySelectorAll('.connected-node-item').forEach(el => {
      el.addEventListener('click', () => openNodePanel(el.dataset.id));
    });
  }

  // NEW in v5: Display extracted metadata if available
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

  document.getElementById('node-panel').classList.add('open');
  updateSidebarNodeList();
}

function closeNodePanel() {
  document.getElementById('node-panel').classList.remove('open');
  panelId = null;
  updateSidebarNodeList();
}

document.getElementById('panel-close').addEventListener('click', closeNodePanel);

// AI Suggest in panel
document.getElementById('panel-btn-ai').addEventListener('click', async () => {
  if (!panelId) return;
  const b = allBookmarks.find(x => x.id === panelId);
  if (!b) return;

  const btn = document.getElementById('panel-btn-ai');
  const status = document.getElementById('panel-ai-status');
  btn.disabled = true;
  status.textContent = '⏳ Asking AI...';
  status.className = 'panel-ai-status';

  try {
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

    const result = await callAI(b.title, b.url, aiText);
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
  } catch (e) {
    status.textContent = '❌ ' + e.message;
    status.className = 'panel-ai-status error';
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
  const summary = document.getElementById('panel-summary').value.trim();
  const reason = document.getElementById('panel-reason').value.trim();
  const tags = document.getElementById('panel-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  await updateBookmark(panelId, { summary, reason, tags });
  allBookmarks = await getBookmarks();
  renderAll();
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
document.getElementById('btn-ai-batch').addEventListener('click', async () => {
  const settings = await getSettings();
  if (!settings.aiEnabled || !settings.aiBaseUrl || !settings.aiModel) {
    showToast('⚠️ AI not configured. Go to Settings first.');
    return;
  }

  const allVisible = getFiltered(); // nodes currently visible
  if (allVisible.length === 0) { showToast('⚠️ No nodes to process.'); return; }

  // Only process nodes without a summary
  const targets = allVisible.filter(b => !b.summary);
  const alreadyDone = allVisible.length - targets.length;

  if (targets.length === 0) {
    showToast('✅ All ' + allVisible.length + ' visible nodes already have a summary!');
    return;
  }

  let msg = 'AI will process ' + targets.length + ' node' + (targets.length > 1 ? 's' : '') + ' (no summary yet).';
  if (alreadyDone > 0) msg += '\n' + alreadyDone + ' already have a summary and will be skipped.';
  if (!confirm(msg)) return;

  // Show notify
  const notify = document.getElementById('ai-batch-notify');
  const bar    = document.getElementById('ai-batch-bar');
  const sub    = document.getElementById('ai-batch-sub');
  notify.classList.remove('hidden');
  notify.querySelector('.notify-title').textContent = '✨ AI processing…';
  bar.style.width = '0%';
  sub.textContent = '0 / ' + targets.length + ' done';

  document.getElementById('btn-ai-batch').disabled = true;

  let done = 0;
  let failed = 0;

  for (const b of targets) {
    // Build aiText from saved pageMeta
    const meta = b.pageMeta || {};
    const parts = [];
    if (meta.ogTitle && meta.ogTitle !== b.title) parts.push('Title: ' + meta.ogTitle);
    if (meta.description) parts.push('Description: ' + meta.description);
    if (meta.keywords) parts.push('Keywords: ' + meta.keywords);
    if (meta.ogType) parts.push('Type: ' + meta.ogType);
    if (meta.author) parts.push('Author: ' + meta.author);
    if (meta.siteName) parts.push('Site: ' + meta.siteName);
    const aiText = parts.join('\n');

    try {
      const result = await callAI(b.title, b.url, aiText);
      if (result) {
        const changes = {};
        if (settings.featTags && result.tags?.length) {
          changes.tags = [...new Set([...result.tags, ...(b.tags || [])])].slice(0, 8);
        }
        if (settings.featSummary && result.summary) {
          changes.summary = result.summary;
        }
        if (Object.keys(changes).length) {
          await updateBookmark(b.id, changes);
          // Update local state immediately so color updates on re-render
          const local = allBookmarks.find(x => x.id === b.id);
          if (local) Object.assign(local, changes);
        }
      }
    } catch (e) {
      failed++;
    }

    done++;
    const pct = Math.round((done / targets.length) * 100);
    bar.style.width = pct + '%';
    sub.textContent = done + ' / ' + targets.length + ' done' + (failed ? ' (' + failed + ' failed)' : '');

    // Re-render after each node so color updates live
    renderAll();
  }

  document.getElementById('btn-ai-batch').disabled = false;

  // Done state
  notify.querySelector('.notify-title').textContent = '✅ AI batch complete';
  sub.textContent = (done - failed) + ' processed' + (failed ? ', ' + failed + ' failed' : '');
  allBookmarks = await getBookmarks();
  renderAll();

  setTimeout(() => notify.classList.add('hidden'), 4000);
});

// ── Delete all ─────────────────────────────────────────────────────────────────
document.getElementById('btn-delete-all').addEventListener('click', async () => {
  if (allBookmarks.length === 0) { showToast('⚠️ No bookmarks yet!'); return; }
  if (!confirm('Delete all ' + allBookmarks.length + ' bookmarks? This cannot be undone!')) return;
  await chrome.storage.local.remove('tab_bookmarks');
  allBookmarks = [];
  closeNodePanel();
  renderAll();
  showToast('🗑️ Deleted tất cả!');
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
