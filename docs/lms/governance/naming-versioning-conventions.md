# Naming and Versioning Conventions

## Module IDs
- lowercase kebab-case (`react-native`, `database`).

## Lesson IDs
- lowercase kebab-case, prefixed by module context where needed.

## Storage keys
- New modules: `lms_<module>_<lesson>_done`
- Legacy compatibility keys are allowed only for migrated content.

## Versioning model
- Keep `registry.js` backward compatible where possible.
- Additive changes (new modules/lessons) are minor.
- Breaking schema changes require migration notes in governance docs.
