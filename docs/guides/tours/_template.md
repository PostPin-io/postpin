---
id: tour-id
type: tour
title: Title shown in PostPin Guides
status: planned
minRole: member # lowest role that can do it at all: reviewer | member | admin | owner | guest (README, rule 17)
permission: area.action # the right of roles.ts it is about, minRole is the lowest role with it; leave out if none
trigger: manual
starts: when / from where it starts
prerequisites: []
code: []
---

# Title

**Goal:** What the user knows afterwards.

## Steps

Each step is a popover on one highlighted element; the rest is dimmed and can't be used. Write the
advance mode in brackets: next | next, inert | click | appears. That makes it a Look (next, inert),
Try (next) or Your-turn step (click, appears), rule 16 in the README: a Look text never asks the user
to do something. Texts: as short as possible, as long as necessary (rule 15).

1. `step-id` (click): **Highlights:** element. **Text:** popover copy.
2. `done` (done): **Completion card**, nothing highlighted. **Title:** "✓ …". **Text:** what the user
   can do now. **Button:** "Done".

## Success feedback

- After `step-id`: "✓ Confirmation text"

## Notes

-
