---
id: sync-to-nle
type: tutorial
title: Feedback back in the NLE
status: planned
audience: editor
starts: after first-review, when a plugin is connected
prerequisites: [plugin-workflow, first-review]
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
