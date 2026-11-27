---
id: install-desktop
type: tutorial
title: Installing PostPin Desktop
status: implemented
minRole: member
permission: plugin.use
trigger: automatic
starts: on the first visit to the export list of a timeline, when the user answers the plugin question with Pro Tools or FilmCraft (see [plugin-workflow](plugin-workflow.md#the-plugin-question)) · from the PostPin Guides page; one in progress goes on on the dashboard
prerequisites: [may use the plugins (`permission`)]
code:
  - packages/postpin/src/lib/components/guides/tutorials/InstallDesktopTutorial.svelte
  - packages/postpin/src/lib/components/guides/tutorials/InstallTutorial.svelte
  - packages/postpin/src/lib/components/guides/tutorials/InstallPrompt.svelte
  - packages/postpin/src/lib/downloads.ts
  - packages/desktop/electron-builder.yml
  - packages/desktop/src/adapters/pro-tools/ptsl.ts
  - packages/desktop/src/adapters/filmcraft/control.ts
  - packages/plugin-core/src/ui/Login.svelte
---

# Installing PostPin Desktop

**Goal:** PostPin Desktop is installed, signed in to the user's PostPin account and next to a
running Pro Tools, or ready to start FilmCraft.

## Steps

The shared install tutorial frame (see [plugin-workflow](plugin-workflow.md#install-tutorials)):
full screen, "Installing on: macOS | Windows" at the top of the card, "Back" / "Next" on the steps
outside the browser, progress stored on every step.

PostPin Desktop works with several programs, so the card also has "Working in: Pro Tools |
FilmCraft" above the OS switch, stored as `program` in the context. The plugin question's answer
picks it; otherwise it is where the tutorial left off, or Pro Tools. The texts of `download`,
`open-in-nle` and `done` follow it; further programs get their variant here instead of a new
tutorial.

1. `download`: What PostPin Desktop does. Pro Tools: bounces of the session up, markers back as
   memory locations; requires **Pro Tools 2025.10 or newer**. FilmCraft: exports of the sequence
   up, markers back onto it; requires FilmCraft in its usual place. "Need it for <other OS>?" switches,
   "Already installed" goes to `open-in-nle`. **Done when:** the download is clicked.
2. `os-security`: Only on Windows (the macOS app is signed and notarized). Opening
   `PostPin-Desktop-<version>-x64.exe` brings "Windows protected your PC": "More info", then "Run
   anyway". **Done when:** "Next".
3. `install`: **Done when:** "Next".
   - **macOS:** open `PostPin-Desktop-<version>-universal.dmg`, drag PostPin Desktop into
     Applications, open it from there and confirm "Open" once.
   - **Windows:** the installer runs by itself (one click, per user) and starts the app.

   PostPin Desktop updates itself from then on.

4. `open-in-nle`: **Done when:** "Next".
   - **Pro Tools** ("Open Pro Tools"): start Pro Tools and open a session; keep PostPin Desktop
     open next to it. "PostPin Desktop can't reach Pro Tools?" explains its two errors ("Pro Tools
     is not running, or its scripting interface is disabled", "Pro Tools 2025.10 or newer is
     required").
   - **FilmCraft** ("Quit FilmCraft"): FilmCraft only takes remote control when PostPin Desktop
     starts it, and the app's Program menu only shows after the sign-in. So: quit FilmCraft if
     it's open and keep PostPin Desktop open; choosing FilmCraft comes on the completion screen.
5. `connect`: Click "Login" in PostPin Desktop; the server hint as in every install tutorial;
   approve the code in the browser. **Done when:** the app is signed in for this user (client
   `io.postpin.desktop`).
6. `done`: **Completion screen:** "PostPin Desktop is connected", what it can do now, a pointer to
   PostPin Guides. FilmCraft: choose FilmCraft under Program in PostPin Desktop, it opens
   FilmCraft; "PostPin Desktop can't reach FilmCraft?" explains its two errors ("FilmCraft is
   running without remote control", "FilmCraft isn't installed"). **Done when:** "Done"; the tutorial closes at once.

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
- Roles: the plugins are for members and up (`plugin.use`; signing in a plugin is refused for
  an account that is a reviewer in all its organizations), so `minRole` is Member. A reviewer sees
  the row greyed out on the PostPin Guides page and is never asked the plugin question.
