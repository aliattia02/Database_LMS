# LMS Platform — Project Documentation

> A Firebase-backed learning management system: a static-site SPA shell that
> serves self-contained HTML lessons, with optional sign-in, per-user/tier
> access control, progress tracking, an admin console, AI/human-authored
> "personalized lessons," and an admin-built dynamic course system.

This document covers three things at once: **how the system is built**
(architecture reference), **how to stand it up** (setup guide), and **how to
add content to it** (authoring guide).

---

## Table of contents

1. [Tech stack & hosting model](#1-tech-stack--hosting-model)
2. [Repository layout](#2-repository-layout)
3. [High-level architecture](#3-high-level-architecture)
4. [The module/field/lesson registry](#4-the-modulefieldlesson-registry)
5. [Firestore data model](#5-firestore-data-model)
   - [5a. Firestore Security Rules](#5a-firestore-security-rules-confirmed)
   - [5b. Storage Security Rules](#5b-storage-security-rules-confirmed)
6. [Authentication & access control](#6-authentication--access-control)
7. [Progress tracking system](#7-progress-tracking-system)
8. [Internationalization (i18n)](#8-internationalization-i18n)
9. [The admin console](#9-the-admin-console)
10. [Personalized Lessons](#10-personalized-lessons)
11. [Dynamic Courses (admin-authored)](#11-dynamic-courses-admin-authored)
12. [Setup & deployment guide](#12-setup--deployment-guide)
13. [Content authoring guide](#13-content-authoring-guide)
14. [Gotchas & constraints](#14-gotchas--constraints)
15. [File reference](#15-file-reference)
16. [Known gaps / suggested next uploads](#16-known-gaps--suggested-next-uploads)

---

## 1. Tech stack & hosting model

- **No build step, no framework.** Everything is hand-written HTML/CSS/vanilla
  JS, loaded as native ES modules (`<script type="module">`). There is no
  bundler, no npm install required to run it.
- **Firebase** (v10.12.0 web SDK, imported directly from
  `https://www.gstatic.com/firebasejs/...`) provides:
  - **Authentication** — Google popup + email/password.
  - **Firestore** — user profiles, progress, access control, personalized
    lesson requests/lessons, admin-authored courses.
  - **Storage** — uploaded CV/profile files for personalized lesson requests.
- **Static hosting.** The presence of a `CNAME` file at the repo root and
  `docs/` as the served folder strongly suggests **GitHub Pages** is the
  deployment target (a custom domain pointed at a GitHub Pages site that
  serves the `docs/` folder). `cors.json` is a Firebase Storage CORS config
  (needed because the site origin differs from the Storage bucket's default).
- **Security model:** the Firebase config in `firebase-config.js` is **not a
  secret** — Firebase API keys are designed to be public. All real
  authorization happens in **Firestore Security Rules + Storage Security
  Rules** — both have now been reviewed (see [§5a](#5a-firestore-security-rules-confirmed)
  and [§5b](#5b-storage-security-rules-confirmed)) and confirm the precedence
  logic described throughout this doc is actually enforced server-side, not
  just a client-side convenience. Treat the client-side `isAdmin()`/access
  checks in `access.js`/`app.js` as **UX conveniences that happen to mirror**
  the rules — the rules are the real boundary.

---

## 2. Repository layout

```
docs/                                  ← served as the site root
├── lms/
│   ├── .draft/                        ← old/retired files kept for reference
│   │   ├── field-page.js                 (superseded by field.html redirect shim)
│   │   ├── landing.js
│   │   └── module-shell.js               (its postMessage logic now lives in app.js)
│   ├── admin/
│   │   └── index.html                 ← admin console shell (loads core/admin.js)
│   ├── core/                          ← all shared application logic
│   │   ├── access.js                     module/field visibility resolution
│   │   ├── admin.js                      admin console controller (4 tabs)
│   │   ├── app.js                        main SPA controller (the learner-facing shell)
│   │   ├── auth.js                       Firebase Auth wrapper
│   │   ├── db.js                         Firestore/Storage data-access layer
│   │   ├── firebase-config.js            Firebase project config (public, not secret)
│   │   ├── i18n.js                       shell-level language loader
│   │   ├── progress.js                   pure localStorage progress calculations
│   │   ├── registry.js                   LMS_CONFIG — the content registry (single source of truth)
│   │   └── styles.css                    SPA shell stylesheet (light + dark-navy-sidebar tokens)
│   ├── fields/
│   │   └── field.html                 ← legacy URL redirect shim → index.html?field=
│   ├── governance/                    ← contributor-facing process docs (see note below)
│   ├── i18n/
│   │   ├── ar.js                         Arabic shell translations
│   │   └── de.js                         German shell translations
│   ├── modules/                       ← static lesson content, grouped by track
│   │   ├── database/                     phase-00..07 MariaDB/SQL track
│   │   ├── Interview-main/                Treuhandstelle interview-prep track
│   │   ├── python/                       3-lesson Python track
│   │   ├── react/                        3-lesson React track
│   │   ├── react-native/                 3-lesson React Native track
│   │   ├── shared/
│   │   │   ├── lesson-ui.js              shared lesson-page runtime (tabs, accordions, progress, mindmaps)
│   │   │   └── theme.css                 shared lesson-page design system
│   │   └── module.html                   ← legacy URL redirect shim → index.html?field=&module=
│   └── personalied_modules/            ← "Personalised Local Courses" field (note: folder
│       │                                  name keeps the original typo intentionally —
│       │                                  see comment in registry.js)
│       ├── database_pers/                personal copy of the database track
│       ├── Interview_pers/               personal copy of the interview track
│       ├── shared/                       same lesson-ui.js / theme.css, duplicated
│       ├── UKM_pers/                     a one-off personal module
│       └── personalized_module.html      ← same redirect shim, duplicated (see §14 note)
├── analysis report
├── CHAT_GUIDE.md
├── CNAME                                custom domain for GitHub Pages
├── cors.json                            Firebase Storage CORS config
├── index.html                          ← the learner SPA shell (loads lms/core/app.js)
├── LMS_UPGRADE_PROMPT.md
├── migrate_db_module.py
├── package.json
└── tree_gen.py                          generates the tree listing above
```

**Two parallel content trees.** `lms/modules/` (shared) and
`lms/personalied_modules/` (personalized-to-one-person variants) are served
identically by the app — they're just two different `route` prefixes
registered as separate modules/fields in `registry.js`. There's nothing
structurally special about the personal tree; it's a convention, not a code
branch.

> `lms/governance/*.md` (contribution-workflow, module-authoring-guide,
> naming-versioning-conventions, quality-gates, repository-structure, and a
> `NEW_MODULE_PROMPT`) were listed in the tree but not included in the files
> reviewed for this document — they're almost certainly the canonical
> authoring rules for this repo. **Read those before adding content**; the
> [Content authoring guide](#13-content-authoring-guide) section below is
> reverse-engineered from the code itself and may not capture every
> project-specific convention those docs define.

---

## 3. High-level architecture

There are **two independent front ends**, both backed by the same Firebase
project:

| | Learner shell | Admin console |
|---|---|---|
| Entry HTML | `docs/index.html` (repo root) | `lms/admin/index.html` |
| Controller | `core/app.js` | `core/admin.js` |
| Who can load it | anyone (gated per-lesson) | only Firestore users with `role: 'admin'` |
| Renders | fields → modules → lessons, in an iframe | Users / Categories / Requests / Courses tabs |

### The root SPA shell (`docs/index.html`)

Three top-level regions, all siblings of `<body>`, toggled by `app.js` via
`hidden`:

- **`#account-bar`** — a native `<details>/<summary>` disclosure pinned
  `position: fixed` to the top-right, containing `#auth-panel`
  (`#auth-signed-out` / `#auth-signed-in`). It deliberately lives *outside*
  both of the regions below (not inside the sidebar) so sign-in is reachable
  on the very first screen — before a field is even picked. The code
  comments call this the **"Phase 0 fix"**: previously the auth panel lived
  inside `.sidebar`, which is hidden on the fields-landing screen, so an
  anonymous visitor looking at 🔒-locked fields had no way to sign in
  without first entering a field they might not have access to. Using
  `<details>` means the expand/collapse needs zero JavaScript — it's pure
  HTML/CSS. All of its element ids (`#auth-email`, `#btn-signout`, etc.) are
  unchanged from when the panel lived in the sidebar, so moving it required
  **zero changes to `app.js`** (it looks everything up via
  `getElementById`, not by DOM position). The Admin Panel link
  (`#btn-admin-panel`, `href="lms/admin/"`) also lives here, hidden unless
  `isAdmin(userProfile)`.
- **`#fields-landing`** — the marketing-ish landing screen shown when
  `activeFieldId === null`: hero header, a feature-pills row, a 4-up feature
  strip, the field-card grid (`#fields-grid`, injected by
  `renderFieldsLanding()`), and a footer slot (`#fields-footer`) for the
  Personalized Lessons entry point.
- **`#app-shell`** — the actual learning UI once a field/module is active:
  `.sidebar` (back-to-fields button, brand, language switcher,
  `#module-nav`, `#lesson-nav`, `#progress-bars`, reset-progress button) +
  `.main` (`#welcome-panel`, `#personalized-panel`, and the
  `#lesson-frame` iframe that all lesson content loads into).

This file loads **two** stylesheets — `lms/core/styles.css` and
`lms/core/styles_enhanced.css` — plus a small inline `<style>` block scoped
to `.account-bar`. `styles_enhanced.css` was referenced here but not
included in the files reviewed for this document; see
[§16](#16-known-gaps--suggested-next-uploads).

### Learner shell data flow

```
registry.js (LMS_CONFIG)         Firestore                 localStorage
       │                              │                          │
       ├─ static fields/modules/      ├─ users/{uid} profile     ├─ per-lesson checklist
       │  lessons (hard-coded)        ├─ users/{uid}/access/...  │  progress (q_0, q_1, …)
       │                              ├─ tiers/{tierId}          │
       └──────────────┐               ├─ courses/* (dynamic)     │
                       ▼               ├─ personalizedLesson*     │
                  access.js  ◄─────────┘                          │
                (getVisibleModules)                                │
                       │                                           │
                       ▼                                           │
                  app.js render()  ──────────────────────────────► lesson <iframe>
                       │                                           ▲
                       └── postMessage bridge (lms:*) ─────────────┘
```

- `registry.js` exports `LMS_CONFIG`: a hard-coded tree of **fields → modules
  → lessons**, plus the platform-wide `accessControl.mode`. This is the
  single source of truth for all *static* content.
- `access.js` filters that tree (plus any dynamic courses) down to what the
  current user/tier is allowed to see.
- `app.js` is the controller: it owns all UI state (`activeFieldId`,
  `activeModuleId`, `activeLessonId`), renders the sidebar/nav, and loads the
  selected lesson into an `<iframe>`.
- Lessons are **independent static HTML files**. They never talk to Firebase
  directly. They talk to the parent shell exclusively via
  `window.postMessage`, using the small `lesson-ui.js` runtime that every
  lesson page includes via `<script src="../shared/lesson-ui.js">`.

### Admin console data flow

`admin.js` is completely separate from `app.js` — it is **never imported by
the learner shell** and has its own Firebase initialization, its own
Firestore reads, and its own rendering code. It reads the same `registry.js`
`LMS_CONFIG` (for static module/field names) but otherwise operates purely
on Firestore collections: `userIndex`, `users/{uid}`, `tiers`, `courses`,
`personalizedLessonRequests`.

### Legacy URL redirect shims

Three small files exist purely to keep old bookmarks/links working after the
app moved from a multi-page architecture to a single-page one:

| File | Old URL pattern | Redirects to |
|---|---|---|
| `lms/fields/field.html` | `field.html?id=<fieldId>` | `index.html?field=<fieldId>` |
| `lms/modules/module.html` | `module.html?id=<moduleId>&from=<fieldId>` | `index.html?field=<fieldId>&module=<moduleId>` |
| `lms/personalied_modules/personalized_module.html` | same pattern as `module.html` | same — `index.html?field=&module=` |

All three are tiny inline-`<script>` redirects using `location.replace()`
(so the shim never appears in browser history), with a plain-link fallback
for the no-JS case. They used to drive standalone page controllers
(`field-page.js`, `module-shell.js` — both now retired into `lms/.draft/`)
that have since been fully superseded by `index.html` + `app.js` handling
field/module selection via URL query params (see `restoreStateFromURL()` in
`app.js`).

**Minor inconsistency worth knowing about:** `personalized_module.html`'s
file-level doc-comment is a verbatim copy of `module.html`'s — it still says
`module.html — redirect shim` and describes `lms/modules/` paths, even
though the file actually lives in `lms/personalied_modules/`. The redirect
logic itself works correctly either way (both go up two directory levels to
reach `index.html`), so this isn't a functional bug — just a stale comment
that could confuse someone reading the file in isolation. Worth fixing the
comment header if you're already touching this file for governance updates.

---

## 4. The module/field/lesson registry

`core/registry.js` exports a single object, `LMS_CONFIG`, with this shape:

```js
LMS_CONFIG = {
  appName: 'LMS Platform',
  storagePrefix: 'lms',
  accessControl: { mode: 'open' | 'controlled' },   // platform-wide default
  welcome: { heading, body },                        // shown when nothing is selected
  fields: [
    {
      id, title, subtitle, icon,
      theme: { accent, accentSoft },
      moduleIds: ['<module id>', ...]                // which modules live in this field
    },
    ...
  ],
  modules: [
    {
      id, title, subtitle,
      theme: { accent, accentSoft },
      indexRoute: '<optional static HTML route>',    // shown immediately on module select
      lessons: [
        {
          id, title, subtitle,
          route: 'lms/modules/.../file.html',
          progress: { type: 'checklist', storageKey: '...', total: N, ignoreKeys?: [...] }
                  | { type: 'untracked', total: 0 }
        },
        ...
      ]
    },
    ...
  ]
}
```

Key design points:

- **Fields are presentation grouping only.** A module can appear in more
  than one field (e.g. `python` appears in both `backend` and `frontend`) —
  its progress is shared because progress is keyed by `storageKey`, not by
  field or module id.
- **`progress.type`** is either:
  - `'checklist'` — the lesson has `.q-card` elements; `total` must equal
    the number of cards on the page, and `storageKey` is the localStorage
    key `lesson-ui.js` writes to (see [§7](#7-progress-tracking-system)).
  - `'untracked'` — overview/masterplan pages with no checkboxes; these
    always report 100% so they don't drag down a module's average.
- **`indexRoute`** lets a module show a real table-of-contents page (like
  `lesson_index.html`) the instant it's selected, instead of the generic
  welcome panel.
- **`LANG_KEY`** is also exported from this file (`'lms_lang'` by default,
  derived from `storagePrefix`) — every other file imports it from here so
  the localStorage key for the language preference is never hard-coded
  twice.

To add a new static module, you edit this file directly (see
[§13](#13-content-authoring-guide)).

---

## 5. Firestore data model

This is the canonical schema (collected from comments in `db.js`):

```
users/{uid}
  (doc)                    { displayName, email, tier: 'free'|'pro', lang,
                              createdAt, lastSeen, role?: 'admin' }
  /progress/{storageKey}   { <checkboxKey>: true|false, ... }
  /access/modules          { <moduleId|courseId>: true|false, ... }   ← per-user override
  /personalized_lessons/{lessonId}
                            { title, topic, html, createdAt, requestId, progress }

userIndex/{uid}             { displayName, email, photoURL }
                             — public-ish index so the admin console can list
                               every registered user without an Auth Admin SDK

tiers/{tierId}               { <moduleId|courseId>: true|false, ... }
                             — tier ids: 'anonymous' | 'free' | 'pro' | 'custom' | 'admin'
                             — managed from the admin Categories tab

personalizedLessonRequests/{requestId}
  { uid, topic, answers, profileFileURL, profileFileName,
    targetJobFileURL, targetJobFileName,
    targetAbilitiesFileURL, targetAbilitiesFileName,
    status: 'pending'|'in_review'|'fulfilled'|'declined',
    requestedAt, fulfilledAt, fulfilledBy, lessonId, adminNote }
  — `answers` may also carry plain-text targetJob/targetAbilities entries

courses/{courseId}
  { title, subtitle, icon, fieldId, order, status: 'draft'|'published'|'archived',
    requiresAuth, requiresPro, createdBy, createdAt, updatedAt }
  /lessons/{lessonId}
    { title, subtitle, order, html, htmlStorageURL, requiresAuth, requiresPro,
      progress, createdAt, updatedAt }
    — content is EITHER inline `html` OR `htmlStorageURL` (Storage), never both
```

Storage layout:

```
profile-uploads/{uid}/{requestId}/{filename}                  ← kind='profile' (default)
profile-uploads/{uid}/{requestId}/targetJob-{filename}        ← kind='targetJob'
profile-uploads/{uid}/{requestId}/targetAbilities-{filename}  ← kind='targetAbilities'
```

### Notable Firestore query requirements

- `getPublishedCourses()` combines `where('status','==','published')` with
  `orderBy('order')` on a different field — **this needs a composite index**
  (`courses`: `status` Asc + `order` Asc). The code comment notes you can
  either create it proactively in the Firebase console or just trigger the
  call once locally and click the auto-generated link in the resulting
  console error.
- Courses are **never hard-deleted by default** — `archiveCourse()` just sets
  `status: 'archived'`. `permanentlyDeleteCourse()` exists but is
  irreversible and also deletes the lessons subcollection.
- `cloneCourse()` duplicates a course (title prefixed `[Copy] `) and all its
  lessons as a new **draft**, regardless of the source's status.

### 5a. Firestore Security Rules (confirmed)

These are the actual deployed rules (`firestore.rules`), not an inference
from code comments — they fully confirm the precedence logic described in
[§6](#6-authentication--access-control).

| Path | Read | Write |
|---|---|---|
| `users/{userId}` | owner or admin | owner or admin |
| `users/{userId}/progress/{key}` | owner or admin | owner or admin |
| `users/{userId}/access/{doc}` | owner or admin | **admin only** |
| `users/{userId}/personalized_lessons/{id}` | owner or admin | **admin only** |
| `userIndex/{userId}` | **admin only** | owner (self-write on sign-in) |
| `tiers/{tierId}` | **public** (`true`) | admin only |
| `personalizedLessonRequests/{id}` | owner or admin | see below |
| `courses/{id}` | published → anyone; else admin only | admin only |
| `courses/{id}/lessons/{id}` | parent course published → anyone; else admin only | admin only |

Notable specifics:

- **`isAdmin()` was patched for a real bug.** The rules file's own comment
  explains the fix: the original implementation called
  `get(...).data.role`, which **throws** for any user whose `users/{uid}`
  document doesn't exist yet (e.g. a brand-new email sign-up, mid-race
  between `signUpWithEmail()` and `ensureUserDocument()` completing) — and
  Firestore's rules engine can evaluate `isAdmin()` eagerly even inside an
  `||`, so this could deny legitimate owners access to their *own* profile
  document. The fix is two-fold: an `exists()` check before the `get()`, and
  `.data.get('role', '')` (safe field access with a default) instead of
  `.data.role` (throws on a missing field). **If you ever copy this
  `isAdmin()` pattern elsewhere, keep both guards** — either one alone can
  still throw in an edge case the other was added to cover.
- **`personalizedLessonRequests` has a narrowly-scoped self-update rule.**
  A non-admin can `update` their own request doc **only** to attach file
  fields (`profileFileURL`/`Name`, `targetJobFileURL`/`Name`,
  `targetAbilitiesFileURL`/`Name`) right after creation — enforced via
  `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])`
  — and **only** if `status` is unchanged. This is exactly (and only) what
  `updatePersonalizedRequestFile()` in `db.js` does; a user can never write
  `status`, `uid`, `topic`, `answers`, or `requestedAt` themselves, which is
  what makes the admin review workflow tamper-proof from the client side.
  `delete` is disabled entirely (`allow delete: if false`) — requests are
  kept as a permanent audit trail.
- **`tiers` is publicly readable** (`allow read: if true`, no auth check) —
  this is intentional, not an oversight: `access.js`'s `getTierAccess()`
  needs to resolve the `'anonymous'` tier's defaults for signed-out visitors,
  which requires reading `tiers/anonymous` with no `request.auth` at all.
- **Course visibility can't be filtered client-side**, and the rules comment
  says so explicitly: because `status` varies per-document, Firestore can
  only allow a `list` query if the query *itself* filters on `status`
  server-side — which is exactly why `getPublishedCourses()` in `db.js` must
  use `where('status', '==', 'published')` rather than fetching everything
  and filtering in JS (a non-admin client attempting the unfiltered fetch
  would simply have the read rejected). Lesson-level reads, by contrast,
  check the **parent course's** status via a cross-document `get()` — every
  lesson in the same course shares an identical condition, so (unlike the
  parent list query) no composite index or server-side `where` is needed
  there.

### 5b. Storage Security Rules (confirmed)

```
profile-uploads/{uid}/{requestId}/{fileName}
  read:   anyone (true)
  write:  uid matches signed-in user
          AND size < 5 MB
          AND contentType ∈ {application/pdf,
                              application/vnd.openxmlformats-officedocument.wordprocessingml.document,
                              application/msword}
  delete: never (false)

everything else: denied (read AND write: false)
```

- **Read is intentionally open** (`allow read: if true`) on this path — the
  rules comment explains why: Storage download URLs already embed an
  unguessable access token, and the admin Requests tab needs to open these
  links directly with a plain `<a href>` rather than a custom signed-URL
  flow.
- **The 5 MB / PDF-or-Word constraint is enforced twice**, redundantly and
  on purpose: client-side in `app.js` (`PL_MAX_FILE_SIZE`,
  `PL_ALLOWED_FILE_TYPES`, checked *before* any upload begins, so the user
  gets instant feedback) and server-side here (so a user bypassing the
  client UI — e.g. calling the Storage SDK directly — still can't upload
  something larger or of a different type).
- **One rule covers all three file "kinds"** (profile / target-job /
  target-abilities) because, as `db.js`'s `uploadProfileFile()` comment
  notes, non-default kinds are namespaced with a `{kind}-` filename prefix
  rather than a new path segment — so the single `{fileName}` wildcard glob
  in this rule transparently covers all of them. This was a deliberate
  storage-layout choice specifically so the Security Rules wouldn't need to
  be touched every time a new "kind" of upload was added.
- **No rule exists for course-lesson `htmlStorageURL` content.** `db.js`
  supports storing a course lesson's HTML in Storage instead of inline
  (`createCourseLesson`'s `htmlStorageURL` field), but the only Storage path
  these rules cover is `profile-uploads/...`; anything else falls through to
  the final `allow read, write: if false` catch-all. **If `htmlStorageURL` is
  ever actually used for a course lesson, it needs its own Storage Rules
  entry** — as written, an admin would have no path the rules grant write
  access to for that content.

---

## 6. Authentication & access control

### Auth (`core/auth.js`)

Thin wrapper around Firebase Auth:

- `signInWithGoogle()`, `signUpWithEmail(email, pw)`, `signInWithEmail(email, pw)`,
  `signOutUser()`, `onAuthChange(callback)`.
- Both `signInWithGoogle` and `signUpWithEmail` call `ensureUserDocument()`
  (in `db.js`) so a `users/{uid}` doc always exists after registration.
  `signInWithEmail` does **not** — the doc is assumed to already exist from
  sign-up.
- **Import constraint:** ES module specifiers must be static string literals.
  You cannot build the Firebase CDN URL from a variable — doing so throws a
  `SyntaxError` that breaks the *entire* module graph (including `app.js`).
  When upgrading the SDK version, update the pinned `10.12.0` string in
  `auth.js` **and** `db.js` **and** `admin.js` together.

### Access resolution (`core/access.js`)

Visibility precedence, **highest first**:

1. **Admin** (`userProfile.role === 'admin'`) → sees every module, full stop.
2. **Per-user override** — `users/{uid}/access/modules` — wins over tier if
   present, *per module id* (a per-user doc can grant some modules and stay
   silent on others; only the keys actually present in the map override the
   tier/platform default).
3. **Tier default** — `tiers/{tierId}` (`tierId = profile.tier || 'free'`),
   managed from the admin **Categories** tab.
4. **Platform fallback** — `LMS_CONFIG.accessControl.mode`:
   - `'open'` → everything visible unless explicitly set to `false`.
   - `'controlled'` → everything hidden unless explicitly set to `true`.

Anonymous (signed-out) users skip step 2 entirely and resolve via the
`'anonymous'` tier, then the platform fallback.

A tier that has **never been saved** from the Categories tab returns `null`
from `getTierAccess()` and is treated identically to an unconfigured
per-user doc — i.e. existing deployments are unaffected until an admin
actually visits Categories and saves something.

`getAccessibleFields()` / `getVisibleModulesForField()` build on top of
`getVisibleModules()` to compute field-level lock state (a field is "locked"
when **all** of its modules are inaccessible) without duplicating the
precedence logic.

### Lesson-level gating (`app.js`)

Independent of module-level visibility, individual lessons (static or
dynamic-course) can carry `requiresAuth` / `requiresPro` flags.
`getLessonAccess(lesson)` returns:

- `'open'` — no flags, or the user already satisfies them.
- `'needs-auth'` — `requiresAuth` is true and nobody is signed in.
- `'needs-pro'` — `requiresPro` is true and `userProfile.tier !== 'pro'`.

`requiresPro` implies `requiresAuth`: a signed-out user hitting a Pro lesson
sees the sign-in prompt first, not a paywall — tier is only checked once
someone is actually signed in. Clicking a locked lesson swaps the lesson
`<iframe>` for a contextual prompt in the welcome panel instead of loading
content, and this gate is enforced **on the postMessage path too**
(`lms:openLesson`), so an iframe can't bypass it by asking the parent to
navigate.

---

## 7. Progress tracking system

Progress is intentionally **localStorage-first, Firestore-second** so it
works fully offline and syncs opportunistically when signed in.

### Storage shape

Each trackable lesson owns one localStorage key (its `storageKey` from the
registry), holding a flat map like:

```json
{ "q_0": true, "q_1": true, "q_2": false }
```

`q_<index>` keys are written by `lesson-ui.js`'s `toggle()` function the
first time a `.q-card` is opened — it's a **one-way "seen" tracker**, not a
toggle: closing a card never clears its key. `ignoreKeys` in the registry
lets a module exclude a specific key (e.g. a `'home'` link rendered as a
fake q-card) from the percentage calculation.

### The three layers

| Layer | File | Responsibility |
|---|---|---|
| Pure computation | `core/progress.js` | `safeReadStorage`, `computeLessonProgress`, `computeModuleProgress`, `computeGroupProgress`, `getAllStorageKeys` — no DOM, no Firebase, safe to import anywhere |
| Shell sync | `core/app.js` | `syncProgressToFirestore()` (poll-driven, pushes local→remote), `migrateLocalStorageToFirestore()` (sign-in-time merge, remote wins on conflict) |
| In-lesson bridge | `modules/shared/lesson-ui.js` | reads/writes the lesson's own localStorage key, notifies the parent via `postMessage` |

### The postMessage protocol

Lessons live in a same-origin `<iframe>` and can't call Firebase directly
(by design — keeps lesson files dumb/static). They talk to the shell via
five message types:

| Message | Direction | Purpose |
|---|---|---|
| `lms:openLesson` | iframe → shell | navigate to a sibling lesson (registered → uses `openLesson()` so sidebar/progress stay correct; unregistered → loads directly, no sidebar highlight) |
| `lms:progressChanged` | iframe → shell | a q-card was just opened — triggers immediate `renderProgressBars()` + `renderLessonNav()` + an out-of-band Firestore sync, instead of waiting for the poll |
| `lms:requestProgress` | iframe → shell | on lesson load, ask for Firestore-authoritative progress (covers q-cards opened on another device) |
| `lms:progressData` | shell → iframe | reply to the above, `{ storageKey, data }` |
| `lms:setLang` / `lms:langChanged` | both directions | keep the shell's language switcher and the lesson's tab bar in sync |

### Why both a storage event AND a 3-second poll?

```js
// ① Cross-tab: fires instantly in THIS window when a DIFFERENT tab/window
//    writes localStorage. Does NOT fire for same-tab writes.
window.addEventListener('storage', ...);

// ② Same-tab: the lesson iframe shares localStorage with the parent but
//    writes from inside an iframe never fire the parent's `storage` event.
//    The poll (PROGRESS_POLL_INTERVAL = 3000ms) is the fallback that catches
//    those, plus it drives syncProgressToFirestore().
setInterval(..., PROGRESS_POLL_INTERVAL);
```

The `lms:progressChanged` postMessage exists specifically to shortcut that
3-second worst case down to "instant" for the common case (an open lesson
tab posting a message), while the poll remains as the safety net for
anything that doesn't post a message.

---

## 8. Internationalization (i18n)

Two independent i18n layers exist, and they don't share code — be aware of
this when adding translations:

### Shell-level (`core/i18n.js` + `i18n/{lang}.js`)

- `loadLanguage(lang)` dynamically imports `../i18n/{lang}.js` (only `'de'`
  and `'ar'` exist today; `'en'` is the implicit default with an empty
  translation map) and sets `<html dir="rtl|ltr" lang="...">`.
- `t(key, fallback)` reads from `window.__LMS_TRANSLATIONS__`, falling back
  to the literal string if the key is missing — so the shell **never**
  shows a raw translation key, only English as a silent fallback.
- `applyTranslations(root)` walks `[data-i18n]` elements and fills their
  `textContent`. Call it again after any DOM swap that introduces new
  `data-i18n` elements.
- Supported langs: `['en', 'ar', 'de']`; RTL langs: `['ar']`.

**Key namespace (confirmed from `i18n/de.js`).** `de.js`'s own header
comment states the convention explicitly: *"English is the source of
truth; it lives in the HTML/JS files directly. ... only keys that differ
from the English default"* — so a translation file is a sparse override
map, not a full duplicate. Each `de.js`/`ar.js` only needs to define the
keys that actually have German/Arabic text; anything missing silently falls
back to the English string hard-coded in the HTML/JS (per `t()`'s fallback
behavior above). The key namespaces in use, by prefix:

| Prefix | Covers | Example |
|---|---|---|
| `fields.*` | Fields-landing copy | `fields.tagline` |
| `field.<fieldId>.title` / `.subtitle` | Per-field registry strings | `field.backend.title` |
| `field.modules` / `.complete` / `.locked` | Field card chrome | `field.locked` |
| `module.<moduleId>.title` / `.subtitle` | Per-module registry strings | `module.python.subtitle` |
| `lesson.<lessonId>.title` / `.subtitle` | Per-lesson registry strings | `lesson.db-galera.title` |
| `shell.*` | Sidebar chrome (back button, panel titles, reset button) | `shell.resetButton` |
| `welcome.*` | Welcome panel heading/body | `welcome.heading` |
| `auth.*` | Account-bar / auth panel | `auth.signInTitle` |
| `gate.*` | Lesson access-gate prompts (needs-auth/needs-pro) | `gate.proHeading` |
| `progress.*` | Progress bar labels | `progress.overall` |

To add a new static module/lesson and have it show correctly in German/
Arabic, add matching `module.<id>.title`/`field.<id>.title`/
`lesson.<id>.title` (etc.) keys to **both** `i18n/de.js` and `i18n/ar.js` —
the registry id is the join key between `registry.js` and the translation
tables; nothing auto-derives one from the other.

### Lesson-level (`modules/shared/lesson-ui.js`)

Lessons implement **their own** EN/DE/AR tab bars inline (`.tab-content`,
`.tab-btn`), entirely independent of the shell's i18n. `lesson-ui.js`
provides:

- `switchTab(lang, btn)` — swaps the visible `.tab-content`, closes open
  accordions, refreshes progress bars, re-applies mindmap state, and posts
  `lms:langChanged` so the **shell's** language switcher follows along.
- **The language-availability guard** (`guardLanguageTab('ar')`, run on every
  `DOMContentLoaded`): if a lesson has no `#tab-ar` block (or an empty one),
  it auto-injects a friendly "not yet translated" banner with an optional
  "Request translation" link, instead of showing a blank tab. The moment a
  real `#tab-ar` block with content is added to the file, the guard steps
  aside automatically — no flag to flip.
- On load, the shell's saved language preference (`localStorage['lms_lang']`)
  is read and applied immediately, so a lesson opened from a German-language
  session opens already on the German tab.

**Practical implication:** translating the *shell chrome* (buttons, nav
labels) means editing `i18n/de.js` / `i18n/ar.js`. Translating *lesson
content* means adding a `#tab-de` / `#tab-ar` block inside that specific
lesson's HTML file. These are unrelated tasks.

---

## 9. The admin console

`lms/admin/index.html` + `core/admin.js`. Gate: on boot, it checks
`users/{uid}.role === 'admin'`; anyone else gets a plain "Access denied"
message rendered over the whole page. There are four tabs:

### Users tab (default)

A table of every user in `userIndex` (kept up to date by `upsertUserIndex()`,
called on every sign-in from `app.js`). Per row:

- Tier `<select>` (`handleTierChange`) — writes `users/{uid}.tier`.
- Role promote/demote button (`handlePromote`) — toggles `role: 'admin'`.
- **Module access chips**, grouped by field (shared modules get a chip per
  field they belong to, kept in sync across duplicates by the toggle
  handler). Each chip is a 3-state control:
  - unset (follows tier/platform default, marked with `*`)
  - granted (green)
  - revoked (red)
- Bulk actions per user: grant-all / revoke-all / grant-field / revoke-field
  (`handleBulkAction`).
- An **access-mode banner** at the top reminds the admin what
  `LMS_CONFIG.accessControl.mode` currently is, since that's the ultimate
  fallback for anything left unset.

### Categories tab

One **tier card** per entry in `TIER_DEFS`
(`anonymous`/`free`/`pro`/`custom`/`admin`; `admin` is rendered read-only —
admins always have full access by code, not by tier config). Each card has
the same chip grid as the Users tab, but writes to `tiers/{tierId}` instead
of a per-user doc — this is what "tier defaults" actually configure.
`tiersLoadError` is surfaced inline if the `tiers` collection's Security
Rules haven't been deployed yet, rather than crashing the rest of the panel.

### Requests tab

Review queue for `personalizedLessonRequests`, filterable by status
(`all`/`pending`/`in_review`/`fulfilled`/`declined`), grouped by requesting
user (collapsible groups). Each request card shows the topic, the
questionnaire answers, and the target-job/target-abilities content (each is
either inline text or a linked uploaded file — `renderTargetRow` handles
both). Actions (`handleRequestAction`) let an admin mark **in review**,
**decline** (with an optional note shown back to the user), or **fulfill**
by pasting in authored HTML — this calls `publishPersonalizedLesson()` in
`db.js`, which writes the lesson doc *before* stamping the request
`fulfilled`, so a user can never observe a "fulfilled" request with no
matching lesson.

### Courses tab

List view → **Course Editor** (`editingCourseId`) → **lesson editor**
(`editingLessonId`) nested inside it.

- List view filters by `coursesViewFilter` (`'active'` = draft+published,
  `'archived'`). Per-course actions: edit, publish/unpublish toggle, archive,
  restore, permanently delete, **clone**.
- Editor: title/subtitle/icon/fieldId/order/`requiresAuth`/`requiresPro`
  form (`handleSaveCourseMeta`), plus an ordered lesson list with
  add/edit/delete/reorder (move up/down — `handleMoveLesson`) actions. A
  lesson's content is authored as a raw HTML blob (textarea, monospace) —
  there is **no WYSIWYG editor**; the admin pastes finished lesson HTML
  directly.
- `syncCourseRegistry()` runs once after `loadCourses()` resolves and merges
  every course id/title into the same `MODULE_IDS`/`MODULE_TITLES` lookup
  tables the Users/Categories tabs already use — this is *why* courses get
  access-control chips identical to static modules with zero special-casing
  in the chip-rendering code.

---

## 10. Personalized Lessons

A per-user, request-then-fulfill workflow, deliberately **not** part of
`LMS_CONFIG.fields` — it's keyed entirely on Firestore data and the sentinel
`activeFieldId === 'personalized'` inside `app.js`.

**Learner side** (`renderPersonalizedShell` and friends in `app.js`):

1. Signed-out visitors see a "sign in required" panel — the field is fully
   gated on auth, enforced again at the Firestore Security Rules layer (a
   user can only query their own request/lesson subcollections).
2. Signed-in users see: a "+ New request" sidebar entry, a list of fulfilled
   lessons, and pending/declined request cards.
3. The request form (`renderPersonalizedForm` / `handlePersonalizedSubmit`)
   collects: topic (preset list or custom), role, level, goal, gaps,
   deadline, plus **target job** and **target abilities**, each of which can
   be *either* typed text *or* an uploaded file (`renderToggleField` /
   `getToggleFieldMode` implement that write/upload toggle), and an optional
   CV/profile file.
4. **Client-side file validation** happens for every attached file *before*
   any Firestore write: only `application/pdf`,
   `application/msword`, or
   `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
   and a 5 MB ceiling (`PL_MAX_FILE_SIZE`). The same rule set applies
   uniformly to all three possible file fields.
5. On submit: create the request doc, then upload each attached file and
   patch its URL back onto the request (`uploadProfileFile` +
   `updatePersonalizedRequestFile`, each file namespaced by `kind` so they
   never collide in Storage).

**Admin side**: see [§9 → Requests tab](#9-the-admin-console). Fulfillment
is manual — an admin (or an admin pasting AI-generated output) writes the
lesson HTML directly into the fulfillment form; there's no automated
generation pipeline in this codebase.

**Content delivery**: fulfilled lessons store `html` (or `htmlStorageURL`)
inline in Firestore rather than as a static file. `loadInlineHtmlLesson()`
in `app.js` turns that into a `Blob` URL (`URL.createObjectURL`) and points
the lesson `<iframe>` at it, revoking the previous Blob URL on every switch
to avoid leaking object URLs.

---

## 11. Dynamic Courses (admin-authored)

The "real" multi-learner equivalent of personalized lessons: an admin
authors a full course (title + ordered lessons) once, via the **Courses**
admin tab, and it becomes visible to **every** eligible learner — not just
one.

- Stored as `courses/{courseId}` + `courses/{courseId}/lessons/{lessonId}`
  (see [§5](#5-firestore-data-model)).
- `loadCourseModules()` in `app.js` fetches every `published` course, runs
  it through the **same** per-user/tier/`accessControl.mode` precedence
  chain `access.js` uses for static modules (course id is just another key
  in the same access maps), and reshapes the result into the same
  `{ id, title, subtitle, lessons }` shape a static `LMS_CONFIG` module has —
  so every other piece of code (`getFieldModules`, `openLesson`,
  `renderLessonNav`, `computeModuleProgress`, …) treats a dynamic course
  exactly like a static module, with no branching.
- A course's `requiresAuth`/`requiresPro` is **OR'd into every one of its
  lessons** — gating the whole course in one toggle, without having to also
  set the flag on each lesson individually.
- Content delivery is identical to personalized lessons:
  `html`/`htmlStorageURL` → Blob URL → iframe.
- Course management actions in `db.js` are deliberately reversible by
  default: `archiveCourse()`/`restoreCourse()` are the normal path;
  `permanentlyDeleteCourse()` is a separate, clearly-irreversible function.

---

## 12. Setup & deployment guide

### Prerequisites

- A Firebase project with **Authentication** (Google + Email/Password
  providers enabled), **Firestore**, and **Storage** turned on.
- Deploy the project's **`firestore.rules`** and **`storage.rules`** — see
  [§5a](#5a-firestore-security-rules-confirmed) /
  [§5b](#5b-storage-security-rules-confirmed) for the full, confirmed
  contents and rationale of each rule. Use the Firebase CLI
  (`firebase deploy --only firestore:rules,storage:rules`) or paste them
  into the console's Rules tab for the respective product.
- Storage CORS configured — `cors.json` at the repo root is the config to
  apply via `gsutil cors set cors.json gs://<your-bucket>` (or the Firebase
  CLI equivalent) so uploads from your site's origin succeed.
- A static file host that serves the `docs/` folder as-is (e.g. GitHub
  Pages with the included `CNAME`, or any static host/CDN).

### Configuring the project

1. Replace the values in `lms/core/firebase-config.js` with your Firebase
   project's web config (Project Settings → General → "Your apps" → Web app).
   This file is safe to commit.
2. Bootstrap your first admin: sign up normally through the app, then
   manually set `role: 'admin'` on that user's `users/{uid}` document in the
   Firebase console (there's no seed script for this in the reviewed files).
   Every subsequent promotion can be done from the admin Users tab.
3. Decide your platform default: `LMS_CONFIG.accessControl.mode` in
   `registry.js` — `'open'` (recommended to start; you opt modules *out*)
   vs `'controlled'` (everything hidden until explicitly granted, via the
   Categories tab or per-user overrides).
4. If you want tier-based defaults beyond "everything default-open," visit
   the admin **Categories** tab once per tier and save — until a tier is
   saved at least once, it's treated as "not configured" and falls through
   to the platform default.

### Local development

There's no bundler or dev server baked into this repo (no `package.json`
scripts were reviewed) — because everything is static files + native ES
modules, any simple static file server works, e.g.:

```bash
cd docs
python3 -m http.server 8080
# then open http://localhost:8080/
```

Note the cache-busting logic in `app.js`'s `openLesson()`: it only appends a
`?_cb=<timestamp>` query string when `location.hostname` is `localhost` or
`::1`, specifically to defeat browser caching of lesson HTML during local
editing. Any other host serves lessons with normal HTTP caching — so if
you're testing under a different local hostname/IP, you may see stale
cached lesson content after edits.

### Deploying

Since this is a static site, "deploying" is just "push the updated `docs/`
folder to whatever your static host serves from" (e.g. `git push` to the
branch GitHub Pages is configured to publish, if that's the hosting model
implied by `CNAME`). There's no server-side build to run.

---

## 13. Content authoring guide

### A. Adding a new static module (the `LMS_CONFIG` path)

1. **Create the lesson HTML files** under `lms/modules/<your-track>/`. Each
   lesson page should:
   - Link `../shared/theme.css` for the design system.
   - Include `<script src="../shared/lesson-ui.js"></script>`.
   - Use the `.tab-content` / `.tab-btn` pattern for language tabs (at
     minimum `#tab-en`; add `#tab-de` / `#tab-ar` when translations exist —
     see [§8](#8-internationalization-i18n)).
   - Use `.q-card` / `.q-trigger` (`onclick="toggle(this)"`) / `.q-panel` for
     any checklist-tracked content (see the markup pattern in
     `Interview-main/general.html` for a concrete example).
   - If the lesson links to sibling lessons, prefer
     `window.parent.postMessage({ type: 'lms:openLesson', route: '...' }, '*')`
     over a raw `<a href>` so the shell sidebar stays in sync — `lesson-ui.js`
     doesn't do this for you automatically; it's a pattern you replicate per
     link/button in the lesson's own inline script.
2. **Register the module** in `core/registry.js`: add a module object with
   `id`, `title`, `subtitle`, `theme`, and a `lessons` array. For each
   lesson, set `route` to its path relative to the site root, and set
   `progress`:
   - `{ type: 'checklist', storageKey: '<unique key>', total: <# of .q-card
     on the page>, ignoreKeys?: [...] }` — pick a `storageKey` that doesn't
     collide with any other lesson's key across the whole registry (progress
     is global, not per-field).
   - `{ type: 'untracked', total: 0 }` for overview/masterplan pages.
3. **(Optional) Add it to a field** — push the new module's `id` into a
   field's `moduleIds` array, or add a new field object, so it's reachable
   from the fields-landing screen.
4. **(Optional) Add an `indexRoute`** if the module should show a real
   table-of-contents on selection (see `lesson_index.html` for the pattern —
   it posts `lms:openLesson` for each card and falls back to a plain
   navigation when opened outside the shell).
5. **(Optional) Override default access** for this module from the admin
   Categories tab (tier defaults) or Users tab (per-user overrides) if the
   platform isn't fully `'open'`.

If you're duplicating an existing module into the personalized tree
(`lms/personalied_modules/`), follow the same steps but register it as a
separate module id (e.g. `<name>-pers`) with `route`s pointing at the
`personalied_modules/` copies, and a `storageKey` namespaced (existing
convention: `lms_local_<slug>_done`) so it never collides with the shared
version's progress key.

### B. Adding content via the admin Course Manager (no file edits)

Use this path when content doesn't need to live in the git repo as a
static file — e.g. AI-drafted or frequently-revised material.

1. Admin console → **Courses** tab → **New course**. Set title/subtitle/
   icon, optionally assign a `fieldId` so it appears grouped with static
   modules in a field, and `requiresAuth`/`requiresPro` if it should be
   gated.
2. Inside the course editor, **add lessons** one at a time: title, subtitle,
   and a raw HTML blob pasted into the lesson editor's textarea. There is no
   visual editor — paste complete, self-contained HTML (you can reuse the
   same `theme.css`/`lesson-ui.js` patterns as static lessons if you want
   consistent styling and progress tracking, by linking them with absolute
   URLs since the content isn't served from a fixed relative path).
3. Reorder lessons with the up/down controls; the course stays in **draft**
   until you explicitly **publish** it from the list view.
4. Once published, it's visible to any learner whose tier/per-user access
   map (or the platform default, if unconfigured) allows it — exactly like a
   static module, with chips for it appearing automatically in the Users and
   Categories admin tabs.

### C. Fulfilling a Personalized Lesson request

This is conceptually the same as (B) but scoped to one user and triggered by
their request: admin console → **Requests** tab → open a pending request →
review the questionnaire/attachments → paste authored HTML into the
fulfillment form → fulfill. See [§10](#10-personalized-lessons).

### D. Styling conventions

- Lesson pages and the SPA/admin shells use **two separate design systems**
  — don't mix them up:
  - **`core/styles.css`** (confirmed) — the SPA shell + fields-landing
    stylesheet, internally labeled *"CLIDATECH LMS — Enhanced Design
    System"*. It defines **two parallel token sets**:
    - Light tokens (`--bg`, `--surface`, `--surface-2`, `--text`, `--muted`,
      `--border`, `--danger`, `--accent`, `--accent-soft`, `--cyan`) for the
      main content area (`.main`, `.welcome-panel`, `.fields-landing`,
      `.field-card`).
    - A **separate dark-navy sidebar palette** (`--sb-bg`, `--sb-surface`,
      `--sb-text`, `--sb-muted`, `--sb-accent`, `--sb-danger`, etc.) used
      exclusively by `.sidebar` and everything inside it (`.nav-btn`,
      `.auth-btn`, `.danger-btn`, `.tier-badge`, `.admin-link`). The design
      intent (per the file's own banner comment) is explicitly "no black" —
      a deep navy/indigo sidebar rather than `#000`/pure black.
    - `updateTheme()` in `app.js` only ever overrides `--accent` /
      `--accent-soft` (the *light* tokens) from a module's `theme` config —
      it does not touch the `--sb-*` sidebar tokens, so per-module accent
      colors show up in the field cards and main content but the sidebar's
      indigo stays constant regardless of which module is active.
    - Locked-state classes worth knowing if you're styling new UI:
      `.field-card.locked` (faded, `cursor: not-allowed`),
      `.nav-btn.locked` (faded sidebar entry, no click),
      `.pl-entry-btn.locked` (the Personalized Lessons landing entry, same
      treatment). All three reduce opacity rather than hiding the element —
      a locked field/module/entry is still visible (so the user knows it
      exists) just visibly disabled.
    - `index.html` also loads **`core/styles_enhanced.css`** immediately
      after this file. That second file was **not** part of this review —
      see [§16](#16-known-gaps--suggested-next-uploads) for the residual
      open question of what it actually contains versus this file (whose
      own internal name already says "Enhanced Design System," which is a
      bit confusing alongside a *second*, differently-named "enhanced"
      stylesheet — these may have been merged/renamed at some point and
      `styles_enhanced.css` could now be a thin leftover, or it could carry
      meaningful additional rules; don't assume either way).
  - **`modules/shared/theme.css`** (and the duplicated copy under
    `personalied_modules/shared/`) — the *lesson content* design system:
    its own, completely separate token set (`--navy`, `--slate`, `--blue`,
    `--pill-l1..l4`, etc.), its own `.q-card`/`.tab-content`/accordion
    styling, RTL rules, and the Google Fonts import (Cairo for Arabic, IBM
    Plex Sans/Mono otherwise). It shares no tokens with `core/styles.css` —
    a lesson page never references `--accent`/`--sb-*`, and the shell never
    references `--navy`/`--pill-l1`.
- RTL support in the shell mirrors the sidebar's whole layout, not just
  text alignment: `[dir="rtl"] .app-shell` flips the CSS grid so the
  sidebar column renders on the right, `.sidebar` swaps its border side, and
  `.nav-btn.active`'s left accent bar moves to the right — all declared once
  in `core/styles.css`'s RTL block rather than per-component.
- RTL support **inside lessons** is automatic once a lesson has a real
  `#tab-ar` block — the guard in `lesson-ui.js` only needs the block's
  *existence*; the RTL CSS in `theme.css` (`[dir="rtl"] ...` rules) and the
  `dir="rtl"` attribute you put directly on the `#tab-ar` element do the
  rest.

---

## 14. Gotchas & constraints

A running list of non-obvious constraints, pulled directly from in-code
comments — worth knowing before you touch the relevant file:

- **ES module import specifiers must be static string literals.** You
  cannot build the Firebase CDN URL dynamically — it throws a `SyntaxError`
  that breaks the whole module graph. The SDK version (`10.12.0`) is pinned
  identically in `auth.js`, `db.js`, and `admin.js`; update all three
  together.
- **`initializeApp()` is called more than once** (in `auth.js` and `db.js`
  independently) — this is intentionally safe; Firebase de-duplicates by
  project ID and returns the same app instance either way.
- **Composite Firestore index required** for `getPublishedCourses()`
  (`status` equality + `order` sort on `courses`) — and the same pattern
  recurs for `personalizedLessonRequests` queries. If a query throws on a
  missing index, Firestore's error message contains a direct console link
  to create it.
- **Progress keys (`storageKey`) are global, not per-field/module.** A
  module shared across two fields (e.g. `python`) has exactly one progress
  record. Don't assume field-scoped isolation when picking new keys.
- **`q_<index>` progress is index-based, not id-based.** If you reorder or
  insert `.q-card` elements in an existing, already-in-use lesson, you will
  silently corrupt that lesson's progress data for anyone who already has
  partial progress (their `q_2: true` will now point at a different
  question). Append new cards at the end, or treat the `total` change as a
  breaking change you should communicate.
- **Access-control resolution order matters for UX, not just correctness**:
  `app.js`'s `onAuthChange` handler deliberately resolves and renders
  visibility (`getVisibleModules`) **before** running
  `migrateLocalStorageToFirestore()` (which can take several seconds for
  users with lots of local progress) — otherwise users would see a flash of
  "everything unlocked" (the pre-sign-in/likely-more-permissive state) while
  waiting for the slower progress merge.
- **Lesson access gating is enforced twice on purpose**: once in the normal
  `openLesson(lessonId)` path, and again on the `lms:openLesson` postMessage
  handler — so a lesson iframe can't bypass gating by asking the parent to
  navigate to a route it isn't allowed to open via the sidebar.
- **Archived ≠ deleted** for courses: an archived course's Firestore
  document and lesson subcollection remain fully intact; only its
  visibility (learner query + admin access-chip registries) is suppressed.
  Per-user/tier access-map entries for that course id also survive and
  silently reactivate if the course is restored.
- **Deleting a single course lesson is irreversible** and can orphan a
  learner's checklist progress doc if that lesson used
  `{ type: 'checklist', storageKey }`. Prefer editing lesson HTML in place;
  if deletion is necessary, unpublish the course first.
- **Local dev cache-busting only triggers on `localhost`/`::1`** — testing
  from another local hostname or IP won't get the `?_cb=` query string, so
  you may see stale cached lesson HTML there.
- **The `personalied_modules` folder name is a kept typo**, not a bug — the
  registry comment explicitly says it's left as-is to match the existing
  directory rather than risk breaking existing routes by renaming it.
- **`isAdmin()` in `firestore.rules` needs both of its guards, not just
  one.** `exists()` before `get()` protects brand-new users (no `users/{uid}`
  doc yet); `.data.get('role', '')` instead of `.data.role` protects any doc
  that exists but happens not to have a `role` field. Either guard alone can
  still throw for the other case — Firestore rules `throw` (denying the
  whole request) rather than evaluating to `false` on a bad `get()`/missing
  field, which is why a seemingly-redundant double-guard is actually load-
  bearing here. Worth keeping in mind if you ever write a similar
  `isXyz()` helper elsewhere in the rules.
- **Course-lesson `htmlStorageURL` content has no matching Storage rule.**
  `db.js` supports storing a course lesson's HTML in Storage instead of
  inline Firestore `html`, but the deployed Storage rules only grant access
  under `profile-uploads/{uid}/{requestId}/{fileName}` — anything else is
  denied by the final catch-all. If this code path is ever actually
  exercised (vs. always using inline `html`), it will fail until a matching
  Storage rule is added.
- **`personalized_module.html`'s header comment is a stale copy-paste** from
  `module.html` — it still says `module.html — redirect shim` and describes
  `lms/modules/` paths even though the file lives in
  `lms/personalied_modules/`. The redirect itself works fine either way (the
  `../../index.html` relative path is correct at that depth too); it's a
  documentation accuracy issue inside the file, not a functional bug.

---

## 15. File reference

| File | Role |
|---|---|
| `index.html` | **Root SPA shell** — `#account-bar` (auth), `#fields-landing`, `#app-shell`; loads `core/app.js` |
| `core/registry.js` | `LMS_CONFIG` — fields/modules/lessons content tree + `accessControl.mode`; `LANG_KEY` |
| `core/access.js` | Resolves module/field visibility (admin → per-user → tier → platform default) |
| `core/auth.js` | Firebase Auth wrapper: sign-in/up/out, `onAuthChange` |
| `core/db.js` | All Firestore + Storage reads/writes: profiles, progress, access maps, tiers, personalized lessons, courses |
| `core/firebase-config.js` | Public Firebase project config |
| `core/i18n.js` | Shell-level language loader (`loadLanguage`, `t`, `applyTranslations`) |
| `core/progress.js` | Pure localStorage progress math, importable anywhere |
| `core/app.js` | Learner-facing SPA controller — the largest file; owns all UI state and rendering for the main shell |
| `core/admin.js` | Admin console controller — Users / Categories / Requests / Courses tabs |
| `core/styles.css` | SPA shell stylesheet — light tokens for main content + a separate dark-navy `--sb-*` token set for the sidebar. Linked by the admin shell too, but admin's tab/table/tier-card chrome is styled inline in `lms/admin/index.html` instead, not from this file |
| `core/styles_enhanced.css` | Loaded by `index.html` right after `styles.css` — **not reviewed**, relationship to `styles.css` unconfirmed, see §16 |
| `lms/admin/index.html` | Admin console HTML shell (loads `core/admin.js`) |
| `lms/fields/field.html` | Legacy redirect shim: old `field.html?id=` URLs → `index.html?field=` |
| `lms/modules/module.html` | Legacy redirect shim: old `module.html?id=&from=` URLs → `index.html?field=&module=` |
| `lms/personalied_modules/personalized_module.html` | Duplicate of `module.html`'s redirect shim (stale internal comment, see §3) |
| `firestore.rules` | Confirmed deployed Firestore Security Rules — see [§5a](#5a-firestore-security-rules-confirmed) |
| `storage.rules` | Confirmed deployed Storage Security Rules — see [§5b](#5b-storage-security-rules-confirmed) |
| `modules/shared/lesson-ui.js` | Lesson-page runtime: tabs, accordions, q-card progress bridge, mindmaps, AR-translation guard |
| `modules/shared/theme.css` | Lesson-page design system (tokens, `.q-card`, tab/accordion styling, RTL rules) |
| `modules/Interview-main/lesson_index.html` | Example module table-of-contents page (`indexRoute` pattern) |
| `modules/Interview-main/general.html` | Example lesson using the `.q-card` checklist pattern |
| `modules/Interview-main/topic0-mindmap.html` | Example lesson using the mindmap pattern |
| `i18n/de.js` | German shell-chrome translation table (confirmed) — sparse override map, see §8 |
| `i18n/ar.js` | Arabic shell-chrome translation table — **not reviewed**, see §16 |
| `CNAME` | Custom domain for the static host (implies GitHub Pages) |
| `cors.json` | Firebase Storage CORS policy |

---

## 16. Known gaps / suggested next uploads

**Resolved since the last revision** — `firestore.rules`, `storage.rules`,
`module.html`, `personalized_module.html`, and `lms/i18n/de.js` were all
provided and are now incorporated (see §5a, §5b, §3, and §8 respectively).

What's still open, roughly in order of how much it'd change the doc:

1. **`lms/core/styles_enhanced.css`** — loaded by `index.html` right after
   `styles.css`. Still unreviewed, and now there's a specific open question
   (not just "missing file"): the `styles.css` you provided already
   internally calls itself an *"Enhanced Design System"* in its own banner
   comment, which sits oddly next to a second, separately-named
   `styles_enhanced.css`. Possibilities I can't currently distinguish:
   (a) `styles_enhanced.css` is an older/now-mostly-superseded file and the
   `<link>` to it in `index.html` is a leftover that should probably be
   removed, (b) it carries a meaningful further layer of overrides on top
   of what you provided, or (c) the naming is just an unrelated historical
   accident. Worth a direct look before this becomes a governance claim
   either way.
2. **`lms/i18n/ar.js`** — the Arabic counterpart to the now-confirmed
   `de.js`. Same sparse-override shape is assumed but not verified — in
   particular I can't confirm whether `ar.js` covers exactly the same key
   set as `de.js` (translation parity isn't enforced anywhere in code, so
   it's plausible one language lags the other for some keys).
3. **The `lms/governance/*.md` files** — still intentionally unread, per
   your note that you're going the other direction. One addition worth a
   quick gut-check once you're editing: the rules files revealed a couple
   of real, specific gotchas (the `isAdmin()` two-guard fix in
   `firestore.rules`; the missing Storage rule for course-lesson
   `htmlStorageURL`) that read like exactly the kind of thing governance
   docs are meant to capture so they don't get silently "fixed" backwards
   by a future contributor who doesn't know why they're there.
4. **Lower priority / likely fine to skip:** the remaining static lesson
   files (`topic2`–`topic6`, the `database`/`python`/`react`/`react-native`
   tracks) — §13's authoring patterns were drawn from `general.html`,
   `topic0-mindmap.html`, and `topic1-gics-gpas.html`, and the rest appear
   (per the registry) to follow the same `.q-card`/tab-bar conventions, so
   they're unlikely to change the doc. Same goes for `package.json`,
   `migrate_db_module.py`, `tree_gen.py`, `CHAT_GUIDE.md`,
   `LMS_UPGRADE_PROMPT.md`, and `analysis report` — these read as
   process/tooling artifacts rather than parts of the live app, but I'm
   guessing from filenames alone since none were uploaded.
