# Phase 3: Generate Static HTML Template — Agent Instructions

**Task ID:** static-html-generator  
**Objective:** Implement `generateStaticHTML(nodes, edges)` function

---

## 🎯 What This Function Does

Create a self-contained HTML file with embedded graph visualization using vis.js.

### Input

```javascript
nodes = [
  { id: '1', title: 'Rust', value: 2, degree: 2, group: 0, tags: ['rust', 'async'], ... },
  { id: '2', title: 'Go', value: 1, degree: 1, group: 1, tags: ['go', 'async'], ... },
  // ... from computeNodeMetrics()
]

edges = [
  { from: '1', to: '2', type: 'tag', label: 'async', confidence: 1.0 },
  // ... from buildEdgesFromTags()
]
```

### Output

```javascript
// Returns HTML string:
`<!DOCTYPE html>
<html>
<head>
  <title>naoTab Graph</title>
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  ...
</head>
<body>
  <div id="graph"></div>
  <script>
    const nodes = new vis.DataSet([...embedded nodes JSON...]);
    const edges = new vis.DataSet([...embedded edges JSON...]);
    new vis.Network(container, {nodes, edges}, options);
  </script>
</body>
</html>`
```

---

## 📋 Requirements

### 1. HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>naoTab Graph Export</title>
    <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        /* CSS here */
    </style>
</head>
<body>
    <div id="graph"></div>
    <div id="controls">...</div>
    <script>
        /* JavaScript here */
    </script>
</body>
</html>
```

### 2. CSS Styling

```css
body {
  margin: 0;
  font-family: 'Inter', -apple-system, sans-serif;
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
  background: rgba(10,10,30,0.88);
  padding: 14px;
  border-radius: 10px;
  z-index: 10;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.08);
}

#stats {
  position: fixed;
  top: 10px;
  right: 10px;
  font-size: 12px;
  background: rgba(10,10,30,0.88);
  padding: 10px 14px;
  border-radius: 10px;
}
```

### 3. JavaScript Visualization

```javascript
// Embed nodes and edges as JSON
const originalNodes = [... nodes array as JSON ...];
const originalEdges = [... edges array as JSON ...];

const nodes = new vis.DataSet(originalNodes);
const edges = new vis.DataSet(originalEdges);

const options = {
  physics: {
    enabled: true,
    barnesHut: {
      gravitationalConstant: -26000,
      centralGravity: 0.3,
      springLength: 200,
    }
  },
  nodes: {
    physics: true,
    scaling: {
      label: true
    },
    widthConstraint: {
      maximum: 200
    }
  },
  edges: {
    smooth: {
      type: 'continuous'
    }
  }
};

const container = document.getElementById('graph');
new vis.Network(container, { nodes, edges }, options);
```

### 4. Features to Include

- ✅ **Graph container:** `<div id="graph"></div>` (full viewport)
- ✅ **Embedded data:** nodes and edges JSON directly in HTML
- ✅ **Physics simulation:** vis.js force-directed layout
- ✅ **Dark theme:** Professional dark background
- ✅ **Stats display:** Show node count, edge count
- ✅ **Responsive:** Works on different screen sizes
- ✅ **Self-contained:** NO external CSS/JS files (CDN exceptions: vis.js)

### 5. Node Colors

```javascript
// Node coloring by community (group)
const COMMUNITY_COLORS = [
  "#E91E63", "#00BCD4", "#8BC34A", "#FF5722", "#673AB7",
  "#FFC107", "#009688", "#F44336", "#3F51B5", "#CDDC39",
];

// Apply to nodes before vis.js:
nodes.forEach(n => {
  n.color = COMMUNITY_COLORS[n.group % COMMUNITY_COLORS.length];
  n.size = Math.sqrt(n.value) * 15;  // Size by degree
  n.label = n.title;
});
```

### 6. Edge Styling

```javascript
edges.forEach(e => {
  if (e.type === 'tag') {
    e.color = { color: '#555555' };  // Grey for tag links
    e.width = 1;
  } else if (e.type === 'inferred') {
    e.color = { color: '#FF5722' };  // Orange for inferred
    e.width = 2;
  }
  e.title = `${e.label} (${e.confidence.toFixed(2)})`;  // Hover tooltip
});
```

---

## 🔧 Function Signature

```javascript
function generateStaticHTML(nodes, edges) {
  // Build HTML string with embedded data
  // Include all CSS + JavaScript
  // Return complete HTML
  return htmlString;
}
```

---

## 📂 Implementation

### Location in app.js

Add after `computeNodeMetrics()` function (around line 341)

### Function Structure

```javascript
function generateStaticHTML(nodes, edges) {
  // 1. Prepare data (colors, sizing, labels)
  const preparedNodes = nodes.map(n => ({
    id: n.id,
    label: n.title,
    size: Math.sqrt(n.value) * 15,
    color: COMMUNITY_COLORS[n.group % COMMUNITY_COLORS.length],
    ...
  }));

  // 2. Prepare edges
  const preparedEdges = edges.map(e => ({
    ...e,
    color: e.type === 'tag' ? '#555555' : '#FF5722',
    title: `${e.label} (${e.confidence})`
  }));

  // 3. Serialize to JSON
  const nodesJson = JSON.stringify(preparedNodes, null, 2);
  const edgesJson = JSON.stringify(preparedEdges, null, 2);

  // 4. Create HTML template
  const html = `<!DOCTYPE html>
  <html>
  ...
  <script>
    const nodes = new vis.DataSet(${nodesJson});
    const edges = new vis.DataSet(${edgesJson});
    ...
  </script>
  </html>`;

  return html;
}
```

---

## 🧪 Testing

### Test Cases

1. **Basic graph:** 3 nodes, 2 edges
   - [ ] HTML generates without errors
   - [ ] Nodes and edges appear in HTML
   - [ ] File is valid HTML (can open in browser)

2. **Visualization:** Open in browser
   - [ ] Graph renders with physics simulation
   - [ ] Nodes sized by degree (larger = more connections)
   - [ ] Nodes colored by community
   - [ ] Hover shows metadata

3. **Large dataset:** 100+ nodes
   - [ ] HTML file size reasonable (< 2MB)
   - [ ] Renders smoothly
   - [ ] No console errors

4. **Self-contained:** No external dependencies
   - [ ] Only vis.js from CDN (allowed)
   - [ ] No broken links
   - [ ] All CSS/JS embedded

---

## 📋 Deliverables

- [ ] `generateStaticHTML(nodes, edges)` implemented
- [ ] Returns complete HTML string
- [ ] Nodes colored by community
- [ ] Nodes sized by degree
- [ ] Edges styled appropriately
- [ ] JSDoc documented
- [ ] Handles edge cases (empty graph, large graphs)
- [ ] Commit created

---

## 📂 Reference

### From build_graph.py

See lines 625-1000 for vis.js HTML template reference:
- HTML structure
- CSS styling
- vis.js configuration
- Node/edge properties

### Integration with Previous Phases

```javascript
// Phase 1 + Phase 2 output
const edges = buildEdgesFromTags(allBookmarks);
const {nodes} = computeNodeMetrics(allBookmarks, edges);

// Phase 3: Generate HTML
const html = generateStaticHTML(nodes, edges);
```

---

## 🚀 Success Criteria

✅ Function implemented  
✅ Generates valid HTML  
✅ Graph renders in browser  
✅ Self-contained (no broken links)  
✅ Nodes sized by degree  
✅ Nodes colored by community  
✅ Efficient (<2MB for 1000 nodes)  
✅ Commit created
