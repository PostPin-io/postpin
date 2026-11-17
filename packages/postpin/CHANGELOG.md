# @postpin-io/postpin

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
