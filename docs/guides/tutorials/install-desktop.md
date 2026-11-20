---
id: install-desktop
type: tutorial
title: Installing PostPin Desktop
status: implemented
minRole: reviewer
trigger: automatic
starts: from the PostPin Guides page (later from plugin-workflow, when the user picks Pro Tools); one in progress goes on on the dashboard
prerequisites: []
code:
  - packages/postpin/src/lib/components/guides/tutorials/InstallDesktopTutorial.svelte
  - packages/postpin/src/lib/components/guides/tutorials/InstallTutorial.svelte
  - packages/postpin/src/lib/downloads.ts
  - packages/desktop/electron-builder.yml
  - packages/desktop/src/adapters/pro-tools/ptsl.ts
  - packages/plugin-core/src/ui/Login.svelte
---

# Installing PostPin Desktop

**Goal:** PostPin Desktop is installed, signed in to the user's PostPin account and next to a
running Pro Tools.

## Steps

The shared install tutorial frame (see [plugin-workflow](plugin-workflow.md#install-tutorials)):
full screen, "Installing on: macOS | Windows" at the top of the card, "Back" / "Next" on the steps
outside the browser, progress stored on every step. The NLE-specific part is `open-in-nle`;
further programs that run through the desktop app get their variant there instead of a new
tutorial.

1. `download`: What PostPin Desktop does (bounces of the session up, markers back as memory
   locations); requires **Pro Tools 2025.10 or newer**. "Need it for <other OS>?" switches,
   "Already installed" goes to `open-in-nle`. **Done when:** the download is clicked.
2. `os-security`: Only on Windows (the macOS app is signed and notarized). Opening
   `PostPin-Desktop-<version>-x64.exe` brings "Windows protected your PC": "More info", then "Run
   anyway". **Done when:** "Next".
3. `install`: **Done when:** "Next".
   - **macOS:** open `PostPin-Desktop-<version>-universal.dmg`, drag PostPin Desktop into
     Applications, open it from there and confirm "Open" once.
   - **Windows:** the installer runs by itself (one click, per user) and starts the app.

   PostPin Desktop updates itself from then on.

4. `open-in-nle`: Start Pro Tools and open a session; keep PostPin Desktop open next to it.
   "PostPin Desktop can't reach Pro Tools?" explains its two errors ("Pro Tools is not running, or
   its scripting interface is disabled", "Pro Tools 2025.10 or newer is required"). **Done when:**
   "Next".
5. `connect`: Click "Login" in PostPin Desktop; the server hint as in every install tutorial;
   approve the code in the browser. **Done when:** the app is signed in for this user (client
   `io.postpin.desktop`).
6. `done`: **Completion screen:** "PostPin Desktop is connected", what it can do now, a pointer to
   PostPin Guides. **Done when:** "Done"; the tutorial closes at once.

## Success feedback

- After `download` (only when the file itself downloads): "✓ Download started"
- After `connect`: "✓ PostPin Desktop connected"

## Notes

- Open: does Pro Tools need its scripting interface (PTSL) switched on somewhere? If so,
  `open-in-nle` explains it per OS.
- The Windows build is x64 (built on an x64 runner); an ARM64 build would need its own file name in
  `downloads.ts`.
- Once the Windows installer is signed, drop `os-security` for Windows too (keep the step id).
- Not yet: screenshots; "Continue" into plugin-workflow.
- Roles: for everyone with an account, reviewers included: the plugin also pulls and pushes markers,
  which a reviewer may do. They start it from the PostPin Guides page; it only starts on its own
  from [plugin-workflow](plugin-workflow.md), i.e. for those who upload.
