# Module Authoring Guide

This guide covers the **file-based path**: adding or editing a static
module in `registry.js`. Content that doesn't need to live in the git repo
(AI-drafted or frequently-revised material) can instead be added through
the admin **Courses** tab as a dynamic course, or fulfilled per-user through
the **Requests** tab as a personalized lesson — both are database-backed
and registered entirely through the admin console, not through this file.
See `repository-structure.md` for how the two paths divide ownership.

## Required module contract
Each module in `registry.js` must define:
- `id` (stable slug, unique across the whole registry — see
  `naming-versioning-conventions.md`)
- `title` and `subtitle`
- `theme` (`accent`, `accentSoft`)
- `indexRoute` (optional) — a static HTML route shown immediately on module
  select instead of the generic welcome panel; use this for a real
  table-of-contents page (see `lesson_index.html` for the pattern: it posts
  `lms:openLesson` per card and falls back to plain navigation outside the
  shell).
- `lessons[]` with:
  - `id` (kebab-case, unique across **all** modules — progress lookups are
    global, not module-scoped)
  - `title`
  - `subtitle`
  - `route` (path relative to the site root, e.g.
    `lms/modules/<id>/file.html`)
  - `progress` object — one of:
    - `{ type: 'checklist', storageKey, total, ignoreKeys? }`
    - `{ type: 'untracked', total: 0 }` for overview/masterplan pages with
      no checkboxes (these always report 100% so they don't drag down a
      module's average)
  - `requiresAuth` / `requiresPro` (optional, boolean) — independent of
    module-level visibility; gates the individual lesson behind sign-in or
    a `pro` tier. `requiresPro` implies `requiresAuth`. This is enforced
    both in the normal navigation path and on the `lms:openLesson`
    postMessage handler, so a lesson iframe can't bypass it.

A module can appear in more than one field by adding its `id` to more than
one field's `moduleIds` array — its progress is shared across both, because
progress is keyed by `storageKey`, not by field or module id.

## Storage conventions
- Use `lms_<module>_<lesson>_done` for new shared-tree module lessons.
- Use `lms_local_<slug>_done` for lessons in the personalized tree
  (`lms/personalied_modules/`), so a personalized variant never collides
  with the shared version's progress key.
- Storage keys are **global across the whole registry, not per-field or
  per-module**. Pick a key that doesn't collide with any other lesson's key
  anywhere in `registry.js`.
- Checklist storage values are a flat map of boolean entries, written by
  `lesson-ui.js` as `q_<index>: true` the first time each `.q-card` is
  opened. This is a one-way "seen" tracker — closing a card never clears
  its key.
- **`q_<index>` keys are positional, not id-based.** If you reorder or
  insert `.q-card` elements into an already-published lesson, you will
  silently corrupt the progress of anyone with partial completion (their
  `q_2: true` now points at a different question). Append new cards at the
  end, or treat a reorder/insert as a breaking change and call it out per
  `naming-versioning-conventions.md`.
- Reserve `home` for optional non-trackable state (e.g. a fake q-card used
  for a link) and add it to `ignoreKeys` so it doesn't count toward the
  percentage.

## Content rules
- Keep lesson files in module-owned folders (`lms/modules/<id>/` or
  `lms/personalied_modules/<id>_pers/`).
- Lessons must be standalone HTML pages that run in an iframe and never
  reference Firebase or global variables from the shell directly.
- Link `../shared/theme.css` and include
  `<script src="../shared/lesson-ui.js"></script>` for the shared design
  system and runtime.
- Use the `.tab-content` / `.tab-btn` pattern for language tabs — at
  minimum `#tab-en`. Add `#tab-de` / `#tab-ar` when a translation exists; a
  missing `#tab-ar` block is auto-detected and shown as a "not yet
  translated" banner rather than a blank tab, so omitting it is safe but
  not ideal.
- Use `.q-card` / `.q-trigger` (`onclick="toggle(this)"`) / `.q-panel` for
  checklist-tracked content.
- If a lesson links to a sibling lesson, prefer posting
  `window.parent.postMessage({ type: 'lms:openLesson', route: '...' }, '*')`
  over a raw `<a href>` so the shell sidebar stays in sync — this is not
  automatic; replicate it per link/button in the lesson's own inline
  script.
- Lessons must not rely on global variables from the shell. All
  shell-lesson communication goes through the `lms:*` postMessage protocol
  (open lesson, progress changed/requested, language sync) — see the LMS
  platform documentation for the full message list before adding a new
  message type.