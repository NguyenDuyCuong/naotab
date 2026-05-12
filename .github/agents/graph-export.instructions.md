# bookmark-vault Graph Export Feature — Agent Instructions

## 🎯 Phase 1: Build Edges from Bookmark Tags

**Task ID:** graph-edges-builder
**Objective:** Implement `buildEdgesFromTags()` function in app.js

---

## 📋 Requirements

### What This Function Must Do

Extract edges (connections) from bookmark tags. When multiple bookmarks share a tag, create an edge between them.

**Input:** Array of bookmarks (from `chrome.storage.local`)

```javascript
bookmarks = [
  { id: '1', title: 'Rust async', tags: ['rust', 'async', 'perf'] },
  { id: '2', title: 'Go concurrency', tags: ['go', 'async', 'concurrency'] },
  { id: '3', title: 'Performance tips', tags: ['perf', 'optimization'] }
]
```

**Output:** Array of edges with metadata

```javascript
edges = [
  // Edges from 'async' tag (connects bookmarks sharing 'async')
  { from: '1', to: '2', type: 'tag', label: 'async', confidence: 1.0 },
  
  // Edges from 'perf' tag
  { from: '1', to: '3', type: 'tag', label: 'perf', confidence: 1.0 }
]
```

### Function Signature

```javascript
function buildEdgesFromTags(bookmarks) {
  // Return: Array of edge objects
  // Edge structure: { from, to, type, label, confidence, id (optional) }
  return edges;
}
```

### Edge Object Structure

```javascript
{
  from: '1712345678901',           // bookmark id (source)
  to: '1712345678902',             // bookmark id (target)
  type: 'tag',                     // Always 'tag' in Phase 1
  label: 'rust',                   // Tag name that connects them
  confidence: 1.0,                 // Always 1.0 for explicit tag links
  id: '1->2:tag:rust' (optional)  // Can be auto-generated
}
```

---

## 🔧 Implementation Details

### Rules

1. **Tag-based connection:** For each tag, connect ALL bookmarks that have that tag
   - If 3 bookmarks have tag 'rust', create edges: 1↔2, 1↔3, 2↔3 (fully connected)

2. **Deduplication:** Avoid duplicate edges
   - If edge (A→B, tag: 'rust') exists, don't add (A→B, tag: 'async')
   - Keep ONE edge per unique (from, to) pair
   - In case of duplicate, keep metadata (can merge labels or pick first)

3. **Self-loops:** Don't create edges where from === to

4. **Edge direction:** Edges should be bidirectional (or can be undirected)
   - Currently: Create edge A→B for each tag connection
   - Later phases will handle visualization

5. **Empty tags:** Handle bookmarks with zero tags gracefully

### Algorithm Pseudocode

```
For each tag:
  Get all bookmarks with this tag → bookmarkIds
  For each pair of bookmarkIds (i, j) where i < j:
    Create edge (i, j)
    Check if edge already exists:
      YES → Merge or skip
      NO → Add to edges array

Return edges deduplicated
```

### Example Implementation

```javascript
function buildEdgesFromTags(bookmarks) {
  const edges = [];
  const seen = new Set();  // Track (from, to) pairs to avoid duplicates
  
  // Map: tag → [bookmarkIds]
  const tagMap = {};
  bookmarks.forEach(b => {
    b.tags.forEach(tag => {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(b.id);
    });
  });
  
  // For each tag, connect all bookmarks with that tag
  Object.entries(tagMap).forEach(([tag, bookmarkIds]) => {
    for (let i = 0; i < bookmarkIds.length; i++) {
      for (let j = i + 1; j < bookmarkIds.length; j++) {
        const from = bookmarkIds[i];
        const to = bookmarkIds[j];
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
```

---

## 📂 Files to Modify

### Primary File: `app.js`

**Location:** `/app.js` (in repo root)

**Where to add:**
- Add `buildEdgesFromTags()` function somewhere in the file
- Good location: After line ~150, before rendering logic
- Or: Create new section "// ── Graph Data Building ──"

**Don't modify:**
- Existing `init()`, `renderAll()`, `renderView()` functions
- State variables (allBookmarks, etc.)

### Reference Files (Read-only)

- **schema.js** — Understand bookmark structure
- **build_graph.py lines 155-178** — See how wiki version does it
- **app.js lines 1-35** — Understand current data flow

---

## 🧪 Testing

### Unit Test Cases

Before marking done, verify:

1. **Basic case:** 2 bookmarks with shared tag
   ```javascript
   bookmarks = [
     { id: '1', tags: ['rust'] },
     { id: '2', tags: ['rust'] }
   ]
   Expected: 1 edge (1↔2)
   ```

