---
id: install-premiere
type: tutorial
title: Installing the Premiere Pro plugin
status: planned
audience: editor
trigger: automatic
starts: from plugin-workflow when the user picks Premiere Pro; or from the PostPin Guides page
prerequisites: []
code:
  - packages/plugin-premiere/scripts/build-ccx.sh
  - packages/plugin-premiere/public/manifest.json
  - packages/postpin/src/routes/auth/device/+page.svelte
  - packages/postpin/src/lib/device-clients.ts
---

# Installing the Premiere Pro plugin

**Goal:** The PostPin panel is installed in Premiere Pro and signed in to the user's PostPin
account.

## Steps

Full screen, with a "macOS | Windows" switch in the header, preset from the detected OS (see
[plugin-workflow](plugin-workflow.md#install-tutorials)). The download is the same `.ccx` for both;
the switch only changes the screenshots and menu names. Steps 2–4 happen outside the browser, so
they complete with "Next".

1. `download`: "Download for Premiere Pro" (`PostPin-Premiere-<version>.ccx`). States the
   requirement up front: **Premiere Pro 26.2 or newer** (`minVersion` in the manifest) and the
   Creative Cloud desktop app. **Done when:** the download is clicked.
2. `install`: Double-click the `.ccx`; Creative Cloud opens and installs the plugin. **Done when:**
   "Next".
3. `os-security`: Creative Cloud warns that the plugin doesn't come from the Adobe Marketplace
   (the `.ccx` is not signed outside the Marketplace): confirm "Install". Same on macOS and
   Windows. **Done when:** "Next".
4. `open-in-nle`: Restart Premiere Pro if it was running, then open **Window → UXP Plugins →
   PostPin**. **Done when:** "Next", or `connect` completes right away.
5. `connect`: Click "Sign in" in the panel; the browser opens `/auth/device` with the code, the
   user approves it. **Done when:** a device authorization for `io.postpin.plugin.premiere` is
   approved for this user.
6. `done`: **Completion screen:** "✓ Premiere Pro is connected", the panel can now create timelines
   and upload renders, a pointer to PostPin Guides. **Done when:** "Done" (started from
   plugin-workflow: "Continue", which goes on there).

## Success feedback

- After `download`: "✓ Download started"
- After `connect`: "✓ Plugin connected"

## Notes

- To verify on both OSes before implementing: the exact Creative Cloud warning text for a
  non-Marketplace `.ccx`, and whether double-click works without the Creative Cloud app being
  signed in. Fallback if double-click fails: the Unified Plugin Installer Agent (`UPIA`) from the
  command line; offer it behind a "Didn't work?" link, per OS, since its path differs.
- Reinstalling or updating: double-click the new `.ccx`.
- If the plugin is ever published on the Adobe Marketplace, `os-security` is left out (keep the
  step id).
