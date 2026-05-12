# Phase 4 Quick Reference Card

## 📋 What Changed

```
✅ app.js (line 846)        — Export button connected
✅ manifest.json (line 15)  — CSP policy for vis.js CDN
```

## 🚀 Quick Test (5 Minutes)

```bash
1. chrome://extensions/ → 🔄 Reload "bookmark-vault"
2. Open bookmark-vault app.js
3. Create 10 bookmarks (use script below)
4. Click "📊 Export Graph"
5. Click "📥 Export"
6. Open downloaded HTML file
7. ✅ Graph should render!
```

## 💻 Test Data Script

```javascript
// Paste into app.js console
async function quickTest() {
  const items = [
    ['Rust Async', 'https://example.com/1', ['rust', 'async']],
    ['Rust Web', 'https://example.com/2', ['rust', 'web']],
    ['Python ML', 'https://example.com/3', ['python', 'ai']],
    ['JS Frontend', 'https://example.com/4', ['javascript', 'web']],
    ['Python Async', 'https://example.com/5', ['python', 'async']],
    ['Database SQL', 'https://example.com/6', ['database', 'sql']],
    ['Rust Perf', 'https://example.com/7', ['rust', 'performance']],
    ['Web Dev', 'https://example.com/8', ['web', 'guide']],
    ['AI Guide', 'https://example.com/9', ['ai', 'guide']],
    ['Testing', 'https://example.com/10', ['testing', 'framework']],
  ];
  
  for (const [title, url, tags] of items) {
    await storage.saveBookmark({title, url, reason: 'Test', tags});
  }
  console.log('✅ Created 10 test bookmarks!');
}

quickTest();
```

## 🔍 Debug Commands

```javascript
// Check if button handler exists
document.getElementById('btn-export-graph'); 
// Result: <button> element (should exist)

// Test showExportModal directly
showExportModal(); 
// Result: Modal should appear

// Count bookmarks
allBookmarks.length; 
// Result: Should be ≥1 to export

// Check vis.js loads (in exported HTML)
typeof vis; 
// Result: 'object' (not 'undefined')

// Measure export performance
console.time('export');
const edges = buildEdgesFromTags(allBookmarks);
const {nodes} = computeNodeMetrics(allBookmarks, edges);
const colored = assignCommunityColors(nodes);
const html = generateStaticHTML(colored, edges);
console.timeEnd('export');
console.log(`HTML: ${(html.length/1024).toFixed(1)}KB`);
// Expected: <500ms for 10 items, <1500ms for 500 items
```

## ✅ Success Checklist

### Basic Test (10 items)
- [ ] Button "📊 Export Graph" visible
- [ ] Click button → modal appears
- [ ] Modal has options for filters/colors
- [ ] Click "📥 Export" → file downloads
- [ ] File name: `bookmark-vault-graph-YYYY-MM-DD.html`
- [ ] File size: <50KB
- [ ] Open HTML in new tab
- [ ] Graph renders (nodes visible)
- [ ] Can drag nodes
- [ ] Can zoom with wheel
- [ ] No "Failed to load" errors

### Performance Test (500 items)
- [ ] Export time: <1.5 seconds
- [ ] File size: <150KB
- [ ] No UI freezing
- [ ] Graph opens without lag
- [ ] Memory usage reasonable

### CSP Test
- [ ] manifest.json has content_security_policy section
- [ ] script-src includes https://unpkg.com
- [ ] DevTools Issues tab: 0 CSP violations
- [ ] vis.js loads (Network tab: unpkg.com request 200)

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| TESTING_START_HERE.md | ⭐ Quick start guide |
| TEST_RESULTS.md | Detailed testing framework |
| IMPLEMENTATION_COMPLETE.md | What changed & why |
| PHASE4_SETUP.md | Setup & reference guide |
| PHASE4_INDEX.md | Master index & navigation |

## 🔗 Function Reference

