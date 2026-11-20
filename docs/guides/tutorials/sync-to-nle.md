---
id: sync-to-nle
type: tutorial
title: Using the plugin
status: implemented
minRole: member
permission: plugin.use
trigger: automatic
starts: right after a plugin is connected (after the `done` of an install tutorial, or on the dashboard for a plugin signed in without one), once an export with markers exists · from PostPin Guides: needs an export with markers (`getGuideStart`)
prerequisites: [a plugin connected (an install tutorial or plugin-workflow), an export with markers in an organization where the user may use the plugins (`permission`)]
code:
  - packages/plugin-core/src/ui/MainScreen.svelte
  - packages/plugin-core/src/ui/HostNode.svelte
  - packages/plugin-core/src/ui/Destination.svelte
  - packages/plugin-core/src/ui/RenderToDisk.svelte
  - packages/plugin-core/src/ui/RenderToDiskModal.svelte
  - packages/plugin-core/src/ui/MarkerSyncButton.svelte
  - packages/plugin-core/src/ui/SyncPreviewModal.svelte
  - packages/plugin-core/src/ui/MarkerHistoryModal.svelte
  - packages/plugin-core/src/sync.ts
  - packages/plugin-core/src/history.ts
  - packages/postpin/src/api/controllers/MarkerController.ts
  - packages/postpin/src/lib/components/guides/tutorials/SyncToNleTutorial.svelte
  - packages/postpin/src/lib/components/guides/tutorials/PluginPanelShot.svelte
  - packages/postpin/src/lib/components/guides/tutorials/plugin-panel.json
  - packages/postpin/static/guides/plugin-panel/
  - packages/plugin-core/preview/
  - packages/plugin-core/scripts/screenshots.mjs
  - packages/postpin/src/lib/components/guides/guides.remote.ts
  - packages/postpin/src/lib/components/guides/GuideHost.svelte
  - packages/postpin/src/lib/plugin-programs.ts
---

# Using the plugin

**Goal:** The user knows the plugin's panel, from the program to PostPin: the program follows the
open timeline, exports go up to a PostPin timeline, and markers travel both ways with one export.
They have brought markers into their program, added one and sent it back, and seen both arrive.

Wording as in every guide (README rule 14): **the plugin**, and where the program matters its name.
On Pro Tools the plugin is PostPin Desktop and markers are memory locations; the texts below say
"marker" and switch to "memory location" there, but the box in the plugin is called "Markers" there
too, so a text that names the box keeps that word. The tutorial says no "push" or "pull": the marker
buttons are symbols (the program's logo, an arrow, the PostPin logo), so the texts name the
direction of the arrow ("from <program> to PostPin").

**Same words in the plugin:** a sync to PostPin reports "Synced to PostPin: …" / "Nothing to
sync." and warns "… weren't synced back", like the other direction (`pushReport` in
`plugin-core/src/sync.ts`; it used to say "pushed").

**Builds on the new marker sync** (`feat/improve-plugin-marker-sync`): a sync first compares both
sides and shows a preview of what changes on the target ("Apply" runs it), then writes only what
changed, and saves a marker set (the state of both sides before it) that the plugin's History can
undo. This tutorial is built after that; its texts and Detection assume it.

## The plugin's panel

What the tutorial walks through, in the order of its steps. Labels as in the plugin.

The wide layout has three columns: the program on the left, the actions in the middle, PostPin on
the right. PostPin's two parts line up with their actions in two rows: "Upload to" with Render &
Upload, "Exchange markers with" with Markers. The steps go through the program first, then the
upload row, then the marker row.

| Area              | In the plugin                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The program       | Logo and name, "Current timeline" (with thumbnail), "Current project". Found by itself: the plugin follows the timeline open in the program. "⋯" menu: "Clear all markers in this timeline". |
| Upload            | "Upload to" with "Choose timeline": the PostPin project and timeline new exports go to (a project or timeline can be created right there), and "Name of the new export".                     |
| Render & Upload   | "Render & Upload", "new export in <timeline>": renders the open timeline and uploads it as a new export.                                                                                     |
| Additional render | The settings button next to it opens the "Render to disk" dialog: "Additionally render to disk" (preset, folder, file name). Only for programs that can (`capabilities.renderToDisk`).       |
| Exchange markers  | "Exchange markers with" with "Choose export": the export whose markers travel.                                                                                                               |
| Markers           | The "Markers" box with two buttons, <program> → PostPin and PostPin → <program>, and "History" below them.                                                                                   |

