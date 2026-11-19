---
id: install-desktop
type: tutorial
title: Installing PostPin Desktop
status: planned
audience: editor
trigger: automatic
starts: from plugin-workflow when the user picks Pro Tools; or from the PostPin Guides page
prerequisites: []
code:
  - packages/desktop/electron-builder.yml
  - packages/desktop/src/adapters/pro-tools/ptsl.ts
  - packages/postpin/src/routes/auth/device/+page.svelte
  - packages/postpin/src/lib/device-clients.ts
---

# Installing PostPin Desktop

**Goal:** PostPin Desktop is installed, signed in to the user's PostPin account and connected to
the NLE (for now: Pro Tools).

## Steps

Full screen, with a "macOS | Windows" switch in the header, preset from the detected OS (see
[plugin-workflow](plugin-workflow.md#install-tutorials)). Steps 2–4 happen outside the browser, so
they complete with "Next". The NLE-specific part is `open-in-nle`; further NLEs that run through
the desktop app add their own variant there instead of a new tutorial.

1. `download`: "Download for macOS" / "Download for Windows" (one button for the selected OS, a
   small link to the other one). States the requirement up front: **Pro Tools 2025.10 or newer**.
   **Done when:** the download is clicked.
2. `install`: **Done when:** "Next".
   - **macOS:** open `PostPin-Desktop-<version>-universal.dmg`, drag PostPin Desktop into
     Applications, start it from there. Signed and notarized, so no Gatekeeper warning beyond the
     usual "downloaded from the internet" confirmation.
   - **Windows:** run `PostPin-Desktop-<version>-x64.exe`; it installs in one click and starts.
3. `os-security`: Only on Windows. The installer is not signed yet, so SmartScreen shows "Windows
   protected your PC": click "More info", then "Run anyway". A screenshot shows both clicks.
   Left out on macOS. **Done when:** "Next".
4. `open-in-nle`: **Pro Tools:** start Pro Tools and open a session; PostPin Desktop shows that it
   is connected to Pro Tools. **Done when:** "Next".
5. `connect`: Click "Sign in" in PostPin Desktop; the browser opens `/auth/device` with the code, the
   user approves it. **Done when:** a device authorization for `io.postpin.desktop` is approved
   for this user.
6. `done`: **Completion screen:** "✓ PostPin Desktop is connected", it can now create timelines and
   upload renders from Pro Tools, a pointer to PostPin Guides. **Done when:** "Done" (started from
   plugin-workflow: "Continue", which goes on there).

## Success feedback

- After `download`: "✓ Download started"
- After `connect`: "✓ PostPin Desktop connected"

## Notes

- Open: does Pro Tools need its scripting interface (PTSL) switched on, and where? PostPin
  Desktop reports "Pro Tools is not running, or its scripting interface is disabled" when it
  can't reach it on `localhost:31416`. If there is a setting, `open-in-nle` explains it per OS.
- An older Pro Tools fails with "Pro Tools 2025.10 or newer is required"; `open-in-nle` links to
  that requirement.
- Updates come through the app itself (electron-updater), so this tutorial is only for the first
  install.
- `connect` and `open-in-nle` could also run the other way round (sign in before Pro Tools is
  open); the web app only sees `connect`, so either order completes the tutorial.
- Once the Windows installer is signed, drop `os-security` for Windows too (keep the step id).
