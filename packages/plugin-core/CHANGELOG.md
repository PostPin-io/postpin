# @postpin-io/plugin-core

## 0.8.0

### Patch Changes

- PostPin Desktop connects to FilmCraft: pull and push markers, and render and upload the timeline. PostPin starts FilmCraft with remote control, so quit FilmCraft first if it's already open
- PostPin Desktop connects to REAPER: pull and push markers and regions, render and upload the project, and a timeline snapshot with the items. PostPin sets REAPER up by itself the first time, while REAPER is closed: a script, an action for it and a password-protected web interface of its own

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
- feat: the plugins remember the chosen timeline and export for each timeline you work on, also after a restart. A new export can be named before Render & Upload (otherwise it's named after the timeline with date and time), the render to disk settings have their own dialog, and messages show as short toasts.
- feat(plugins): "Additionally render to disk" in the Resolve plugin now renders the timeline with a chosen preset into a folder while the export uploads; the marker buttons show which way the markers go (editing app ⇄ PostPin) with a marker animation while syncing, and disabled actions explain why they can't run yet

### Patch Changes

- fix: improved error and offline handling
- feat: new tutorial "Using the plugin". Right after a plugin is connected, and once an export with markers exists, it walks through the plugin's panel on screenshots of it, brings the markers into DaVinci Resolve, Premiere Pro or Pro Tools and sends a new one back, and notices both syncs by itself. Accounts that signed in a plugin before get it marked as completed. In the plugins, a sync to PostPin now says "Synced to PostPin" like the other direction.
- feat: the plugins are for members and up – a reviewer can't sign a plugin in any more (the device page says why), the plugin API refuses reviewers, and the plugins show "The plugin needs the Member role" instead of an error
