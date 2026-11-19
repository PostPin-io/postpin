---
id: plugin-workflow
type: tutorial
title: Working from your NLE
status: planned
audience: editor
trigger: automatic
starts: from the welcome step of first-upload (the user picks the plugin path)
prerequisites: []
code:
  - packages/postpin/src/routes/auth/device/+page.svelte
  - packages/plugin-core/
---

# Working from your NLE

**Goal:** The plugin is installed and signed in, and the user rendered and uploaded an export from
the NLE (DaVinci Resolve, Premiere Pro, or Pro Tools via the desktop app).

## Steps

1. `choose-nle`: Pick the NLE. **Done when:** an NLE is selected.
2. `install-plugin`: Download and install instructions for that NLE. **Done when:** the user
   confirms, or the plugin connects (next step).
3. `connect-plugin`: Sign in from the plugin via the device-code flow (`/auth/device`).
   **Done when:** the device is authorized.
4. `create-project-timeline`: Create or pick a project and timeline from the plugin.
   **Done when:** the plugin is linked to a timeline.
5. `render-upload`: Render and upload from the plugin. **Done when:** the export appears in the web
   app.

## Success feedback

- After `connect-plugin`: "✓ Plugin connected"
- After `render-upload`: "✓ Export rendered and uploaded"

## Notes

- Steps 2, 4 and 5 happen outside the web app. How the web app follows them (polling, live updates)
  is planned separately.
- Continues with [first-review](first-review.md).
