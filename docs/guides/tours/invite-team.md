---
id: invite-team
type: tour
title: Inviting your team
status: implemented
minRole: admin
trigger: manual
starts: guide button next to "Invite by E-Mail" in the members settings · from PostPin Guides: the members settings of the active organization (`getGuideStart`)
prerequisites: [may invite into the organization (Admin and up)]
code:
  - packages/postpin/src/lib/components/guides/tours/invite-team.ts
  - packages/postpin/src/lib/components/guides/GuideHost.svelte
  - packages/postpin/src/lib/components/guides/guides.remote.ts
  - packages/postpin/src/routes/(root)/organizations/[organization]/settings/members/+page.svelte
  - packages/postpin/src/lib/components/sharing/InviteLinks.svelte
---

# Inviting your team

**Goal:** The user invites people into the organization with the right role.

## Steps

1. `invite`: **Highlights:** the invite form. **Title:** "Invite by e-mail". **Text:** "Invite
   people into your organization by e-mail."
2. `roles` (inert): **Highlights:** the role selector. **Title:** "Their role". **Text:**
   "Reviewer, Member or Admin: each can do more than the one before."
3. `links`: **Highlights:** the invite links. **Title:** "Invite links". **Text:** "Or send a link:
   one per role. Turn it on, copy it and send it."
4. `done` (done): **Completion card. Title:** "✓ Inviting your team". **Text:** "You know both ways
   in. Restart this tour under PostPin Guides."

## Success feedback

- `done` is the confirmation: "✓ Inviting your team" (no separate toast).

## Notes

- Popover copy is a draft.
- Roles: inviting into the **organization** is `invitation.create` on the organization, which
  only org-wide roles (Admin and Owner) have: a member has no grant on the organization itself.
  That's why the guide has no `permission`: in the matrix `invitation.create` is a Member right
  (on their projects), so the test of rule 17 would demand Member.
  Members invite into a project or timeline instead, that is the
  [project-access](project-access.md) tour. The role selector offers Reviewer, Member and Admin,
  never Owner (`INVITE_ROLES`), and nothing above the inviter's own role (`canInviteAs`).
- The same can be done without leaving the page: admins and owners have an "Invitations" button
  next to the organization name in the header. It opens the Invitations dialog for the whole
  organization (tabs "Add people" with e-mail only, "Invite links", "Access"). The tour stays on
  the members settings, where everything is visible at once.
- Invite links: turning one off stops it for good; turning it on again gives a new URL. `links`
  doesn't explain that, the buttons say what they do.
