# Contribution Workflow

There are three distinct ways to add content to this LMS — pick the one
that matches what's being added before starting:

| Path | Use when | Registered in |
|---|---|---|
| A. Static file-based module | Content should live in git, version-controlled | `docs/lms/core/registry.js` |
| B. Admin-authored dynamic course | Content doesn't need to be in git (AI-drafted, frequently revised) | Firestore, via the admin **Courses** tab |
| C. Personalized lesson fulfillment | One-off content scoped to a single learner's request | Firestore, via the admin **Requests** tab |

## A. Static file-based module
1. Add or update module lesson files under `docs/lms/modules/<module-id>/`
   (or `docs/lms/personalied_modules/<module-id>_pers/` for a personalized
   variant — see `repository-structure.md` for the distinction).
2. Register module/lesson entries in `docs/lms/core/registry.js`, following
   `module-authoring-guide.md` and `naming-versioning-conventions.md`.
3. If the module/field introduces new ids and translations are available,
   add the corresponding keys to `docs/lms/i18n/de.js` and
   `docs/lms/i18n/ar.js`.
4. Validate navigation and progress in `docs/index.html`.
5. Verify reset behavior and aggregate percentages.
6. If the module sets `requiresAuth`/`requiresPro` on any lesson, or relies
   on a new per-user/tier access setting, verify the access chip appears
   correctly in the admin **Users**/**Categories** tabs and that the
   gating actually triggers for a signed-out and/or free-tier test user.
7. Run available repository checks (if none exist, complete manual browser
   validation per `quality-gates.md`).
8. Update governance docs when contract/rules change.

## B. Admin-authored dynamic course
1. Admin console → **Courses** tab → create/edit the course and its
   lessons (raw HTML, no visual editor — see the LMS platform
   documentation for the full authoring flow).
2. Confirm the course stays in **draft** until intentionally published.
3. After publishing, verify it appears for an eligible learner and that
   its access chip appears in the Users/Categories tabs alongside static
   modules.
4. No `registry.js` edit, no governance doc update is needed unless the
   change reveals a gap in the documented conventions themselves.

## C. Personalized lesson fulfillment
1. Admin console → **Requests** tab → review the pending request and its
   attachments.
2. Paste authored HTML into the fulfillment form and fulfill.
3. Confirm the learner can see the fulfilled lesson under their
   Personalized Lessons panel.

## Whenever a contribution touches shared infrastructure
- Any change to `firestore.rules` or `storage.rules` must be deployed
  alongside the code change it supports, and the rationale recorded in
  governance docs if it changes who can read/write an existing data path.
- Any change to the `LMS_CONFIG` contract shape, a storage-key convention,
  or a Security Rule's effective access must be reflected in
  `naming-versioning-conventions.md` and/or `module-authoring-guide.md` in
  the same change, not as a follow-up.