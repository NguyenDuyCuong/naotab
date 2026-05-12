# Phase 3B: Node Community Coloring — Agent Instructions

**Task ID:** node-community-coloring  
**Objective:** Add community-based node coloring for visualization

---

## 🎯 What This Does

Enhance the graph visualization to color nodes by their community (topic cluster).

### Input

```javascript
nodes = [
  // From computeNodeMetrics(), nodes already have 'group' property
  { id: '1', title: 'Rust', group: 0, ... },
  { id: '2', title: 'Go', group: 1, ... },
  { id: '3', title: 'Python', group: 1, ... }  // Same group as Go
]
```

### Output

Same nodes, but with `color` property added for visualization:

```javascript
nodes = [
  { id: '1', title: 'Rust', group: 0, color: '#E91E63', ... },
  { id: '2', title: 'Go', group: 1, color: '#00BCD4', ... },
  { id: '3', title: 'Python', group: 1, color: '#00BCD4', ... }
]
```

---

## 📋 Requirements

### 1. Color Palette

```javascript
const COMMUNITY_COLORS = [
  "#E91E63", "#00BCD4", "#8BC34A", "#FF5722", "#673AB7",
  "#FFC107", "#009688", "#F44336", "#3F51B5", "#CDDC39",
];
```

### 2. Color Assignment

```javascript
function assignCommunityColors(nodes) {
  return nodes.map(n => ({
    ...n,
    color: COMMUNITY_COLORS[n.group % COMMUNITY_COLORS.length]
  }));
}
```

### 3. Visual Result

- Bookmarks with same primary tag → same color (group)
- Related bookmarks visually clustered
- Easy to identify topic areas
- Colors cycle if > 10 communities

---

## 📂 Implementation

### Add to app.js

Create helper function to assign colors:

```javascript
const COMMUNITY_COLORS = [
  "#E91E63", "#00BCD4", "#8BC34A", "#FF5722", "#673AB7",
  "#FFC107", "#009688", "#F44336", "#3F51B5", "#CDDC39",
];

function assignCommunityColors(nodes) {
  return nodes.map(n => ({
    ...n,
    color: COMMUNITY_COLORS[n.group % COMMUNITY_COLORS.length]
  }));
}
```

### Integration Point

In `generateStaticHTML()`:

```javascript
// After computeNodeMetrics()
const nodes = assignCommunityColors(nodes);

// Then use in vis.js setup
```

Or in dynamic rendering:

```javascript
function renderView() {
  const filtered = getFiltered();
  const edges = buildEdgesFromTags(filtered);
  const {nodes} = computeNodeMetrics(filtered, edges);
  
  const coloredNodes = assignCommunityColors(nodes);  // Add colors
  
  renderGraph(coloredNodes, edges);
}
```

---

## ⚠️ Notes

- Simple task (can do in parallel with other Phase 3 tasks)
- No major logic, just cosmetic coloring
- Use predefined color palette
- Keep JSDoc minimal

---

## 🚀 Success Criteria

✅ COMMUNITY_COLORS palette defined  
✅ assignCommunityColors() function implemented  
✅ Works with computeNodeMetrics() output  
✅ Colors cycle correctly for > 10 communities  
✅ Integrates with visualization code
