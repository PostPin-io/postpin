# @postpin-io/resolve-plugin

## 0.6.0

### Minor Changes

- feat: smarter marker sync in the plugins. A sync now only transfers what changed since the last one, keeps changes made on the other side, and shows a preview first: new and changed markers on the left, deleted ones on the right, sorted by timecode. "Add & update" never deletes anything, "Match" makes the other side exactly the same, and single markers can be left out with a click. Markers deleted in PostPin no longer come back with the next sync.
  Every sync and "Clear all markers" backs up the markers first; the new History in the plugin undoes any of them.
  Exports uploaded in the browser that start at another timecode than the timeline (e.g. 00:00:00:00 instead of 01:00:00:00) now land on the right frames. In DaVinci Resolve, a marker whose frame is already taken goes on the next free frame instead of failing, and markers that couldn't be written are listed with the reason.
  The plugins need the new server version (API version 2).
- feat: the plugins remember the chosen timeline and export for each timeline you work on, also after a restart. A new export can be named before Render & Upload (otherwise it's named after the timeline with date and time), the render to disk settings have their own dialog, and messages show as short toasts.
- feat(plugins): "Additionally render to disk" in the Resolve plugin now renders the timeline with a chosen preset into a folder while the export uploads; the marker buttons show which way the markers go (editing app ⇄ PostPin) with a marker animation while syncing, and disabled actions explain why they can't run yet

### Patch Changes

- feat: the plugins are for members and up – a reviewer can't sign a plugin in any more (the device page says why), the plugin API refuses reviewers, and the plugins show "The plugin needs the Member role" instead of an error

## 0.3.0

### Minor Changes

- **Faster uploads**: The render starts uploading right away while the plugin encodes the review versions on your computer, so the export is ready to review sooner.
- **Server version check**: If your PostPin server needs a different plugin version, the plugin says so and links to the right download.

### Patch Changes

- **Windows**: Window buttons follow dark mode, and dragging the window works again.
- **Text selection**: Text in the plugin can no longer be selected by accident.

## 0.2.0

### Minor Changes

- **First release**: The PostPin plugin for DaVinci Resolve 21.2, as an installer for macOS (signed and notarized) and Windows (x64 and arm64).
  - Render and upload a timeline, with a snapshot of its clips in their clip colors.
  - Markers sync in both directions, matched to categories by color.
