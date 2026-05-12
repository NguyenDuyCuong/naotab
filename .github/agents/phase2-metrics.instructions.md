# Phase 2: Compute Node Metrics — Agent Instructions

**Task ID:** graph-metrics-compute  
**Objective:** Implement `computeNodeMetrics(bookmarks, edges)` function

---

## 🎯 What This Function Does

Calculate node properties for graph visualization:
1. **Degree:** Number of edges connected to each node (centrality measure)
2. **Communities:** Group related bookmarks (optional, simplified)
3. **Value:** For node sizing in visualization

### Input

```javascript
bookmarks = [
  { id: '1', title: 'Rust', tags: ['rust', 'async'] },
  { id: '2', title: 'Go', tags: ['go', 'async'] },
  { id: '3', title: 'Python', tags: ['python'] }
]

edges = [
  { from: '1', to: '2', type: 'tag', label: 'async', confidence: 1.0 },
  // ... more edges
]
```

### Output

```javascript
{
  nodes: [
    { 
      id: '1',
      title: 'Rust',
      value: 2,           // degree = 2 (connected to node 2)
      group: 0,           // community = 0
      degree: 2           // explicit degree property
    },
    { 
      id: '2',
      title: 'Go',
      value: 1,           // degree = 1
      group: 1,           // different community
      degree: 1
    },
    // ... more nodes
  ],
  communities: {        // Optional: map nodeId -> communityId
    '1': 0,
    '2': 1,
    '3': 1
  }
}
```

---

## 📋 Requirements

### 1. Calculate Node Degrees

```javascript
// For each node, count edges
// degree = number of edges where node appears (from OR to)

Example:
  Edge 1: {from: '1', to: '2'}  → node 1 degree +1, node 2 degree +1
  Edge 2: {from: '1', to: '3'}  → node 1 degree +1, node 3 degree +1
  
Result:
  node 1: degree = 2
  node 2: degree = 1
  node 3: degree = 1
```

### 2. Community Detection (Simplified, Optional)

**Two options:**

**Option A: Simplified Tag-Based Clustering** ⭐ RECOMMENDED
```javascript
// Group bookmarks by their most common tag
// Bookmarks with same primary tag = same community

Example:
  Bookmark 1: tags ['rust', 'async'] → primary tag 'rust' → community 'rust'
  Bookmark 2: tags ['rust', 'perf'] → primary tag 'rust' → community 'rust'
  Bookmark 3: tags ['go', 'async'] → primary tag 'go' → community 'go'
  
Result:
  community 'rust': [1, 2]
  community 'go': [3]
```

**Option B: Skip Communities for Now**
- Return empty communities object {}
- Can add later in Phase 2B

### 3. Enhance Nodes

```javascript
// Take existing bookmarks, add computed properties

Enhanced node:
{
  ...bookmarkProperties,  // id, title, tags, url, etc.
  value: degree,          // For node sizing (important!)
  group: communityId,     // For community coloring
  degree: degree          // Explicit degree property
}
```

### 4. Edge Cases

- Empty edges → all nodes have degree 0
- Isolated nodes → degree 0, value 1 (still visible)
- Duplicate edges → count once
- Self-loops → shouldn't happen (Phase 1 prevents them)

---

## 🔧 Function Signature

```javascript
function computeNodeMetrics(bookmarks, edges) {
  // Calculate degrees
  // Detect communities (optional)
  // Enhance nodes with computed properties
  
  return {
    nodes: [...enhanced nodes],
    communities: { nodeId: communityId, ... }  // or {}
  };
}
```

---

## 📂 Implementation

### Example Implementation

```javascript
function computeNodeMetrics(bookmarks, edges) {
  // 1. Initialize degree map
  const degreeMap = {};
  bookmarks.forEach(b => {
    degreeMap[b.id] = 0;
  });

  // 2. Count degree for each node
  edges.forEach(e => {
    if (degreeMap[e.from] !== undefined) degreeMap[e.from]++;
    if (degreeMap[e.to] !== undefined) degreeMap[e.to]++;
  });

  // 3. Detect communities (simplified: by primary tag)
  const communities = {};
  const tagToComm = {}; // tag -> communityId
  let commId = 0;
  
  bookmarks.forEach(b => {
    if (b.tags && b.tags.length > 0) {
      const primaryTag = b.tags[0];
      if (!tagToComm[primaryTag]) {
        tagToComm[primaryTag] = commId++;
      }
      communities[b.id] = tagToComm[primaryTag];
    } else {
      communities[b.id] = commId++;
    }
  });

  // 4. Enhance nodes with computed properties
  const nodes = bookmarks.map(b => ({
    ...b,
    value: degreeMap[b.id] + 1,  // +1 so isolated nodes are visible
    degree: degreeMap[b.id],
    group: communities[b.id]
  }));

  return { nodes, communities };
}
```

