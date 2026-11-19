---
id: install-resolve
type: tutorial
title: Installing the Resolve plugin
status: implemented
minRole: reviewer
trigger: automatic
starts: from the PostPin Guides page (later from plugin-workflow, when the user picks DaVinci Resolve); one in progress goes on on the dashboard
prerequisites: []
code:
  - packages/postpin/src/lib/components/guides/tutorials/InstallResolveTutorial.svelte
  - packages/postpin/src/lib/components/guides/tutorials/InstallTutorial.svelte
  - packages/postpin/src/lib/components/guides/GuideHost.svelte
  - packages/postpin/src/lib/components/guides/guides.remote.ts
  - packages/postpin/src/lib/downloads.ts
  - packages/plugin-resolve/scripts/build-pkg.sh
  - packages/plugin-resolve/scripts/build-exe.sh
  - packages/plugin-resolve/scripts/windows/installer.nsi
  - packages/postpin/src/routes/auth/device/+page.svelte
  - packages/plugin-core/src/ui/Login.svelte
---

# Installing the Resolve plugin

**Goal:** The PostPin plugin is installed in DaVinci Resolve Studio and signed in to the user's
PostPin account.

## Steps

Full screen. On every step but `done`, a "Installing on: macOS | Windows" switch at the top of the
card, preset from the detected OS (see [plugin-workflow](plugin-workflow.md#install-tutorials));
the choice is stored with the progress. Steps 2–4 happen outside the browser: they go on with
"Next" and have a "Back" button. Step, OS and the plugin's last sign-in before the tutorial are
stored on every step, so a reload goes on where the user left off.

1. `download`: "Download for macOS" / "Download for Windows" for the selected OS, and "Need it for
   <other OS>?" to switch. States the requirement up front: **DaVinci Resolve Studio**; the free
   version has no Workflow Integrations. Asks to quit Resolve before installing (it loads plugins
   only on start). "Already installed" goes straight to `open-in-nle`. **Done when:** the download
   is clicked.
2. `os-security`: Only on Windows, left out on macOS (the package is signed and notarized). The
   installer is not signed yet, so opening it brings "Windows protected your PC": click "More
   info", then "Run anyway". **Done when:** "Next".
3. `install`: **Done when:** "Next".
   - **macOS:** open `PostPin-Resolve-<version>.pkg` from Downloads, "Continue" and "Install",
     enter the Mac password.
   - **Windows:** allow the admin prompt ("Yes"), wait for "PostPin for DaVinci Resolve is
     installed", "Finish".
4. `open-in-nle`: Start DaVinci Resolve Studio (restart it if it was running), open a project,
   **Workspace → Workflow Integrations → PostPin**. "PostPin isn't in the menu?" opens: Studio
   only, restart Resolve, and the install folder for the selected OS. **Done when:** "Next".
5. `connect`: Click "Login" in the plugin; the server hint as in every install tutorial (see
   [plugin-workflow](plugin-workflow.md#install-tutorials)); the browser opens `/auth/device`
   with the code, the user approves it. A link to the sign-in page (new tab) for when no browser opened. **Done
   when:** the plugin is signed in for this user (see Notes).
6. `done`: **Completion screen:** "DaVinci Resolve is connected", what the panel can do now, a
   pointer to PostPin Guides. **Done when:** "Done"; the tutorial closes at once.

"Skip tutorial" in the header asks once for confirmation, like every tutorial.

## Success feedback

- After `download` (only when the installer itself downloads, not the downloads page): "✓ Download
  started"
- After `connect`: "✓ Plugin connected"

## Notes

- **Signed in** means a valid session of client `io.postpin.plugin.resolve` for the user
  (`getPluginSignIn`, polled every 3 s while the tab is visible). Before `connect`, only a sign-in
  newer than the one there was when the tutorial started counts, and it jumps to `done` from any
  step. On `connect`, an earlier sign-in counts too: a reinstalled plugin keeps its sign-in and
  doesn't ask again.
- **Download links** come from the server's own version: plugins and server are released together,
  so `…/releases/download/v<version>/PostPin-Resolve-<version>.pkg|exe` is the plugin that speaks
  this server's API. Builds without a release (`ci-…`) link to the downloads page instead.
- **Where it runs:** started by hand, on the page where it was started; in progress, it goes on on
  the dashboard (while guides are on). Never on `/auth/*`, where the sign-in it waits for may
  happen. first-upload doesn't push in front of it while it was started by hand.
- Install locations (shown at `open-in-nle`):
  - macOS: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/io.postpin.plugin.resolve`
  - Windows: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\io.postpin.plugin.resolve`
- The Windows installer picks the x64 or ARM64 build of the Resolve module by itself; nothing for
  the user to choose.
- Reinstalling or updating uses the same installer; it removes the old version first.
- Not yet: screenshots of the SmartScreen prompt and the Resolve menu; "Continue" into
  plugin-workflow (it isn't implemented yet).
- Once the Windows installer is signed, drop `os-security` for Windows too (keep the step id).
- Linux (Resolve Studio runs there too): no installer yet, not covered; the OS switch offers macOS
  and Windows only.
- Roles: for everyone with an account, reviewers included: the plugin also pulls and pushes markers,
  which a reviewer may do. They start it from the PostPin Guides page; it only starts on its own
  from [plugin-workflow](plugin-workflow.md), i.e. for those who upload.