A medium-wide panel puts PostPin's two parts side by side with each action below its part; a
narrow one stacks everything: PostPin on top, the actions in between, the program at the bottom.
So the texts never give a direction ("left", "right", "above", "below") but name the area ("the
<program> box", "Upload to", "Markers").

## Steps

Full screen, in the frame of the install tutorials (`TutorialShell`): a card with the steps at the
top, "Back" / "Next" on the steps that happen outside the browser, progress stored on every step.
The tutorial can't highlight anything inside the plugin, so the card shows a **screenshot of the
panel** of the user's program with the area of the current step highlighted, in the tutorial
style (see Notes, "Screenshots of the panel"). The frame is wider than the other tutorials'
(`TutorialShell` `wide`), so the screenshot stays readable. The user switches between the plugin and this window, so every step says which
program it is about. <program> is the program of the connected plugin (see Notes).

1. `open-plugin`: **Title:** "Open the plugin". **Text:** "Open the PostPin plugin in <program>, with
   the timeline you're working on." **Done when:** "Next".
2. `program`: **Title:** "<program>". **Text:** "The plugin automatically picks the timeline
   that's open in <program>." **Done when:** "Next".
3. `upload-to`: **Title:** "Where exports go". **Text:** "Under Upload to, choose the PostPin
   timeline for your exports. You can create a project or timeline right there." **Done when:**
   "Next".
4. `render-upload`: **Title:** "Render & Upload". **Text:** "Renders your timeline and uploads it
   to PostPin for review." **Done when:** "Next". Explained, not done: an upload isn't needed for
   the rest of the tutorial (see Notes, plugin-workflow). Naming the export is left out: the
   plugin names it by itself.
5. `render-to-disk`: **Title:** "Also a file for you". **Text:** "With the settings button next to
   it, the same render also lands in a folder of your choice." **Done when:** "Next". Only for
   DaVinci Resolve, left out for the others (see Notes).
6. `exchange-with`: **Title:** "Choose the export for markers". **Text:** "Under Exchange markers
   with, choose the export whose markers you want, for now: <project> › <timeline> › <export>. The
   plugin remembers it for this timeline." Names the export the tutorial chose (the latest one with
   markers). **Done when:** "Next".
7. `markers`: **Title:** "Markers go both ways". **Text:** "The arrow on each button in Markers shows
   where the markers go. Before anything changes, the plugin shows a preview of what will change."
   **Done when:** "Next".
8. `to-program`: **Title:** "Bring the markers over". **Text:** "Click the button with the arrow
   from PostPin to <program>. The preview lists what comes in; click Apply." **Done when:** the
   server saw the sync (Detection), or the quiet button "The plugin says Nothing to sync" (the
   markers are there already; see Detection).
9. `see-markers`: **Title:** "Your markers are on the timeline". **Text:** "A marker's category
   comes along as its color, and its name as a #tag in the description. Keep the tag, it keeps the
   category when the marker goes back." **Done when:** "Next". Not every marker has a tag: none
   without a category, and none for a category named after a color (e.g. "Resolve Blue", the color
   says it already, `toNleMarker`). The text says "a marker's category", not "each marker".
10. `add-marker`: **Title:** "Add a marker". **Text:** "Add a marker on the timeline in <program>,
    or change one. Markers without a #tag get a category named after their color." **Done when:**
    "Next".
11. `to-postpin`: **Title:** "Send it back". **Text:** "Click the button with the arrow from
    <program> to PostPin, and click Apply." **Done when:** the server saw the sync with at least one
    new or changed marker (Detection), or "I did it".
12. `history`: **Title:** "Every sync can be undone". **Text:** "History under the marker buttons
    lists every sync, with a backup taken before it. Undo brings the markers back as they were."
    **Done when:** "Next". Explained, not done.
13. `done`: **Completion screen:** "✓ You're set up in <program>". **Text:** "Bring the markers over
    before you start and send them back when you're done; only what changed travels. More under
    PostPin Guides in the account menu." **Done when:** "Open your export" (the review page of the
    export the marker went to) or "Done"; the tutorial closes at once.

## Detection

The web app only sees what reaches the server. The live updates of the review page
(`notifyMarkers`) don't reach a full-screen tutorial, so the tutorial polls (like `getPluginSignIn`,
every 3 s while the tab is visible) `getPluginTutorial` while `to-program` or `to-postpin` waits. Only what
happens after the step began counts, like a `signal` step in a tour. Steps 1–7, 9–10 and 12 happen
in the plugin or the program without a trace on the server, so they go on with "Next".

