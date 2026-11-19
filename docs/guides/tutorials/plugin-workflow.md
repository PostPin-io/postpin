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

1. `choose-nle`: Pick the NLE: DaVinci Resolve, Premiere Pro or Pro Tools. **Done when:** an NLE is
   selected.
2. `install`: Hands over to the install tutorial of that NLE:
   [install-resolve](install-resolve.md), [install-premiere](install-premiere.md) or
   [install-desktop](install-desktop.md) (Pro Tools). Left out when a plugin for that NLE is
   already connected for this user. **Done when:** that install tutorial is completed; its
   completion screen says "Continue" and comes back here.
3. `create-project-timeline`: Create or pick a project and timeline from the plugin.
   **Done when:** the plugin is linked to a timeline.
4. `render-upload`: Render and upload from the plugin. **Done when:** the export appears in the web
   app.
5. `done`: **Completion screen:** "✓ Your first export from <NLE> is in PostPin", what the user can
   do now, a pointer to PostPin Guides. **Done when:** "Open your export"; the tutorial closes at
   once and the review page opens.

## Success feedback

- After `render-upload`: "✓ Export rendered and uploaded"
- Connecting the plugin has its feedback in the install tutorial.

## Install tutorials

One install tutorial per plugin, not per operating system: the plugins differ far more from each
other than macOS from Windows (Resolve: `.pkg` / `.exe`; Premiere: the same `.ccx` on both;
Pro Tools: the PostPin Desktop app). All three share the same step ids, so they can be built as one
tutorial component with data per NLE and OS:

| Step          | What it is                                                              |
| ------------- | ----------------------------------------------------------------------- |
| `download`    | Download button for the selected OS, requirements stated up front       |
| `install`     | Run the installer                                                       |
| `os-security` | Security prompt (SmartScreen, Creative Cloud warning); left out if none |
| `open-in-nle` | Where the plugin shows up in the NLE                                    |
| `connect`     | Sign in via the device-code flow; the one step the web app can observe  |
| `done`        | Completion screen; "Continue" when started from plugin-workflow         |

- **OS switch:** a "macOS | Windows" switch in the tutorial header, preset from the detected OS
  (`navigator.userAgentData.platform`, falling back to the user agent). Users often read in the
  browser on one machine and install on another (the edit workstation), so the preset is only a
  default. The selected OS is stored on the tutorial's progress, like the step.
- **OS differences** are written per step as **macOS** / **Windows** sub-items, and only where they
  differ. A step that doesn't apply to an OS is left out for it (it keeps its id).
- **Steps outside the browser** (`install`, `os-security`, `open-in-nle`) complete with "Next".
  `connect` completes by itself as soon as a device authorization for the plugin's client id
  (`DEVICE_CLIENTS` in `#lib/device-clients.ts`) is approved for this user, also from another tab;
  it then jumps there from any earlier step.
- **Downloads** point at the latest release (currently `https://docs.postpin.io/downloads`).

## Notes

- Steps 3 and 4 happen outside the web app. How the web app follows them (polling, live updates)
  is planned separately, together with `connect` of the install tutorials.
- Open: one guide runs at a time, so `install` is a hand-over (plugin-workflow pauses while the
  install tutorial runs and goes on after it), not a nested guide. To decide when implementing
  whether that is two guides in `GuideHost` or one tutorial that includes the install steps.
- Continues with [first-review](first-review.md).
