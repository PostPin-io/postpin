---
id: timeline-view
type: tour
title: Timeline view
status: planned
minRole: reviewer
trigger: manual
starts: guide button in the timeline toolbar
prerequisites: [first-review]
code:
  - packages/postpin/src/lib/components/review/ShotGrid.svelte
  - packages/postpin/src/lib/components/review/MovieBarcode.svelte
  - packages/postpin/src/lib/components/review/BarcodeOverview.svelte
  - packages/postpin/src/lib/components/review/EstimatedCuts.svelte
---

# Timeline view

**Goal:** The user can find their way through an export using shots and the movie barcode.

## Steps

1. `barcode`: **Highlights:** the overview below the shot grid, the movie barcode with the shots in view framed. **Text:** "The whole export by color. Drag the frame or click beside it to jump through the shots, drag its edges to see more or fewer at once."
2. `cuts`: **Highlights:** the detected cuts. **Text:** "PostPin detects cuts and shows a thumbnail per shot."
3. `shot-grid`: **Highlights:** the shot grid. **Text:** "Jump to any shot directly."

## Success feedback

- At the end: "✓ Timeline view: done"

## Notes

- Popover copy is a draft.
- Roles: read-only features, the same for every role from Reviewer up (and none of the steps
  needs a right beyond `marker.read`).
