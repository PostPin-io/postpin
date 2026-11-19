---
id: screening
type: tour
title: Screenings
status: planned
minRole: member
permission: shareLink.create
trigger: manual
starts: guide button next to the screening button
prerequisites: [first-review, may create share links (`permission`)]
code:
  - packages/postpin/src/lib/components/screening/
---

# Screenings

**Goal:** The user can run a live screening that others follow.

## Steps

1. `start`: **Highlights:** the screening button. **Text:** "Start a screening: everyone watching follows your playback."
2. `remote`: **Highlights:** the screening controls. **Text:** "Control playback for everyone; end the screening here."

## Success feedback

- At the end: "✓ Screenings: done"

## Notes

- Popover copy is a draft.
- Roles: a screening runs over a share link, so starting and controlling one is for those who may
  create share links (Member and up); everyone else only follows one. Their guide button sits next to the screening button, which only
  those people have. (Check `permission` against the actual screening check once implemented.)
