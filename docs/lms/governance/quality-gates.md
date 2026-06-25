# Module Onboarding Quality Gates

Use this checklist for each new module pack onboarding, whether it's a
static file-based module, a dynamic admin-authored course, or a fulfilled
personalized lesson.

## Content & navigation
- [ ] **Content integrity**: all lesson routes load successfully.
- [ ] **Navigation correctness**: module selector and lesson selector
  operate without dead links, including any `indexRoute` table-of-contents
  page.
- [ ] **Contract compliance**: module/lesson metadata matches the required
  contract fields (see `module-authoring-guide.md`).

## Progress
- [ ] **Progress persistence**: lesson completion state persists across
  refresh, and the chosen `storageKey` doesn't collide with any other
  lesson's key in the registry.
- [ ] **Reset behavior**: global reset clears all checklist progress keys.
- [ ] **Global analytics**: module and LMS percentages update after lesson
  changes.
- [ ] **No silent progress corruption**: if an existing lesson's `.q-card`
  elements were reordered or had cards inserted, confirm this was treated
  as a breaking change (see `naming-versioning-conventions.md`) rather than
  shipped silently.

## Access control
- [ ] **Visibility precedence**: the new module/course resolves access
  correctly through the admin → per-user → tier → platform-default chain
  for at least one signed-out, one free-tier, and one pro-tier (or
  equivalent) test case.
- [ ] **Lesson-level gating**: if any lesson sets `requiresAuth` or
  `requiresPro`, confirm the gate triggers correctly on both the normal
  navigation path and the `lms:openLesson` postMessage path.
- [ ] **Security Rules coverage**: if the change introduces a new
  Firestore or Storage data path, confirm `firestore.rules`/
  `storage.rules` actually grant the access the feature needs — a
  client-side check alone is not sufficient, since the rules are the real
  authorization boundary.
- [ ] **Admin console reflects the change**: access chips for the new
  module/course appear correctly in the Users and Categories tabs, and
  bulk grant/revoke actions behave as expected.

## i18n
- [ ] **Shell-level keys**: if the module/field introduces new ids, add
  the corresponding `module.<id>.*` / `field.<id>.*` / `lesson.<id>.*` keys
  to `i18n/de.js` and `i18n/ar.js` if translations are available (missing
  keys fall back silently to the English string, so this is non-blocking
  but should be tracked).
- [ ] **Lesson-level tabs**: each lesson has at least `#tab-en`; any
  `#tab-de`/`#tab-ar` blocks added render correctly and the
  "not yet translated" fallback behaves correctly where a language tab is
  intentionally omitted.

## UX consistency
- [ ] **UX consistency**: shared shell styling and component behavior
  remain consistent — lesson pages use `modules/shared/theme.css` design
  tokens, not the shell's `core/styles.css` tokens (the two systems are
  separate and don't share variables).