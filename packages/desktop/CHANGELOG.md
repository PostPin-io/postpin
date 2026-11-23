# @postpin-io/desktop

## 0.6.1

No changes in this release.

## 0.6.0

### Minor Changes

- feat: smarter marker sync in the plugins. A sync now only transfers what changed since the last one, keeps changes made on the other side, and shows a preview first: new and changed markers on the left, deleted ones on the right, sorted by timecode. "Add & update" never deletes anything, "Match" makes the other side exactly the same, and single markers can be left out with a click. Markers deleted in PostPin no longer come back with the next sync.
  Every sync and "Clear all markers" backs up the markers first; the new History in the plugin undoes any of them.
  Exports uploaded in the browser that start at another timecode than the timeline (e.g. 00:00:00:00 instead of 01:00:00:00) now land on the right frames. In DaVinci Resolve, a marker whose frame is already taken goes on the next free frame instead of failing, and markers that couldn't be written are listed with the reason.
  The plugins need the new server version (API version 2).
- feat: the plugins remember the chosen timeline and export for each timeline you work on, also after a restart. A new export can be named before Render & Upload (otherwise it's named after the timeline with date and time), the render to disk settings have their own dialog, and messages show as short toasts.

### Patch Changes

- feat(plugins): "Additionally render to disk" in the Resolve plugin now renders the timeline with a chosen preset into a folder while the export uploads; the marker buttons show which way the markers go (editing app ⇄ PostPin) with a marker animation while syncing, and disabled actions explain why they can't run yet
- feat: the plugins are for members and up – a reviewer can't sign a plugin in any more (the device page says why), the plugin API refuses reviewers, and the plugins show "The plugin needs the Member role" instead of an error

## 0.3.0

### Minor Changes

- **Faster uploads**: The render starts uploading right away while PostPin Desktop encodes the review versions on your computer, so the export is ready to review sooner.
- **Server version check**: If your PostPin server needs a different version of PostPin Desktop, you get an update offer instead of errors. Updates only install versions that work with your server.

### Patch Changes

- **Windows**: Window buttons follow dark mode, and dragging the window works again.
- **Text selection**: Text in the app can no longer be selected by accident.

## 0.2.0

### Minor Changes

- **First release**: PostPin Desktop connects Pro Tools to PostPin, for macOS (signed and notarized) and Windows.
  - Render and upload the session, with a snapshot of its timeline.
  - Markers sync in both directions and land on the ruler you can see.
  - Without an edit selection, it renders the range of all clips. Projects and timelines are named after the session and its folder.
  - A program switcher for the programs PostPin Desktop supports.
  - Updates itself.
