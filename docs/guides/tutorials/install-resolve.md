---
id: install-resolve
type: tutorial
title: Installing the DaVinci Resolve plugin
status: planned
audience: editor
trigger: automatic
starts: from plugin-workflow when the user picks DaVinci Resolve; or from the PostPin Guides page
prerequisites: []
code:
  - packages/plugin-resolve/scripts/build-pkg.sh
  - packages/plugin-resolve/scripts/build-exe.sh
  - packages/plugin-resolve/scripts/windows/installer.nsi
  - packages/postpin/src/routes/auth/device/+page.svelte
  - packages/postpin/src/lib/device-clients.ts
---

# Installing the DaVinci Resolve plugin

**Goal:** The PostPin plugin is installed in DaVinci Resolve Studio and signed in to the user's
PostPin account.

## Steps

Full screen, with a "macOS | Windows" switch in the header, preset from the detected OS (see
[plugin-workflow](plugin-workflow.md#install-tutorials)). Steps 2–4 happen outside the browser, so
they complete with "Next".

1. `download`: "Download for macOS" / "Download for Windows" (one button for the selected OS, a
   small link to the other one). States the requirement up front: **DaVinci Resolve Studio**; the
   free version has no Workflow Integrations. **Done when:** the download is clicked.
2. `install`: Run the installer. Quit Resolve first. **Done when:** "Next".
   - **macOS:** open `PostPin-Resolve-<version>.pkg`, click through the installer, enter the Mac
     password. The package is signed and notarized, so no Gatekeeper warning.
   - **Windows:** open `PostPin-Resolve-<version>.exe`, allow the admin prompt (User Account
     Control).
3. `os-security`: Only on Windows. The installer is not signed yet, so SmartScreen shows "Windows
   protected your PC": click "More info", then "Run anyway". A screenshot shows both clicks.
   Left out on macOS. **Done when:** "Next".
4. `open-in-nle`: Start DaVinci Resolve Studio (restart it if it was running) and open
   **Workspace → Workflow Integrations → PostPin**. **Done when:** "Next", or `connect` completes
   right away.
5. `connect`: Click "Sign in" in the plugin; the browser opens `/auth/device` with the code, the
   user approves it. **Done when:** a device authorization for `io.postpin.plugin.resolve` is
   approved for this user.
6. `done`: **Completion screen:** "✓ DaVinci Resolve is connected", the plugin can now create
   timelines and upload renders, a pointer to PostPin Guides. **Done when:** "Done" (started from
   plugin-workflow: "Continue", which goes on there).

## Success feedback

- After `download`: "✓ Download started"
- After `connect`: "✓ Plugin connected"

## Notes

- Install locations, in case the plugin doesn't show up ("Plugin missing?" link at `open-in-nle`):
  - macOS: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/io.postpin.plugin.resolve`
  - Windows: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\io.postpin.plugin.resolve`
- The Windows installer picks the x64 or ARM64 build of the Resolve module by itself; nothing for
  the user to choose.
- Reinstalling or updating uses the same installer; it removes the old version first.
- Once the Windows installer is signed, drop `os-security` for Windows too (keep the step id).
- Linux (Resolve Studio runs there too): no installer yet, not covered.
