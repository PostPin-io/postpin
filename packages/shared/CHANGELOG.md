# @postpin-io/shared

## 0.6.0

### Minor Changes

- feat: tours start from a guide button next to their feature, a tour that explains PostPin Guides starts on its own, and guides can be switched off on the PostPin Guides page, whose rows are now compact with a "Not completed" filter
- feat: live markers – marker, response and category changes from other reviewers and tabs appear without reloading
- feat: pointers – arrows and boxes on the picture that show what a marker is about
- feat: smarter marker sync in the plugins. A sync now only transfers what changed since the last one, keeps changes made on the other side, and shows a preview first: new and changed markers on the left, deleted ones on the right, sorted by timecode. "Add & update" never deletes anything, "Match" makes the other side exactly the same, and single markers can be left out with a click. Markers deleted in PostPin no longer come back with the next sync.
  Every sync and "Clear all markers" backs up the markers first; the new History in the plugin undoes any of them.
  Exports uploaded in the browser that start at another timecode than the timeline (e.g. 00:00:00:00 instead of 01:00:00:00) now land on the right frames. In DaVinci Resolve, a marker whose frame is already taken goes on the next free frame instead of failing, and markers that couldn't be written are listed with the reason.
  The plugins need the new server version (API version 2).
- feat: new tutorial "Using the plugin". Right after a plugin is connected, and once an export with markers exists, it walks through the plugin's panel on screenshots of it, brings the markers into DaVinci Resolve, Premiere Pro or Pro Tools and sends a new one back, and notices both syncs by itself. Accounts that signed in a plugin before get it marked as completed. In the plugins, a sync to PostPin now says "Synced to PostPin" like the other direction.
- feat: PostPin Guides – the "Your first upload" tutorial for new accounts (from creating the organization to the first export), a share links tour on the review page, and a PostPin Guides page in the account menu to start them again
- refactor: remove the getting started tutorial (welcome page, review and sharing tours) to make room for PostPin Guides; new accounts now start on the dashboard
- feat: screening guests follow the presenter – while a screening runs, guests have no video and their playhead stays in sync with the screen; once it ends, the link works like a normal share link (all qualities, own playhead) until the screening is started again
- feat: guests are sent away as soon as their share link is deleted or expires, instead of only with their next request
- feat: sign in with Google, Microsoft, GitHub, Apple or your own OIDC provider, with passkeys, and protect your password with two-factor authentication. Enter submits the login and sign-up forms.

### Patch Changes

- fix: a timeline imported from a wrong EDL or FCPXML can be replaced with detected cuts again; imported markers stay
