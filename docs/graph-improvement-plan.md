# Graph Improvement Plan

Inspired by the [Observable temporal force-directed graph demo](https://observablehq.com/@d3/temporal-force-directed-graph).

## 1. Timeline Scrubber

Add a horizontal slider below the graph to scrub through time and watch the knowledge base grow.

- Filter nodes by `savedAt` date up to the selected time
- Edges also appear/disappear as nodes enter the view
- Play/pause animation to auto-advance the slider
- Shows how clusters formed over time

**Implementation notes:**
- Parse `savedAt` timestamps, sort nodes chronologically
- D3 slider or `<input type="range">` mapped to date range
- On scrub: filter `allBookmarks` by date, re-run simulation with subset

---

## 2. Node Size by Connection Count

Nodes with more shared-tag connections appear larger — visually surfacing "hub" topics.

- Compute degree (number of edges) per node
- Map degree to radius: `r = baseRadius + degree * scaleFactor`
- Hubs (e.g., a node tagged `javascript`, `react`, `performance`) stand out immediately

**Implementation notes:**
- Build adjacency/degree map after edge computation
- Pass degree into D3 node radius scale (`d3.scaleSqrt` recommended)
- Tooltip or panel shows connection count

---

## 3. Edge Thickness by Shared Tag Count

When two bookmarks share multiple tags, the edge between them is thicker — stronger relationship = thicker line.

- Current: edge exists if ≥1 shared non-excluded tag
- Improvement: edge `strokeWidth` ∝ number of shared tags
- Quickly reveals tightly related bookmarks vs loosely related ones

**Implementation notes:**
- When building edges, count intersection of tag arrays
- Map count to stroke width: 1 shared tag → 1px, 3+ → 3px
- Optionally color edges by strength (light grey → dark blue)

---

## 4. Node Opacity by Recency

Recently saved bookmarks appear fully opaque; older ones fade — shows what's fresh in the knowledge base.

- Compute age in days from `savedAt` to today
- Map age to opacity: recent = 1.0, 30+ days = 0.4
- Helps prioritize revisiting older, faded nodes

**Implementation notes:**
- `d3.scaleLinear().domain([0, 30]).range([1.0, 0.4]).clamp(true)`
- Apply to node circle `opacity` attribute
- Could also affect label opacity for consistency

---

## Priority order

| # | Feature | Effort | Visual Impact |
|---|---------|--------|---------------|
| 1 | Edge thickness by shared tags | Low | Medium |
| 2 | Node size by connection count | Low | High |
| 3 | Node opacity by recency | Low | Medium |
| 4 | Timeline scrubber | High | High |

Start with 1–3 as they require only changes to the existing render loop. Timeline scrubber is the most complex but most impressive feature.
