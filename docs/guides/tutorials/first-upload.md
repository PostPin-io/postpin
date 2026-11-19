---
id: first-upload
type: tutorial
title: Your first upload
status: implemented
audience: editor
trigger: automatic
starts: automatically on the dashboard for a fresh account (no organization yet) or someone who may create projects in the active organization; or from the PostPin Guides page
prerequisites: [no organization yet, or may create projects in the active organization]
code:
  - packages/postpin/src/lib/components/guides/tutorials/FirstUploadTutorial.svelte
  - packages/postpin/src/lib/components/guides/GuideHost.svelte
  - packages/postpin/src/lib/components/exports/UploadModal.svelte
  - packages/postpin/src/lib/components/organizations/create-org.ts
---

# Your first upload

**Goal:** The user has a project with a timeline and an uploaded export, ready for review.

## Steps

Full screen on the dashboard. Step and created ids (`projectId`, `timelineId`, `exportId`) are stored
on every step, so a reload goes on where the user left off.

1. `welcome`: "Welcome to PostPin": the account is ready. **Done when:** "Let's go".
2. `create-organization`: Name the organization (suggested: "<first name>'s Studio"); it becomes the
   active one. Left out for someone already in an organization. **Done when:** it is created.
3. `create-project`: Name the project (suggested: "My First Project"). **Done when:** it is created.
4. `create-timeline`: Name the timeline (suggested: "Main Edit"). **Done when:** it is created.
5. `upload-export`: Choose a video in the upload dialog. **Done when:** the upload has started.
6. `processing`: Upload progress, then the confirmation. This is the completion screen. **Done
   when:** "Open your export" (also possible while uploading); the tutorial closes at once, the
   review page opens and the tutorial is stored as completed.

"Skip tutorial" in the header asks once for confirmation ("Skip this tutorial? You can start it
again under PostPin Guides in the account menu.").

## Success feedback

- After `create-organization`: "✓ Organization created"
- `processing`, once uploaded: "✓ Export uploaded, processing has started"

## Notes

- Existing accounts (before PostPin Guides) are marked as completed by the migration.
- Not yet: choosing the plugin path at `welcome` ([plugin-workflow](plugin-workflow.md)), offering an
  existing project to people who joined an organization with projects in it.
- An interrupted or cancelled upload goes back to `upload-export` ("Upload again").
- Doesn't start while guides are switched off on the PostPin Guides page; can still be started
  there by hand. The [postpin-guides](../tours/postpin-guides.md) tour follows it.
