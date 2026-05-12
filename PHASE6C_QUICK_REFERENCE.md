# Phase 6c: Health & Lint Checks — Quick Reference

## 🚀 Quick Start

### Health Check (Instant)
1. **Click** 🏥 Health button in topbar
2. **Wait** <1 second for results
3. **Review** issues with severity levels (HIGH/MEDIUM/LOW)
4. **Click** 🔧 Auto-fix to normalize and clean up

### Lint Check (AI-Powered)
1. **Enable** AI in Settings (popup.html)
2. **Click** 🔍 Lint button in topbar
3. **Wait** <30 seconds for analysis
4. **Review** semantic issues and suggestions
5. **Use** "AI Suggest" button in node panel to improve

---

## 📊 Health Check Issues

### Severity: HIGH 🔴
- `empty_bookmark` — No title, summary, or reason
- `missing_url` — No valid URL for bookmark

### Severity: MEDIUM 🟠
- `no_metadata` — No summary or extracted knowledge
- `inconsistent_concept_naming` — Variations in concept names
- `inconsistent_entity_naming` — Conflicting entity names

### Severity: LOW 🔵
- `inconsistent_keyword_naming` — Keyword case variations
- `low_confidence_extraction` — Extraction confidence < 60%
- `stale_metadata` — Metadata older than 30 days

---

## 🔍 Lint Check Issues

All require **AI enabled** in Settings.

- `generic_summary` — Vague text with common adjectives (<60 chars)
- `missing_technical_entities` — Tech content without extracted entities
- `suspicious_high_confidence` — >95% confidence with 10+ concepts
- `missing_summary_with_extraction` — Has extracted data but no summary
- `conflicting_entity_types` — Same entity has multiple types
- `outdated_extraction` — Bookmark updated after last extraction
- `duplicate_keywords` — Same keyword appears multiple times

---

## 🔧 Auto-Fix Operations

Health check only. Automatically:
1. **Delete** empty bookmarks
2. **Delete** bookmarks with missing URLs
3. **Normalize** all concept names (→ kebab-case)
4. **Normalize** all entity names (→ Proper Case)
5. **Normalize** all keywords (→ lowercase)
6. **Regenerate** metadata for stale entries

After auto-fix, graph view updates automatically.

---

## 💾 Saving Reports

Click **💾 Save Report** to download report as `.txt`:
- Report includes summary statistics
- Lists all identified issues
- Can be shared or archived
- Filename: `health-lint-report-{timestamp}.txt`

---

## ⚙️ Settings Integration

### For AI Lint Checks:
**Required settings** (in Settings tab):
- ✅ Enable AI
- ✅ Set API endpoint (OpenAI, Anthropic, etc.)
- ✅ Provide API key
- ✅ Select model

If AI not enabled: Lint button shows warning, returns info message.

---

## 🎯 Best Practices

### Regular Use:
1. Run **Health** weekly to catch issues
2. Run **Lint** after batch import/processing
3. Review **Auto-fix** suggestions before applying
4. Use **Lint suggestions** to improve bookmark quality

### Large Collections:
- ✅ Health check: Always <1s
- ⏳ Lint check: ~5-30s for 100+ bookmarks
- 💡 Consider running lint off-peak

### Data Quality:
- 🎯 Fix HIGH severity issues first
- 📝 Review suggestions in node panel
- 🤖 Use "AI Suggest" to auto-complete missing fields
- 🔄 Regenerate stale metadata quarterly

---

## 🐛 Troubleshooting

### Health Check Runs Slowly
→ Should always be <1s. Check browser console for errors.

### Lint Check Shows Warning
→ Ensure AI is enabled in Settings tab of popup.html

### Auto-fix Doesn't Work
→ Check console for errors. Some issues may require manual review.

### Buttons Not Appearing
→ Reload extension (🔄 button in popup)

### Report Download Fails
→ Check browser download permissions

---

## 🔗 Integration with Other Features

- **AI Extract All**: Can regenerate stale metadata
- **Node Panel**: "AI Suggest" improves extracted content
- **Graph View**: Updates automatically after auto-fix
- **Export**: Works with fixed/normalized data
- **Search**: Indexes regenerated metadata

---

## 📈 Performance Notes

| Operation | Time | Bookmarks |
|-----------|------|-----------|
| Health check | <1s | 100+ |
| Lint check | <5s | 50 |
| Lint check | <30s | 100 |
| Auto-fix | 1-10s | ~50 |
| Auto-fix + regenerate | 10-60s | ~50 |

---

## 🎓 Example Workflow

```
1. Click 🏥 Health
   ↓ Review HIGH severity issues
2. Click 🔧 Auto-fix Issues
   ↓ Issues deleted/normalized
3. Click 🔍 Lint
   ↓ Review semantic issues
4. Use 💡 Suggestions in node panel
   ↓ Improve bookmark quality
5. Click 💾 Save Report
   ↓ Archive for records
```

---

## ✅ Success Indicators

- ✅ Health check shows 0 HIGH severity issues
- ✅ Most bookmarks have summaries
- ✅ No naming inconsistencies detected
- ✅ Extraction confidence >70% average
- ✅ Metadata <7 days old
- ✅ All bookmarks have valid URLs

---

## 📞 Support

**Error Messages:**
- "Bookmark has no title, summary, or reason" → Use auto-fix or node panel
- "Low extraction confidence: 45%" → Click "AI Suggest" or "AI Extract All"
- "Lint requires AI enabled" → Enable AI in Settings

**Questions:**
- See PHASE6C_COMPLETION_REPORT.md for technical details
- Check test_phase6c.js for implementation examples
- Review core/health.js and core/lint.js source code

---

**Phase 6c Complete!** Use health & lint checks to maintain a high-quality knowledge base. 🚀
