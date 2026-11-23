---
id: project-access
type: tour
title: Project access
status: planned
minRole: member
permission: grant.create
trigger: manual
starts: guide button in the "Invitations" dialog of a project or timeline
prerequisites: [may give access (`permission`)]
code:
  - packages/postpin/src/lib/components/sharing/SharingSetupModal.svelte
  - packages/postpin/src/lib/components/sharing/AddPeople.svelte
  - packages/postpin/src/lib/components/sharing/AccessGrants.svelte
  - packages/postpin/src/lib/components/sharing/InviteLinks.svelte
---

# Project access

**Goal:** The user gives someone access to a single project or timeline only.

## Steps

1. `add`: **Highlights:** the "Add people" field. **Text:** "Type a name from your organization, or an e-mail address to invite someone new."
2. `access-tab` (click): **Highlights:** the "Access" tab. **Text:** "See who can open it."
3. `grants`: **Highlights:** the access list. **Text:** "They get access to just this project or timeline."
4. `links-tab` (click): **Highlights:** the "Invite links" tab. **Text:** "Or invite with a link."
5. `invite-link`: **Highlights:** the invite links. **Text:** "One link per role. Turn it on, copy it and send it."

## Success feedback

- At the end: "✓ Project access: done"

## Notes

- Popover copy is a draft.
- Roles: giving access is `grant.create` (Member and up, on a project or timeline they have a
  grant on; admins everywhere) and an invite link needs `inviteLink.create`. This is how members
  invite people: into the organization only admins do ([invite-team](invite-team.md)).
  Removing access is limited to what the user gave themselves (`grant.delete` is "own" for a member,
  all for an admin), so the tour only explains adding, never removing. Whoever can't open the
  Invitations dialog (a reviewer) has no guide button.
- The dialog has three tabs and opens on "Add people". `access-tab` and `links-tab` let the user
  switch tabs themselves (Your turn), so the next step's element is on screen. If the user switches
  to another tab on their own, the step waits for its element (README: missing element).
