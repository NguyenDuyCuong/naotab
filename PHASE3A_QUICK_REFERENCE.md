# Phase 3a Quick Reference

## What Changed?

### New Bookmark Fields (v3 Schema)

```javascript
{
  // Existing fields...
  
  // NEW in v3:
  ai_generated: boolean,  // Was summary made by AI?
  ai_tags: boolean,       // Were tags suggested by AI?
  content_type: string,   // article|video|guide|tool|paper|bookmark
  reading_time: number    // Estimated minutes to read
}
```

## Using the New Features

### 1. Track AI Usage (in popup.js)

```javascript
// When saving a bookmark after using AI:
const result = await saveBookmark({
  url: tab.url,
  title: tab.title,
  summary: userSummary,
  tags: userTags,
  ai_generated: aiSummaryUsed,  // true if AI generated summary
  ai_tags: aiTagsUsed,           // true if AI generated tags
});
```

### 2. Display Badges (in app.js)

The `openNodePanel()` function automatically displays:
- 🤖 AI Summary - if `bookmark.ai_generated === true`
- ✍️ Manual - if summary exists but `ai_generated === false`
- 🤖 AI Tags - if tags were AI-generated
- Content type emoji + name (📰 article, 🎥 video, etc.)
- ⏱️ Reading time (e.g., "5 min read")

### 3. Filter by Content Type (in app.html)

Users can filter bookmarks using checkboxes in the toolbar:
```html
<label><input type="checkbox" class="content-filter" data-type="article" checked> 📰 Articles</label>
<label><input type="checkbox" class="content-filter" data-type="video" checked> 🎥 Videos</label>
<label><input type="checkbox" class="content-filter" data-type="guide" checked> 📚 Guides</label>
<label><input type="checkbox" class="content-filter" data-type="tool" checked> 🛠️ Tools</label>
<label><input type="checkbox" class="content-filter" data-type="paper" checked> 📄 Papers</label>
```

## Key Functions

### `detectContentType(url, tags, pageMeta)`
Returns one of: `'article'`, `'video'`, `'guide'`, `'tool'`, `'paper'`, `'bookmark'`

**Detection rules:**
- **video** - Contains 'youtube.com', 'youtu.be', 'vimeo.com' OR tag contains 'video'
- **paper** - Contains 'arxiv', 'scholar.google', '/pdf' OR tag contains 'paper'
- **guide** - Contains '/guide', 'tutorial', 'how-to' OR tag contains 'guide'
- **tool** - Contains 'github.com' OR tag contains 'tool'
- **article** - Default fallback

### `estimateReadingTime(summary)`
Returns estimated minutes to read based on word count.

**Calculation:** `Math.ceil(wordCount / 200)` (minimum 1 minute)

**Example:**
- "Short summary" (2 words) → 1 min
- 250-word summary → 2 min
- Empty summary → 0 min

### `migrateBookmark(raw)`
Automatically upgrades old bookmarks to v3.

**Handles:**
- v1 → v2 migration (graph fields)
- v2 → v3 migration (AI fields + content detection)
- Preserves all existing data
- Never throws errors

## Testing

Run tests to verify Phase 3a implementation:

```bash
node test_graph_logic.js
```

Expected output: All 8 tests passing
- Test 1: Bookmark Migration
- Test 2: Edge Building
- Test 3: Node Metrics
- Test 4: Data Validation
- Test 5: Graph Statistics
- Test 6: v2→v3 Migration ✨ NEW
- Test 7: Content Type Detection ✨ NEW
- Test 8: Reading Time Estimation ✨ NEW

## Files Modified

1. **core/schema.js** - Schema upgrade, new functions
2. **popup.js** - AI tracking variables and flags
3. **app.js** - Badges display and filtering logic
4. **app.html** - UI elements and styling
5. **test_graph_logic.js** - New tests

## Important Notes

### Backward Compatibility
- Old bookmarks auto-upgrade without data loss
- Default values prevent undefined fields
- Schema version bump allows future migrations

### AI Attribution
- User must explicitly enable AI features in settings
- Flags are only set when AI Suggest button is used
- Manual edits preserve AI attribution (can be overridden)

### Content Detection
- Based on heuristics, not perfect accuracy
- Can be improved with more training data
- User can manually edit content_type if needed

### Reading Time
- Assumes 200 words per minute average
- Minimum 1 minute for any content
- 0 minutes if no summary provided

## Example: Adding v4 in the Future

```javascript
const SCHEMA_VERSION = 4;

const BOOKMARK_DEFAULTS = {
  // ... existing fields ...
  ai_generated: false,
  ai_tags: false,
  content_type: 'article',
  reading_time: 0,
  
  // NEW in v4:
  language: 'en',        // Detected language
  sentiment: 'neutral',  // AI-detected sentiment
};

function migrateBookmark(raw) {
  // ... existing migration logic ...
  
  if (v < 4) {
    b.language = detectLanguage(b.title + ' ' + b.summary);
    b.sentiment = analyzeSentiment(b.summary);
  }
  
  b.schemaVersion = SCHEMA_VERSION;
  return b;
}
```

## Debugging Tips

### Check schema version:
```javascript
allBookmarks.forEach(b => {
  if (b.schemaVersion < 3) {
    console.warn('Unmigrated bookmark:', b.id);
  }
});
```

### Verify content type detection:
```javascript
const result = detectContentType('https://youtube.com/watch?v=123', ['tutorial'], {});
console.log(result); // Should be 'video'
```

### Test reading time:
```javascript
const time = estimateReadingTime('A '.repeat(100)); // ~100 words
console.log(time); // Should be 1
```

---

**Phase 3a Complete** ✅  
All tests passing | Backward compatible | Ready for deployment
