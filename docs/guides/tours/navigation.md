---
id: navigation
type: tour
title: Finding your way
status: implemented
audience: editor
trigger: manual
starts: guide button next to the dashboard button (logo and organization name) in the header, on every page with the header · from PostPin Guides: right there (its first step is in the header)
prerequisites: [at least one export in the active organization that the user can open]
code:
  - packages/postpin/src/lib/components/guides/tours/navigation.ts
  - packages/postpin/src/lib/components/guides/guides.remote.ts
  - packages/postpin/src/lib/components/layout/Header.svelte
  - packages/postpin/src/lib/components/layout/Breadcrumbs.svelte
  - packages/postpin/src/routes/(root)/dashboard/+page.svelte
  - packages/postpin/src/routes/(root)/projects/[project]/+page.svelte
  - packages/postpin/src/routes/(root)/projects/[project]/timelines/[timeline]/exports/+page.svelte
---

# Finding your way

**Goal:** The user can move around their organization on their own: from the dashboard through a
project and a timeline to an export, create projects and timelines, find things with search, sort
and the two views, and jump around with the breadcrumbs. (Sharing is not part of it, see
[share-link](share-link.md).)

## Steps

The tour walks down the real hierarchy: dashboard → project → timeline (its exports) → export.
Each "open" step is a real click into the user's own first item; the steps after it wait for the
next page (`waitForElement`). Everything only explained is `inert`.

1. `go-home` (click; left out on the dashboard): **Highlights:** the dashboard button in the header
   (logo and organization name). **Title:** "Your dashboard". **Text:** "Click here to go home,
   from anywhere."
2. `home` (next; waits for the dashboard): **Highlights:** the dashboard button. **Title:** "Your
   home". **Text:** "It shows the organization you're in. You switch organizations in your account menu."
3. `projects` (next): **Highlights:** the project list. **Title:** "Projects". **Text:** "One
   project per production: a film, a series, a commercial."
4. `new-project` (next; optional: only for those who may create projects): **Highlights:** the +
   button next to "Your Projects". **Title:** "New project". **Text:** "This is where you create a project."
5. `search` (next): **Highlights:** the search field. **Title:** "Search". **Text:** "Finds a project by name."
6. `sort` (next): **Highlights:** the sort options. **Title:** "Sort". **Text:** "By name, creation
   or last change."
7. `views` (next; optional: not on phones, where it's always cards): **Highlights:** the
   Table/Cards switch. **Title:** "Cards or table". **Text:** "Cards show thumbnails, the table is
   compact."
8. `open-project` (click): **Highlights:** the first project (card or row). **Title:** "Open a
   project". **Text:** "Click it to see its timelines."
9. `timelines` (next; waits for the project page): **Highlights:** the timeline list. **Title:**
   "Timelines". **Text:** "One timeline per sequence you edit. Search, sort and views work as on
   the dashboard."
10. `new-timeline` (next; optional: only for those who may create timelines): **Highlights:** the
    - button next to "Your Timelines". **Title:** "New timeline". **Text:** "This is where you add a timeline."
11. `open-timeline` (click): **Highlights:** the first timeline. **Title:** "Open a timeline".
    **Text:** "Click it to see its exports."
12. `exports` (next; waits for the export list): **Highlights:** the export list. **Title:**
    "Exports". **Text:** "Every render you upload is an export. Dropping a video on the page adds the next version."
13. `open-export` (click): **Highlights:** the first export. **Title:** "Open an export".
    **Text:** "Click it to review it."
14. `breadcrumbs` (next; waits for the review page): **Highlights:** the breadcrumbs in the header.
    **Title:** "Where you are". **Text:** "Each name takes you back up to that level." On phones:
    **Highlights:** the back button instead; **Text:** "This takes you one level up."
15. `switcher` (next): **Highlights:** the arrow next to the timeline in the breadcrumbs.
    **Title:** "Jump sideways". **Text:** "Switch to another timeline without going back."
16. `done` (done): **Completion card. Title:** "✓ You know your way around". **Text:** "Next: share
    an export with the button next to it." **Button:** "Done".

## Success feedback

- `done` is the confirmation: "✓ You know your way around".

## Anchors

| Step              | Element                                          | Where                                                                        |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `go-home`, `home` | dashboard button (logo, organization name)       | `layout/Header.svelte`                                                       |
| `projects`        | project list (cards or table)                    | `routes/(root)/dashboard/+page.svelte`                                       |
| `new-project`     | + next to "Your Projects"                        | `routes/(root)/dashboard/+page.svelte`                                       |
| `search`          | "Search projects"                                | `routes/(root)/dashboard/+page.svelte`                                       |
| `sort`            | sort options                                     | `routes/(root)/dashboard/+page.svelte`                                       |
| `views`           | Table/Cards switch                               | `routes/(root)/dashboard/+page.svelte`                                       |
| `open-project`    | first project card or row                        | `routes/(root)/dashboard/+page.svelte`                                       |
| `timelines`       | timeline list                                    | `routes/(root)/projects/[project]/+page.svelte`                              |
| `new-timeline`    | + next to "Your Timelines"                       | `routes/(root)/projects/[project]/+page.svelte`                              |
| `open-timeline`   | first timeline card or row                       | `routes/(root)/projects/[project]/+page.svelte`                              |
| `exports`         | export list                                      | `routes/(root)/projects/[project]/timelines/[timeline]/exports/+page.svelte` |
| `open-export`     | first export card or row                         | same                                                                         |
| `breadcrumbs`     | breadcrumb list (desktop) / back button (phones) | `layout/Breadcrumbs.svelte`                                                  |
| `switcher`        | "Switch timeline" arrow                          | `layout/Breadcrumbs.svelte`                                                  |

## Notes

- **Guide button:** next to the dashboard button in the header, so it can be found from anywhere;
  the tour starts with `go-home` unless the user is on the dashboard already.
- **Prerequisite:** the tour walks into real items, so it needs at least one project with a
  timeline and an export. Without one, the guide button isn't shown (the first-upload tutorial
  creates them). The `open-*` steps pick the first item that leads further.
- **Leaving the path:** the "open" steps only allow the highlighted item, so the user can't get
  lost; if they navigate back with the browser anyway, the tour goes back to the step whose
  element is there (or pauses on another page).
- **Search:** a search typed before the tour started could hide the item to open; then the tour
  goes back to the step before. Not handled yet (the search would have to be cleared at the
  start).
- **Phones:** cards only (`views` left out); breadcrumbs show just the current level and a back
  button, `breadcrumbs` explains that instead; `switcher` highlights the down arrow next to the
  current name.
- **Organization switching** is only mentioned (`home`), not walked through: it lives in the
  account menu and changes the whole dashboard.
- **Not part of this tour:** sharing and invitations (share buttons in the breadcrumbs and the
  project/timeline menus), renaming and deleting (the actions menus of the items).

## How it is built

- `spansPages`: the tour isn't paused by its own navigation (other manual tours pause when the
  user leaves the page).
- `go-home` and `home` point at the same element: `data-guide` takes several ids separated by
  spaces.
- `breadcrumbs` and `back` are the two screen-size variants, each `skipIf` the other size.
- `switcher`: the arrow of the timeline crumb on desktop, of the export crumb on phones (only the
  current level is shown there); both carry the anchor, the visible one is used.
- `open-project` / `open-timeline` mark the first item that leads on to an export (a project
  with a timeline that has one, a timeline that has one); `open-export` the first export.
- Prerequisite: `getGuideAvailability()` tells the guide button whether an export the user may
  open exists in the active organization; without one there is no button.
