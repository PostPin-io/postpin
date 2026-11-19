---
id: guest-review
type: tour
title: Reviewing as a guest
status: planned
audience: guest
trigger: manual
starts: guide button in the header of the share view (guests have no PostPin Guides page)
prerequisites: []
code:
  - packages/postpin/src/routes/s/[token]/+page.svelte
  - packages/postpin/src/lib/components/share-view/
---

# Reviewing as a guest

**Goal:** A guest can leave feedback on an export without an account.

## Steps

1. `player`: **Highlights:** the player. **Text:** "Watch the export; pause wherever you want to comment."
2. `set-marker`: **Highlights:** the create-marker control. **Text:** "Leave a comment at the current frame."
3. `navigate`: **Highlights:** the marker list. **Text:** "Jump between comments."

## Success feedback

- At the end: "✓ Reviewing as a guest: done"

## Notes

- Popover copy is a draft.
