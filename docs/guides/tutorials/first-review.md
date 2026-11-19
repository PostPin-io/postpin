---
id: first-review
type: tutorial
title: Your first review
status: planned
audience: editor
trigger: automatic
starts: automatically when the first export is playable
prerequisites: [first-upload or plugin-workflow]
code:
  - packages/postpin/src/lib/components/review/ExportReview.svelte
  - packages/postpin/src/lib/components/review/markers/
---

# Your first review

**Goal:** The user can leave frame-accurate feedback on an export and work through it.

## Steps

1. `set-marker`: Pause at a frame and create a marker with a comment. **Done when:** a marker exists.
2. `choose-category`: Assign a category to the marker. **Done when:** the marker has a category.
3. `navigate-markers`: Jump between markers (list and shortcuts). **Done when:** the user jumped
   to a marker.
4. `respond`: Reply to a marker. **Done when:** a response exists.

## Success feedback

- After `set-marker`: "✓ Your first marker"
- At the end: "✓ You know the basics of reviewing"

## Notes

- Continues with [sync-to-nle](sync-to-nle.md) if a plugin is connected; otherwise suggests the
  [share-link](../tours/share-link.md) tour.
