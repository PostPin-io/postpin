---
id: sync-to-nle
type: tutorial
title: Feedback back in the NLE
status: planned
minRole: reviewer
permission: marker.read
trigger: automatic
starts: automatically after first-review, when a plugin is connected
prerequisites: [a plugin connected (an install tutorial or plugin-workflow), first-review]
code:
  - packages/plugin-core/src/sync.ts
---

# Feedback back in the NLE

**Goal:** The user pulls markers from PostPin into the NLE timeline and pushes NLE markers back.

## Steps

1. `pull-markers`: Pull markers in the plugin. **Done when:** markers appear on the NLE timeline.
2. `push-markers`: Change or add a marker in the NLE and push it. **Done when:** the change shows up
   in the web app.

## Success feedback

- After `pull-markers`: "✓ Markers synced"

## Notes

- Categories travel as a `#Category` tag in the marker description, otherwise they map from the NLE
  color; worth one sentence in the tutorial.
- Roles: pulling needs `marker.read`, pushing new markers `marker.create`; both are Reviewer rights.
  Changes to existing markers only go through for markers the user may edit (a reviewer: their
  own), so `push-markers` asks for a new or own marker.
