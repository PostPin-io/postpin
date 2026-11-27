# @postpin-io/api-client-ts

## 0.8.0

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.1

No changes in this release.

## 0.6.0

### Minor Changes

- feat: smarter marker sync in the plugins. A sync now only transfers what changed since the last one, keeps changes made on the other side, and shows a preview first: new and changed markers on the left, deleted ones on the right, sorted by timecode. "Add & update" never deletes anything, "Match" makes the other side exactly the same, and single markers can be left out with a click. Markers deleted in PostPin no longer come back with the next sync.
  Every sync and "Clear all markers" backs up the markers first; the new History in the plugin undoes any of them.
  Exports uploaded in the browser that start at another timecode than the timeline (e.g. 00:00:00:00 instead of 01:00:00:00) now land on the right frames. In DaVinci Resolve, a marker whose frame is already taken goes on the next free frame instead of failing, and markers that couldn't be written are listed with the reason.
  The plugins need the new server version (API version 2).