```javascript
buildEdgesFromTags(bookmarks)
  Input:  Array of bookmarks with .tags property
  Output: Array of edges {from, to, type, label}
  
computeNodeMetrics(bookmarks, edges)
  Input:  Bookmarks + edges
  Output: {nodes, communities} with degree/group
  
assignCommunityColors(nodes)
  Input:  Nodes from computeNodeMetrics
  Output: Same nodes with .color property
  
generateStaticHTML(nodes, edges)
  Input:  Colored nodes + edges
  Output: Complete HTML string with vis.js
  
downloadFile(html, filename)
  Input:  HTML content + filename
  Output: Browser download triggered
```

## ⚠️ Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Button missing | Check app.html for `id="btn-export-graph"` |
| Modal doesn't open | Reload extension (chrome://extensions/ → 🔄) |
| vis.js fails | Check manifest.json has CSP for unpkg.com |
| File won't download | Try different filename (no special chars) |
| Graph blank | Check nodes/edges have data (console logs) |
| Slow export | Check edge count: should be <5000 for 500 items |

## 📊 Performance Targets

| Operation | Small (10) | Large (500) |
|-----------|-----------|-----------|
| buildEdgesFromTags | <100ms | <500ms |
| computeNodeMetrics | <50ms | <300ms |
| generateStaticHTML | <200ms | <1000ms |
| Total Export | <500ms | <1500ms |
| File Size | <50KB | <150KB |

## 🚀 Testing Steps

### Step 1: Setup (2 min)
1. Reload extension
2. Create test data (use script above)
3. Open app.js full view

### Step 2: Basic Test (5 min)
1. Click "📊 Export Graph"
2. Modal appears?
3. Click "📥 Export"
4. File downloads?
5. Open HTML file
6. Graph renders?

### Step 3: Detailed Tests (30-50 min)
1. See TEST_RESULTS.md § Test 1-4
2. Follow all checklists
3. Document results
4. Check against benchmarks

### Step 4: Wrap Up
1. All tests pass?
2. No critical blockers?
3. ✅ Ready for release!

## 📞 Quick Support

**Button not working?**
```javascript
document.getElementById('btn-export-graph').addEventListener('click', () => showExportModal());
```

**vis.js not loading?**
- Check manifest.json line 15 has `https://unpkg.com` in CSP
- Check DevTools Network tab for unpkg.com request

**Slow performance?**
```javascript
// Check edge count
buildEdgesFromTags(allBookmarks).length; 
// If >5000, performance will suffer
```

**Export not downloading?**
- Try different filename
- Check browser download settings
- Try incognito mode

## 📋 Test Results Template

```
Test 1: Small Dataset (10 items)
Status: ✅ PASS / ❌ FAIL
Graph renders: YES / NO
File size: ___ KB
Performance: ___ ms
Issues: ___

Test 2: Large Dataset (500 items)
Status: ✅ PASS / ❌ FAIL
Export time: ___ ms
File size: ___ KB
Memory usage: OK / HIGH
Issues: ___

Test 3: CSP Compliance
Status: ✅ PASS / ❌ FAIL
CSP violations: ___ (expect 0)
vis.js loads: YES / NO
Issues: ___

Test 4: Cross-Browser
Chrome: ✅ PASS / ❌ FAIL
Edge: ✅ PASS / ❌ FAIL (if tested)
Brave: ✅ PASS / ❌ FAIL (if tested)
Issues: ___

Overall: ✅ READY FOR RELEASE / ❌ NEEDS FIXES
```

## 🎯 Next Actions

1. **NOW:** Read TESTING_START_HERE.md (5 min)
2. **THEN:** Reload extension & test (15 min)
3. **THEN:** Run detailed tests (TEST_RESULTS.md)
4. **THEN:** Document results
5. **FINALLY:** Commit & release 🚀

---

**Ready to test? Start with TESTING_START_HERE.md!**
