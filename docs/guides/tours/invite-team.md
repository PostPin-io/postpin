---
id: invite-team
type: tour
title: Inviting your team
status: planned
minRole: admin
permission: invitation.create
trigger: manual
starts: guide button next to the invite button of the members settings
prerequisites: [may invite (`permission`)]
code:
  - packages/postpin/src/routes/(root)/organizations/[organization]/settings/members/+page.svelte
---

# Inviting your team

**Goal:** The user invites people into the organization with the right role.

## Steps

1. `invite`: **Highlights:** the invite button. **Text:** "Invite people by email or with an invite link."
2. `roles`: **Highlights:** the role selector. **Text:** "Reviewer, Member or Admin: each can do more than the one before."

## Success feedback

- At the end: "✓ Inviting your team: done"

## Notes

- Popover copy is a draft.
- Roles: inviting into the **organization** is `invitation.create` on the organization, which
  only org-wide roles (Admin and Owner) have: a member has no grant on the organization itself.
  Members invite into a project or timeline instead, that is the
  [project-access](project-access.md) tour. The role selector offers Reviewer, Member and Admin,
  never Owner (`INVITE_ROLES`), and nothing above the inviter's own role (`canInviteAs`).
