---
id: new-version
type: tour
title: Uploading a new version
status: planned
minRole: member
permission: export.upload
trigger: manual
starts: guide button next to the upload of a new version on the review page
prerequisites: [first-upload or plugin-workflow, may upload exports (`permission`)]
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
- Roles: uploading is `export.upload` (Member and up), on the timeline's project or timeline grant.
  A reviewer has neither the upload button nor this guide's button. `versions` (the export list)
  is the same for everyone, but without a guide button a reviewer never sees this tour.
