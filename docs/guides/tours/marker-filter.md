---
id: marker-filter
type: tour
title: Filtering markers
status: planned
minRole: reviewer
trigger: manual
starts: guide button next to the filter of the marker panel
prerequisites: [first-review]
code:
  - packages/postpin/src/lib/components/review/markers/MarkerPanel.svelte
  - packages/postpin/src/lib/components/review/markers/marker-filter.svelte.ts
---

# Filtering markers

**Goal:** The user can narrow the marker list down to what matters right now.

## Steps

1. `filter`: **Highlights:** the filter controls of the marker panel. **Text:** "Show only the markers you need, e.g. one category or open markers."
2. `list`: **Highlights:** the marker list. **Text:** "Click a marker to jump to its frame."

## Success feedback

- At the end: "✓ Filtering markers: done"

## Notes

- Popover copy is a draft.
- Roles: read-only features, the same for every role from Reviewer up (and none of the steps
  needs a right beyond `marker.read`).
