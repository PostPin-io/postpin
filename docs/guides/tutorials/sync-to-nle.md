---
id: sync-to-nle
type: tutorial
title: Using the plugin
status: planned
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
  - packages/plugin-core/src/ui/MarkerSyncButton.svelte
  - packages/plugin-core/src/sync.ts
  - packages/postpin/src/api/controllers/MarkerController.ts
---

# Using the plugin

**Goal:** The user knows the plugin's panel, from the program to PostPin: the program follows the
open timeline, exports go up to a PostPin timeline, and markers travel both ways with one export.
They have brought markers into their program, added one and sent it back, and seen both arrive.

Wording as in every guide (README rule 14): **the plugin**, and where the program matters its name.
On Pro Tools the plugin is PostPin Desktop and markers are memory locations; the texts below say
"marker" and switch to "memory location" there. The plugin shows no "push" or "pull" and neither
does the tutorial: the marker buttons are symbols (the program's logo, an arrow, the PostPin logo),
so the texts name the direction of the arrow ("from <program> to PostPin").

**Builds on the new marker sync** (`feat/improve-plugin-marker-sync`): a sync first compares both
sides and shows a summary, then writes only what changed, and saves a marker set (the state of both
sides before it) that the plugin's history can restore. This tutorial is built after that; its
texts and Detection assume it.

## The plugin's panel

What the tutorial walks through, in the order the panel reads in its wide layout (left to right).
Labels as in the plugin:

| Area               | In the plugin                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The program (left) | Logo and name, "Current timeline" (with thumbnail), "Current project". Found by itself: the plugin follows the timeline open in the program. "⋯" menu: "Clear all markers in this timeline". |
| Upload             | "Upload to" with "Choose timeline": the PostPin project and timeline new exports go to (a project or timeline can be created right there).                                                   |
| Render & Upload    | "Render & Upload", "new export in <timeline>": renders the open timeline and uploads it as a new export.                                                                                     |
| Additional render  | The settings button next to it: "Additionally render to disk" (preset, folder, file name). Only for programs that can (`capabilities.renderToDisk`).                                         |
| Exchange markers   | "Exchange markers with" with "Choose export": the export whose markers travel.                                                                                                               |
| Markers            | The "Markers" box with two buttons: <program> → PostPin and PostPin → <program>.                                                                                                             |

On a narrow panel it is stacked: PostPin on top, the actions in between, the program at the bottom.
So the texts never say "left" or "right" but name the area ("the <program> box", "Upload to").

## Steps

Full screen, in the frame of the install tutorials (`TutorialShell`): a card with the steps at the
top, "Back" / "Next" on the steps that happen outside the browser, progress stored on every step.
The tutorial can't highlight anything inside the plugin, so the card shows a **sketch of the
panel** (the areas of the table above as boxes) with the area of the current step highlighted, in
the tutorial style. The user switches between the plugin and this window, so every step says which
program it is about. <program> is the program of the connected plugin (see Notes).

1. `open-plugin`: **Title:** "Open the plugin". **Text:** "Open the PostPin plugin in <program>, with
   the timeline you're working on." **Done when:** "Next".
2. `program`: **Title:** "<program>". **Text:** "The plugin follows the timeline that's open in
   <program>. Things that only affect <program>, like clearing all markers, are in its ⋯ menu."
   **Done when:** "Next".
3. `upload-to`: **Title:** "Where exports go". **Text:** "Under Upload to, choose the PostPin
   timeline for your exports. You can create a project or timeline right there." **Done when:**
   "Next".
4. `render-upload`: **Title:** "Render & Upload". **Text:** "Renders the open timeline and uploads
   it as a new export to that timeline, ready for review." **Done when:** "Next". Explained, not
   done: an upload isn't needed for the rest of the tutorial (see Notes, plugin-workflow).
5. `render-to-disk`: **Title:** "Also a file for you". **Text:** "With the settings button next to
   it, the same render also lands in a folder of your choice." **Done when:** "Next". Left out for
   programs without render to disk (`capabilities.renderToDisk`; the tutorial knows it from the
   program, see Notes).
6. `exchange-with`: **Title:** "Choose the export for markers". **Text:** "Under Exchange markers
   with, choose the export whose markers you want, for now: <project> › <timeline> › <export>."
   Names the export the tutorial chose (the latest one with markers). **Done when:** "Next".
7. `markers`: **Title:** "Markers go both ways". **Text:** "The arrow on each button in Markers shows
   where the markers go. Before anything changes, the plugin shows what will change." **Done
   when:** "Next".
8. `to-program`: **Title:** "Bring the markers over". **Text:** "Click the button with the arrow
   from PostPin to <program>, and confirm." **Done when:** the server saw the sync (Detection), or
   "I did it".
9. `see-markers`: **Title:** "Your markers are on the timeline". **Text:** "Each marker comes with
   its category: a color, and the name as a #tag in its description. Keep the tag, it keeps the
   category when the marker goes back." **Done when:** "Next".
10. `add-marker`: **Title:** "Add a marker". **Text:** "Add a marker on the timeline in <program>,
    or change one. Markers without a #tag get a category named after their color." **Done when:**
    "Next".
11. `to-postpin`: **Title:** "Send it back". **Text:** "Click the button with the arrow from
    <program> to PostPin, and confirm." **Done when:** the server saw the sync with at least one
    new or changed marker (Detection), or "I did it".
12. `history`: **Title:** "Every sync can be undone". **Text:** "The plugin keeps a history of your
    syncs. Restore one to get the markers back as they were before it." Names where the history
    sits once the plugin has it. **Done when:** "Next".
13. `done`: **Completion screen:** "✓ You're set up in <program>". **Text:** "Bring the markers over
    before you start and send them back when you're done; only what changed travels. More under
    PostPin Guides in the account menu." **Done when:** "Open your export" (the review page of the
    export the marker went to) or "Done"; the tutorial closes at once.

