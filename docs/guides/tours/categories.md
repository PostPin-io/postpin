---
id: categories
type: tour
title: Categories
status: planned
minRole: reviewer
permission: category.create
trigger: manual
starts: guide button next to the category selector
prerequisites: [first-review, may create categories (`permission`)]
code:
  - packages/postpin/src/lib/components/categories/
---

# Categories

**Goal:** The user can create, recolor and reuse categories, including presets.

## Steps

1. `selector`: **Highlights:** the category selector of a marker. **Text:** "Categories group feedback, e.g. color, sound, edit."
2. `edit`: **Highlights:** the edit-categories button. **Text:** "Rename categories and pick their colors here."
3. `presets`: **Highlights:** the presets button. **Text:** "Save a set of categories and reuse it in other projects."

## Success feedback

- At the end: "✓ Categories: done"

## Notes

- Popover copy is a draft.
- Roles: a reviewer creates categories and changes or deletes only their own (`category.create`,
  own `update`/`delete`); Member and up change all. So `edit` has a text that holds for both
  ("Change a category's name and color") and, if the tour has the user change one, it is one they
  created in the tour. `presets` is **optional**: saving a preset is `categoryPreset.create`
  (Member and up); a reviewer can apply existing presets but has no save button, so the step is
  left out for them.
