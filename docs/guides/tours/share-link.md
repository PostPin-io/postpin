---
id: share-link
type: tour
title: Share links
status: implemented
minRole: member
permission: shareLink.create
trigger: manual
starts: guide button next to the share button of the export in the breadcrumbs (review page) · from PostPin Guides: the latest export the user may share (`getGuideStart`)
prerequisites: [may create share links for the export (`permission`)]
code:
  - packages/postpin/src/lib/components/guides/tours/share-link.ts
  - packages/postpin/src/lib/components/guides/GuideHost.svelte
  - packages/postpin/src/lib/components/guides/GuideButton.svelte
  - packages/postpin/src/lib/components/layout/Breadcrumbs.svelte
  - packages/postpin/src/lib/components/sharing/share-links/
---

# Share links

**Goal:** The user creates a share link so people without an account can review.

## Steps

Each step is a popover on one highlighted element; the rest is dimmed and can't be used. The user
does the real thing (opens the dialog, saves the link); the tour follows.

1. `open` (click): **Highlights:** the share button of the export in the breadcrumbs. **Title:**
   "Share this export". **Text:** "Send it to people without a PostPin account. Open the share
   links."
2. `new` (appears: goes on once the form is open): **Highlights:** the + button of the share links.
   **Title:** "Share links". **Text:** "Anyone with a link can watch and leave markers. Create one
   with +." Skipped by itself when the form opens right away (no links yet).
3. `panels` (next): **Highlights:** panel layout and note of the form. **Title:** "What guests
   see". **Text:** "Switch the timeline and marker panels on or off. The note shows in their
   player."
4. `expiry` (next): **Highlights:** the expiry options. **Title:** "How long it works". **Text:**
   "You can renew or revoke the link anytime."
5. `save` (click): **Highlights:** the save button. **Title:** "Create the link". **Text:** "Save
   it."
6. `copy` (click): **Highlights:** the copy button of the new link. **Title:** "Send it". **Text:**
   "Copy the link and send it to your reviewer."
7. `done` (done): **Completion card. Title:** "✓ Your share link is ready". **Text:** "Paste it
   anywhere. A QR code and e-mail are right next to it. Restart this tour under PostPin Guides."
   **Button:** "Done". The tour disappears; the sharing dialog stays open with the new link.

## Success feedback

- `done` is the confirmation: "✓ Your share link is ready" (no separate toast).

## Notes

- Guide button: a `graduation-cap` button in the tour style right next to the share button of the
  export, tooltip "Tour: Share links". Only where the share button is: share links need
  `shareLink.create` (Member and up, on the export's project or timeline), so a reviewer gets
  no button, and on the PostPin Guides page the row is greyed out: "Needs the Member role".
- Escape and clicks outside are blocked, so the sharing dialog can't be closed during the tour.
- After a reload the tour is paused; its guide button starts it again at `open`.
