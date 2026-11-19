---
id: share-link
type: tour
title: Share links
status: implemented
audience: editor
starts: automatically on the review page of an export the user may share, once first-upload isn't running; or after starting it on the PostPin Guides page
prerequisites: [may create share links for the export]
code:
  - packages/postpin/src/lib/components/guides/tours/share-link.ts
  - packages/postpin/src/lib/components/guides/GuideHost.svelte
  - packages/postpin/src/lib/components/layout/Breadcrumbs.svelte
  - packages/postpin/src/lib/components/sharing/share-links/
---

# Share links

**Goal:** The user creates a share link so people without an account can review.

## Steps

Each step is a popover on one highlighted element; the rest is dimmed and can't be used. The user
does the real thing (opens the dialog, saves the link); the tour follows.

1. `open` (click): **Highlights:** the share button of the export in the breadcrumbs. **Text:** "Send
   this export to people who don't have a PostPin account. Open the share links here."
2. `new` (appears: goes on once the form is open): **Highlights:** the + button of the share links.
   **Text:** "Anyone with a share link can watch this export and leave markers, without an account.
   Create a new link with +." Skipped by itself when the form opens right away (no links yet).
3. `panels` (next): **Highlights:** panel layout and note of the form. **Text:** "Choose the panels
   guests get: the timeline, the markers, or just the video. Click a panel to switch it on or off.
   The note is shown in the player."
4. `expiry` (next): **Highlights:** the expiry options. **Text:** "Pick how long the link works. You
   can renew or revoke it anytime."
5. `save` (click): **Highlights:** the save button. **Text:** "Save the link to create it."
6. `copy` (click): **Highlights:** the copy button of the new link. **Text:** "Copy the link and send
   it to your reviewer."
7. `done` (done): **Completion card. Title:** "✓ Your share link is ready". **Text:** "It's copied,
   paste it anywhere. Next to it you can also show a QR code or send it by e-mail. You can start
   this tour again under PostPin Guides in the account menu." **Button:** "Done". The tour disappears; the
   sharing dialog stays open with the new link.

## Success feedback

- `done` is the confirmation: "✓ Your share link is ready" (no separate toast).

## Notes

- Reviewers can't create share links: the share button is missing, so the tour never shows for them.
- Escape and clicks outside are blocked, so the sharing dialog can't be closed during the tour.
- After a reload the tour starts again at `open` (it is short; the stored step is informational).
