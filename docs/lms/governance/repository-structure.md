# LMS Repository Structure Guide

## Purpose
This repository now supports a platform-level LMS with multiple module packs.

## Layout
- `docs/index.html` — platform shell entrypoint.
- `docs/lms/core/` — shared shell assets (`app.js`, `styles.css`, `registry.js`).
- `docs/lms/modules/<module-id>/` — module-owned learning content.
- `docs/phase-*.html` — legacy Database module lesson files (kept for compatibility).
- `docs/lms/governance/` — standards and contribution rules.

## Ownership boundaries
- Core shell owns layout, module/lesson navigation, and global analytics.
- Modules own lesson content and lesson-level completion data.
- Module registration must occur only in `docs/lms/core/registry.js`.
