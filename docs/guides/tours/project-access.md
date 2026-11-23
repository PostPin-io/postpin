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

1. `add`: **Highlights:** the "Add people" field. **Text:** "Type a name from your organization or an e-mail address to invite someone new."
2. `grants`: **Highlights:** the access list. **Text:** "They get access to just this project or timeline."
3. `invite-link`: **Highlights:** the invite link. **Text:** "Invite people directly to this project. Each role has its own link."

## Success feedback

- At the end: "✓ Project access: done"

## Notes

- Popover copy is a draft.
- Roles: giving access is `grant.create` (Member and up, on a project or timeline they have a
  grant on; admins everywhere) and an invite link needs `inviteLink.create`. This is how members
  invite people: into the organization only admins do ([invite-team](invite-team.md)).
  Removing access is limited to what the user gave themselves (`grant.delete` is "own" for a member,
  all for an admin), so the tour only explains adding, never removing. Whoever has no access
  section (a reviewer) has no guide button.
