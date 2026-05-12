// ── State ──────────────────────────────────────────────────────────────────────
let allBookmarks = [];
let activeTag = null;
let excludedTags = new Set(); // tags excluded from graph edges
let searchQuery = '';
let currentView = 'graph';
let editingId = null;
let panelId = null; // id bookmark đang hiển thị trong panel

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
  const COMMUNITY_COLORS = [
    "#E91E63", "#00BCD4", "#8BC34A", "#FF5722", "#673AB7",
    "#FFC107", "#009688", "#F44336", "#3F51B5", "#CDDC39",
  ];

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

// ── Graph view ─────────────────────────────────────────────────────────────────
function renderGraph(bookmarks) {
  const svg = d3.select('#graph-svg');
  svg.selectAll('*').remove();

  if (bookmarks.length === 0) return;

  const w = document.getElementById('graph-view').clientWidth;
  const h = document.getElementById('graph-view').clientHeight;

  // Build edges and compute metrics
  const edges = buildEdgesFromTags(bookmarks);
  const { nodes: metricNodes } = computeNodeMetrics(bookmarks, edges);
  
  // Assign community colors
  const nodes = assignCommunityColors(metricNodes);
  
  // Build link data from edges
  const links = edges.map(e => ({
    source: e.from,
    target: e.to,
    shared: [e.label]
  }));

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(w / 2, h / 2))
    .force('collision', d3.forceCollide(32));

  const g = svg.append('g');

  svg.call(d3.zoom().scaleExtent([0.2, 3]).on('zoom', e => g.attr('transform', e.transform)));

  const link = g.append('g').selectAll('line').data(links).join('line')
    .attr('stroke', '#dadce0').attr('stroke-width', 1.5).attr('stroke-opacity', 0.6);

  const node = g.append('g').selectAll('g').data(nodes).join('g')
    .attr('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

  node.append('circle')
    .attr('r', 18)
    .attr('fill', d => d.color)
    .attr('fill-opacity', d => d.summary ? 0.25 : 0.08)
    .attr('stroke', d => d.color)
    .attr('stroke-width', d => d.summary ? 2.5 : 1.5);

  node.append('text')
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
    .attr('font-size', '14px').text('🔗');

  node.append('text')
    .attr('text-anchor', 'middle').attr('y', 28)
    .attr('font-size', '10px').attr('fill', '#3c4043')
    .text(d => d.title.length > 22 ? d.title.slice(0, 22) + '…' : d.title);

  const tooltip = document.getElementById('graph-tooltip');

  // Build adjacency set for quick lookup
  const neighborMap = {};
  nodes.forEach(n => { neighborMap[n.id] = new Set(); });
  links.forEach(l => {
    neighborMap[l.source.id || l.source]?.add(l.target.id || l.target);
    neighborMap[l.target.id || l.target]?.add(l.source.id || l.source);
  });

  node
    .on('mouseover', (e, d) => {
      tooltip.style.display = 'block';
      tooltip.innerHTML =
        '<strong>' + escapeHtml(d.title) + '</strong>' +
        '<div class="tt-url">' + escapeHtml(d.url) + '</div>' +
        (d.summary ? '<div class="tt-summary">' + escapeHtml(d.summary) + '</div>' : '') +
        (d.reason ? '<div class="tt-reason">"' + escapeHtml(d.reason) + '"</div>' : '') +
        '<div class="tt-tags">' + d.tags.map(t => '<span class="tt-tag">' + escapeHtml(t) + '</span>').join('') + '</div>';
    })
    .on('mousemove', (e) => {
      tooltip.style.left = (e.offsetX + 14) + 'px';
      tooltip.style.top = (e.offsetY - 10) + 'px';
    })
    .on('mouseout', () => { tooltip.style.display = 'none'; })
    .on('click', (e, d) => {
      e.stopPropagation();
      const neighbors = neighborMap[d.id] || new Set();
      node.selectAll('circle')
        .attr('fill-opacity', n => (n.id === d.id || neighbors.has(n.id)) ? (n.summary ? 0.85 : 0.35) : 0.04)
        .attr('stroke-opacity', n => (n.id === d.id || neighbors.has(n.id)) ? 1 : 0.15);
      node.selectAll('text')
        .attr('opacity', n => (n.id === d.id || neighbors.has(n.id)) ? 1 : 0.2);
      link
        .attr('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.05)
        .attr('stroke', l => (l.source.id === d.id || l.target.id === d.id) ? '#1a73e8' : '#dadce0')
        .attr('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? 2.5 : 1.5);
      openNodePanel(d.id);
    })
    .on('dblclick', (e, d) => { e.stopPropagation(); window.open(d.url, '_blank'); });

  // Click background → reset highlight
  svg.on('click', () => {
    node.selectAll('circle')
      .attr('fill-opacity', n => n.summary ? 0.25 : 0.08)
      .attr('stroke-opacity', 1)
      .attr('stroke', n => n.color)
      .attr('stroke-width', n => n.summary ? 2.5 : 1.5);
    node.selectAll('text').attr('opacity', 1);
    link.attr('stroke-opacity', 0.6).attr('stroke', '#dadce0').attr('stroke-width', 1.5);
    closeNodePanel();
  });

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

  btn.disabled = false;
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