**The marker sets are the trace.** Every sync leaves one on the server, with what the tutorial
needs: `action`, `createdById`, `exportId`, `hostName`, `createdAt` and `summary`. ("PUSH" / "PULL"
stay words of the code.)

- **`to-program`:** a `MarkerSet` with `action: PULL` by the user, created after the step began.
  The plugin creates it (`POST …/marker-sets`) before it writes into the program, and only when
  something is written or removed (`summary.nle`), not for a sync that only links markers. Since
  the set comes first, `summary.nle` counts what was planned, not what was written: a marker that
  failed still counts (see Success feedback).
- **`to-postpin`:** a `MarkerSet` with `action: PUSH` by the user, created after the step began,
  whose `summary.postpin` has at least one added or updated marker. The server creates it in the
  same transaction as the push (`POST …/markers/sync`), also for a push that only links markers,
  hence the check (an empty one means the marker from `add-marker` didn't make it, e.g. another
  export chosen: the step keeps waiting).
- On any export, not only the one named in `exchange-with`: the user may have chosen another. The
  `exportId` of `to-postpin` is the export "Open your export" opens.
- No table and no API of its own for the tutorial, and no guessing from `nleId` / `updatedAt`.
  `getPluginTutorial` reads the user's latest `MarkerSet`s (`createdById`, indexed), and returns
  the id of the latest PULL and of the latest PUSH with an added or changed marker. The step stores
  the ids there were when it began (`pullBefore`, `pushBefore` in the progress context); another
  id means a new sync.

**Nothing to sync:** a sync without changes creates no set; the plugin shows the toast "Nothing to
sync." and no preview. For `to-program` that happens when the markers are in the program already
(the user synced before), so the step has a quiet button "The plugin says Nothing to sync" that
goes on, with the success feedback left out. `to-postpin` can't end like that: the user just added
a marker, so there is something to sync; "I did it" stays there as the quiet way out (a marker that
couldn't be written, see Notes). An older plugin can't sync at all (API version 2: it shows the
version mismatch screen), so there is no case of syncs without sets.

## Success feedback

- After `to-program`: "✓ Your markers are in <program>" (left out after "Nothing to sync"). No
  number: `summary.nle` counts planned markers, failed ones included; the plugin reports those
  itself in its warning.
- After `to-postpin`: "✓ Your marker is in PostPin"
- `done` is the confirmation: "✓ You're set up in <program>".

## Notes

- **When it starts** (rule 3): right after the plugin is connected, that's when the user is at the
  plugin anyway. From an install tutorial: its "Done" hands over to this tutorial at once, in the
  same full-screen frame, if an export with markers exists. A plugin signed in without an install
  tutorial: on the dashboard at the next visit. **No export with markers yet** (typical right after
  plugin-workflow: the export just uploaded has no feedback yet): it waits and starts on the
  dashboard once one exists, i.e. when the feedback is in. Never in the middle of a review.
- **Overlap with [plugin-workflow](plugin-workflow.md)** (planned): it has the user choose a timeline
  and render and upload from the plugin. This tutorial only explains those areas (`upload-to`,
  `render-upload`, `render-to-disk`), so it fits both a user who came through plugin-workflow and
  one who only exchanges markers. Open: whether plugin-workflow then shrinks to choosing the program
  and the hand-over to the install tutorial, with the first upload done here as a Your-turn step.
- **Order with other guides:** tutorials go first (rule 3). If postpin-guides is due at the same
  time (first-upload just settled), this tutorial runs first and postpin-guides follows at the next
  dashboard visit.
- "**A plugin is connected**" means a valid session of a plugin client (`DEVICE_CLIENTS`), the same
  check as `connect` of the install tutorials. Existing accounts with a connected plugin shouldn't be
  surprised: the migration marks it completed for them.
- **<program>:** the `hostName` of the user's latest marker set, before that the plugin signed in
  most recently (its client in `PLUGIN_PROGRAMS` → DaVinci Resolve, Premiere Pro, Pro Tools). With several plugins
  connected, the first sync corrects it. `hostName` is the plugin's short name ("Resolve",
  "Premiere Pro", "Pro Tools"); the tutorial shows the display name like the plugin does
  (`plugin-core/src/ui/hosts.ts`: "Resolve" → "DaVinci Resolve").
- **Render to disk** (`render-to-disk`): only DaVinci Resolve can (`capabilities.renderToDisk` is
  `true` in the Resolve plugin, `false` in Premiere Pro and Pro Tools). The web app has no
  `capabilities`, so it is a flag per program in `PLUGIN_PROGRAMS` (`lib/plugin-programs.ts`,
  also the display names and "memory location" for Pro Tools); whoever enables render to disk in
  another plugin sets it there too.