---

## 📂 Files to Modify

### Primary File: `app.js`

**Add after `buildEdgesFromTags()`:**
- Location: After line 276 (after buildEdgesFromTags function)
- Section: "// ── Graph Data Building"

**Function:** `computeNodeMetrics(bookmarks, edges)`

### Reference Files

- **app.js lines 217-276:** buildEdgesFromTags (Phase 1, already done)
- **schema.js:** Bookmark structure
- **build_graph.py lines 1252-1258:** Degree-based sizing reference

---

## 🧪 Testing

### Test Cases

1. **Empty case:**
   ```javascript
   bookmarks = []
   edges = []
   Expected: { nodes: [], communities: {} }
   ```

2. **No edges (isolated nodes):**
   ```javascript
   bookmarks = [{id:'1', title:'A'}, {id:'2', title:'B'}]
   edges = []
   Expected:
     nodes = [
       {id:'1', title:'A', value: 1, degree: 0},
       {id:'2', title:'B', value: 1, degree: 0}
     ]
     communities = {'1': 0, '2': 1} (or similar)
   ```

3. **Connected nodes:**
   ```javascript
   bookmarks = [{id:'1'}, {id:'2'}, {id:'3'}]
   edges = [{from:'1', to:'2'}, {from:'1', to:'3'}]
   Expected:
     nodes[0]: degree: 2, value: 3
     nodes[1]: degree: 1, value: 2
     nodes[2]: degree: 1, value: 2
   ```

4. **With communities (tags):**
   ```javascript
   bookmarks = [
     {id:'1', tags:['rust']},
     {id:'2', tags:['rust']},
     {id:'3', tags:['go']}
   ]
   Expected:
     communities['1'] === communities['2']  (same tag)
     communities['1'] !== communities['3']  (different tag)
   ```

5. **Large dataset (100+ bookmarks):**
   ```
   Performance: < 100ms
   Memory: Reasonable
   ```

---

## 📋 Deliverables

### Code

- [ ] `computeNodeMetrics(bookmarks, edges)` function added to app.js
- [ ] JSDoc documentation with parameters and return types
- [ ] Clear comments explaining algorithm
- [ ] All 5 test cases pass
- [ ] No console errors

### Properties Computed

- [ ] `node.value` = degree + 1 (for sizing)
- [ ] `node.degree` = raw degree count
- [ ] `node.group` = community ID
- [ ] `communities` object returned

### Commit

- [ ] Create commit: "feat: implement computeNodeMetrics for graph export (Phase 2)"
- [ ] Include both functions (buildEdgesFromTags + computeNodeMetrics tested together)

---

## 🎓 Context

### What Depends on This

**Phase 3 functions that depend on this:**
- `generateStaticHTML(nodes, edges)` — Uses node.value for sizing
- `buildNodeSizingVis()` — Uses degree to scale node radius

### Why Communities Matter

Communities help visualize clusters:
- Nodes with same community = same color
- Easier to see topic groups
- Later: can be used for filtering

### Performance Target

```
1000 bookmarks + 5000 edges
Expected compute time: < 100ms
```

---

## 🚀 Success Criteria

✅ Function implemented  
✅ Passes all 5 test cases  
✅ Efficiently handles 1000+ bookmarks  
✅ JSDoc documented  
✅ Works with buildEdgesFromTags output  
✅ Commit created

---

## 📝 Integration

### How It Works with Phase 1

```javascript
// Phase 1 output
const edges = buildEdgesFromTags(allBookmarks);

// Phase 2 (your function)
const {nodes, communities} = computeNodeMetrics(allBookmarks, edges);

// Result: enhanced nodes ready for visualization
nodes[0] // {id, title, tags, url, ..., value, degree, group}
```

### Ready for Phase 3

After this is done, Phase 3 will use:
- `nodes` → for HTML template
- `edges` → for visualization
- Can parallelize multiple Phase 3 tasks

