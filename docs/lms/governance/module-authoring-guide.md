# Module Authoring Guide

## Required module contract
Each module in `registry.js` must define:
- `id` (stable slug)
- `title` and `subtitle`
- `theme` (`accent`, `accentSoft`)
- `lessons[]` with:
  - `id`
  - `title`
  - `subtitle`
  - `route`
  - `progress` object (`type`, and when checklist: `storageKey`, `total`, optional `ignoreKeys`)

## Storage conventions
- Use `lms_<module>_<lesson>_done` for new module lessons.
- Use checklist object values with boolean entries.
- Reserve `home` for optional non-trackable state and add it to `ignoreKeys`.

## Content rules
- Keep lesson files in module-owned folders.
- Lessons must be standalone HTML pages that run in an iframe.
- Lessons must not rely on global variables from the shell.
