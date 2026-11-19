---
id: project-access
type: tour
title: Project access
status: planned
minRole: member
permission: grant.create
trigger: manual
starts: guide button in the access section of the sharing dialog
prerequisites: [may give access (`permission`)]
code:
  - packages/postpin/src/lib/components/sharing/AccessGrants.svelte
  - packages/postpin/src/lib/components/sharing/TargetInvite.svelte
---

# Project access

**Goal:** The user gives someone access to a single project or timeline only.

## Steps

1. `grants`: **Highlights:** the access list. **Text:** "Give access to just this project or timeline."
2. `invite-link`: **Highlights:** the invite link. **Text:** "Invite people directly to this project."

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
