# PostPin Guides

PostPin Guides are the in-app help system: **tutorials** teach the essential mechanics step by step,
**tours** explain a single feature. This folder is the source of truth for what every guide does. It
grows with the product: whenever a feature or its UI changes, the affected guides are updated here in
the same change, and the implementation follows these files (by hand or with AI).

```
docs/guides/
├── README.md        system and rules (this file)
├── tutorials/       one file per tutorial
│   └── _template.md
└── tours/           one file per tour
    └── _template.md
```

## Tutorials and tours

|              | Tutorial                                                   | Tour                                                      |
| ------------ | ---------------------------------------------------------- | --------------------------------------------------------- |
| Purpose      | Learn the essential mechanics of PostPin, step by step     | Learn a single feature                                    |
| Interaction  | Interactive: the user performs each step, the guide reacts | Popovers next to the relevant UI elements                 |
| Presentation | Usually takes up the whole screen                          | Everything except the relevant area is dimmed (spotlight) |
| Start        | Automatically, as soon as its prerequisites are met        | Manually, with the guide button at its feature (¹)        |
| Icon         | `graduation-cap` (lucide)                                  | `graduation-cap` (lucide)                                 |
| Style        | One shared style for all tutorials: `primary`              | One shared style for all tours: `accent`                  |
| Input        | Only the tutorial screen (and dialogs it opens)            | Only the highlighted element and the tour card            |
| Ending       | Completion screen, then the tutorial closes                | Completion card, then the tour disappears entirely        |

(¹) Exception: the [postpin-guides](tours/postpin-guides.md) tour starts automatically, see rule 4.

Rule of thumb: if you can't work with PostPin meaningfully without it, it's a **tutorial**. If it's a
feature you can discover later, it's a **tour**.

## Rules

1. **Icon:** guides as such are lucide `graduation-cap`, nothing else (guide button, tour and
   tutorial cards, the PostPin Guides page). Only the rows on the PostPin Guides page also show an
   icon for what each guide is about (`GUIDE_ICONS` on that page, one per guide), in the guide's
   style.
2. **Style:** all tutorials look alike (daisyUI `primary`), all tours look alike (daisyUI `accent`).
   The color tells tutorial from tour, not one guide from another. Never `secondary`.
3. **Tutorials start automatically:** they are essential, so each starts on its own as soon as its
   prerequisites are met (e.g. first-upload on the dashboard of a fresh account). Only one guide
   runs at a time; tutorials go first. Where the right tutorial depends on the user, PostPin asks
   once instead: the install tutorials start from the plugin question on the first visit to an
   export list ([plugin-workflow](tutorials/plugin-workflow.md#the-plugin-question)); "No, thanks"
   (confirmed once, rule 7) skips them.
4. **Tours start manually,** with a **guide button** at the feature they explain: a small
   `graduation-cap` button in the tour style (`accent`), right next to the element the tour's first
   step highlights (e.g. next to the share button of an export). It shows while the tour is not
   started, or started but not finished; it disappears once the tour is completed or skipped (from
   then on it starts again only from the PostPin Guides page). Its tooltip names the tour
   ("Tour: Share links"). It is only there for users who may use the feature (no button for a
   reviewer at a feature only members have). Where users look for help elsewhere than at the
   first step's element, the button may sit there instead (marker-ranges: next to the shortcut
   hint of the timeline); the tour file says so.
   **Exception:** the [postpin-guides](tours/postpin-guides.md) tour explains the guide system
   itself (guide buttons, the PostPin Guides page, switching guides off), so it starts
   automatically, once per user, but always after the first tutorial: only once first-upload is
   completed or skipped, or for someone who can't do it (in an organization without the right to
   create projects). For a new account that is right after first-upload, for an existing account
   its next visit.
5. **Guides can be switched off** on the PostPin Guides page, for the user, all at once: then no
   tutorial and no tour starts on its own and no guide button is shown. A guide that is running
   when they are switched off disappears at once and stays "in progress". The PostPin Guides page
   itself keeps working: any guide can still be started there by hand, and guides can be switched
   on again. The setting is stored per user (default: on).
6. **One action at a time:** while a guide runs, only what the current step is about can be used.
   A step highlights exactly the element of its action (the play button, the title field), not
   the area around it: everything inside the highlighted element works, so a bigger element would
   let the user do something else (e.g. open the category settings in the marker editor) and the
   guide would wait for an action that never comes.
   A tour blocks clicks, keyboard focus and shortcuts everywhere except on the highlighted element
   and the tour card; Escape does nothing (it neither closes a dialog nor the tour). Scrolling stays
   possible. The tour card is no dialog for the page's shortcuts: keys a step lets through work
   also while the card has the focus.
