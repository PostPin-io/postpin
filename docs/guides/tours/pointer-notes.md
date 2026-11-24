---
id: pointer-notes
type: tour
title: Drawing and pointing
status: planned
minRole: reviewer
permission: marker.create
trigger: manual
starts: guide button next to the pointer selector in the video menu bar
prerequisites: [first-review, may create markers (`permission`)]
code:
  - packages/postpin/src/lib/components/review/PointerOverlay.svelte
  - packages/postpin/src/lib/components/review/NoteOverlay.svelte
  - packages/postpin/src/lib/components/review/markers/PointerSelector.svelte
---

# Drawing and pointing

**Goal:** The user can point at a spot in the frame and attach it to a marker.

## Steps

1. `pointer`: **Highlights:** the pointer selector. **Text:** "Mark a spot in the frame so everyone knows exactly what you mean."
2. `overlay`: **Highlights:** the video. **Text:** "Pointers are shown on the frame when the marker is selected."

## Success feedback

- At the end: "✓ Drawing and pointing: done"

## Notes

- Popover copy is a draft.
- Roles: creating and shaping markers is a Reviewer right (`marker.create`); changing or deleting
  someone else's marker isn't, so the tour works on a marker the user creates in it, not on an
  existing one.
