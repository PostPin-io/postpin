---
id: new-version
type: tour
title: Uploading a new version
status: planned
audience: editor
trigger: manual
starts: guide button next to the upload of a new version on the review page
prerequisites: [first-upload or plugin-workflow]
code:
  - packages/postpin/src/lib/components/exports/UploadModal.svelte
---

# Uploading a new version

**Goal:** The user uploads a second export of the same timeline and understands versions.

## Steps

1. `upload`: **Highlights:** the upload button of the timeline. **Text:** "Upload the next version of the same timeline here."
2. `versions`: **Highlights:** the export list. **Text:** "Every upload is a version; markers stay with their export."

## Success feedback

- At the end: "✓ Uploading a new version: done"

## Notes

- Popover copy is a draft.
