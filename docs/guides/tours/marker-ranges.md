---
id: marker-ranges
type: tour
title: Marker ranges
status: planned
minRole: reviewer
permission: marker.create
trigger: manual
starts: guide button in the marker editor
prerequisites: [first-review, may create markers (`permission`)]
code:
  - packages/postpin/src/lib/components/review/RangeEdgeIcon.svelte
  - packages/postpin/src/lib/components/review/markers/MarkerPositionModal.svelte
---

# Marker ranges

**Goal:** The user can create markers that span a range instead of a single frame.

## Steps

1. `range`: **Highlights:** the range edges of a marker on the timeline. **Text:** "Drag the edges to cover a whole passage."

## Success feedback

- At the end: "✓ Marker ranges: done"

## Notes

- Popover copy is a draft.
- Roles: creating and shaping markers is a Reviewer right (`marker.create`); changing or deleting
  someone else's marker isn't, so the tour works on a marker the user creates in it, not on an
  existing one.
