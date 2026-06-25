# Naming and Versioning Conventions

## Module IDs
- lowercase kebab-case (`react-native`, `database`).
- Personalized-tree variants of a shared module use the shared module's id
  suffixed with `-pers` (e.g. `database-pers`), and route to
  `lms/personalied_modules/<id>_pers/` rather than `lms/modules/<id>/`.
- Dynamic course ids (admin-authored, created via the admin **Courses**
  tab) live in the **same id namespace as static module ids** for
  access-control purposes — the admin console merges course ids into the
  same lookup tables used for static modules so they get identical access
  chips. A new course id must not collide with any existing static module
  id, and vice versa.

## Lesson IDs
- lowercase kebab-case, prefixed by module context where needed.
- Must be unique **across all modules**, not just within one module —
  progress and the registry's lesson lookups are global.

## Storage keys
- New shared-tree modules: `lms_<module>_<lesson>_done`.
- Personalized-tree lessons: `lms_local_<slug>_done` (existing convention,
  kept distinct from the shared-tree pattern so personal and shared
  progress never collide for the same underlying content).
- Storage keys are **global, not per-field/module-scoped**. A module shared
  across two fields (e.g. `python` appearing in both `backend` and
  `frontend`) has exactly one progress record — don't assume field-scoped
  isolation when picking a new key.
- Legacy compatibility keys are allowed only for migrated content.

## Within-lesson progress indices
- `q_<index>` keys inside a checklist's `storageKey` map are **positional**
  (order-of-appearance), not stable per-question ids. Reordering or
  inserting `.q-card` elements in an already-published lesson silently
  reassigns existing users' progress to different questions. Treat this as
  a breaking change to that lesson — append new cards at the end instead,
  or document the reorder as a breaking change per the versioning model
  below.

## Folder naming
- `lms/personalied_modules/` keeps an intentional historical typo
  ("personalied" instead of "personalized"). **Do not rename it** to fix
  the spelling — the registry, existing routes, and progress keys all
  reference this exact path, and renaming it would silently break existing
  links and stored progress for personalized-tree content.

## Versioning model
- Keep `registry.js` backward compatible where possible.
- Additive changes (new modules/lessons/fields, new optional contract
  fields like `indexRoute`, `requiresAuth`, `requiresPro`) are minor.
- Breaking changes require migration notes in governance docs, including
  (but not limited to):
  - Registry schema changes (new required fields, renamed keys).
  - Reordering or inserting `.q-card` elements in a published lesson (see
    above).
  - Renaming a `storageKey`, module id, or lesson id that already has
    stored progress.
  - Changes to Firestore/Storage Security Rules that alter who can read or
    write existing data paths.