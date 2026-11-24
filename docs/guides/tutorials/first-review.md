---
id: first-review
type: tutorial
title: Your first review
status: implemented
minRole: reviewer
permission: marker.create
trigger: automatic
starts: automatically on the review page once its video can be played, on desktop (for an uploader that is their own export right after first-upload, for a reviewer the first export they open) · from PostPin Guides: the latest export the user may leave markers on (`getGuideStart`)
prerequisites: [an export the user can open and may leave markers on (`permission`), a screen at least 1024px wide]
code:
  - packages/postpin/src/lib/components/guides/tutorials/first-review.ts
  - packages/postpin/src/lib/components/guides/GuideHost.svelte
  - packages/postpin/src/lib/components/guides/Tour.svelte
  - packages/postpin/src/lib/components/guides/guide-signals.svelte.ts
  - packages/postpin/src/lib/components/review/ExportReview.svelte
  - packages/postpin/src/lib/components/review/VideoMenuBar.svelte
  - packages/postpin/src/lib/components/review/markers/MarkerPanel.svelte
  - packages/postpin/src/lib/components/review/markers/Marker.svelte
  - packages/postpin/src/lib/components/review/markers/UpdateMarker.svelte
  - packages/postpin/src/lib/components/review/markers/ResponseMarker.svelte
---

# Your first review

**Goal:** The user can leave frame-accurate feedback on an export and work through it.

## Steps

Not a screen of its own: it happens on the review page, with the tour engine (spotlight and card)
in the tutorial style (`primary`). One action per step, and the step highlights exactly the
element of that action, nothing around it (rule 6): only that action is possible. Every step is a
Your-turn step (rule 16) that goes on by itself once the user did it: the page reports it
(`signalGuide`, `advance: "signal"`) or the click is the action (`advance: "click"`); there is no
Next. Icons in brackets are shown inline (rule 14).

1. `play` (signal: played, then paused again): **Highlights:** the play/pause button.
   **Title:** "Find the spot". **Text:** "Start the video with [play] and stop it with [pause]
   where something should change. <kbd>Space</kbd> works too." Waits until there is a player
   (processing).
2. `add-marker` (signal: a new marker was created, or the user's own marker at the playhead was
   selected): **Highlights:** the add-marker button.
   **Title:** "Your first marker". **Text:** "Add a marker on this frame with [diamond-plus] or
   <kbd>M</kbd>."
3. `title` (signal: Enter in the title field, or leaving it, with a title): **Highlights:** the
   title field of the marker editor. **Title:** "Say what to change". **Text:** "Type what should
   change, then press <kbd>Enter</kbd>."
4. `category` (signal: a category was picked): **Highlights:** the category selector (its list
   opens above the dimming and works). **Title:** "Pick a category". **Text:** "Categories sort
   the feedback, e.g. color, sound or edit. Choose one." The category settings next to it are
   blocked.
5. `jump` (signal: jumped from the list): **Highlights:** the [locate] button of the user's marker
   in the list. **Title:** "Jump to a marker". **Text:** "Every marker in the list takes you to
   its frame. Jump to yours with [locate]."
6. `expand` (click; optional: left out when the marker is open already): **Highlights:** the
   [chevron-down] button of the marker. **Title:** "Open the marker". **Text:** "Open your marker
   with [chevron-down]."
7. `open-responses` (click): **Highlights:** the Respond button of the open marker. **Title:**
   "Talk it through". **Text:** "Every marker has its own conversation. Start it with
   [message-square-reply] Respond."
8. `reply` (signal: a response was sent): **Highlights:** the reply form (text field and send
   button). **Title:** "Reply". **Text:** "Write a reply and send it with [send]. Everyone working
   on this export sees it."
9. `done` (done): **Completion card. Title:** "✓ You know the basics of reviewing". **Text:**
   "Leave a marker wherever something should change. For more, look out for [guide button] next
   to features, and PostPin Guides in the account menu." **Button:** "Done".

## Success feedback

- After `add-marker`: "✓ Your first marker"
- `done` is the confirmation: "✓ You know the basics of reviewing".

## Anchors

| Step             | Element                                          | Where                                  |
| ---------------- | ------------------------------------------------ | -------------------------------------- |
| `play`           | play/pause button (once there is a player)       | `review/VideoMenuBar.svelte`           |
| `add-marker`     | add-marker button (once there is a player)       | `review/VideoMenuBar.svelte`           |
| `title`          | title field of the marker editor (desktop)       | `review/markers/UpdateMarker.svelte`   |
| `category`       | category selector of the marker editor (desktop) | `review/markers/UpdateMarker.svelte`   |
| `jump`           | locate button of the selected marker             | `review/markers/Marker.svelte`         |
| `expand`         | expand button of the selected, closed marker     | `review/markers/Marker.svelte`         |
| `open-responses` | Respond button of the selected marker            | `review/markers/Marker.svelte`         |
| `reply`          | the reply form                                   | `review/markers/ResponseMarker.svelte` |

Signals: `play` in `ExportReview` (paused after playing, by button or key), `add-marker` in
`MarkerPanel` (a new marker, or the user's own one that is there: M selects it instead of adding
a second; someone else's marker on the frame doesn't stop the user from adding theirs), `title` and
`category` in `UpdateMarker`, `jump` in `MarkerPanel` (the list's jump), `reply` in
`ResponseMarker`.

## Notes

- Runs only where it can be done in one go: on the review page, at least 1024px wide (on phones
  the editor and the replies are in a modal of their own; not yet). Leaving the page pauses it
  ("in progress"); the next review page starts it again at `play`.
- A guide started by hand goes first: on an export opened for the share links tour from the
  PostPin Guides page, that tour runs, not this tutorial.
- The postpin-guides tour comes after it on the review page (tutorials go first, rule 3).
- The completion card points to the guide buttons in general instead of to one tour, so it holds
  for every role: a reviewer has no share links tour, and [sync-to-nle](sync-to-nle.md) starts on
  its own once a plugin is connected.
- Roles: it is written for the lowest role, so every step is something a reviewer can do: create
  markers, assign a category, jump, reply. Nothing here needs more than `marker.create` and
  `marker.respond`. A reviewer may edit and delete only their own markers, so the tutorial has
  them work on the marker they create in `add-marker`.
- Existing accounts: not marked completed by a migration. Whoever has reviewed before gets it once
  on their next export and can skip it; to decide before release whether accounts with markers
  should be marked completed.
