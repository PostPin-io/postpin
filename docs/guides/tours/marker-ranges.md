---
id: marker-ranges
type: tour
title: Marker ranges
status: implemented
minRole: reviewer
permission: marker.create
trigger: manual
starts: guide button in the timeline toolbar, next to the shortcut hint ("… ⌥ drag a marker for a range or its edge to resize") · from PostPin Guides: the latest export the user may leave markers on (`getGuideStart`)
prerequisites: [an export the user may leave markers on (`permission`), a screen at least 1024px wide]
code:
  - packages/postpin/src/lib/components/guides/tours/marker-ranges.ts
  - packages/postpin/src/lib/components/guides/GuideHost.svelte
  - packages/postpin/src/lib/components/review/Timeline.svelte
  - packages/postpin/src/lib/components/review/Timecode.svelte
  - packages/postpin/src/lib/components/review/VideoMenuBar.svelte
  - packages/postpin/src/lib/components/review/ExportReview.svelte
  - packages/postpin/src/lib/components/review/RangeEdgeIcon.svelte
  - packages/postpin/src/lib/components/review/markers/MarkerPanel.svelte
  - packages/postpin/src/lib/components/review/markers/Marker.svelte
  - packages/postpin/src/lib/components/review/markers/UpdateMarker.svelte
  - packages/postpin/src/lib/components/review/markers/markers.remote.ts
  - packages/postpin/src/lib/components/review/timeline-view.ts
  - packages/postpin/src/lib/components/guides/tour.ts
  - packages/postpin/src/lib/components/guides/Tour.svelte
  - packages/postpin/src/lib/keyboard.ts
---

# Marker ranges

**Goal:** The user can place a marker exactly where it belongs: move it on the timeline, stretch it
into a range that covers a whole passage, set start and end to the frame, and do it faster with
in and out points.

## Steps

On the review page, on a marker of the user's own (a reviewer may only change their own, rule 17):
the one they add in the first step, or their own marker that already sits at the playhead. Icons
in brackets are shown inline, keys as key caps (rule 14).

Steps that are left out depend on the state of the user's marker, never on an element that
happens to be missing for a moment: they use `skipIf`, not `optional`. A step whose element is
on its way (a save, a list re-rendering) waits for it (`waitForElement`) instead of going back to
an earlier step, so the tour never sends the user back to the timeline in a loop.

1. `add-marker` (signal; keys <kbd>M</kbd>): **Highlights:** the add-marker button. **Title:** "A
   marker to shape". **Text:** "Add a marker with [diamond-plus] or <kbd>M</kbd>. You'll move it and
   stretch it into a range." Waits until there is a player. Done when a marker was added, or when
   [diamond-plus] / <kbd>M</kbd> selected the user's own marker that is already at the playhead
   (e.g. the one from an earlier run of this tour).
2. `show-timeline` (click; left out while the timeline is shown): **Highlights:** the timeline
   button of the player bar ([chevrons-up-down], only there while the timeline is hidden).
   **Title:** "Show the timeline". **Text:** "Markers are moved on the timeline. Show it with
   [chevrons-up-down]."
3. `move` (signal: the marker was dragged to another place; waits for its element): **Highlights:**
   the head of the user's marker on the timeline: its diamond, or for a range (made from in and out
   points) its start triangle. Never the bar of a range: it can be 2px wide or wider than the
   timeline. **Title:** "Move it". **Text:** "Drag your marker along the timeline. The video
   follows, so you see the frame you land on."
4. `make-range` (click; left out when the marker is a range already, i.e. its end triangle is on
   the timeline; waits for its element): **Highlights:** the [move-horizontal] button in the marker
   editor. **Title:** "Make it a range". **Text:** "Turn it into a range with [move-horizontal]."
   (No ⌥-drag alternative here: the timeline is blocked on this step.)
5. `end` (signal: the end was dragged and it is still a range; keys <kbd>⌥</kbd>; left out when the
   end was dragged already since `add-marker`, e.g. by an <kbd>⌥</kbd>-drag in `move`):
   **Highlights:** the end triangle of the range on the timeline. **Title:** "Where it stops".
   **Text:** "Hold <kbd>⌥</kbd> and drag the end of the range to where the passage stops. Without
   <kbd>⌥</kbd> it moves the whole range."
6. `expand` (click; left out when the marker is open already, i.e. its start timecode is in the
   list; waits for its element): **Highlights:** the [chevron-down] button of the marker in the
   list. **Title:** "Open your marker". **Text:** "Open your marker with [chevron-down]. Its start
   and end are in there."
7. `timecode` (signal: a new start was typed; waits for its element): **Highlights:** the start
   timecode of the marker in the list. **Title:** "Exact to the frame". **Text:** "Click the
   timecode, type the exact start and press <kbd>Enter</kbd>."
