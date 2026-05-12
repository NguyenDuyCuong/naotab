# Phase 6a Quick Testing Guide

## How to Test Phase 6a Features

### 1. Load the Extension
1. Open Chrome
2. Navigate to: `chrome://extensions/`
3. Load unpacked: `C:\Users\cuong\workspace\naotab`
4. Open the extension app page

### 2. Test Normalization Functions (Console)
Open Developer Tools (F12) → Console and run:

```javascript
// Test concept names
normalizeConceptName("Machine Learning")        // Should: "machine-learning"
normalizeConceptName("Deep Neural Networks")    // Should: "deep-neural-networks"
normalizeConceptName("  Async / Await  ")       // Should: "async-await"

// Test entity names
normalizeEntityName("microsoft", "organization")     // Should: "Microsoft"
normalizeEntityName("OPEN AI", "organization")       // Should: "Open Ai"
normalizeEntityName("GPT-4", "acronym")              // Should: "GPT-4"

// Test keyword names
normalizeKeywordName("Learning")                // Should: "learning"
normalizeKeywordName("  OPTIMIZATION  ")        // Should: "optimization"
```

### 3. Test Schema v6 Migration (Console)
```javascript
// Create a v5 bookmark
const v5Book = {
  id: 'test-v5',
  url: 'https://example.com',
  schemaVersion: 5,
  concepts: [{ name: 'AI', relevance: 0.9 }],
  entities: [{ name: 'OpenAI', type: 'org' }]
};

// Migrate it
const migrated = migrateBookmark(v5Book);

// Check results
console.log(migrated.schemaVersion);                      // Should: 6
console.log(migrated.concepts[0].manual_definition);     // Should: null
console.log(migrated.entities[0].manual_definition);     // Should: null
```

### 4. Test Universal Node Panel - Bookmarks
1. Click any bookmark in the graph
2. Panel should show:
   - URL with favicon
   - Summary field (editable)
   - Reason field (editable)
   - Tags field (editable)
   - Connected bookmarks
   - AI Suggest button (if AI enabled)
3. Click Save button → changes persist
4. Double-click node → opens URL in new tab

### 5. Test Universal Node Panel - Concepts
⚠️ **Note**: Requires bookmarks with concepts in graph
1. Extract metadata for a bookmark (AI Extract All button)
2. Wait for graph to render with concept nodes (green circles)
3. Click a concept node → right panel opens
4. Panel shows:
   - Concept name as title
   - Definition (AI) field - read-only
   - Definition (Manual) field - editable
   - Related Entities section
   - Source bookmark link
5. Edit manual definition and click Save

### 6. Test Universal Node Panel - Entities
⚠️ **Note**: Requires bookmarks with entities in graph
1. Extract metadata for a bookmark
2. Look for entity nodes (orange circles) in graph
3. Click an entity node → right panel opens
4. Panel shows:
   - Entity name as title
   - Type field (read-only)
   - Profile (AI) field - read-only
   - Profile (Manual) field - editable
   - Related Concepts section
   - Source bookmark link
5. Edit manual profile and click Save

### 7. Test Cross-Navigation
1. Open a concept panel
2. Click a related entity → entity panel opens
3. Click a related concept → concept panel opens
4. Click source bookmark link → bookmark panel opens

### 8. Test Backward Compatibility
1. Import a v5 or v4 JSON export (use Import JSON button)
2. Graph should render normally
3. All bookmarks should show in list view
4. Clicking any bookmark should work
5. No errors in console

### 9. Run Full Test Suite (Console)
```javascript
// Enable the test script by uncommenting in app.html
// Then load the app page and check console output
// You should see test results like:
// ✅ SCHEMA_VERSION = 6
// ✅ normalizeConceptName("Machine Learning") = "machine-learning"
// etc.
```

## Expected Graph Behavior

- **Blue circles**: Bookmarks
- **Green circles**: Concepts (small)
- **Orange circles**: Entities (small)
- **Yellow circles**: Keywords (tiny)
- **Dashed lines**: Concept edges
- **Dotted lines**: Entity edges
- **Solid lines**: Bookmark-to-bookmark edges

## Regression Tests

Verify these Phase 5 features still work:
- ✅ Layer toggling (🎨 Layers section)
- ✅ Tag filtering (click tags in sidebar)
- ✅ Graph panning/zooming
- ✅ List view toggle
- ✅ Export buttons (JSON, Obsidian)
- ✅ Import button
- ✅ AI Suggest for bookmarks (if AI enabled)

## Troubleshooting

### Graph not showing concept/entity nodes
- Bookmarks need extracted metadata
- Click "✨ AI Extract All" button (requires AI configured)
- Wait for completion

### Panel not showing for concept/entity clicks
- Check console (F12) for errors
- Ensure node type is recognized (look for 🟢 or 🟠 badge)
- Try clicking bookmark first to verify panel works

### Manual definitions not saving
- Click the 💾 Save button explicitly
- Check browser console for errors
- Verify bookmark was updated with getBookmarks()

---

**Status**: Phase 6a Complete - Ready for Phase 6b
**Next**: Keywords dedup + Health auto-fix + Definition persistence