- **The plugin answers in toasts:** the outcome of a sync shows for a few seconds at the bottom of
  the plugin ("Synced to DaVinci Resolve: 3 new." / "Nothing to sync.", the same for PostPin once
  the push texts are renamed, see above), warnings stay as an alert.
  The tutorial's own success feedback is the confirmation that counts; it doesn't quote the toasts.
- **Markers that can't be written:** the plugin lists them with the reason in a warning, and links
  the rest. In DaVinci Resolve a marker on a taken frame goes to the next free one instead of
  failing, so `see-markers` needs no word on it.
- **Remembered destinations:** the plugin remembers "Upload to" and "Exchange markers with" per
  timeline of the program, also after a restart. `exchange-with` may find the export chosen
  already; the text works either way.
- **Export it uses:** the latest export with markers in an organization where the user may use the
  plugins (`plugin.use`; a member in one organization can be a reviewer in another), found like
  `getGuideStart`. Deleted markers don't count: they are deleted for real, the marker sync only
  remembers them in `DeletedMarker`. Without one, the row on the PostPin Guides page says what's missing (`restartHint`), and
  the tutorial doesn't start.
- **Role:** the plugins are for members and up (`plugin.use`, `apiAuthorize`), so `minRole` is
  Member.
- **Desktop only** (`wide`, like first-review): the plugins run on a computer; on a phone it doesn't
  start on its own and waits for a wide screen. Started by hand it runs anyway.
- **Without a program** (started by hand before any plugin was signed in): the texts say "your
  editing program" and leave out `render-to-disk`.
- **Length:** 13 steps is long for rule 15. Steps 2–7 are Look steps of one or two sentences each;
  if it feels long when built, `render-to-disk` can go into `render-upload`, and `markers` into
  `to-program`.
- **What the texts may promise,** with the new marker sync: only changes travel, a change made only
  in the target survives a sync, and deletions only travel when the user picks "Match" in the
  preview (or a single marker there). The tutorial doesn't teach deleting or conflicts: the preview
  explains them where they happen.
- **The preview** (`SyncPreviewModal`): the target's logo on top, two columns sorted by timecode,
  what comes in left (+ new, ✎ changed), what goes away right (−), each line leaving a gap in the
  other column. With something deleted on one side, "Add & update" (default, nothing is deleted)
  and "Match" (the target becomes like the source: also deletes, and brings back markers deleted
  on the target, tagged "was deleted"). Clicking a line leaves that marker out or takes it in.
  "Add & update" is the default the first time; after that the preview opens in the mode picked
  last, as long as the plugin runs. So the texts never say which tab is selected.
- **Clear all markers** (in the ⋯ menu of the program box) isn't part of the tutorial: it deletes
  the user's markers in the program (backed up first, the History can undo it).
- **The History** (`MarkerHistoryModal`): one row per action (sync to either side, clear all,
  restore) with what changed on each side; "Undo" asks "Really undo?" once and restores the side
  the action changed. Undoing creates a backup itself, so an undo can be undone. `history` only
  explains it: undoing the tutorial's own sync would take the user's new marker away again.
- **Screenshots of the panel** (`PluginPanelShot`): one per program (DaVinci Resolve, Premiere
  Pro, Pro Tools), made from the real panel with demo data, so they can't drift from it. The
  areas a step highlights are marked in the panel with `data-guide="sync-to-nle/<step-id>"` and
  measured when the screenshots are taken (`plugin-panel.json`, in percent of the image); the
  highlight is a ring in the tutorial style, everything around it dimmed. After changing the
  panel: `pnpm --filter @postpin-io/plugin-core run screenshots` (the preview in
  `plugin-core/preview/` with demo bridges and a demo server, photographed by Electron offscreen).
  `pnpm --filter @postpin-io/plugin-core run preview` opens the same preview in the browser.
  Only the wide layout, what most see in Resolve and Premiere; the texts name areas, never
  directions, so they fit the other layouts too. Pro Tools shows the panel without PostPin
  Desktop's program picker above it. Demo names only (Harbor Lights, Reel 1): the images are
  public.
- Continues from the install tutorials ([install-resolve](install-resolve.md),
  [install-premiere](install-premiere.md), [install-desktop](install-desktop.md)) and
  [plugin-workflow](plugin-workflow.md).
- The id stays `sync-to-nle` (internal; planned guides could still be renamed, e.g. `plugin-tour`).