8. `range-end` (next; left out when the marker is no range): **Highlights:** only the triangle in
   front of the timecode, which switches between start and end. **Title:** "Start and end".
   **Text:** "Switch between start and end with the triangle. The end is typed the same way."
9. `keys` (next; keys <kbd>Space</kbd> <kbd>I</kbd> <kbd>O</kbd> <kbd>M</kbd>): **Highlights:** the
   add-marker button. **Title:** "Faster with keys". **Text:** "Play with <kbd>Space</kbd>, set In
   with <kbd>I</kbd> and Out with <kbd>O</kbd>, then <kbd>M</kbd> adds the range."
10. `done` (done): **Completion card. Title:** "Your markers cover whole passages". **Text:**
    "Tip: hold <kbd>⌥</kbd> while you drag a marker to pull out a range at once. Restart this tour
    under PostPin Guides." **Button:** "Done". (No "NLE" on screen, rule 14.)

## Success feedback

- After `end`: "✓ Your first range" (not when `end` is left out: the range came from an
  <kbd>⌥</kbd>-drag the user just did)
- `done` is the confirmation.

## Anchors

| Step            | Element                                                                | Where                                                    |
| --------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `add-marker`    | add-marker button (once there is a player)                             | `review/VideoMenuBar.svelte`                             |
| `show-timeline` | timeline button, only while the timeline is hidden                     | `review/VideoMenuBar.svelte`                             |
| `move`          | head of the selected own marker: diamond, or start triangle of a range | `review/Timeline.svelte`                                 |
| `make-range`    | range button of the editor, only for a point marker                    | `review/markers/UpdateMarker.svelte`                     |
| `end`           | end triangle of the selected range                                     | `review/Timeline.svelte`                                 |
| `expand`        | expand button of the selected, closed marker in the list               | `review/markers/Marker.svelte`                           |
| `timecode`      | start timecode field of the selected marker in the list                | `review/markers/Marker.svelte`, `review/Timecode.svelte` |
| `range-end`     | start/end switch (triangle) of the selected range in the list          | `review/markers/Marker.svelte`                           |
| `keys`          | add-marker button                                                      | `review/VideoMenuBar.svelte`                             |

Signals: `add-marker` in `MarkerPanel` (a new marker, or the user's own one at the playhead),
`move` and `end` in `Timeline` once a drag was saved (`dragSignals` in `timeline-view.ts`: `move`
for any change, `end` when the end moved, the start didn't and it is still a range), `timecode` in
`MarkerPanel` once a typed start was saved. Only real changes count: a click on the marker, or a
value clamped back to what it was, is no signal.

## Notes

- Runs only where it can be done: on the review page, at least 1024px wide (`desktopOnly`; on
  phones there is no timeline, only the position dialog `MarkerPositionModal`, not part of the
  tour). The guide button sits in the timeline toolbar, so it is only there while the timeline is;
  started from PostPin Guides on an export whose timeline is hidden, `show-timeline` brings it back.
- The guide button is next to the shortcut hint, not next to the first step's element (the
  add-marker button): the hint is where a user wonders about ranges.
- <kbd>M</kbd> on a frame with a marker: the user's own marker there is selected instead of a
  second one being added, and the tour goes on with it. Someone else's marker on the same frame
  doesn't stop the user from adding their own (`ownMarkerAt`). Before, <kbd>M</kbd> selected any
  marker there and `add-marker` waited forever, e.g. on a second run with the playhead still on the
  marker of the first.
- The highlight is cut to what is visible of the element inside its scroll containers (the
  timeline lanes, the marker list): a range bar wider than the timeline, or a diamond scrolled under
  the track names, never puts a highlight next to the timeline. An element scrolled out of view
  completely is scrolled back in.
- Dragging works under the tour's blocking layer: the drag starts in the highlighted element and
  follows the pointer on the window.
- `end` is on the end triangle, not on the small handle at the end of the bar: the triangle lies
  on top of it, and without ⌥ it moves the whole range (no `end` signal, the tour would wait).
  With ⌥ the triangle changes the end, at any zoom; the handle needs a range at least 12px wide.
  Dragging the end onto the start turns the range back into a point: no `end` signal.
- Steps with keys (`keys`) blur a focused text field first (the timecode just typed into), or the
  page's shortcuts would take <kbd>I</kbd>, <kbd>O</kbd> and <kbd>M</kbd> as typing. The tour card
  itself is no overlay for the page's shortcuts (`data-tour-card`): with the focus on the card,
  <kbd>Space</kbd>, <kbd>I</kbd> and <kbd>O</kbd> still work.
- The timecodes in the list are only in an open marker, hence `expand` before `timecode`.
- If the user's marker isn't in the list (filtered out), `expand` / `timecode` wait for it; the
  user can skip the tour. Rare: a new marker gets the default category.
- Roles: everything here is `marker.create` and `marker.update` on the user's own marker, so
  Reviewer is enough. Guests (share links) have no stored progress and get no guide button.
