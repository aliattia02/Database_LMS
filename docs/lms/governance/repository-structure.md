# LMS Repository Structure Guide

## Purpose
This repository supports a Firebase-backed LMS platform: a static-site SPA
shell (`docs/`) that serves self-contained HTML lessons, with optional
sign-in, per-user/tier access control, progress tracking, an admin console,
personalized (request-then-fulfill) lessons, and admin-authored dynamic
courses.

There is **no build step and no framework** — everything is hand-written
HTML/CSS/vanilla JS loaded as native ES modules. Firebase (Auth, Firestore,
Storage) is the only backend dependency.

## Layout

```
docs/                                  ← served as the site root
├── index.html                         ← learner SPA shell entrypoint (loads core/app.js)
├── lms/
│   ├── core/                          ← shared application logic (Firebase-backed)
│   │   ├── access.js                     module/field visibility resolution
│   │   ├── admin.js                      admin console controller
│   │   ├── app.js                        learner-facing SPA controller
│   │   ├── auth.js                       Firebase Auth wrapper
│   │   ├── db.js                         Firestore/Storage data-access layer
│   │   ├── firebase-config.js            Firebase project config (public, not secret)
│   │   ├── i18n.js                       shell-level language loader
│   │   ├── progress.js                   pure localStorage progress calculations
│   │   ├── registry.js                   LMS_CONFIG — content registry (single source of truth)
│   │   ├── styles.css                    SPA shell stylesheet
│   │   └── styles_enhanced.css           loaded after styles.css (relationship under review — see note below)
│   ├── admin/
│   │   └── index.html                 ← admin console shell (loads core/admin.js; gated to role: 'admin')
│   ├── fields/
│   │   └── field.html                 ← legacy URL redirect shim → index.html?field=
│   ├── i18n/
│   │   ├── de.js                         shell-chrome translation overrides
│   │   └── ar.js                         shell-chrome translation overrides
│   ├── governance/                    ← this folder — contributor-facing process docs
│   ├── modules/                       ← module-owned static lesson content, grouped by track
│   │   ├── <module-id>/                  one folder per module (e.g. database/, python/, react/)
│   │   ├── shared/
│   │   │   ├── lesson-ui.js               shared lesson-page runtime (tabs, accordions, progress, mindmaps)
│   │   │   └── theme.css                  shared lesson-page design system
│   │   └── module.html                   ← legacy URL redirect shim → index.html?field=&module=
│   ├── personalied_modules/           ← parallel "personalized" content tree (folder name keeps an
│   │   │                                  intentional historical typo — do not rename it, see
│   │   │                                  naming-versioning-conventions.md)
│   │   ├── <module-id>_pers/             personal copies/variants of shared tracks
│   │   ├── shared/                       duplicated lesson-ui.js / theme.css
│   │   └── personalized_module.html      ← same redirect shim pattern, duplicated
│   └── .draft/                        ← retired files kept for reference only; not part of the live app
│       ├── field-page.js                 superseded by lms/fields/field.html
│       ├── landing.js
│       └── module-shell.js               superseded by app.js
├── CNAME                                custom domain (implies GitHub Pages hosting)
├── cors.json                            Firebase Storage CORS config
├── package.json
└── tree_gen.py                          regenerates the tree listing
```

**Note on `styles_enhanced.css`:** `index.html` loads this immediately after
`core/styles.css`. Its relationship to `styles.css` (superseded leftover vs.
meaningful additional layer) has not yet been confirmed. Don't assume either
way until it's been reviewed — flag this if you're touching shell styling.

## Two parallel content trees
`lms/modules/` (shared) and `lms/personalied_modules/` (personalized-to-one-
person variants) are served identically by the app shell — they're just two
different `route` prefixes registered as separate modules in `registry.js`.
There is nothing structurally special about the personal tree; it's a
convention, not a code branch.

## Ownership boundaries
- **Core shell** (`lms/core/`) owns: layout, module/lesson navigation,
  authentication, access-control resolution (admin → per-user → tier →
  platform default), progress sync between localStorage and Firestore, and
  global analytics.
- **Modules** (`lms/modules/<id>/`, `lms/personalied_modules/<id>_pers/`)
  own: lesson content and lesson-level completion data. Lesson files are
  independent static HTML pages that never talk to Firebase directly — they
  communicate with the shell only via `window.postMessage`.
- **Admin console** (`lms/admin/`) owns: user/tier access management,
  category (tier) defaults, personalized-lesson request fulfillment, and
  dynamic course authoring. It is a separate front end from the learner
  shell, gated to Firestore users with `role: 'admin'`, and is the only
  place dynamic (database-backed) courses and personalized lessons are
  created.
- **Module registration must occur only in `docs/lms/core/registry.js`** for
  static, file-based modules. Admin-authored dynamic courses and
  personalized lessons are registered entirely through Firestore via the
  admin console — they are never added to `registry.js`.
- **Real authorization is server-side.** `firestore.rules` and
  `storage.rules` are the actual security boundary; client-side checks in
  `access.js`/`app.js` are UX conveniences that mirror those rules, not a
  substitute for them. Any change to access-control behavior must be
  reflected in both places.