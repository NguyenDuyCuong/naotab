# Phase 4 Testing Results — naoTab Export Feature

**Date:** [To be filled during testing]  
**Tester:** [Your name]  
**Browser:** [Chrome version]  

---

## Overview

This document tracks the validation of the naoTab graph export feature across 4 test scenarios:
1. Small Dataset (10-50 bookmarks)
2. Large Dataset (500-1000 bookmarks)
3. CSP Compliance
4. Cross-Browser Compatibility

---

## Setup Checklist

Before starting tests, verify:
- [ ] Extension version: Check popup → should show naoTab v0.19.1+
- [ ] Button present: Look for "📊 Export Graph" button in app.js view
- [ ] CSP policy: manifest.json includes `https://unpkg.com` in script_src
- [ ] DevTools console: No errors on app.js load
- [ ] vis.js CDN: Can be reached (check browser network tab)

---

## Test 1: Small Dataset (10-50 bookmarks)

### Setup
1. Open naoTab popup (`chrome-extension://[id]/popup.html`)
2. Create 5-10 test bookmarks with mixed tags:
   - Bookmark 1: `["rust", "web"]`
   - Bookmark 2: `["rust", "async"]`
   - Bookmark 3: `["web", "javascript"]`
   - Bookmark 4: `["python", "async"]`
   - Bookmark 5: `["database", "sql"]`
   - (Add 5-10 more)

**Quick method:** Use this in popup.js console:
```javascript
async function createSmallDataset() {
  const tags = ["rust", "web", "python", "async", "database"];
  const titles = ["Article", "Tutorial", "Guide", "Doc"];
  
  for (let i = 1; i <= 10; i++) {
    const t1 = tags[Math.floor(Math.random() * tags.length)];
    const t2 = tags[Math.floor(Math.random() * tags.length)];
    
    await storage.saveBookmark({
      title: `${titles[Math.floor(Math.random() * titles.length)]} ${i}`,
      url: `https://example.com/test-${i}`,
      reason: `Test bookmark ${i}`,
      tags: [t1, t2].filter((v, i, a) => a.indexOf(v) === i)
    });
  }
  console.log('✅ Created 10 test bookmarks');
}
createSmallDataset();
```

### Validation Checklist

**Graph Rendering:**
- [ ] Open app.js view (click the extension icon → "Open full-page app")
- [ ] Graph renders without crashing
- [ ] All nodes visible (should see ~10-15 nodes if tags overlap)
- [ ] Node labels readable
- [ ] Edges connect related nodes (same tag)

**Edge Generation:**
- [ ] Open DevTools console in app.js
- [ ] Run: `console.log('Edges:', buildEdgesFromTags(allBookmarks).length)`
- [ ] Expected: 8-15 edges (depends on tag overlap)
- [ ] Each edge should connect bookmarks sharing ≥1 tag

**Metrics Computation:**
- [ ] Run: `const {nodes: metricNodes} = computeNodeMetrics(allBookmarks, buildEdgesFromTags(allBookmarks)); console.log('Nodes with degree:', metricNodes.slice(0,3));`
- [ ] Verify degree > 0 for connected nodes
- [ ] Verify communities detected (group property)

**Community Colors:**
- [ ] Run: `const nodes = assignCommunityColors(metricNodes); console.log('Node colors:', nodes.slice(0,3));`
- [ ] Colors assigned from COMMUNITY_COLORS palette
- [ ] Same-tag bookmarks should get same color

**HTML Export:**
- [ ] Click "📊 Export Graph" button
- [ ] Modal appears with options
- [ ] Shows: "X node(s) will be exported"
- [ ] Click "📥 Export"
- [ ] File `naotab-graph-YYYY-MM-DD.html` downloads
- [ ] File size: <50KB expected

**HTML Validity:**
- [ ] Open downloaded HTML in browser (File → Open or drag into tab)
- [ ] Graph renders with vis.js
- [ ] Nodes visible
- [ ] Edges visible
- [ ] No JavaScript errors in console
- [ ] Physics simulation settles (nodes stop moving after ~3-5 seconds)

**Interactivity:**
- [ ] Drag nodes → positions update
- [ ] Zoom with mouse wheel → graph zooms
- [ ] Pan with middle mouse → viewport moves
- [ ] Hover nodes → tooltip shows title/tags/summary
- [ ] Click nodes → graph responds (no errors)

**Result:**
- [ ] ✅ PASS — All checks passed
- [ ] ⚠️ PARTIAL — Some features work, minor issues noted below
- [ ] ❌ FAIL — Critical failures

**Issues Found:**
```
[List any issues, errors, or observations here]
```

---

## Test 2: Large Dataset (500-1000 bookmarks)

### Setup

In app.js console, create 500+ bookmarks:

```javascript
async function createLargeDataset() {
  const tags = ["rust", "web", "python", "async", "performance", "database", "ai", "ui", "mobile", "backend", "frontend", "devops", "testing", "api", "graphql"];
  const titles = ["Article", "Tutorial", "Documentation", "Code Sample", "Guide", "Benchmark"];
  const baseUrl = "https://example.com/article";
  
  let created = 0;
  for (let i = 0; i < 500; i++) {
    const t1 = tags[Math.floor(Math.random() * tags.length)];
    const t2 = tags[Math.floor(Math.random() * tags.length)];
    const title = `${titles[Math.floor(Math.random() * titles.length)]} ${i}`;
    
    await storage.saveBookmark({
      title,
      url: `${baseUrl}-${i}`,
      reason: `Test article ${i}`,
      tags: [t1, t2].filter((v, i, a) => a.indexOf(v) === i)
    });
    
    created++;
    if (created % 50 === 0) console.log(`Created ${created}/500...`);
  }
  console.log('✅ Created 500 test bookmarks');
}
createLargeDataset();
```

### Performance Validation

**1. Function Performance:**
- [ ] In console, run:
```javascript
const bm = allBookmarks;
console.time('buildEdgesFromTags');
const edges = buildEdgesFromTags(bm);
console.timeEnd('buildEdgesFromTags');
console.log(`Edges: ${edges.length}`);

