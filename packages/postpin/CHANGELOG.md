# @postpin-io/postpin

## 0.7.0

### Minor Changes

- feat: all e-mails (invitation, share link, e-mail verification, password reset, account deletion, SMTP test) are now HTML mails in the PostPin look with the logo, one button and a plain-text part; they say how long their link works and why you got them
- feat: two new tours under PostPin Guides. "Inviting your team" (admins and owners) explains the e-mail invitation, the roles and the invite links in the members settings. "Project access" (members and up) goes through the Invitations dialog of a project: adding people by name or e-mail, who has access, and the invite links.
- feat: sharing a project or timeline happens in one dialog, "Invitations", instead of separate "Invite to …" and "Manage access" dialogs. Its tabs: "Add people" (type a name to give an organization member access, or an e-mail address to invite someone new), "Invite links" and "Access" (people with access and pending invitations). Admins and owners open the same dialog for the whole organization with the new button next to the organization name in the header. Invite links look and work the same in this dialog and in the members settings: one row per role with an on/off switch, copy and "New link". Turning a link off or replacing it asks first. Turning a link back on now always gives a new URL, so a link that was switched off can't come back to life, and anyone allowed to invite may turn it on again.
- feat: on the first visit to a timeline's export list, members without a signed-in plugin are asked whether to install a plugin and pick DaVinci Resolve, Premiere Pro or Pro Tools, which starts its install tutorial; "No, thanks" skips them after one confirmation. The install tutorials now need the Member role, since reviewers can't sign in a plugin. The first-upload tutorial creates the first organization itself instead of the dashboard's plain dialog, and only shows the steps the user actually does. Fixed: after signing up, the first tutorial sometimes didn't start and "Get started" did nothing until a reload. The sign-in pages got a cleaner card with the logo, consistent headings and fields, and the email and password form now comes before SSO and passkeys.

### Patch Changes

- fix: starting a screening could crash the page ("can't access property guestCount") until a reload.

## 0.6.1

### Patch Changes

- Sign in with Apple works again: SvelteKit no longer rejects Apple's callback as a cross-site form submission.

## 0.6.0

### Minor Changes

- feat: tours start from a guide button next to their feature, a tour that explains PostPin Guides starts on its own, and guides can be switched off on the PostPin Guides page, whose rows are now compact with a "Not completed" filter
- feat: live markers – marker, response and category changes from other reviewers and tabs appear without reloading
- feat: timelines open their export list, with "Open latest" as a shortcut; export sizes moved into an "Info" menu item; projects, timelines and exports share one button and menu layout; "Share" is now reserved for share links, project and timeline access is "Invite to …"
- feat: pointers – arrows and boxes on the picture that show what a marker is about
- feat: smarter marker sync in the plugins. A sync now only transfers what changed since the last one, keeps changes made on the other side, and shows a preview first: new and changed markers on the left, deleted ones on the right, sorted by timecode. "Add & update" never deletes anything, "Match" makes the other side exactly the same, and single markers can be left out with a click. Markers deleted in PostPin no longer come back with the next sync.
  Every sync and "Clear all markers" backs up the markers first; the new History in the plugin undoes any of them.
  Exports uploaded in the browser that start at another timecode than the timeline (e.g. 00:00:00:00 instead of 01:00:00:00) now land on the right frames. In DaVinci Resolve, a marker whose frame is already taken goes on the next free frame instead of failing, and markers that couldn't be written are listed with the reason.
  The plugins need the new server version (API version 2).
