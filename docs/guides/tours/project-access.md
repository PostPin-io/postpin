---
id: project-access
type: tour
title: Project access
status: implemented
minRole: member
permission: grant.create
trigger: manual
starts: guide button in the "Invitations" dialog of a project or timeline · from PostPin Guides: the latest project the user may give access to (`getGuideStart`), where `open` opens the dialog
prerequisites: [may give access (`permission`)]
code:
  - packages/postpin/src/lib/components/guides/tours/project-access.ts
  - packages/postpin/src/lib/components/guides/GuideHost.svelte
  - packages/postpin/src/lib/components/guides/guides.remote.ts
  - packages/postpin/src/lib/components/layout/Breadcrumbs.svelte
  - packages/postpin/src/lib/components/sharing/SharingSetupModal.svelte
  - packages/postpin/src/lib/components/sharing/AddPeople.svelte
  - packages/postpin/src/lib/components/sharing/AccessGrants.svelte
  - packages/postpin/src/lib/components/sharing/InviteLinks.svelte
---

# Project access

**Goal:** The user gives someone access to a single project or timeline only.

## Steps

1. `open` (click): **Highlights:** the Invitations button of the project in the breadcrumbs.
   **Title:** "Invitations". **Text:** "Who can open this project, and who joins. Open the
   invitations with [user-group]." Left out when the dialog is open already (started from its
   guide button).
2. `add`: **Highlights:** the "Add people" field. **Title:** "Add people". **Text:** "Type a name
   from your organization, or an e-mail address to invite someone new."
3. `access-tab` (click): **Highlights:** the "Access" tab. **Title:** "Who has access". **Text:**
   "See who can open it."
4. `grants` (inert): **Highlights:** the access list. **Title:** "People with access". **Text:**
   "They get access to just this project or timeline."
5. `links-tab` (click): **Highlights:** the "Invite links" tab. **Title:** "Invite links".
   **Text:** "Or invite with a link."
6. `invite-link`: **Highlights:** the invite links. **Title:** "One link per role". **Text:** "Turn
   it on, copy it and send it. Anyone with the link joins with its role."
7. `done` (done): **Completion card. Title:** "✓ Project access". **Text:** "You know how people
   get in. Restart this tour under PostPin Guides."

## Success feedback

- `done` is the confirmation: "✓ Project access" (no separate toast).

## Notes

- Popover copy is a draft.
- Roles: giving access is `grant.create` (Member and up, on a project or timeline they have a
  grant on; admins everywhere) and an invite link needs `inviteLink.create`. This is how members
  invite people: into the organization only admins do ([invite-team](invite-team.md)).
  Removing access is limited to what the user gave themselves (`grant.delete` is "own" for a member,
  all for an admin), so the tour only explains adding, never removing. Whoever can't open the
  Invitations dialog (a reviewer) has no guide button.
- Guide button: next to the title of the Invitations dialog, only for projects and timelines (the
  dialog of the whole organization has none).
- The dialog has three tabs and opens on "Add people". `access-tab` and `links-tab` let the user
  switch tabs themselves (Your turn), so the next step's element is on screen. If the user switches
  to another tab on their own, the step waits for its element (README: missing element).