## Detection

The web app only sees what reaches the server. The live updates of the review page
(`notifyMarkers`) don't reach a full-screen tutorial, so the tutorial polls (like `getPluginSignIn`,
every 3 s while the tab is visible) a server function such as `getMarkerSyncSignal`. Only what
happens after the step began counts, like a `signal` step in a tour. Steps 1–7 and 9–10 happen in
the plugin or the program without a trace on the server, so they go on with "Next".

**The marker sets are the trace.** Every sync leaves one on the server, with what the tutorial
needs: `action`, `createdById`, `exportId`, `hostName`, `createdAt` and `summary`. ("PUSH" / "PULL"
stay words of the code.)

- **`to-program`:** a `MarkerSet` with `action: PULL` by the user, created after the step began.
- **`to-postpin`:** a `MarkerSet` with `action: PUSH` by the user, created after the step began,
  whose `summary` has at least one added or changed marker (an empty one means the marker from
  `add-marker` didn't make it, e.g. another export chosen: the step keeps waiting).
- On any export, not only the one named in `exchange-with`: the user may have chosen another. The
  `exportId` of `to-postpin` is the export "Open your export" opens.
- No table and no API of its own for the tutorial, and no guessing from `nleId` / `updatedAt`.

**To agree with the marker sync:** a sync to the program that changes nothing must still create
its set (or another trace), otherwise the tutorial can't see it. That is common for users who tried
the plugin before. Either the plugin always creates the set, or sets with an empty summary aren't
listed in the history but are still recorded. "I did it" stays as a quiet button in both sync steps
for a sync that failed in the plugin or an older plugin without marker sets.

## Success feedback

- After `to-program`: "✓ <n> markers in <program>" (from the set's `summary`)
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
  most recently (`DEVICE_CLIENTS` → DaVinci Resolve, Premiere Pro, Pro Tools). With several plugins
  connected, the first sync corrects it. `render-to-disk` needs to know whether that program can
  render to disk; the web app has no `capabilities`, so it is a fixed list per client in
  `DEVICE_CLIENTS` (to check per plugin which ones can).
- **Export it uses:** the latest export with markers in an organization where the user may use the
  plugins (`plugin.use`; a member in one organization can be a reviewer in another), found like
  `getGuideStart`. Markers marked as deleted (`deletedAt`, if the marker sync introduces it) don't
  count. Without one, the row on the PostPin Guides page says what's missing (`restartHint`), and
  the tutorial doesn't start.
- **Role:** the plugins are for members and up (`plugin.use`, `apiAuthorize`), so `minRole` is
  Member.
- **Desktop only** (`wide`, like first-review): the plugins run on a computer; on a phone it doesn't
  start on its own and waits for a wide screen.
- **Length:** 13 steps is long for rule 15. Steps 2–7 are Look steps of one or two sentences each;
  if it feels long when built, `render-to-disk` can go into `render-upload`, and `markers` into
  `to-program`.
- **What the texts may promise,** with the new marker sync: only changes travel, a change made only
  in PostPin survives a sync from the program, and deletions travel (with a question in the
  plugin). The tutorial doesn't teach deleting or conflicts: the plugin's summary explains them
  where they happen. If the marker sync decides otherwise, `markers` and the two sync steps follow.
- **Clear all markers** is only named (`program`), never done: it deletes the user's markers in the
  program.
- **Open:** the sketch of the panel (`TutorialShell`): one per layout or only the wide one. The wide
  one is what most see in Resolve and Premiere; screenshots would do too, but go out of date.
- **Open:** where the history sits in the plugin (`history`), once the marker sync has its UI.
- Continues from the install tutorials ([install-resolve](install-resolve.md),
  [install-premiere](install-premiere.md), [install-desktop](install-desktop.md)) and
  [plugin-workflow](plugin-workflow.md).
- The id stays `sync-to-nle` (internal; planned guides could still be renamed, e.g. `plugin-tour`).
