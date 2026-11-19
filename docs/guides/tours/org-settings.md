---
id: org-settings
type: tour
title: Organization settings
status: planned
minRole: admin
permission: organization.updateSettings
trigger: manual
starts: guide button in the header of the organization settings
prerequisites: [may change organization settings (`permission`)]
code:
  - packages/postpin/src/routes/(root)/organizations/[organization]/settings/+page.svelte
---

# Organization settings

**Goal:** The user knows where to manage the organization.

## Steps

1. `general`: **Highlights:** the general settings. **Text:** "The basics of your organization."
2. `members`: **Highlights:** the members section. **Text:** "Who is in the organization and with which role."
3. `storage`: **Highlights:** the storage overview. **Text:** "How much storage your media uses."

## Success feedback

- At the end: "✓ Organization settings: done"

## Notes

- Popover copy is a draft.
- Roles: changing the settings is `organization.updateSettings` (Admin and up). Renaming and
  deleting the organization is the owner's alone (`organization.rename`/`delete`), so `general`
  doesn't mention the name; an owner-only step about it would be **optional**. In `members` an
  admin changes roles and removes people (`member.updateRole`/`remove`), never above their own
  role. Members and reviewers can open the settings but have no guide button here.