7. **Skipping is explicit:** a guide ends only by finishing it or by its "Skip" button, which asks
   once for confirmation ("Skip this tour? You can start it again under PostPin Guides in the
   account menu."). Clicking outside, Escape or closing a dialog never skips. Leaving the page
   pauses it: it stays "in progress"; a tutorial (and the postpin-guides tour) goes on by itself
   next time, any other tour from its guide button.
8. **Clean ending:** every guide ends with a completion step: a confirmation of what the user can
   do now, a pointer to PostPin Guides, and a single "Done" button. On "Done" the guide disappears
   at once (overlay, dimming, highlight; nothing may stay behind) and is stored as completed. What
   the user made along the way stays, e.g. the share link and the open dialog it is in.
9. **Success feedback:** after a meaningful step (sign-up done, upload done, sync done, link copied)
   the user gets a short positive confirmation. Each guide lists its feedback moments.
10. **Progress per user:** started, completed and skipped guides are stored per user. A completed
    or skipped guide never starts on its own again and has no guide button any more.
11. **PostPin Guides page** (`/guides`, in the account menu): the on/off switch for all guides, and
    two columns, tutorials and tours, a daisyUI `list` with one compact row per guide (the
    guide's icon, title, status, a check for completed ones, button; the description behind an
    info icon). One text filter for both columns, and a "Not completed"
    toggle that hides completed guides. Every guide can be started (again) from here, also while
    guides are switched off (below its minimum role a guide is greyed out instead, rule 17), and it
    takes the user to where its first step is: nobody has to look for the feature first (`startFrom` in `GUIDES`: a fixed page, right here, or a page the server
    finds, e.g. the latest export the user may share). With nothing to start it on (no such
    export), the row says so (`restartHint`). The `description` in `GUIDES` is that info text.
12. **Prerequisites:** a guide only starts when its prerequisites are met (e.g. the sync tutorial
    needs a connected plugin). Prerequisites are listed in the guide's frontmatter. The user's
    right to use the feature is one of them and is named by `permission` (rule 17).
13. **Guests:** guides for share-link visitors (no account) can't store progress on a user; they
    must work without it.
14. **Copy:** UI text in guides is English and addresses the user directly. A text that talks
    about a button shows its lucide icon inline, the one on the button (`icon("diamond-plus")` in
    a step text, written as [diamond-plus] in the guide files): "Add a marker with [diamond-plus]".
    The icons a text may use are listed in `STEP_ICONS` (`tour.ts`).
    A key is always shown as a key cap, the same way in every guide (`key("M")` in a step text,
    written as <kbd>M</kbd> in the guide files): "Add a marker with [diamond-plus] or <kbd>M</kbd>",
    "press <kbd>Enter</kbd>", "hold <kbd>⌥</kbd>". Labels as on the keyboard: letters in capitals,
    <kbd>Space</kbd>, <kbd>Enter</kbd>, <kbd>⌥</kbd>. Never a key as plain text. Every key a step
    lets through (`keys`) is named in its text this way, so the user sees that it works (a test
    checks both).
    Never "NLE" on screen: users don't know the word. It is **the plugin**, and where the program
    matters its name (DaVinci Resolve, Premiere Pro, Pro Tools, FilmCraft; for the last two the
    plugin is PostPin Desktop). "NLE" stays in ids and code (`NleBridge`, `open-in-nle`).
15. **As short as possible, as long as necessary.** Every tour text has to earn its place:
    - one idea per step; the title names it, the text says what to do or why it matters,
    - usually one or two short sentences (aim for 25 words at most),
    - don't describe what the highlighted element already shows, and don't repeat earlier steps,
    - longer only where the user would otherwise be stuck (e.g. a step they have to act on).
16. **Next or your turn: always clear.** In a tour the user must see at a glance whether to click
    "Next" or to use the highlighted element. Every step is one of three kinds, and the card shows
    which, the same way in every tour (`stepKind` in `tour.ts`):
    - **Look** (`next` + `inert`): the element is only explained and can't be used. The card has
      "Next". The text describes; it never asks the user to do something ("This is where you
      create a project", not "Create a project here").
    - **Try** (`next`, not inert): the element can be used, but doesn't have to be. The card has
      "Next" and the line "Try it, then click Next." The text may invite ("Switch them on or
      off").
    - **Your turn** (`click` / `appears`): the user has to use the element; there is no "Next". The
      card has a "Your turn" line with a pointer icon ("Click the highlighted element" /
      "Use the highlighted element"), and the ring around the element pulses. The text says
      exactly what to do, as an instruction ("Open the share links").

    Never mixed: a Look step doesn't ask for a click, a Your-turn step doesn't offer "Next".

17. **Roles: every guide has a minimum role.** The roles are Reviewer < Member < Admin < Owner
    (permission matrix: `lib/roles.ts`), plus guests, who have no role. A guide never teaches
    something the user can't do, never points at a button they don't have, and never stops at a
    step they can't finish. How that is kept:
    - **Every guide names its minimum role:** `minRole` in the frontmatter and in `GUIDES`, the
      lowest role in the active organization that can do the guide at all; higher roles inherit
      it. Anything with an upload needs Member (a reviewer can't upload), sharing too; organization
      settings need Admin. Reviewer means everyone with an account.
    - **And the right it is about:** `permission`, the `area.action` of the matrix (e.g.
      `shareLink.create`). `minRole` must be the lowest role with that right; a test checks it
      (`lowestRoleWith`), so the two can't drift apart when the matrix changes. Where the right
      also depends on the target (the export's project or timeline grant), that check runs on the
      target, like the share-link guide button and `getGuideStart` do.
    - **Below the minimum role:** no guide button (rule 4), no automatic start (rule 3), and it
      can't be started by hand either. On the PostPin Guides page the row stays, greyed out, with
      a lock and "Needs the <role> role" instead of its status, and its button disabled; its info
      says which role the user has. So everyone sees what PostPin has to offer and what to ask for
      (`roleCanDo` in `lib/guides.ts`).
    - **No organization yet:** there is no role. Only guides for everyone (minimum Reviewer) and
      the one that creates the organization (first-upload, `withoutOrganization`) can be done.
    - **Role yes, target not (yet):** when the role has the right but nothing to use it on (no
      export the user may share, no project with a grant), the row stays on the PostPin Guides
      page and says what's missing (`restartHint`), and there is no guide button until there is a
      target.
    - **Write for the minimum role,** and make what higher roles can do on top
      **optional** steps (`optional: true`, see "How a tour behaves"), like "New project" in the
      navigation tour or the presets in categories. An optional step is left out when its element
      isn't there, so the same tour fits every role that gets it. Name the right of each optional
      step in the guide file ("optional: only for those who may …").
    - **No claims about rights that differ by role:** "You can …" is fine for what every role from the
      minimum up can do; for anything else a text says what the element does, never what "admins"
      or "members" can do. Never offer what nobody can choose (nobody is invited as Owner).
    - **Own versus all:** a reviewer changes only their own markers and categories, a member all
      (`onlyOwn`). A guide that has the user change something does so on a thing the user creates
      in the guide, never on an existing one that may not be theirs.
    - **Next guide:** a tutorial or tour that suggests another guide only suggests one the user may
      use (first-review's completion card points to the guide buttons in general, not to the
      share links tour a reviewer doesn't have).
    - **Guests** (rule 13) follow the same idea with the share link's settings in place of a role:
      a panel the link hides is a skipped step.

## Guide files

One Markdown file per guide, file name = guide `id` (kebab-case). Start from `_template.md` in the
respective folder.

### Frontmatter

```yaml
id: first-upload # stable, never renamed once implemented (progress is stored by id)
type: tutorial # tutorial | tour
title: Your first upload # as shown on the PostPin Guides page
status: planned # planned | in-progress | implemented
minRole: member # the lowest role that can do it at all: reviewer | member | admin | owner | guest (higher roles inherit; rule 17)
permission: project.create # the right of roles.ts (area.action) it is about; minRole is the lowest role with it. Leave out if there is none
trigger: automatic # automatic (tutorials, the postpin-guides tour) | manual (all other tours)
starts: on the dashboard after sign-up # automatic: when and where; manual: where the guide button sits
prerequisites: [] # guide ids or conditions
code: [] # files that implement the guide or the UI it explains
```

### Body

- **Goal:** one or two sentences: what the user can do afterwards.
- **Steps:** numbered, each with a stable step id in backticks, what the user sees and what
  completes the step. Step ids are stable like guide ids.
- **Success feedback:** where confirmations appear and what they say.
- **Notes:** edge cases, open questions.

### Anchors in code

UI elements a guide points at get a `data-guide="<guide-id>/<step-id>"` attribute, so guide files and
code can be matched by searching for the id.

## Implementation

All in `packages/postpin/src/`:

| What                                      | Where                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| Registry: ids, titles, type styles        | `lib/guides.ts` (`GUIDES`, `GUIDE_STYLE`)                              |
| Progress per user (`GuideProgress` table) | `lib/components/guides/guides.remote.ts`                               |
| Which guide runs where                    | `lib/components/guides/GuideHost.svelte` (in `routes/+layout.svelte`)  |
| Tutorial frame (full screen)              | `lib/components/guides/TutorialShell.svelte`                           |
| Tutorials                                 | `lib/components/guides/tutorials/<Name>Tutorial.svelte`                |
| Install tutorials (one frame, per plugin) | `tutorials/InstallTutorial.svelte`, `Install<Plugin>Tutorial.svelte`   |
| The plugin question (starts them)         | `tutorials/InstallPrompt.svelte`                                       |
| Tour engine (spotlight + popover)         | `lib/components/guides/Tour.svelte`, `tour.ts`                         |
| Tours (step lists)                        | `lib/components/guides/tours/<id>.ts`                                  |
| Tutorials on a page (tour engine)         | `lib/components/guides/tutorials/<id>.ts`, e.g. `first-review.ts`      |
| What the page reports to a guide          | `signalGuide()` in `guide-signals.svelte.ts`                           |
| Positive feedback                         | `showGuideFeedback()` in `guide-feedback.svelte.ts`                    |
| PostPin Guides page                       | `routes/(root)/guides/+page.svelte` (filter: `filter.ts`)              |
| Guide button at a feature                 | `lib/components/guides/GuideButton.svelte`: `<GuideButton guide="…">`  |
| Guides on/off per user                    | `User.guidesEnabled`, `getGuidesEnabled` / `setGuidesEnabled`          |
| State shared in the tab                   | `lib/components/guides/guide-state.svelte.ts` (started by hand, ended) |

Adding a guide: write its file here, add it to `GUIDES`, implement it (a tour is a step list plus
`data-guide` anchors). A tutorial: decide in `GuideHost` where and when it starts; existing accounts
should not be surprised by it, so mark it completed for them in the migration. A tutorial that
happens on a page of the app instead of in a screen of its own (first-review on the review page)
is a step list for the tour engine; `Tour` shows it in the tutorial style. A tour: put its guide
button next to the element of its first step.

### How a tour behaves

- **Step kinds** (rule 16): Look, Try and Your turn follow from `advance` and `inert`
  (`stepKind`); the card renders the hint and the pulsing ring from that, nothing per tour.
- **Steps advance** by `"next"` (Next button), `"click"` (the user clicks the highlighted element,
  which does what it always does), `"appears"` (as soon as the next step's element shows up) or
  `"signal"` (once the page reports that the user did it: `signalGuide(guideId, stepId)` where it
  happens, e.g. after a marker was created; only what happens after the step began counts). Use
  `"signal"` for what a click alone doesn't show: typing, saving, a choice. It is a Your-turn step.
- **Step options** (`TourStep` in `tour.ts`): `centered` (no element, a card in the middle with
  Next, e.g. a welcome), `nextLabel`, `skipIf` (left out as the tour gets to it, e.g. the way to a
  page the tour already is on), `optional` (left out when its element isn't there),
  `waitForElement` (waits instead of going back: after a navigation, or while a save or a list
  re-renders the element), `inert` (the element is only
  explained, clicks on it are blocked too), `keys` (keys that work anywhere on this step, the page's
  own shortcuts for what it asks, only those: space on the play step, M on the add-marker step;
  each one named in the text with `key()`).
  `optional` is for an element that belongs to a role or a setting (it is there or not for good);
  a step that is left out because of what the user did (the marker is a range already, the marker
  is open already) uses `skipIf` with that state. Otherwise an element that is missing for a
  moment leaves the step out, and the next one, lacking its element, goes back to an earlier step:
  a loop. `{guide-button}` in a step's text shows the guide
  button icon, `icon(name)` a lucide icon, `key(label)` a key cap (rule 14). One element can serve several steps: `data-guide="tour/one tour/two"`.
- **Tour options** (`TourDefinition`): `spansPages` for a tour whose steps navigate (otherwise a
  tour started from a guide button pauses when the user leaves the page), `desktopOnly` for a
  tour of something phones don't have (the timeline in marker-ranges): below 1024px it doesn't run.
- **Keys and text fields:** going to a step with `keys` blurs a focused text field, so the page's
  shortcuts get them instead of the field (e.g. I and O right after typing a timecode).
- **Availability:** a tour that needs something to exist (e.g. an export to walk to) reports it in
  `getGuideAvailability()`; its guide button only shows when it can run.
- **Blocking:** a transparent layer over the whole screen takes every click, except in a cut-out over
  the highlighted element. Focus is kept inside the highlighted element and the tour card; Escape
  and the app's keyboard shortcuts are swallowed. Presses on the dimming or the card don't move
  the focus, so menus that are open while focused (the account menu) stay open. The dimming is the visible part of that layer.
- **Dialogs:** overlays move into an open modal dialog when their element is in one, so they stay
  visible and clickable (`top-layer.ts`). Since Escape and clicks outside are blocked, the user
  can't close a dialog the tour is in by accident.
- **Highlight:** the cut-out is what is visible of the element: cut to its scroll containers (a
  range bar wider than the timeline is highlighted only where it can be seen). An element scrolled
  out of view completely is scrolled back in.
- **Missing element:** a step waits for its element. If it disappears anyway (e.g. the page
  re-rendered), the tour goes back to the latest earlier step whose element is there.
- **Last step:** the completion card (`advance: "done"`), centered on the screen, nothing
  highlighted, nothing blocked behind it except the dimming. "Done" stores the tour as completed
  and removes the tour immediately, without waiting for the server.
- **Start:** from its guide button (or the PostPin Guides page), always at the first step. The
  button starts it in place: the first step's element is right next to it. The PostPin Guides page
  first goes to the page of the first step (rule 11), then starts it.
- **Skip:** the "Skip tour" button in the card switches the card to a confirmation ("Skip this
  tour? You can start it again under PostPin Guides in the account menu." · "Skip" / "Continue tour").
  A tutorial on the tour engine says "tutorial" instead.
- **Style:** the guide's type decides it (`GUIDE_STYLE`): tours in `accent`, tutorials on the
  tour engine in `primary`, ring and "Your turn" line included.

## Keeping guides up to date

- Changing a feature that a guide explains → update its guide file in the same PR.
- Adding a feature → consider whether it needs a tour; if so, add a file with `status: planned`.
- Implementing or changing a guide → update `status` and `code` in its frontmatter.

## Overview

### Tutorials

| id                                                | Title                              | Minimum role |
| ------------------------------------------------- | ---------------------------------- | ------------ |
| [first-upload](tutorials/first-upload.md)         | Your first upload                  | Member       |
| [plugin-workflow](tutorials/plugin-workflow.md)   | Working from your NLE              | Member       |
| [install-resolve](tutorials/install-resolve.md)   | Installing the Resolve plugin      | Member       |
| [install-premiere](tutorials/install-premiere.md) | Installing the Premiere Pro plugin | Member       |
| [install-desktop](tutorials/install-desktop.md)   | Installing PostPin Desktop         | Member       |
| [first-review](tutorials/first-review.md)         | Your first review                  | Reviewer     |
| [sync-to-nle](tutorials/sync-to-nle.md)           | Using the plugin                   | Member       |

### Tours

| id                                        | Title                   | Area          | Minimum role |
| ----------------------------------------- | ----------------------- | ------------- | ------------ |
| [navigation](tours/navigation.md)         | Finding your way        | Basics        | Reviewer     |
| [marker-filter](tours/marker-filter.md)   | Filtering markers       | Review        | Reviewer     |
| [categories](tours/categories.md)         | Categories              | Review        | Reviewer     |
| [pointer-notes](tours/pointer-notes.md)   | Drawing and pointing    | Review        | Reviewer     |
| [marker-ranges](tours/marker-ranges.md)   | Marker ranges           | Review        | Reviewer     |
| [shortcuts](tours/shortcuts.md)           | Keyboard shortcuts      | Review        | Reviewer     |
| [timeline-view](tours/timeline-view.md)   | Timeline view           | Review        | Reviewer     |
| [import](tours/import.md)                 | Importing markers       | Review        | Reviewer     |
| [new-version](tours/new-version.md)       | Uploading a new version | Review        | Member       |
| [share-link](tours/share-link.md)         | Share links             | Collaboration | Member       |
| [guest-review](tours/guest-review.md)     | Reviewing as a guest    | Collaboration | Guest        |
| [invite-team](tours/invite-team.md)       | Inviting your team      | Collaboration | Admin        |
| [project-access](tours/project-access.md) | Project access          | Collaboration | Member       |
| [screening](tours/screening.md)           | Screenings              | Collaboration | Member       |
| [org-settings](tours/org-settings.md)     | Organization settings   | Organization  | Admin        |
| [postpin-guides](tours/postpin-guides.md) | PostPin Guides          | Guides        | Reviewer     |