- feat: a "Finding your way" tour from the dashboard through a project and a timeline to an export, with search, sort, views and the breadcrumbs; the PostPin Guides tour now also explains the PostPin Guides page
- feat: theme switcher
- feat: the plugins remember the chosen timeline and export for each timeline you work on, also after a restart. A new export can be named before Render & Upload (otherwise it's named after the timeline with date and time), the render to disk settings have their own dialog, and messages show as short toasts.
- feat: new tutorial "Using the plugin". Right after a plugin is connected, and once an export with markers exists, it walks through the plugin's panel on screenshots of it, brings the markers into DaVinci Resolve, Premiere Pro or Pro Tools and sends a new one back, and notices both syncs by itself. Accounts that signed in a plugin before get it marked as completed. In the plugins, a sync to PostPin now says "Synced to PostPin" like the other direction.
- feat: the plugins are for members and up – a reviewer can't sign a plugin in any more (the device page says why), the plugin API refuses reviewers, and the plugins show "The plugin needs the Member role" instead of an error
- feat: PostPin Guides – the "Your first upload" tutorial for new accounts (from creating the organization to the first export), a share links tour on the review page, and a PostPin Guides page in the account menu to start them again
- refactor: remove the getting started tutorial (welcome page, review and sharing tours) to make room for PostPin Guides; new accounts now start on the dashboard
- feat: screening guests follow the presenter – while a screening runs, guests have no video and their playhead stays in sync with the screen; once it ends, the link works like a normal share link (all qualities, own playhead) until the screening is started again
- feat: guests are sent away as soon as their share link is deleted or expires, instead of only with their next request
- feat: sign in with Google, Microsoft, GitHub, Apple or your own OIDC provider, with passkeys, and protect your password with two-factor authentication. Enter submits the login and sign-up forms.
- feat: the invite dialog only invites, in three tabs: people from your organization, by e-mail and by link, with Reviewer as default and no Admin role; who has access, pending invitations and active invite links moved to a new "Manage access" item in the project and timeline menus; the share links button of an export moved to the right end of the header; invalid e-mail addresses no longer show "undefined"
- feat: drop a video on the review page to upload it as a new export of the same timeline; the upload dialog's cut settings are collapsed by default and switch between "Detect cuts" and "Import EDL"

### Patch Changes

- fix: a timeline imported from a wrong EDL or FCPXML can be replaced with detected cuts again; imported markers stay
- fix: scrolling on landing page and links in settings for docs and landing page
- fix: the PostPin Guides tour waits for the first tutorial, and guides start fresh after signing in as someone else in the same tab
- fix: live sync on share and screening links – guests now see category changes (color, name, merge) on their markers without reloading
- feat(plugins): "Additionally render to disk" in the Resolve plugin now renders the timeline with a chosen preset into a folder while the export uploads; the marker buttons show which way the markers go (editing app ⇄ PostPin) with a marker animation while syncing, and disabled actions explain why they can't run yet
- fix: the screening button no longer stays on "End screening" after the screening link was revoked

## 0.5.2

### Patch Changes

- **Drag and drop upload**: Drop a video onto a timeline's exports page to upload it, no need to open the upload dialog first.
- **Link previews**: Links to the landing page show a preview image in chats and social media.

## 0.5.1

### Patch Changes

- **Landing page screenshots**: The landing page shows screenshots made with our own footage.

## 0.5.0

### Minor Changes

- **Landing page**: Visitors who aren't signed in see a page that walks through how PostPin works, from the edit to the review and back. Only on instances that turn it on.

## 0.4.0

### Minor Changes

- **Getting started tutorial**: New accounts are guided step by step: create an organization, a project and a timeline, get the plugin, upload the first export. On the first export it explains markers and how to share. The dashboard shows where you left off, and your profile can start the tutorial again. Invited members and existing accounts don't get it.

### Patch Changes

- **Keyboard shortcuts on Windows**: Cut, copy, paste, select all, delete and multi-select of markers use Ctrl outside Apple keyboards, instead of the Windows key.
- **Organizations with the same name**: Creating an organization whose name already exists no longer fails, and errors show in the dialog.

## 0.3.0

### Minor Changes

- **Screening mode**: Present an export in a window of its own on a projector or TV and control it from the review page. The audience joins with a QR code on their phones and adds markers while it plays; they land in a category for that screening.
- **Category presets**: Built-in presets for PostPin, DaVinci Resolve, Premiere Pro, Avid and Final Cut use the same names and colors as those programs, so synced markers land in the right category. Save your own categories as a preset for the whole organization. New projects start with the PostPin preset.
- **Delete unused categories**: One click removes every category without markers.
- **Import markers and cuts from EDL and XML**: Upload an EDL or FCPXML next to the video to get its markers and cuts.
- **Reworked marker panel**: Click a marker to select it, expand it with Enter or a double click, jump to it with the locate button. The selected marker scrolls into view, markers under the playhead are highlighted, and search also finds authors, guests and dates. Timecode or frames is one setting for the whole app and is remembered.
- **Guest category**: The category for guest markers is a normal category now, you can rename it like any other.
- **4K review**: Exports from 4K sources get a 2160p version. The automatic quality never loads more than the player can show.

### Patch Changes

- **Breadcrumbs on phones**: Larger touch targets, the list fits narrow screens and opens above the page content.
- **Breadcrumb lists**: Show an error with a retry instead of spinning forever, and reload on every open so new or renamed items show up.
- **Category renaming**: Fixed renaming categories.

## 0.2.1

### Patch Changes

- **Upload in the browser**: Upload an export straight from the browser, without a plugin. PostPin detects the cuts, and you can change the cut detection's sensitivity afterwards.
- **Share dialog**: Fixed the share dialog not opening on self-hosted servers.

## 0.2.0

### Minor Changes

- **Share links**: Share an export with people who don't have an account. They join with their name, watch, and add their own markers. Choose which panels they see (timeline, markers), add a note, set an expiry, show a QR code or send the link by e-mail. Each link shows its visits, guests and when it was last opened.
- **Breadcrumbs**: The header shows where you are (project, timeline, export) and lets you switch to another one from a dropdown. Each level has its own share button.
- **Marker ranges**: Markers can cover a range instead of a single frame.
- **Review on phones**: Markers open full screen and you swipe between them, reply right there, and use the iPhone's own fullscreen player. Lists show as cards and dialogs as bottom sheets.
- **Markers on the scrub bar**: Without the timeline panel (on phones, in share links, in fullscreen) the scrub bar shows each marker in its category color, and tapping one jumps to it.
- **Clip colors**: The timeline shows clips in the colors they have in Resolve or Premiere.
- **Processing status in the player**: While an export is being processed, the video area shows what's still running. Thumbnails and seek previews appear without reloading.
- **Storage usage**: See how much storage your organization, your account and each export use. Organizations and users can have storage limits.
- **Delete your account**: Delete your own account in your profile, confirmed with your password. Markers, comments and exports stay with the organization as "Deleted User".
- **Members in the organization settings**: Members moved into the organization settings, which every member can open now.
- **New marker dialog**: Creating a marker has a new look, with a default category.

### Patch Changes

- **Passwords in the browser console**: Login and sign-up no longer write your password to the browser console.
- **Scrolling**: The scrollbar stays below the header, and new pages start at the top.

## 0.1.0

### Minor Changes

- **First release**: Review your edits in the browser.
  - Organizations with members and roles (owner, admin, member, reviewer). Invite people by e-mail or invite link, to the whole organization or to a single project or timeline.
  - Projects, timelines and exports: create, rename, delete and search them, as a table or as cards.
  - A player with quality selection, timecode or frames, playback speed, jumping to the previous or next marker, and fullscreen.
  - The timeline of your edit with zoom, a movie barcode and a thumbnail per shot.
  - Markers with comments, categories and colors. Filter by category, search, select several, copy and paste them, move them by timecode or frames.
  - Rename and merge categories.
  - Owners can delete their organization with everything in it.
