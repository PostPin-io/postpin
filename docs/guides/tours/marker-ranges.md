---
id: marker-ranges
type: tour
title: Marker ranges
status: implemented
minRole: reviewer
permission: marker.create
trigger: manual
starts: guide button in the timeline toolbar, next to the hint "⌥ drag a marker for a range" · from PostPin Guides: the latest export the user may leave markers on (`getGuideStart`)
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
---

# Marker ranges

**Goal:** The user can place a marker exactly where it belongs: move it on the timeline, stretch it
into a range that covers a whole passage, set start and end to the frame, and do it faster with
in and out points.

## Steps

On the review page, on a marker the user creates in the tour (a reviewer may only change their
own, rule 17). Icons in brackets are shown inline, keys as key caps (rule 14).

1. `add-marker` (signal: a new marker was created; keys <kbd>M</kbd>): **Highlights:** the
   add-marker button. **Title:** "A marker to shape". **Text:** "Add a marker with [diamond-plus]
   or <kbd>M</kbd>. You'll move it and stretch it into a range." Waits until there is a player.
2. `show-timeline` (click; left out while the timeline is shown): **Highlights:** the timeline
   button of the player bar ([chevrons-up-down], only there while the timeline is hidden).
   **Title:** "Show the timeline". **Text:** "Markers are moved on the timeline. Show it with
   [chevrons-up-down]."
3. `move` (signal: the marker was dragged to another place): **Highlights:** the head of the new
   marker on the timeline (its diamond, or its bar if <kbd>M</kbd> made a range from in and out
   points). **Title:** "Move it". **Text:** "Drag your marker along the timeline. The video
   follows, so you see the frame you land on." Waits for the timeline.
4. `make-range` (click; optional: left out when the marker is a range already, e.g. after an
   <kbd>⌥</kbd>-drag in `move`): **Highlights:** the [move-horizontal] button in the marker editor.
   **Title:** "Make it a range". **Text:** "Turn it into a range with [move-horizontal]. Or hold
   <kbd>⌥</kbd> while you drag a marker."
5. `end` (signal: the end was dragged; keys <kbd>⌥</kbd>): **Highlights:** the end triangle of the
   range on the timeline. **Title:** "Where it stops". **Text:** "Hold <kbd>⌥</kbd> and drag the
   end of the range to where the passage stops. Without <kbd>⌥</kbd> it moves the whole range."
6. `expand` (click; optional: left out when the marker is open already): **Highlights:** the
   [chevron-down] button of the marker in the list. **Title:** "Open your marker". **Text:** "Open
   your marker with [chevron-down]. Its start and end are in there."
7. `timecode` (signal: a new start was typed): **Highlights:** the start timecode of the marker in
   the list. **Title:** "Exact to the frame". **Text:** "Click the timecode, type the exact start
   and press <kbd>Enter</kbd>."
8. `range-end` (next; optional: only while the marker is a range): **Highlights:** only the
   triangle in front of the timecode, which switches between start and end. **Title:** "Start and
   end". **Text:** "Switch between start and end with the triangle. The end is typed the same way."
9. `keys` (next; keys <kbd>Space</kbd> <kbd>I</kbd> <kbd>O</kbd> <kbd>M</kbd>): **Highlights:** the
   add-marker button. **Title:** "Faster with keys". **Text:** "Play with <kbd>Space</kbd>, set In
   with <kbd>I</kbd> and Out with <kbd>O</kbd>, then <kbd>M</kbd> adds the range."
10. `done` (done): **Completion card. Title:** "Your markers cover whole passages". **Text:**
    "Your NLE gets ranges as markers with a duration. Restart this tour under PostPin Guides."
    **Button:** "Done".

## Success feedback

- After `end`: "✓ Your first range"
- `done` is the confirmation.

## Anchors

| Step            | Element                                                       | Where                                                    |
| --------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `add-marker`    | add-marker button (once there is a player)                    | `review/VideoMenuBar.svelte`                             |
| `show-timeline` | timeline button, only while the timeline is hidden            | `review/VideoMenuBar.svelte`                             |
| `move`          | head of the selected marker (diamond, or the bar of a range)  | `review/Timeline.svelte`                                 |
| `make-range`    | range button of the editor, only for a point marker           | `review/markers/UpdateMarker.svelte`                     |
| `end`           | end triangle of the selected range                            | `review/Timeline.svelte`                                 |
| `expand`        | expand button of the selected, closed marker in the list      | `review/markers/Marker.svelte`                           |
| `timecode`      | start timecode field of the selected marker in the list       | `review/markers/Marker.svelte`, `review/Timecode.svelte` |
| `range-end`     | start/end switch (triangle) of the selected range in the list | `review/markers/Marker.svelte`                           |
| `keys`          | add-marker button                                             | `review/VideoMenuBar.svelte`                             |

Signals: `add-marker` in `MarkerPanel` (only for a new marker), `move` and `end` in `Timeline`
once a drag was saved (`move` for any change, `end` when the end moved and the start didn't),
`timecode` in `MarkerPanel` once a typed start was saved. Only real changes count: a click on the
marker, or a value clamped back to what it was, is no signal.

## Notes

- Runs only where it can be done: on the review page, at least 1024px wide (`desktopOnly`; on
  phones there is no timeline, only the position dialog `MarkerPositionModal`, not part of the
  tour). The guide button sits in the timeline toolbar, so it is only there while the timeline is;
  started from PostPin Guides on an export whose timeline is hidden, `show-timeline` brings it back.
- The guide button is next to the "⌥ drag a marker for a range" hint, not next to the first step's
  element (the add-marker button): the hint is where a user wonders about ranges.
- Dragging works under the tour's blocking layer: the drag starts in the highlighted element and
  follows the pointer on the window.
- `end` is on the end triangle, not on the small handle at the end of the bar: the triangle lies
  on top of it, and without ⌥ it moves the whole range (no `end` signal, the tour would wait).
  With ⌥ the triangle changes the end, at any zoom; the handle needs a range at least 12px wide.
- Steps with keys (`keys`) blur a focused text field first (the timecode just typed into), or the
  page's shortcuts would take <kbd>I</kbd>, <kbd>O</kbd> and <kbd>M</kbd> as typing.
- <kbd>M</kbd> on a frame that has a marker already selects that one instead of adding one; `add-marker`
  then waits. To move the playhead first the user would have to skip; rare, as in first-review.
- The timecodes in the list are only in an open marker, hence `expand` before `timecode`;
  without it `timecode` found no element and the tour went back to `end`.
- If the user's marker isn't in the list (filtered out), `timecode` waits for it.
- Roles: everything here is `marker.create` on the user's own marker, so Reviewer is enough.
  Guests (share links) have no stored progress and get no guide button.