console.time('computeNodeMetrics');
const {nodes} = computeNodeMetrics(bm, edges);
console.timeEnd('computeNodeMetrics');

console.time('assignCommunityColors');
const coloredNodes = assignCommunityColors(nodes);
console.timeEnd('assignCommunityColors');

console.time('generateStaticHTML');
const html = generateStaticHTML(coloredNodes, edges);
console.timeEnd('generateStaticHTML');
console.log(`HTML size: ${(html.length / 1024).toFixed(2)}KB`);
```

**Expected Performance:**
- [ ] buildEdgesFromTags: **<500ms** (ideally <300ms)
- [ ] computeNodeMetrics: **<300ms** (ideally <200ms)
- [ ] assignCommunityColors: **<50ms**
- [ ] generateStaticHTML: **<1000ms** (ideally <500ms)
- [ ] **Total: <1.5 seconds**

**Timing Results:**
```
buildEdgesFromTags: ___ ms
computeNodeMetrics: ___ ms
assignCommunityColors: ___ ms
generateStaticHTML: ___ ms
Total: ___ ms
```

**2. Graph Rendering:**
- [ ] Click "📊 Export Graph" → modal appears quickly
- [ ] Shows correct node count
- [ ] Export button stays responsive
- [ ] No UI blocking during export

**3. Downloaded File:**
- [ ] File `naotab-graph-YYYY-MM-DD.html` downloads
- [ ] File size: expected <150KB (500 bookmarks)
  - Actual size: ___KB
- [ ] File is valid HTML (can open in browser)

**4. Browser Opening HTML:**
- [ ] Open downloaded HTML file
- [ ] vis.js network visualization loads
- [ ] No "Failed to load" errors
- [ ] Physics simulation runs (watch status at top-left)
- [ ] Nodes gradually settle (~5-10 seconds)
- [ ] After settling:
  - [ ] All nodes visible
  - [ ] Edges connect related tags
  - [ ] No overlapping nodes (well-distributed)
  - [ ] Can drag individual nodes
  - [ ] Can zoom with wheel
  - [ ] Tooltips show on hover

**5. DevTools Analysis:**
- [ ] Open DevTools on the exported HTML (F12)
- [ ] Console tab: **0 errors expected**
- [ ] Network tab: Check vis-network.min.js loaded from unpkg.com
  - [ ] Size: ~150-200KB
  - [ ] Status: 200 OK
- [ ] Memory: Check memory usage
  - [ ] Initial: ___ MB
  - [ ] After 1min: ___ MB
  - [ ] Check for memory leaks (steady state expected)

**Result:**
- [ ] ✅ PASS — Performance acceptable, <1.5s export, file opens smoothly
- [ ] ⚠️ PARTIAL — Slow but functional (export >2s or opening sluggish)
- [ ] ❌ FAIL — Crash, timeout, or file issues

**Issues Found:**
```
[Note any performance bottlenecks, hangs, or errors]
```

---

## Test 3: CSP Compliance

### Check 1: Manifest CSP Policy

- [ ] Open `manifest.json`
- [ ] Verify `content_security_policy` section exists:
```json
"content_security_policy": {
  "extension_pages": "script-src 'self' https://unpkg.com; style-src 'self' 'unsafe-inline'"
}
```
- [ ] ✅ Correct — unpkg.com included in script-src
- [ ] ❌ Missing — CSP not defined or unpkg.com not included

### Check 2: Runtime CSP Validation

**In app.js exported HTML:**
- [ ] Open DevTools on the exported HTML
- [ ] Go to **Issues** tab
- [ ] Check for CSP violations:
  - [ ] ✅ 0 violations expected
  - [ ] ⚠️ Warnings (list below)
  - [ ] ❌ Errors (list below)

**In Chrome console:**
```javascript
// Check if vis.js loaded successfully
console.log('vis.Network available:', typeof vis !== 'undefined');
console.log('vis.Network.name:', vis.Network?.name || 'N/A');
```
- [ ] ✅ Should print: `vis.Network available: true`
- [ ] ❌ If false → CSP is blocking vis.js

### Check 3: Generated HTML Security

- [ ] Open downloaded HTML in text editor
- [ ] Search for inline scripts:
  - [ ] ✅ Only scripts in `<script>` tags (external or embedded data)
  - [ ] ❌ Any inline event handlers like `onclick="..."` → CSP violation
- [ ] Search for `eval(` or `new Function(`:
  - [ ] ✅ Not found
  - [ ] ❌ Found → CSP violation

### Check 4: File Download CSP

- [ ] When downloading HTML, check headers (DevTools → Network):
  - [ ] Look for `Content-Security-Policy` header
  - [ ] Should allow unpkg.com: `script-src ... https://unpkg.com ...`

**Result:**
- [ ] ✅ PASS — No CSP violations, vis.js loads, HTML renders
- [ ] ⚠️ PARTIAL — Minor warnings, but functional
- [ ] ❌ FAIL — CSP blocking vis.js or inline scripts present

**Issues Found:**
```
[List any CSP issues or violations]
```

---

## Test 4: Cross-Browser Compatibility

### Browser: Chrome 90+

**Test Steps:**
1. [ ] Open extension (click icon)
2. [ ] Open app.js full page
3. [ ] Click "📊 Export Graph"
4. [ ] Export 10-20 bookmarks as HTML
5. [ ] Open downloaded HTML

**Validation:**
- [ ] ✅ Graph renders
- [ ] ✅ No console errors
- [ ] ✅ Drag/zoom works
- [ ] ✅ Tooltips show
- [ ] ✅ File size <150KB
- [ ] ❌ Issues: _________________________________

### Browser: Edge (Chromium-based)

*Repeat steps above on Microsoft Edge if available*

**Validation:**
- [ ] ✅ Graph renders
- [ ] ✅ No console errors
- [ ] ✅ Drag/zoom works
- [ ] ✅ Download path may differ
- [ ] ❌ Issues: _________________________________

### Browser: Brave

*Repeat steps above on Brave if available (may have stricter CSP)*

**Validation:**
- [ ] ✅ Graph renders
- [ ] ✅ No console errors
- [ ] ✅ Drag/zoom works
- [ ] ✅ Adblocker doesn't interfere
- [ ] ❌ Issues: _________________________________

**Overall Result:**
- [ ] ✅ PASS — Works consistently on Chrome, Edge, Brave
- [ ] ⚠️ PARTIAL — Works on most browsers, issues on 1
- [ ] ❌ FAIL — Fails on multiple browsers

---

## Summary & Sign-Off

### Overall Status

- **Test 1 (Small Dataset):** ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- **Test 2 (Large Dataset):** ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- **Test 3 (CSP Compliance):** ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- **Test 4 (Cross-Browser):** ✅ PASS / ⚠️ PARTIAL / ❌ FAIL

### Critical Blockers

```
[List any critical issues that must be fixed before release]
```

### Nice-to-Haves

```
[List any improvements or minor issues for future iterations]
```

### Recommendation

- [ ] ✅ **READY FOR RELEASE** — All tests passed, no blockers
- [ ] 🔧 **NEEDS FIXES** — Address critical blockers before release
- [ ] 📋 **NEEDS RETESTING** — After fixes, retest sections: ___________

### Tester Sign-Off

**Name:** ___________________________  
**Date:** ___________________________  
**Browser & OS:** ___________________________  

---

## Debug Reference

### Chrome Extension Console Commands

**In `app.js` console:**

```javascript
// Check bookmarks loaded
const bm = await getBookmarks();
console.log(`Total bookmarks: ${bm.length}`);

// Check export functions exist
console.log('buildEdgesFromTags:', typeof buildEdgesFromTags);
console.log('computeNodeMetrics:', typeof computeNodeMetrics);
console.log('assignCommunityColors:', typeof assignCommunityColors);
console.log('generateStaticHTML:', typeof generateStaticHTML);

// Test full pipeline
const edges = buildEdgesFromTags(bm);
const {nodes} = computeNodeMetrics(bm, edges);
const coloredNodes = assignCommunityColors(nodes);
const html = generateStaticHTML(coloredNodes, edges);
console.log(`Generated HTML: ${(html.length / 1024).toFixed(2)}KB`);

// Check vis.js in exported HTML
// After opening the exported HTML, run in its console:
console.log('vis available:', typeof vis !== 'undefined');
console.log('Network nodes:', document.querySelectorAll('[data-id]').length);
```

### Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| Export button doesn't show | Not connected to handler | Check app.js line: `document.getElementById('btn-export-graph').addEventListener` |
| Modal doesn't appear | showExportModal not called | Verify button listener calls `showExportModal()` |
| Downloaded file is blank | HTML generation failed | Check console for `generateStaticHTML` errors |
| vis.js fails to load | CSP blocking unpkg.com | Add to manifest.json: `"script-src 'self' https://unpkg.com"` |
| Graph doesn't render | vis.Network CDN issue | Check Network tab: unpkg.com request status |
| Performance slow | Too many edges | Check edge count: `buildEdgesFromTags(allBookmarks).length` |

---

## Next Steps

After completing all 4 tests:

1. [ ] Review test results
2. [ ] Fix any critical blockers
3. [ ] Retest affected sections
4. [ ] Update CLAUDE.md if behavior changed
5. [ ] Commit results: `git add . && git commit -m "Phase 4 testing: Export feature validated"`
6. [ ] Tag release if all ✅ PASS

---

**Good luck! 🚀**
