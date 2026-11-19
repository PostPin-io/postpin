---
id: timeline-view
type: tour
title: Timeline view
status: planned
audience: editor
starts: from the timeline or PostPin Guides
prerequisites: [first-review]
code:
  - packages/postpin/src/lib/components/review/ShotGrid.svelte
  - packages/postpin/src/lib/components/review/MovieBarcode.svelte
  - packages/postpin/src/lib/components/review/EstimatedCuts.svelte
---

# Timeline view

**Goal:** The user can find their way through an export using shots and the movie barcode.

## Steps

1. `barcode`: **Highlights:** the movie barcode. **Text:** "An overview of the whole export by color."
2. `cuts`: **Highlights:** the detected cuts. **Text:** "PostPin detects cuts and shows a thumbnail per shot."
3. `shot-grid`: **Highlights:** the shot grid. **Text:** "Jump to any shot directly."

## Success feedback

- At the end: "✓ Timeline view: done"

## Notes

- Popover copy is a draft.