2. **Multiple tags:** Bookmarks with overlapping tags
   ```javascript
   bookmarks = [
     { id: '1', tags: ['rust', 'async'] },
     { id: '2', tags: ['rust', 'perf'] },
     { id: '3', tags: ['async', 'perf'] }
   ]
   Expected: 3 edges (1↔2, 1↔3, 2↔3)
   ```

3. **Deduplication:** Same bookmarks connected by multiple tags
   ```javascript
   bookmarks = [
     { id: '1', tags: ['rust', 'async'] },
     { id: '2', tags: ['rust', 'async'] }
   ]
   Expected: 1 edge (1↔2) — not duplicated
   Metadata: Can have label 'rust' or 'async' (pick one)
   ```

4. **No tags:** Bookmarks with empty tags array
   ```javascript
   bookmarks = [
     { id: '1', tags: [] },
     { id: '2', tags: ['rust'] }
   ]
   Expected: 0 edges
   ```

5. **Large dataset:** 100+ bookmarks
   ```
   Performance: Should complete in < 100ms
   No memory issues
   ```

### How to Test

Add simple test code in browser console:

```javascript
// Load current bookmarks
const bookmarks = await getBookmarks();

// Call your function
const edges = buildEdgesFromTags(bookmarks);

// Check results
console.log(`Generated ${edges.length} edges`);
console.log('Sample edge:', edges[0]);

// Verify no duplicates
const edgeIds = edges.map(e => `${e.from}-${e.to}`);
const unique = new Set(edgeIds);
console.log(`Unique edges: ${unique.size} (duplicates: ${edgeIds.length - unique.size})`);
```

---

## 📋 Deliverables

### Code Changes

✅ **File: app.js**
- [ ] Add `buildEdgesFromTags(bookmarks)` function
- [ ] Function handles all test cases above
- [ ] No console errors
- [ ] Clear comments explaining logic

### Validation

- [ ] Function works with 0 bookmarks (returns [])
- [ ] Function works with 1-1000 bookmarks
- [ ] No duplicate edges
- [ ] No self-loops
- [ ] All edge objects have required fields

### Documentation

- [ ] Function has JSDoc comment explaining parameters/return
- [ ] Algorithm is clear from comments

### Commit

- [ ] Create commit with message: "feat: implement buildEdgesFromTags for graph export (Phase 1)"
- [ ] Include test cases in commit message or as comment

---

## 🎓 Context & References

### Current Architecture

**Data flow:**
```
popup.js  ← Save bookmarks
    ↓
chrome.storage.local
    ↓
app.js  ← Read with getBookmarks()
    ↓
allBookmarks state
    ↓
Your new buildEdgesFromTags()  ← Create edges from tags
```

### Bookmark Schema (from schema.js)

```javascript
{
  id: '1712345678901',     // timestamp-based, unique
  url: 'https://...',
  title: 'Page title',
  tags: ['rust', 'async'],  // Array of strings
  reason: 'Why saved',
  summary: 'AI summary',
  ... other fields
}
```

### Why This Matters

- **Phase 2** will use these edges to compute node degrees (centrality)
- **Phase 3** will use edges for HTML template generation
- Later phases will add edge typing/confidence scoring

### Related Code

See build_graph.py lines 155-178 for wiki version:
```python
def build_extracted_edges(pages):
    # Similar logic but for wiki pages + wikilinks
    # Map stem (lower) -> page_id
    # For each wikilink, create edge if target exists
```

---

## ⚠️ Important Notes

1. **No breaking changes:** Don't modify existing functions
2. **CSP compliant:** No eval, no inline scripts (but shouldn't need any)
3. **Performance:** Should handle 1000 bookmarks without lag
4. **Robustness:** Handle edge cases (empty arrays, null tags, etc.)
5. **Testing:** Add test code but don't commit test code permanently

---

## 🚀 Success Criteria

✅ Function implemented and in app.js
✅ Passes all 5 test cases above
✅ No console errors
✅ Handles 1000+ bookmarks efficiently
✅ Code is clean and commented
✅ Commit created

---

## 📞 Questions to Resolve

If unclear:
1. **Deduplication strategy:** Keep first edge's metadata or merge?
   → Answer: Keep first occurrence
   
2. **Edge direction:** Should it be A→B or bidirectional?
   → Answer: A→B is fine (vis.js will handle later)
   
3. **Empty case:** Return [] for 0 bookmarks or null?
   → Answer: Return [] (empty array)
