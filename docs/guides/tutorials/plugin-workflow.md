---
id: plugin-workflow
type: tutorial
title: Working from your NLE
status: planned
minRole: member
permission: export.upload
trigger: automatic
starts: from the welcome step of first-upload (the user picks the plugin path)
prerequisites: [may upload exports (`permission`)]
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
tutorial component with data per NLE and OS. The security prompt comes as soon as the installer
is opened, so `os-security` goes before `install`:

| Step          | What it is                                                              |
| ------------- | ----------------------------------------------------------------------- |
| `download`    | Download button for the selected OS, requirements stated up front       |
| `os-security` | Security prompt (SmartScreen, Creative Cloud warning); left out if none |
| `install`     | Run the installer                                                       |
| `open-in-nle` | Where the plugin shows up in the NLE                                    |
| `connect`     | Sign in via the device-code flow; the one step the web app can observe  |
| `done`        | Completion screen; "Continue" when started from plugin-workflow         |

- **OS switch:** a "macOS | Windows" switch at the top of the tutorial card, preset from the detected OS
  (`navigator.userAgentData.platform`, falling back to the user agent). Users often read in the
  browser on one machine and install on another (the edit workstation), so the preset is only a
  default. The selected OS is stored on the tutorial's progress, like the step.
- **OS differences** are written per step as **macOS** / **Windows** sub-items, and only where they
  differ. A step that doesn't apply to an OS is left out for it (it keeps its id).
- **Steps outside the browser** (`install`, `os-security`, `open-in-nle`) complete with "Next".
  `connect` completes by itself as soon as the plugin is signed in for this user: a valid session
  of its client id (`DEVICE_CLIENTS` in `#lib/device-clients.ts`), polled with `getPluginSignIn`;
  a new sign-in also jumps there from any earlier step. Details in
  [install-resolve](install-resolve.md#notes).
- **Sign-in (`connect`):** the plugins' login screen has "Use hosted PostPin server" (on by
  default) and a server URL field. On the hosted server (`https://postpin.io`, in dev the dev
  server) the step says to leave it on; on any other server it says to switch it off and enter
  this server's address, shown right there. The plugin's button is "Login".
- **Built as** one frame, `tutorials/InstallTutorial.svelte` (steps, OS switch, download,
  sign-in, ending, polling), and one small component per plugin with its texts as snippets
  (`Install<Plugin>Tutorial.svelte`). Steps per OS: `install-steps.ts`.
- **Starting:** the plugin question on the export list (next section), or by hand from the
  PostPin Guides page. Started either way, a tutorial runs on the page where it was started; one
  in progress goes on on the dashboard.
- **Icon on the PostPin Guides page:** lucide `unplug` for every install tutorial (`GUIDE_ICONS`).
- **Downloads** are the installers of the server's own release (`#lib/downloads.ts`), so plugin
  and server speak the same API; builds without a release link to the downloads page.

### The plugin question

How the install tutorials start on their own (rule 3). They are no tutorial to push onto everyone:
which one fits depends on the program, so PostPin asks once, at the moment it matters. That is the
**first visit to the export list of a timeline** (`/projects/…/timelines/…/exports`, all exports
of one timeline): the user is about to upload there, and the plugin is the other way to do it.

1. `ask`: A card in the middle of the screen in the tutorial style (`primary`, `graduation-cap`),
   the page dimmed behind it: "Install a PostPin plugin?" · "Upload exports straight from your
   editing program and get the markers back there." Buttons "No, thanks" and "Yes".
   - **"No, thanks":** asks once for confirmation, like every skip (rule 7): "Skip the plugin
     tutorials?" · "You can start them again under PostPin Guides in the account menu." ·
     "Skip" / "Back" (back to the question). On "Skip" the card is gone at once and the export
     list is there. All three install tutorials are stored as skipped: none of them starts on
     its own again (rule 10) and the question never comes back. Each can still be started from
     the PostPin Guides page.
   - **"Yes":** goes to `choose`.
2. `choose`: "Which program do you work in?" with one button per program (plain buttons in
   the tutorial style): DaVinci Resolve, Premiere Pro, Pro Tools, and "Back" to `ask`. A choice starts
   that install tutorial right there, as if started by hand ([install-resolve](install-resolve.md),
   [install-premiere](install-premiere.md), [install-desktop](install-desktop.md)); the card is
   gone. The other two stay "Not started".

**Asked only when all of these hold:**

- guides are switched on (rule 5),
- the user may use the plugins in the active organization (`plugin.use`, Member and up; rule 17),
- none of the three install tutorials was ever started, completed or skipped,
- no plugin is signed in for the user (a valid session of a plugin client, `getPluginConnected`):
  who has one doesn't need to be asked, which also spares existing accounts with a plugin,
- first-upload isn't due any more (tutorials one at a time, it goes first),
- no other guide runs or was started by hand,
- a wide screen (at least 1024px, like sync-to-nle): the plugins run on a computer.

Leaving the page without answering stores nothing: the question comes again on the next visit to
an export list. The question has no progress of its own and no row on the PostPin Guides page: it
is the automatic start of the install tutorials, not a guide. Built in
`tutorials/InstallPrompt.svelte`, shown by `GuideHost`.

## Notes

- Steps 3 and 4 happen outside the web app. How the web app follows them (polling, live updates)
  is planned separately, together with `connect` of the install tutorials.
- Open: one guide runs at a time, so `install` is a hand-over (plugin-workflow pauses while the
  install tutorial runs and goes on after it), not a nested guide. To decide when implementing
  whether that is two guides in `GuideHost` or one tutorial that includes the install steps.
- Continues with [first-review](first-review.md).
- Roles: rendering and uploading from the plugin needs `export.upload` (Member and up). The
  plugins as a whole are for members and up (`plugin.use`): a reviewer can't sign in a plugin, so
  neither this tutorial nor the install tutorials nor [sync-to-nle](sync-to-nle.md) are for them.
