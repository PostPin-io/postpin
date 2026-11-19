---
id: postpin-guides
type: tour
title: PostPin Guides
status: implemented
audience: editor
trigger: automatic
starts: automatically, once per user, once first-upload is completed or skipped, or for someone who can't do it (no right to create projects); new accounts right after first-upload, existing accounts on their next visit; also from the PostPin Guides page
prerequisites: []
code:
  - packages/postpin/src/lib/components/guides/tours/postpin-guides.ts
  - packages/postpin/src/lib/components/guides/GuideHost.svelte
  - packages/postpin/src/lib/components/layout/Header.svelte
  - packages/postpin/src/routes/(root)/guides/+page.svelte
---

# PostPin Guides

**Goal:** The user understands the guide system and can use it on their own:

- what **tutorials** are (the essentials, step by step, full screen) and that they start by
  themselves when they are needed,
- what **tours** are (one feature, right where it is) and how to start one when they come across
  it: the **guide button** with the graduation cap next to a feature,
- where **all guides** are listed (PostPin Guides in the account menu), how to find one there and
  start it again,
- how to **switch guides off** (and on again).

This is the one tour that starts on its own (see rule 4 in the [README](../README.md)): without
it, nobody would know the guide buttons are there.

## Steps

The tour starts where the user is (any page with the header) and ends on the PostPin Guides page:
the explanations of tutorials, tours and the switch point at the real thing there.

1. `welcome` (next): **Centered card**, nothing highlighted. **Title:** "Welcome to PostPin Guides".
   **Text:** "PostPin shows you around with tutorials and tours. This takes a minute." **Button:**
   "Show me".
2. `menu` (appears: goes on as soon as the menu is open, also if it was open already):
   **Highlights:** the account menu button in the header. **Title:** "Your account menu".
   **Text:** "All guides are in your account menu. Open it."
3. `page` (click): **Highlights:** the "PostPin Guides" entry in the open account menu.
   **Title:** "PostPin Guides". **Text:** "Open PostPin Guides." Clicking it opens the PostPin
   Guides page; the tour goes on there.
4. `tutorials` (next): **Highlights:** the tutorials column. **Title:** "Tutorials". **Text:**
   "They teach the basics step by step and start on their own when you need them."
5. `tours` (next): **Highlights:** the tours column. **Title:** "Tours". **Text:** "They explain one
   feature, right where it is. Start one with [guide button] next to the feature; it disappears
   once you're done."
6. `start` (next): **Highlights:** the button of the first row in the tours column. **Title:**
   "Start again". **Text:** "Start any guide again here."
7. `filter` (next): **Highlights:** the text filter and the "Not completed" button. **Title:** "Find
   a guide". **Text:** "Filter by topic, or show only what you haven't completed."
8. `switch` (next): **Highlights:** the "Guides on/off" switch. **Title:** "Switch guides off".
   **Text:** "Nothing starts on its own and the guide buttons disappear. You can still start guides
   here."
9. `done` (done): **Completion card. Title:** "✓ You know your way around". **Text:** "Tutorials
   come by themselves, tours wait for you: look out for [guide button]. All guides are under
   PostPin Guides." **Button:** "Done".

## Success feedback

- `done` is the confirmation: "✓ You know your way around".

## Anchors

| Step        | Element                                              | Where                               |
| ----------- | ---------------------------------------------------- | ----------------------------------- |
| `welcome`   | none (centered card)                                 |                                     |
| `menu`      | account menu button (desktop) / menu button (phones) | `layout/Header.svelte`              |
| `page`      | "PostPin Guides" entry of the account menu           | `layout/Header.svelte`              |
| `tutorials` | tutorials column (heading and rows)                  | `routes/(root)/guides/+page.svelte` |
| `tours`     | tours column (heading and rows)                      | `routes/(root)/guides/+page.svelte` |
| `start`     | button of the first row of the tours column          | `routes/(root)/guides/+page.svelte` |
| `filter`    | text filter together with the "Not completed" button | `routes/(root)/guides/+page.svelte` |
| `switch`    | the "Guides on/off" switch                           | `routes/(root)/guides/+page.svelte` |

## Notes

- Started on the PostPin Guides page itself (from its row there): `menu` and `page` are left out,
  it goes from `welcome` straight to `tutorials`.
- The rows and buttons highlighted in steps 4–8 are only explained, not used: "Next" moves on
  (clicking "Start" there would start another guide in the middle of this one).
- The guide button in step 5 is shown inside the card text as the real icon in the tour style, so
  the user recognizes it later.
- On phones the account menu is the mobile menu; `menu` highlights that button instead, and the
  two columns of the page are below each other: `tours` scrolls into view.
- If the filter or "Not completed" hides the tours column's rows, `start` highlights the empty
  column instead (or is left out).
- The account menu stays open only while it has the focus: presses on the dimming and on the
  tour card don't take the focus away (see "How a tour behaves" in the README).
- Existing accounts get it as well (it explains a new system), so the migration must not mark it
  completed for them.
- While guides are switched off it doesn't start (rule 5); it can still be started from the
  PostPin Guides page.

## Tour engine features it uses

- `welcome`: `centered` (a card without element, with Next) and `nextLabel: "Show me"`.
- `menu`, `page`: `skipIf` on the PostPin Guides page.
- `tutorials` … `switch`: `waitForElement` (they come after the navigation to the page) and `inert`
  (only explained, clicks on them are blocked).
- `start`: `optional` (left out when the tours column has no rows).
- `tours`, `done`: `{guide-button}` in the text, rendered as the real icon.
