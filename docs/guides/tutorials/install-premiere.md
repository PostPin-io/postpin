---
id: install-premiere
type: tutorial
title: Installing the Premiere Pro plugin
status: implemented
minRole: member
permission: plugin.use
trigger: automatic
starts: on the first visit to the export list of a timeline, when the user answers the plugin question with Premiere Pro (see [plugin-workflow](plugin-workflow.md#the-plugin-question)) · from the PostPin Guides page; one in progress goes on on the dashboard
prerequisites: [may use the plugins (`permission`)]
code:
  - packages/postpin/src/lib/components/guides/tutorials/InstallPremiereTutorial.svelte
  - packages/postpin/src/lib/components/guides/tutorials/InstallTutorial.svelte
  - packages/postpin/src/lib/components/guides/tutorials/InstallPrompt.svelte
  - packages/postpin/src/lib/downloads.ts
  - packages/plugin-premiere/scripts/build-ccx.sh
  - packages/plugin-premiere/public/manifest.json
  - packages/plugin-core/src/ui/Login.svelte
---

# Installing the Premiere Pro plugin

**Goal:** The PostPin panel is installed in Premiere Pro and signed in to the user's PostPin
account.

## Steps

The shared install tutorial frame (see [plugin-workflow](plugin-workflow.md#install-tutorials)):
full screen, "Installing on: macOS | Windows" at the top of the card, "Back" / "Next" on the steps
outside the browser, progress stored on every step. The download is the same `.ccx` for both
systems: the button says "Download the plugin", with "The same file for macOS and Windows" instead
of a link to the other OS. The OS only changes the fallback command in `install`.

1. `download`: What the panel does; requires **Premiere Pro 26.2 or newer** (`minVersion` in the
   manifest) and the Creative Cloud desktop app, signed in. "Already installed" goes to
   `open-in-nle`. **Done when:** the download is clicked.
2. `os-security`: On both systems. Double-click `PostPin-Premiere-<version>.ccx`; Creative Cloud
   warns that the plugin doesn't come from the Adobe Marketplace (it's not signed outside the
   Marketplace): that's expected, click "Install". **Done when:** "Next".
3. `install`: Creative Cloud installs it and confirms; updating later works the same way.
   "Nothing happened?" opens: make sure Creative Cloud runs and is signed in, else Adobe's
   installer from the command line (Terminal / Command Prompt), with the path for the selected OS:
   - **macOS:** `".../UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent" --install ~/Downloads/<file>`
   - **Windows:** `"C:\Program Files\Common Files\Adobe\...\UnifiedPluginInstallerAgent.exe" /install "%USERPROFILE%\Downloads\<file>"`

   **Done when:** "Next".

4. `open-in-nle`: Start Premiere Pro (restart it if it was running), open a project, **Window → UXP
   Plugins → PostPin**. "PostPin isn't in the menu?" opens: check the version under Help → About
   Premiere Pro, and that PostPin is listed among the installed plugins in Creative Cloud.
   **Done when:** "Next".
5. `connect`: Click "Login" in the panel; the server hint as in every install tutorial; approve
   the code in the browser. **Done when:** the plugin is signed in for this user (client
   `io.postpin.plugin.premiere`).
6. `done`: **Completion screen:** "Premiere Pro is connected", what the panel can do now, a pointer
   to PostPin Guides. **Done when:** "Done"; the tutorial closes at once.

## Success feedback

- After `download` (only when the file itself downloads): "✓ Download started"
- After `connect`: "✓ Plugin connected"

## Notes

- To verify on both systems: the exact Creative Cloud warning and button text for a
  non-Marketplace `.ccx`; the menu path in current Premiere versions; the UPIA paths.
- If the plugin is ever published on the Adobe Marketplace, `os-security` is left out (keep the
  step id).
- Not yet: screenshots; "Continue" into plugin-workflow.
- Roles: the plugins are for members and up (`plugin.use`; signing in a plugin is refused for
  an account that is a reviewer in all its organizations), so `minRole` is Member. A reviewer sees
  the row greyed out on the PostPin Guides page and is never asked the plugin question.
