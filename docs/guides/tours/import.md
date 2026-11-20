---
id: import
type: tour
title: Importing markers
status: planned
minRole: reviewer
permission: marker.create
trigger: manual
starts: guide button next to the import menu on the review page
prerequisites: [first-review, may create markers (`permission`)]
code:
  - packages/postpin/src/lib/components/review/MarkerImport.svelte
  - packages/postpin/src/lib/components/review/TimelineDataImport.svelte
---

# Importing markers

**Goal:** The user can bring existing markers and timeline data into PostPin.

## Steps

1. `marker-import`: **Highlights:** the marker import. **Text:** "Import markers from a file."
2. `timeline-data`: **Highlights:** the timeline data import. **Text:** "Import timeline data, e.g. for exact cuts."

## Success feedback

- At the end: "✓ Importing markers: done"

## Notes

- Popover copy is a draft.
- Roles: `marker-import` creates markers (`marker.create`, a Reviewer right). `timeline-data` is
  **optional**: replacing the timeline's tracks counts as a new version and needs `export.upload` (Member and
  up, see `importCutList`), so it is left out for a reviewer. Importing only the markers of a cut
  list is `marker.create`, like `marker-import`.
