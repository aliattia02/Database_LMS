import { LMS_CONFIG, LANG_KEY } from './registry.js';

document.title = LMS_CONFIG.appName;

import { loadLanguage, applyTranslations, t } from './i18n.js';
import {
  onAuthChange,
  signInWithGoogle,
  signUpWithEmail,
  signInWithEmail,
  signOutUser
} from './auth.js';
import {
  getUserProfile,
  getLessonProgress,
  setLessonProgress,
  updateUserLang,
  upsertUserIndex,
  getPersonalizedLessons,
  getMyPersonalizedRequests,
  createPersonalizedRequest,
  uploadProfileFile,
  updatePersonalizedRequestFile,
  getPublishedCourses,
  getCourseLessons,
  getModuleAccess,
  getTierAccess
} from './db.js';
import { getVisibleModules, isAdmin } from './access.js';
import {
  safeReadStorage,
  getAllStorageKeys,
  computeLessonProgress,
  computeModuleProgress,
  computeGroupProgress
} from './progress.js';

// ── DOM REFERENCES ─────────────────────────────────────────────────────────
const moduleNav             = document.getElementById('module-nav');
const lessonNav             = document.getElementById('lesson-nav');
const progressBars          = document.getElementById('progress-bars');
const welcomePanel          = document.getElementById('welcome-panel');
const welcomeHeading        = document.getElementById('welcome-heading');
const welcomeBody           = document.getElementById('welcome-body');
const brandSubtitle         = document.getElementById('brand-subtitle');
const frame                 = document.getElementById('lesson-frame');
const resetButton           = document.getElementById('reset-progress');
const fieldsLanding         = document.getElementById('fields-landing');
const fieldsGrid            = document.getElementById('fields-grid');
const fieldsFooter          = document.getElementById('fields-footer');
const appShell              = document.getElementById('app-shell');
const backToFieldsButton    = document.getElementById('btn-back-fields');
// Field overview (module picker sub-page) — sits between fields-landing and
// app-shell. See enterField()/renderFieldOverview() below.
const fieldOverview          = document.getElementById('field-overview');
const fieldOverviewIcon      = document.getElementById('field-overview-icon');
const fieldOverviewTitle     = document.getElementById('field-overview-title');
const fieldOverviewSubtitle  = document.getElementById('field-overview-subtitle');
const moduleOverviewGrid     = document.getElementById('module-overview-grid');
const moduleLockNotice       = document.getElementById('module-lock-notice');
const backToFieldsFromOverviewButton = document.getElementById('btn-back-to-fields');
const personalizedPanel     = document.getElementById('personalized-panel');
// Auth panel elements
const authSignedOut         = document.getElementById('auth-signed-out');
const authSignedIn          = document.getElementById('auth-signed-in');
const authAvatar            = document.getElementById('auth-avatar');
const authDisplayName       = document.getElementById('auth-display-name');
const authTierBadge         = document.getElementById('auth-tier-badge');
const authError             = document.getElementById('auth-error');

// Floating account widget — fields-landing / field-overview pages (mirrors
// the sidebar auth panel above; see showSignedIn()/showSignedOut() below,
// which update both in lock-step). Shown/hidden by render().
const landingAccount        = document.getElementById('landing-account');
const landingLangSwitcher   = document.getElementById('landing-lang-switcher');
const landingSignedOut      = document.getElementById('landing-auth-signed-out');
const landingSignedIn       = document.getElementById('landing-auth-signed-in');
const landingAvatar         = document.getElementById('landing-auth-avatar');
const landingDisplayName    = document.getElementById('landing-auth-display-name');
const landingTierBadge      = document.getElementById('landing-auth-tier-badge');
const landingAuthError      = document.getElementById('landing-auth-error');

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const IFRAME_RELOAD_DELAY    = 50;
const PROGRESS_UPDATE_DELAY  = 150;
const PROGRESS_POLL_INTERVAL = 3000;

// ── STATE ──────────────────────────────────────────────────────────────────
let activeFieldId  = null;   // null → show fields landing (when LMS_CONFIG.fields is non-empty)
// Seeded from the first static module for the no-fields backward-compat case
// (renderShell() on boot). When fields ARE configured, render() doesn't just
// check this for truthiness — it checks field membership (see
// moduleIsValidForField) — so this seed value harmlessly routes a fresh
// field entry to the field-overview module picker instead of a stale shell.
let activeModuleId = LMS_CONFIG.modules[0]?.id ?? null;
let activeLessonId = null;

let currentUser  = null;     // firebase.User | null
let userProfile  = null;     // Firestore user document data | null

// module objects the current user can see — recomputed by getVisibleModules()
// on every auth change. Seeded optimistically from accessControl.mode so the
// very first synchronous render() (before onAuthChange resolves) doesn't
// show every field as locked on 'open' platforms.
let visibleModules = (LMS_CONFIG.accessControl?.mode ?? 'open') === 'open'
  ? LMS_CONFIG.modules
  : [];

// ── DYNAMIC COURSES (admin-authored via the Course Manager) ─────────────────
// Published courses + their lessons, fetched once at boot and reshaped to
// the same { id, title, subtitle, lessons: [...] } shape as a static
// LMS_CONFIG module — see loadCourseModules() below. Kept separate from
// visibleModules (rather than merged into it) so getFieldModules() can
// combine the two with field-aware logic that static modules don't need.
// Starts empty: there's no synchronous equivalent of LMS_CONFIG to seed from,
// since this data only exists in Firestore.
// Phase 4: visibility is now gated through the same per-user access map /
// tier default / accessControl.mode chain as static modules (see
// loadCourseModules). Course-level requiresAuth/requiresPro still applies
// at the lesson level as an additional guard.
let courseModules = [];

// Published dynamic courses the current user can SEE but can't open — metadata
// only (title/subtitle/fieldId), never their lessons. Kept separate from
// courseModules (which stays strictly "accessible") so nothing that resolves
// real lesson content can accidentally pick these up; only the field/module
// picker UI (getAllFieldModulesWithLock) reads this list. Populated alongside
// courseModules in loadCourseModules() below.
let lockedCourseModules = [];

// ── PERSONALIZED LESSONS STATE ──────────────────────────────────────────────
// This field is special-cased (see NEW_FIELD_PERSONALIZED_LESSONS_PROMPT.md):
// it is NOT in LMS_CONFIG.fields because its content is per-user Firestore
// data, not shared config. activeFieldId === 'personalized' is the sentinel
// app.js checks throughout render()/enterField()/etc. to switch into this mode.
let personalizedLessons      = [];     // fulfilled lessons for the current user (from getPersonalizedLessons)
let personalizedRequests     = [];     // all requests for the current user (from getMyPersonalizedRequests)
let personalizedView         = 'list'; // 'list' | 'form' — which sub-view the main panel shows
let personalizedFormPrefill  = null;   // topic string to pre-fill when "Request again" is clicked
let lessonBlobURL      = null;   // Blob URL currently loaded into the iframe (for revocation)
let moduleLockNoticeTimer = null; // auto-hide timer for the field-overview lock notice

const PL_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — see §5 of the governance prompt
const PL_ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// ── URL STATE ──────────────────────────────────────────────────────────────
// Keeps the browser URL in sync with activeFieldId / activeModuleId so that:
//   • The back/forward buttons work correctly within the SPA.
//   • field.html and module.html can redirect here with ?field=&module= and
//     land the user in exactly the right view (see those files for the shims).
//   • Users can bookmark or share a direct link to a specific module.
//
// replaceState is used (not pushState) so that navigating between modules
// doesn't pollute the history stack — only field entry/exit creates a new
// entry via pushState below.
function updateURL(push = false) {
  const params = new URLSearchParams();
  if (activeFieldId)  params.set('field',  activeFieldId);
  if (activeModuleId) params.set('module', activeModuleId);
  const search = params.toString() ? `?${params}` : location.pathname;
  if (push) {
    history.pushState(null, '', search);
  } else {
    history.replaceState(null, '', search);
  }
}

// ── PROGRESS HELPERS ───────────────────────────────────────────────────────
// safeReadStorage, getAllStorageKeys, computeLessonProgress, computeModuleProgress,
// and computeGroupProgress are imported from ./progress.js (Issue 2 fix).
// computeGlobalProgress is a thin local wrapper that scopes the group calc to
// the active field's modules — it is not generic enough for the shared module.

function computeGlobalProgress() {
  return computeGroupProgress(getActiveFieldModules());
}

// ── FIRESTORE SYNC (Phase 4) ───────────────────────────────────────────────

/**
 * Called on every 3-second poll tick when a user is signed in.
 * Reads all checklist storageKeys from localStorage and writes any non-empty
 * ones to Firestore. Lesson files only write to localStorage; this is the
 * bridge that makes those writes cross-device.
 *
 * Non-blocking — errors are swallowed so a transient network failure doesn't
 * break the progress poll cycle.
 */
async function syncProgressToFirestore() {
  if (!currentUser) return;
  const keys = getAllStorageKeys();
  for (const key of keys) {
    const localData = safeReadStorage(key);
    if (Object.keys(localData).length === 0) continue;
    try {
      await setLessonProgress(currentUser.uid, key, localData);
    } catch (err) {
      console.warn(`[LMS] syncProgressToFirestore: failed to sync key "${key}"`, err);
    }
  }
}

/**
 * Called once on sign-in, before the first render.
 * Reads the Firestore progress for every storageKey and merges it with
 * whatever is already in localStorage. Firestore wins on conflict — it holds
 * the most recent data from any device. Local-only keys that don't exist in
 * Firestore are preserved (the user may have worked offline since last sync).
 * The merged result is written back to both localStorage and Firestore so
 * both stores converge immediately.
 *
 * @param {string} uid
 */
async function migrateLocalStorageToFirestore(uid) {
  const keys = getAllStorageKeys();
  for (const key of keys) {
    try {
      const remote = await getLessonProgress(uid, key);   // {} if doc doesn't exist
      const local  = safeReadStorage(key);
      // Spread order: local first, remote second — remote wins on key conflicts.
      const merged = { ...local, ...remote };
      localStorage.setItem(key, JSON.stringify(merged));
      if (Object.keys(merged).length > 0) {
        await setLessonProgress(uid, key, merged);
      }
    } catch (err) {
      console.warn(`[LMS] migrateLocalStorageToFirestore: failed for key "${key}"`, err);
      // Continue — a failure on one key must not block the rest.
    }
  }
}

// ── DYNAMIC COURSES (admin-authored via the Course Manager) ─────────────────

/**
 * Fetches every published course, filters it through the same per-user /
 * tier / accessControl.mode precedence that access.js applies to static
 * modules, then reshapes each visible course into the same
 * { id, title, subtitle, lessons: [...] } shape as a static LMS_CONFIG
 * module — so getFieldModules() / openLesson() / renderLessonNav() /
 * computeModuleProgress() etc. all work without any special-casing.
 *
 * Access precedence (mirrors access.js / getLessonAccess):
 *   1. Per-user override in users/{uid}/access/modules — explicit true/false.
 *   2. Tier default in tiers/{tier} — fallback when no per-user override.
 *   3. LMS_CONFIG.accessControl.mode ('open' | 'controlled') — final fallback.
 *
 * A course's requiresAuth / requiresPro flags are OR'd into each of its
 * lessons (a lesson is gated if EITHER the course or the lesson requires it)
 * — this lets an admin gate an entire course in one toggle without also
 * having to set it on every lesson.
 *
 * Failures are logged, not thrown — a Firestore error here degrades to
 * "no dynamic courses this load" rather than breaking the whole boot.
 *
 * Returns BOTH lists: `accessible` courses (fully hydrated with lessons, as
 * before) and `locked` courses (metadata only — id/title/subtitle/fieldId,
 * lessons always `[]`). Locked courses are never sent to getCourseLessons(),
 * so no protected lesson content is ever fetched for a course the current
 * user can't open; the locked list exists purely so the field/module picker
 * can show "this exists, but you don't have access yet" cards.
 *
 * @param {string|null} uid   — current user uid, or null if signed out
 * @param {string|null} tier  — current user tier ('free'|'pro'|…), or null
 * @returns {Promise<{ accessible: object[], locked: object[] }>}
 */
async function loadCourseModules(uid = null, tier = null) {
  const accessMode = LMS_CONFIG.accessControl?.mode ?? 'open';

  let courses;
  try {
    courses = await getPublishedCourses();
  } catch (err) {
    console.warn('[LMS] boot: published courses fetch failed', err);
    return { accessible: [], locked: [] };
  }

  // Fetch the per-user and tier access maps in parallel.
  // These are the same Firestore docs that access.js reads for static modules —
  // running them here in parallel with getVisibleModules() means only one
  // extra round-trip even if the SDK doesn't cache the reads.
  const [accessMap, tierMap] = await Promise.all([
    uid  ? getModuleAccess(uid).catch(() => null) : Promise.resolve(null),
    tier ? getTierAccess(tier).catch(() => null)  : Promise.resolve(null)
  ]);

  // Split: courses this user is allowed to see vs. ones that exist but are
  // currently locked to them. Precedence: per-user override → tier default
  // → accessControl.mode.
  const isCourseVisible = course => {
    if (accessMap !== null && course.id in accessMap) return accessMap[course.id];
    if (tierMap   !== null && course.id in tierMap)   return tierMap[course.id];
    return accessMode === 'open';
  };
  const visibleCourses = courses.filter(isCourseVisible);
  const lockedCourses  = courses.filter(c => !isCourseVisible(c));

  const lessonsByCourse = await Promise.all(
    visibleCourses.map(course =>
      getCourseLessons(course.id).catch(err => {
        console.warn(`[LMS] boot: lessons fetch failed for course "${course.id}"`, err);
        return [];
      })
    )
  );

  const accessible = visibleCourses.map((course, i) => ({
    id:           course.id,
    title:        course.title,
    subtitle:     course.subtitle,
    fieldId:      course.fieldId ?? null,
    dynamic:      true,   // distinguishes from static LMS_CONFIG modules where relevant
    lessons:      lessonsByCourse[i].map(lesson => ({
      ...lesson,
      requiresAuth: course.requiresAuth || lesson.requiresAuth,
      requiresPro:  course.requiresPro  || lesson.requiresPro
    }))
  }));

  const locked = lockedCourses.map(course => ({
    id:       course.id,
    title:    course.title,
    subtitle: course.subtitle,
    fieldId:  course.fieldId ?? null,
    dynamic:  true,
    lessons:  []
  }));

  return { accessible, locked };
}

// ── FIELD / MODULE SCOPING ─────────────────────────────────────────────────

/**
 * Returns every module — static LMS_CONFIG modules AND published dynamic
 * courses — that belongs to a given field AND is currently accessible to
 * the signed-in/anonymous user. When fieldId is falsy (or doesn't match a
 * configured field — e.g. it was removed from the registry), falls back to
 * all accessible static modules plus every accessible dynamic course that
 * isn't assigned to any field, mirroring the original "show everything"
 * fallback.
 *
 * This is the function the module SHELL trusts: getActiveFieldModules()
 * (sidebar nav, lesson nav, openLesson(), renderModuleLanding()) calls this
 * so nothing can ever be entered/loaded that the user doesn't have access
 * to. The landing/overview picker pages use getAllFieldModulesWithLock()
 * below instead, which additionally lists locked modules for browsing.
 *
 * @param {string|null} fieldId
 * @returns {Array<object>}
 */
function getFieldModules(fieldId) {
  const field = fieldId ? LMS_CONFIG.fields?.find(f => f.id === fieldId) : null;

  const staticMods = field
    ? field.moduleIds.map(id => visibleModules.find(m => m.id === id)).filter(Boolean)
    : visibleModules;

  const dynamicMods = field
    ? courseModules.filter(c => c.fieldId === fieldId)
    : courseModules.filter(c => !c.fieldId);

  return [...staticMods, ...dynamicMods];
}

/**
 * Like getFieldModules(), but returns EVERY module that belongs to the
 * field — including ones the current user can't access — each annotated
 * with a `locked` boolean. Used only by the landing-page field cards and
 * the field-overview module picker, so people can see what's inside a
 * track/module before they have access to it.
 *
 * This never grants access to anything: the module SHELL still resolves
 * exclusively through getFieldModules()/getActiveFieldModules(), so a
 * `locked: true` entry from here can only ever be displayed, not entered.
 * Static modules are annotated by checking membership in `visibleModules`
 * (no extra Firestore read needed — that list is already the source of
 * truth for "accessible"); dynamic courses are annotated by which of the
 * two lists populated by loadCourseModules() they came from.
 *
 * @param {string|null} fieldId
 * @returns {Array<object & { locked: boolean }>}
 */
function getAllFieldModulesWithLock(fieldId) {
  const field = fieldId ? LMS_CONFIG.fields?.find(f => f.id === fieldId) : null;

  const staticIds = field ? field.moduleIds : LMS_CONFIG.modules.map(m => m.id);
  const staticMods = staticIds
    .map(id => LMS_CONFIG.modules.find(m => m.id === id))
    .filter(Boolean)
    .map(mod => ({ ...mod, locked: !visibleModules.some(v => v.id === mod.id) }));

  const unlockedDynamic = (field
    ? courseModules.filter(c => c.fieldId === fieldId)
    : courseModules.filter(c => !c.fieldId)
  ).map(mod => ({ ...mod, locked: false }));

  const lockedDynamic = (field
    ? lockedCourseModules.filter(c => c.fieldId === fieldId)
    : lockedCourseModules.filter(c => !c.fieldId)
  ).map(mod => ({ ...mod, locked: true }));

  return [...staticMods, ...unlockedDynamic, ...lockedDynamic];
}

function getActiveFieldModules() {
  return getFieldModules(activeFieldId);
}

/**
 * Enters a field from the fields landing page. Lands on the field-overview
 * module picker (activeModuleId stays null) rather than jumping straight
 * into the module shell — see renderFieldOverview() / render() dispatch.
 * Call enterModule() afterwards to actually open a module's shell.
 */
function enterField(fieldId) {
  activeFieldId  = fieldId;
  activeModuleId = null;
  activeLessonId = null;
  resetPersonalizedFrameState();
  frame.src = '';
  frame.classList.remove('visible');
  welcomePanel.classList.remove('hidden');
  updateURL(true);  // pushState so the browser back button exits the field
  render();

  // Personalized Lessons mode renders from live Firestore data — re-fetch on
  // every entry so a stale cache (e.g. from before sign-in resolved) doesn't
  // linger. render() above already painted whatever we had; this just
  // refreshes it once the read completes.
  if (fieldId === 'personalized') {
    refreshPersonalizedData().then(render);
  }
}

/**
 * Commits to a specific module within the active field, taking the person
 * from the field-overview module picker into the full module shell
 * (sidebar + lesson nav + iframe). Mirrors enterField() one level down.
 */
function enterModule(moduleId) {
  activeModuleId = moduleId;
  activeLessonId = null;
  updateURL(true);  // pushState — picking a module is a real navigation step
  render();
}

function exitToFields() {
  activeFieldId  = null;
  activeModuleId = null;
  activeLessonId = null;
  resetPersonalizedFrameState();
  frame.src = '';
  frame.classList.remove('visible');
  updateURL(true);  // pushState so forward goes back into the field
  render();
}

/**
 * Returns from the module shell to the field-overview module picker — one
 * level up from the shell, one level down from exitToFields(). Called by:
 *   • The "← Modules" back button inside the app shell sidebar.
 *   • Clicking the active module card in renderModuleNav().
 * Not used for the 'personalized' field (which has no module picker).
 */
function exitToFieldOverview() {
  if (activeFieldId === 'personalized' || !activeFieldId) {
    exitToFields();
    return;
  }
  activeModuleId = null;
  activeLessonId = null;
  frame.src = '';
  frame.classList.remove('visible');
  welcomePanel?.classList.remove('hidden');
  updateURL(true);
  render();
}

/**
 * Revokes any in-flight personalized-lesson Blob URL and resets the
 * Personalized Lessons sub-view back to the list. Called on every field
 * transition (enterField, exitToFields, popstate) so a Blob URL never
 * outlives the iframe that was pointed at it, and the "+ New request" form
 * never reappears stale when re-entering the field.
 */
function resetPersonalizedFrameState() {
  if (lessonBlobURL) {
    URL.revokeObjectURL(lessonBlobURL);
    lessonBlobURL = null;
  }
  personalizedView        = 'list';
  personalizedFormPrefill = null;
}

function updateTheme(mod) {
  if (!mod?.theme) return;
  document.documentElement.style.setProperty('--accent',      mod.theme.accent);
  document.documentElement.style.setProperty('--accent-soft', mod.theme.accentSoft);
}

// ── RENDER HELPERS ─────────────────────────────────────────────────────────
function renderModuleNav() {
  moduleNav.innerHTML = '';
  // Show only the currently active module in the sidebar — switching modules
  // happens one level up, on the field-overview module picker.
  const mod = getActiveFieldModules().find(m => m.id === activeModuleId);
  if (!mod) return;

  const p   = computeModuleProgress(mod);
  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'nav-btn active';
  btn.innerHTML = `<strong>${t(`module.${mod.id}.title`, mod.title)}</strong><small>${t(`module.${mod.id}.subtitle`, mod.subtitle)}</small><small>${p.pct}% ${t('field.complete', 'complete')}</small>`;
  // Clicking the module card returns to the field-overview module picker
  // (same as clicking "← Modules") so the user can switch to another module.
  btn.addEventListener('click', () => exitToFieldOverview());
  moduleNav.appendChild(btn);
}

// ── LESSON ACCESS GATING (Phase 5) ──────────────────────────────────────────

/**
 * Returns the access status for a lesson given the current auth + tier state.
 *
 *   'open'       — no restriction, or user meets all requirements
 *   'needs-auth' — lesson.requiresAuth is true and the user is not signed in
 *   'needs-pro'  — lesson.requiresPro is true and the user is not on the pro tier
 *
 * requiresPro implies requiresAuth — a signed-out user on a pro-required lesson
 * gets 'needs-auth' so the UX asks them to sign in first, then checks tier.
 *
 * Lessons with no flags at all return 'open' immediately (no cost for the
 * common case where most lessons are public).
 *
 * @param {object} lesson — lesson object from LMS_CONFIG
 * @returns {'open'|'needs-auth'|'needs-pro'}
 */
function getLessonAccess(lesson) {
  if (!lesson.requiresAuth && !lesson.requiresPro) return 'open';
  if (!currentUser)                                return 'needs-auth';
  if (lesson.requiresPro && userProfile?.tier !== 'pro') return 'needs-pro';
  return 'open';
}

/**
 * Shows a contextual gate prompt in the main content area instead of loading
 * the lesson iframe. Reuses the existing #welcome-panel so no new HTML is
 * needed. Injects a transient #gate-cta action button, removed on the next
 * render cycle.
 *
 * For 'needs-auth': scrolls the sidebar auth panel into view so the user
 * can act immediately without explaining where to look.
 * For 'needs-pro': describes the requirement; upgrade flow is a Phase 5 TODO.
 *
 * @param {'needs-auth'|'needs-pro'} access
 */
function showLessonGatePrompt(access) {
  // Swap iframe for the welcome panel
  frame.classList.remove('visible');
  frame.src = '';
  welcomePanel.classList.remove('hidden');

  if (access === 'needs-auth') {
    welcomeHeading.textContent = t('gate.authHeading', 'Sign in to access this lesson');
    welcomeBody.textContent    = t('gate.authBody',
      'Create a free account to track your progress and unlock this content.');
  } else {
    welcomeHeading.textContent = t('gate.proHeading', 'Pro access required');
    welcomeBody.textContent    = t('gate.proBody',
      'This lesson is available on the Pro plan. Upgrade to unlock personalised content and AI-generated exercises.');
  }

  // Remove any CTA left over from a previous prompt before injecting a new one.
  document.getElementById('gate-cta')?.remove();

  if (access === 'needs-auth') {
    // CTA button — focuses the email field in the sidebar auth panel.
    const cta       = document.createElement('button');
    cta.id          = 'gate-cta';
    cta.type        = 'button';
    cta.className   = 'auth-btn gate-cta-btn';
    cta.textContent = t('gate.authCta', 'Sign in or create an account →');
    cta.addEventListener('click', () => {
      const emailField = document.getElementById('auth-email');
      const authPanel  = document.getElementById('auth-panel');
      const trigger    = document.getElementById('sidebar-account-trigger');
      // Open the sidebar account panel if it isn't already open
      if (authPanel && authPanel.hidden) {
        authPanel.hidden = false;
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
      }
      authPanel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => emailField?.focus(), 300);
    });
    welcomePanel.appendChild(cta);
  }
  // 'needs-pro': no CTA yet — upgrade flow is not implemented (Phase 5 TODO).
  // Add a button here that links to the upgrade/billing page when that ships.
}

// ── LESSON NAVIGATION ────────────────────────────────────────────────────────

/**
 * Points the lesson iframe at inline HTML content via a Blob URL, or
 * directly at `htmlStorageURL` when the content lives in Firebase Storage
 * instead of the Firestore doc. Shared by personalized lessons and dynamic
 * course lessons — both store content the same way (db.js: `html` OR
 * `htmlStorageURL`, never both). Revokes any previous Blob URL first so
 * iframe-loaded objects don't leak across lesson switches.
 *
 * @param {{ html?: string|null, htmlStorageURL?: string|null }} lesson
 * @returns {boolean} true if content was loaded, false if lesson had neither field
 */
function loadInlineHtmlLesson(lesson) {
  if (lessonBlobURL) {
    URL.revokeObjectURL(lessonBlobURL);
    lessonBlobURL = null;
  }
  if (lesson.html) {
    const blob = new Blob([lesson.html], { type: 'text/html' });
    lessonBlobURL = URL.createObjectURL(blob);
    frame.src = lessonBlobURL;
  } else if (lesson.htmlStorageURL) {
    frame.src = lesson.htmlStorageURL;
  } else {
    return false;
  }
  return true;
}

/**
 * Opens a lesson in the iframe. Guards against locked lessons so that the
 * postMessage path (lms:openLesson) cannot bypass gating.
 */
function openLesson(lessonId) {
  const mod    = getActiveFieldModules().find(m => m.id === activeModuleId);
  const lesson = mod?.lessons.find(l => l.id === lessonId);
  if (!lesson) return;

  const access = getLessonAccess(lesson);
  if (access !== 'open') {
    // Highlight the lesson in the nav so the user sees which one they clicked,
    // then show the appropriate gate prompt instead of loading the iframe.
    activeLessonId = lessonId;
    showLessonGatePrompt(access);
    renderLessonNav();
    return;
  }

  activeLessonId = lessonId;
  // Dynamic course lessons (authored via the admin Course Manager) store
  // content inline, exactly like personalized lessons — there's no static
  // file for them, so no `route` exists. Static LMS_CONFIG lessons always
  // have `route` and never `html`/`htmlStorageURL`, so checking for either
  // field cleanly distinguishes the two without needing an explicit flag.
  if (lesson.html || lesson.htmlStorageURL) {
    if (!loadInlineHtmlLesson(lesson)) return;
  } else {
    // On localhost, append a timestamp so the browser never serves a stale
    // cached copy of the lesson HTML during local development.
    // On any other host (GitHub Pages, Firebase Hosting, etc.) the buster
    // is omitted — lesson files are served with normal HTTP caching.
    const cacheBust = (location.hostname === 'localhost' || location.hostname === '::1')
      ? `?_cb=${Date.now()}` : '';
    frame.src = lesson.route + cacheBust;
  }
  frame.classList.add('visible');
  welcomePanel.classList.add('hidden');
  // Remove any gate CTA from a previous locked-lesson click
  document.getElementById('gate-cta')?.remove();
  renderLessonNav();
}

function renderLessonNav() {
  lessonNav.innerHTML = '';
  const mod = getActiveFieldModules().find(m => m.id === activeModuleId);
  if (!mod) return;

  mod.lessons.forEach(lesson => {
    const access   = getLessonAccess(lesson);
    const isLocked = access !== 'open';
    const p        = computeLessonProgress(lesson);

    const btn   = document.createElement('button');
    btn.type    = 'button';

    // 'locked' CSS class signals styles.css to grey out and show a muted cursor.
    btn.className = [
      'nav-btn',
      lesson.id === activeLessonId ? 'active'  : '',
      isLocked                     ? 'locked'  : ''
    ].filter(Boolean).join(' ');

    // Progress label: locked lessons show the reason instead of done/total.
    const progressLabel = isLocked
      ? (access === 'needs-auth'
          ? `🔒 ${t('gate.signInLabel', 'Sign in')}`
          : `🔒 ${t('gate.proLabel',    'Pro')}`)
      : (lesson.progress?.type || 'untracked') === 'checklist'
          ? `${p.done}/${p.total} · ${p.pct}%`
          : t('lesson.referenceLabel', 'Reference');

    btn.innerHTML = `
      <strong>${t(`lesson.${lesson.id}.title`, lesson.title)}</strong>
      <small>${t(`lesson.${lesson.id}.subtitle`, lesson.subtitle)}</small>
      <small>${progressLabel}</small>
    `;

    btn.addEventListener('click', () => {
      // openLesson handles both locked and open cases — no branching here.
      openLesson(lesson.id);
    });

    lessonNav.appendChild(btn);
  });
}

function renderProgressBars() {
  if (activeFieldId === 'personalized') {
    renderPersonalizedProgressStats();
    return;
  }

  const mod = getActiveFieldModules().find(m => m.id === activeModuleId);
  const mp  = mod ? computeModuleProgress(mod) : { pct: 0 };
  const gp  = computeGlobalProgress();

  progressBars.innerHTML = `
    <div class="stat-row">
      <span data-i18n="progress.module">${t('progress.module', 'Module')}</span>
      <strong>${mp.pct}%</strong>
    </div>
    <div class="track"><div class="fill" style="width:${mp.pct}%"></div></div>
    <div class="stat-row">
      <span data-i18n="progress.overall">${t('progress.overall', 'Overall')}</span>
      <strong>${gp.pct}%</strong>
    </div>
    <div class="track"><div class="fill" style="width:${gp.pct}%"></div></div>
  `;
}

/**
 * Clears all progress from localStorage. When signed in, also writes empty
 * objects to Firestore so that the reset propagates across devices.
 * Must be async because Firestore writes are awaited sequentially.
 */
async function resetAllProgress() {
  const keys = getAllStorageKeys();

  // Always clear localStorage immediately so the UI updates without waiting
  // for the network.
  keys.forEach(key => localStorage.removeItem(key));

  // When signed in, propagate the reset to Firestore so other devices see it
  // too. Errors on individual keys are swallowed so a partial network failure
  // doesn't leave the UI in a broken state — the local clear already happened.
  if (currentUser) {
    for (const key of keys) {
      try {
        await setLessonProgress(currentUser.uid, key, {});
      } catch (err) {
        console.warn(`[LMS] resetAllProgress: failed to clear Firestore key "${key}"`, err);
      }
    }
  }

  render();

  // Reload the iframe so checkbox state inside the lesson reflects the reset.
  if (frame.src) {
    const src = frame.src;
    frame.src = '';
    setTimeout(() => { frame.src = src; }, IFRAME_RELOAD_DELAY);
  }
}

function renderFieldsLanding() {
  fieldsLanding.hidden = false;
  appShell.hidden      = true;
  fieldOverview.hidden = true;

  fieldsGrid.innerHTML = '';

  (LMS_CONFIG.fields || []).forEach(field => {
    // ALL modules in this field, including ones the user can't access yet —
    // so the card can show an honest module count and stay browsable even
    // when the person currently has zero accessible modules inside it.
    const allMods      = getAllFieldModulesWithLock(field.id);
    const unlockedMods = allMods.filter(mod => !mod.locked);

    const totals = unlockedMods.reduce((acc, mod) => {
      const p = computeModuleProgress(mod);
      return { done: acc.done + p.done, total: acc.total + p.total };
    }, { done: 0, total: 0 });
    const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

    // "No access yet" is informational only now — the card stays clickable
    // so people can browse what's inside a track before they have access.
    // A genuinely empty field (zero modules configured at all) is the only
    // case that's actually a dead end.
    const isEmpty     = allMods.length === 0;
    const noAccessYet = !isEmpty && unlockedMods.length === 0;

    const card = document.createElement('button');
    card.type      = 'button';
    card.className = `field-card${noAccessYet ? ' locked' : ''}`;
    card.style.setProperty('--field-accent', field.theme?.accent     ?? 'var(--accent)');
    card.style.setProperty('--field-soft',   field.theme?.accentSoft ?? 'var(--accent-soft)');
    if (isEmpty) {
      card.disabled = true;
      card.title    = t('field.empty', 'No modules configured yet');
    } else if (noAccessYet) {
      card.title = t('field.locked', 'Access required — sign in or upgrade to unlock. Click to preview what’s inside.');
    }

    card.innerHTML = `
      <div class="field-card-icon">${field.icon ?? '📚'}</div>
      <div class="field-card-body">
        <strong class="field-card-title">${t(`field.${field.id}.title`, field.title)}</strong>
        <p    class="field-card-sub">${t(`field.${field.id}.subtitle`, field.subtitle)}</p>
        <div  class="field-card-meta">
          <span>${allMods.length} ${t('field.modules', 'modules')}</span>
          <span class="field-card-pct">${pct}% ${t('field.complete', 'complete')}</span>
        </div>
        <div class="field-card-bar">
          <div class="field-card-fill" style="width:${pct}%"></div>
        </div>
      </div>
      ${noAccessYet ? `<div class="field-locked-badge" title="${t('field.locked', 'No access')}">🔒</div>` : ''}
    `;

    // Clickable even when locked — clicking now always opens the
    // field-overview module picker, where individual locked modules show
    // their own lock state when clicked (see renderFieldOverview()).
    if (!isEmpty) card.addEventListener('click', () => enterField(field.id));
    fieldsGrid.appendChild(card);
  });

  // Personalized Lessons entry — rendered ABOVE the field-card grid as a
  // prominent top-of-page banner. Moved from #fields-footer (below the grid)
  // to #fields-footer which is now rendered before the grid in the HTML flow,
  // and given larger sizing via .pl-entry-btn--featured so it stands out.
  if (fieldsFooter) {
    fieldsFooter.innerHTML = '';
    const plCard = renderPersonalizedFieldCard();
    // The returned element is a .pl-entry-wrap div; mark it as featured so
    // the inner .pl-entry-btn picks up the --featured styles via the parent.
    plCard.classList.add('pl-entry-wrap--featured');
    // Also mark the inner button if present
    plCard.querySelector('.pl-entry-btn')?.classList.add('pl-entry-btn--featured');
    fieldsFooter.appendChild(plCard);
  }
}

/**
 * Builds the Personalized Lessons entry button for #fields-footer.
 * Rendered as a full-width horizontal banner — visually distinct from the
 * field-card grid above — because this is per-user Firestore content, not a
 * shared static field. Locked (🔒, non-clickable) for anonymous visitors.
 */
function renderPersonalizedFieldCard() {
  const isLocked = !currentUser;

  const wrap = document.createElement('div');
  wrap.className = 'pl-entry-wrap';

  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = `pl-entry-btn${isLocked ? ' locked' : ''}`;

  const statusText = isLocked
    ? t('pl.signInRequired', 'Sign in required')
    : `${personalizedLessons.length} ${t('pl.lessonsReady', 'lessons ready')}`;

  btn.innerHTML = `
    <span class="pl-entry-icon">✨</span>
    <span class="pl-entry-body">
      <strong class="pl-entry-title">${t('pl.fieldTitle', 'Personalisierte Lektionen')}</strong>
      <span  class="pl-entry-sub">${t('pl.fieldSubtitle', 'Lektionen, die für dich gemacht sind')} · <em>${statusText}</em></span>
    </span>
    <span class="pl-entry-cta" aria-hidden="true">
      ${isLocked ? '🔒' : '→'}
    </span>
  `;

  if (!isLocked) btn.addEventListener('click', () => enterField('personalized'));
  wrap.appendChild(btn);

  // When locked, append a discreet sign-in / sign-up nudge row
  if (isLocked) {
    const nudge = document.createElement('p');
    nudge.className = 'pl-auth-nudge';
    nudge.innerHTML = `${t('pl.authNudge', 'Anmeldung erforderlich')} 🔒 —
      <button type="button" class="pl-auth-nudge-btn" data-pl-action="signin">${t('auth.signInButton', 'Einloggen')}</button>
      ${t('pl.authOr', 'oder')}
      <button type="button" class="pl-auth-nudge-btn" data-pl-action="signup">${t('auth.signUpButton', 'Registrieren')}</button>`;

    // Wire both buttons to open the landing auth panel (same as the top-right widget)
    nudge.querySelectorAll('[data-pl-action]').forEach(nudgeBtn => {
      nudgeBtn.addEventListener('click', (e) => {
        // Stop this click from bubbling to the document-level "click outside
        // #landing-account closes the panel" listener (wireLandingAccount) —
        // without this, the panel opens and is immediately closed again in
        // the same click, since this button lives outside #landing-account.
        e.stopPropagation();

        // Open the landing account panel if it exists (fields-landing page)
        const trigger = document.getElementById('landing-account-trigger');
        const panel   = document.getElementById('landing-account-panel');
        if (trigger && panel) {
          panel.hidden = false;
          trigger.setAttribute('aria-expanded', 'true');
          trigger.classList.add('open');
          // Pre-focus the appropriate input
          const action = nudgeBtn.dataset.plAction;
          setTimeout(() => {
            const el = document.getElementById(
              action === 'signup' ? 'landing-auth-email' : 'landing-auth-email'
            );
            el?.focus();
          }, 100);
        } else {
          // Fallback — open the sidebar auth panel
          const sidebarTrigger = document.getElementById('sidebar-account-trigger');
          const sidebarPanel   = document.getElementById('auth-panel');
          if (sidebarPanel && sidebarPanel.hidden) {
            sidebarPanel.hidden = false;
            sidebarTrigger?.setAttribute('aria-expanded', 'true');
            sidebarTrigger?.classList.add('open');
          }
          setTimeout(() => document.getElementById('auth-email')?.focus(), 150);
        }
      });
    });

    wrap.appendChild(nudge);
  }

  return wrap;
}

/**
 * Renders the module-picker sub-page for the currently active field —
 * shown after enterField() but before a specific module has been chosen
 * (activeFieldId set, activeModuleId still null). Mirrors
 * renderFieldsLanding() one level down: instead of field cards that call
 * enterField(), these are module cards that call enterModule().
 *
 * Not used for the 'personalized' field — that one has no module list of
 * its own, so it goes straight to renderPersonalizedShell() (see render()).
 */
function renderFieldOverview() {
  fieldsLanding.hidden = true;
  appShell.hidden      = true;
  fieldOverview.hidden = false;

  // Clear any lock notice left over from a previous visit/module click —
  // this is a fresh render of the picker, so any stale message should go.
  hideModuleLockNotice();

  const field      = LMS_CONFIG.fields?.find(f => f.id === activeFieldId);
  const accent     = field?.theme?.accent     ?? 'var(--accent)';
  const accentSoft = field?.theme?.accentSoft ?? 'var(--accent-soft)';

  // Scope the --field-accent/--field-soft custom props to this page so the
  // icon badge and any module cards that don't set their own pick up the
  // field's colour, exactly like the field cards do on the landing page.
  fieldOverview.style.setProperty('--field-accent', accent);
  fieldOverview.style.setProperty('--field-soft',   accentSoft);

  fieldOverviewIcon.textContent     = field?.icon ?? '📚';
  fieldOverviewTitle.textContent    = field ? t(`field.${field.id}.title`,    field.title)    : '';
  fieldOverviewSubtitle.textContent = field ? t(`field.${field.id}.subtitle`, field.subtitle) : '';

  moduleOverviewGrid.innerHTML = '';

  // Every module in the field, including locked ones — see
  // getAllFieldModulesWithLock(). Locked cards are still rendered (with a
  // 🔒 badge) and still clickable, but clicking shows a lock notice instead
  // of entering the module — the real module shell only ever opens via
  // enterModule(), which getActiveFieldModules() keeps restricted to
  // accessible modules.
  getAllFieldModulesWithLock(activeFieldId).forEach(mod => {
    const p = mod.locked ? { pct: 0 } : computeModuleProgress(mod);

    const card = document.createElement('button');
    card.type      = 'button';
    card.className = `field-card${mod.locked ? ' locked' : ''}`;
    card.style.setProperty('--field-accent', accent);
    card.style.setProperty('--field-soft',   accentSoft);
    if (mod.locked) {
      card.title = t('module.locked', 'Access required — sign in or upgrade to unlock');
    }

    card.innerHTML = `
      <div class="field-card-icon">${mod.icon ?? '📘'}</div>
      <div class="field-card-body">
        <strong class="field-card-title">${t(`module.${mod.id}.title`,    mod.title)}</strong>
        <p    class="field-card-sub">${t(`module.${mod.id}.subtitle`, mod.subtitle)}</p>
        <div  class="field-card-meta">
          <span>${mod.lessons?.length ?? 0} ${t('field.lessons', 'lessons')}</span>
          <span class="field-card-pct">${
            mod.locked
              ? t('module.lockedLabel', 'Locked')
              : `${p.pct}% ${t('field.complete', 'complete')}`
          }</span>
        </div>
        <div class="field-card-bar">
          <div class="field-card-fill" style="width:${mod.locked ? 0 : p.pct}%"></div>
        </div>
      </div>
      ${mod.locked ? `<div class="field-locked-badge" title="${t('module.locked', 'No access')}">🔒</div>` : ''}
    `;

    card.addEventListener('click', () => {
      if (mod.locked) {
        showModuleLockNotice(mod);
      } else {
        enterModule(mod.id);
      }
    });
    moduleOverviewGrid.appendChild(card);
  });
}

/**
 * Surfaces a contextual lock message on the field-overview page when the
 * person clicks a module they can't access yet. Mirrors the *lesson*-level
 * gate prompt (showLessonGatePrompt) one level up, but deliberately never
 * enters the module shell — so nothing requests that module's real lesson
 * content for someone who isn't allowed to open it.
 *
 * @param {object & { locked: true }} mod
 */
function showModuleLockNotice(mod) {
  if (!moduleLockNotice) return;
  clearTimeout(moduleLockNoticeTimer);

  const title = t(`module.${mod.id}.title`, mod.title);

  if (!currentUser) {
    moduleLockNotice.innerHTML = `
      <span class="lock-notice-icon">🔒</span>
      <span class="lock-notice-text">${t('module.lockNotice.signIn', 'Sign in to see if you have access to')} <strong>${title}</strong>.</span>
      <button type="button" class="lock-notice-cta" id="module-lock-notice-cta">${t('auth.signInButton', 'Sign in')}</button>
    `;
    moduleLockNotice.querySelector('#module-lock-notice-cta')?.addEventListener('click', (e) => {
      // Stop this click from bubbling to the document-level "click outside
      // #landing-account closes the panel" listener — without this, the
      // panel opens and is immediately closed again in the same click.
      e.stopPropagation();

      const trigger = document.getElementById('landing-account-trigger');
      const panel   = document.getElementById('landing-account-panel');
      if (trigger && panel) {
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add('open');
        setTimeout(() => document.getElementById('landing-auth-email')?.focus(), 100);
      }
    });
  } else {
    moduleLockNotice.innerHTML = `
      <span class="lock-notice-icon">🔒</span>
      <span class="lock-notice-text"><strong>${title}</strong> ${t('module.lockNotice.noAccess', "isn't included in your current plan yet.")}</span>
    `;
  }

  moduleLockNotice.hidden = false;
  moduleLockNoticeTimer = setTimeout(() => { moduleLockNotice.hidden = true; }, 6000);
}

function hideModuleLockNotice() {
  clearTimeout(moduleLockNoticeTimer);
  if (moduleLockNotice) moduleLockNotice.hidden = true;
}

function renderBrandSubtitle() {
  // Show only the active module's title in the subtitle, not every field module.
  const mod = getActiveFieldModules().find(m => m.id === activeModuleId);
  brandSubtitle.textContent = mod ? t(`module.${mod.id}.title`, mod.title) : '';
}

function renderWelcomePanel() {
  const cfg = LMS_CONFIG.welcome;
  if (!cfg) return;
  if (cfg.heading) welcomeHeading.textContent = t('welcome.heading', cfg.heading);
  if (cfg.body)    welcomeBody.textContent    = t('welcome.body',    cfg.body);
}

/**
 * Decides what fills the main content area once a module is selected but
 * no specific lesson has been opened yet:
 *
 *   • mod.indexRoute set   → load it into the lesson iframe, exactly like a
 *     lesson route (same cache-busting, same #welcome-panel/#lesson-frame
 *     toggle). This is how a module gets its own course-overview / table
 *     of contents page instead of the generic welcome text.
 *   • mod.indexRoute unset → fall back to the plain #welcome-panel (the
 *     original, unchanged behaviour) so every module without one keeps
 *     working exactly as before.
 *
 * Called from the end of renderShell() so every path that can land here —
 * entering a field, clicking a module in the sidebar, browser back/forward,
 * switching language — stays in sync without each of those call sites
 * needing its own copy of this branch. Does nothing if a lesson is already
 * open (activeLessonId set); that state is owned by openLesson().
 */
function renderModuleLanding() {
  if (activeLessonId) return;

  const mod = getActiveFieldModules().find(m => m.id === activeModuleId);

  if (mod?.indexRoute) {
    // Same cache-busting rule as openLesson(): bypass the browser cache on
    // localhost during development, leave normal HTTP caching everywhere else.
    const cacheBust = (location.hostname === 'localhost' || location.hostname === '::1')
      ? `?_cb=${Date.now()}` : '';
    // Avoid redundantly reassigning frame.src (and therefore reloading the
    // index page, losing its scroll position) on every re-render — e.g. a
    // language switch shouldn't reset a page the user is already looking at.
    const resolvedRoute = new URL(mod.indexRoute, location.href).href;
    if (!frame.src.startsWith(resolvedRoute)) {
      frame.src = mod.indexRoute + cacheBust;
    }
    frame.classList.add('visible');
    welcomePanel.classList.add('hidden');
  } else {
    frame.src = '';
    frame.classList.remove('visible');
    welcomePanel.classList.remove('hidden');
  }
}

function renderShell() {
  fieldsLanding.hidden = true;
  appShell.hidden      = false;
  fieldOverview.hidden = true;

  // Undo anything Personalized Lessons mode hid/repurposed, in case the user
  // is arriving here straight from that field (e.g. via "← Fields" then into
  // a normal field, or a popstate jump).
  document.getElementById('lesson-nav-block').hidden = false;
  personalizedPanel.hidden = true;

  // Update back button label: inside a normal field → "Modules" (goes to the
  // module picker). Inside Personalized Lessons or no-field mode → "Fields".
  const backLabel = document.getElementById('back-fields-label');
  if (backLabel) {
    if (activeFieldId && activeFieldId !== 'personalized') {
      backLabel.textContent = t('shell.backToModules', 'Modules');
    } else {
      backLabel.textContent = t('shell.backToFields', 'Tracks');
    }
  }

  const field = LMS_CONFIG.fields?.find(f => f.id === activeFieldId);
  if (field?.theme) updateTheme(field);

  renderModuleNav();
  renderLessonNav();
  renderProgressBars();
  renderBrandSubtitle();
  renderWelcomePanel();
  renderModuleLanding();

  const mod = getActiveFieldModules().find(m => m.id === activeModuleId);
  if (mod?.theme) updateTheme(mod);
}

// ── PERSONALIZED LESSONS FIELD ──────────────────────────────────────────────
// Special-cased per NEW_FIELD_PERSONALIZED_LESSONS_PROMPT.md §2: this field
// bypasses getActiveFieldModules()/getVisibleModules() entirely. Visibility
// of *content* (which requests/lessons exist) is enforced at the Firestore
// rules layer (a user can only ever query their own subcollection/requests);
// this code only decides what to *render* for the signed-in user it has.

/**
 * Re-fetches this user's personalized requests + fulfilled lessons from
 * Firestore. Safe to call with no signed-in user — clears local state
 * instead of throwing.
 */
async function refreshPersonalizedData() {
  if (!currentUser) {
    personalizedLessons  = [];
    personalizedRequests = [];
    return;
  }
  const [lessons, requests] = await Promise.all([
    getPersonalizedLessons(currentUser.uid).catch(err => {
      console.warn('[LMS] refreshPersonalizedData: lessons fetch failed', err);
      return personalizedLessons; // keep whatever we had rather than blanking the UI
    }),
    getMyPersonalizedRequests(currentUser.uid).catch(err => {
      console.warn('[LMS] refreshPersonalizedData: requests fetch failed', err);
      return personalizedRequests;
    })
  ]);
  personalizedLessons  = lessons;
  personalizedRequests = requests;
}

/** Top-level render for activeFieldId === 'personalized'. Mirrors renderShell(). */
function renderPersonalizedShell() {
  fieldsLanding.hidden = true;
  appShell.hidden      = false;
  fieldOverview.hidden = true;

  document.getElementById('lesson-nav-block').hidden = true;
  brandSubtitle.textContent = t('pl.fieldSubtitle', 'Lessons built just for you');

  // Back button in personalized mode always exits all the way to Fields.
  const backLabel = document.getElementById('back-fields-label');
  if (backLabel) backLabel.textContent = t('shell.backToFields', 'Tracks');

  if (!currentUser) {
    renderPersonalizedSignedOutPrompt();
    return;
  }

  renderPersonalizedSidebarNav();
  renderPersonalizedProgressStats();

  // If a personalized lesson is already open in the iframe (e.g. re-entering
  // via popstate while one was loaded), keep showing it instead of snapping
  // back to the list.
  if (activeLessonId && frame.classList.contains('visible')) {
    personalizedPanel.hidden = true;
  } else {
    welcomePanel.classList.add('hidden');
    frame.classList.remove('visible');
    personalizedPanel.hidden = false;
    renderPersonalizedMainPanel();
  }
}

/** Anonymous-visitor fallback — handles a direct/deep link to ?field=personalized. */
function renderPersonalizedSignedOutPrompt() {
  moduleNav.innerHTML = '';
  if (lessonBlobURL) { URL.revokeObjectURL(lessonBlobURL); lessonBlobURL = null; }
  frame.src = '';
  frame.classList.remove('visible');
  welcomePanel.classList.add('hidden');
  personalizedPanel.hidden = false;
  personalizedPanel.innerHTML = `
    <div class="pl-empty-state">
      <div class="pl-empty-icon">🔒</div>
      <h3>${t('pl.signInRequired', 'Sign in required')}</h3>
      <p>${t('pl.signInBody', 'Personalized lessons are tied to your account. Sign in from the account menu to request one.')}</p>
    </div>
  `;
}

/**
 * Repurposes #module-nav as the Personalized Lessons sidebar: a "+ New
 * request" entry, then the user's fulfilled lessons, then any open
 * (pending/in_review) requests. #lesson-nav stays hidden — there's no
 * sub-lesson nav in this mode.
 */
function renderPersonalizedSidebarNav() {
  const label = document.getElementById('module-nav-label');
  if (label) label.textContent = t('pl.sidebarLabel', 'Personalized Lessons');

  moduleNav.innerHTML = '';

  const newBtn = document.createElement('button');
  newBtn.type      = 'button';
  newBtn.className = 'nav-btn pl-new-btn';
  newBtn.innerHTML = `<strong>＋ ${t('pl.newRequest', 'New request')}</strong>`;
  newBtn.addEventListener('click', () => showPersonalizedForm());
  moduleNav.appendChild(newBtn);

  if (personalizedLessons.length > 0) {
    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'pl-sidebar-section-label';
    sectionLabel.textContent = t('pl.yourLessons', 'Your lessons');
    moduleNav.appendChild(sectionLabel);

    personalizedLessons.forEach(lesson => {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = `nav-btn ${lesson.id === activeLessonId ? 'active' : ''}`;
      btn.innerHTML = `<strong>${escHtml(lesson.title)}</strong><small>${escHtml(lesson.topic || '')}</small>`;
      btn.addEventListener('click', () => openPersonalizedLesson(lesson));
      moduleNav.appendChild(btn);
    });
  }

  const openRequests = personalizedRequests.filter(r => r.status === 'pending' || r.status === 'in_review');
  if (openRequests.length > 0) {
    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'pl-sidebar-section-label';
    sectionLabel.textContent = t('pl.pendingRequests', 'Pending requests');
    moduleNav.appendChild(sectionLabel);

    openRequests.forEach(req => {
      const btn = document.createElement('button');
      btn.type      = 'button';
      btn.className = 'nav-btn locked';
      btn.innerHTML = `<strong>⏳ ${escHtml(req.topic)}</strong><small>${t('pl.inReview', 'In review')}</small>`;
      moduleNav.appendChild(btn);
    });
  }
}

/** Replaces the normal module/global progress bars with personalized counts. */
function renderPersonalizedProgressStats() {
  const ready   = personalizedLessons.length;
  const pending = personalizedRequests.filter(r => r.status === 'pending' || r.status === 'in_review').length;

  progressBars.innerHTML = `
    <div class="stat-row">
      <span>${t('pl.statsReady', 'Lessons ready')}</span>
      <strong>${ready}</strong>
    </div>
    <div class="stat-row">
      <span>${t('pl.statsPending', 'Pending requests')}</span>
      <strong>${pending}</strong>
    </div>
  `;
}

/** Dispatches the main content area between the list view and the request form. */
function renderPersonalizedMainPanel() {
  if (personalizedView === 'form') {
    renderPersonalizedForm();
  } else {
    renderPersonalizedList();
  }
}

/** List view: empty state, or a card grid of pending/fulfilled/declined items. */
function renderPersonalizedList() {
  const fulfilled    = personalizedLessons;
  const pendingReqs  = personalizedRequests.filter(r => r.status === 'pending' || r.status === 'in_review');
  const declinedReqs = personalizedRequests.filter(r => r.status === 'declined');
  const isEmpty      = fulfilled.length === 0 && pendingReqs.length === 0 && declinedReqs.length === 0;

  const cardsHtml = [
    ...pendingReqs.map(renderPendingCard),
    ...fulfilled.map(renderFulfilledCard),
    ...declinedReqs.map(renderDeclinedCard)
  ].join('');

  personalizedPanel.innerHTML = `
    <div class="pl-header">
      <h2>${t('pl.fieldTitle', 'Personalized Lessons')}</h2>
    </div>
    ${isEmpty ? `
      <div class="pl-empty-state">
        <div class="pl-empty-icon">✨</div>
        <h3>${t('pl.emptyHeading', 'No personalized lessons yet')}</h3>
        <p>${t('pl.emptyBody', 'Tell us what you want to learn and an instructor will build a lesson just for you.')}</p>
        <button type="button" class="pl-cta-btn pl-cta-btn--featured" id="pl-cta-empty">
          ✨ ${t('pl.requestCta', 'Request a Personalized Lesson')}
        </button>
      </div>
    ` : `
      <div class="pl-cta-center-wrap">
        <button type="button" class="pl-cta-btn pl-cta-btn--featured" id="pl-cta-new">
          ✨ ${t('pl.requestCta', 'Request a Personalized Lesson')}
        </button>
      </div>
      <div class="pl-cards-grid">${cardsHtml}</div>
    `}
  `;

  document.getElementById('pl-cta-new')?.addEventListener('click', () => showPersonalizedForm());
  document.getElementById('pl-cta-empty')?.addEventListener('click', () => showPersonalizedForm());

  personalizedPanel.querySelectorAll('[data-open-lesson]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lesson = fulfilled.find(l => l.id === btn.dataset.openLesson);
      if (lesson) openPersonalizedLesson(lesson);
    });
  });
  personalizedPanel.querySelectorAll('[data-again]').forEach(btn => {
    btn.addEventListener('click', () => showPersonalizedForm(btn.dataset.again));
  });
}

function renderPendingCard(req) {
  const inReview = req.status === 'in_review';
  return `
    <div class="pl-card pending">
      <span class="pl-card-status">⏳ ${inReview ? t('pl.statusInReview', 'In review') : t('pl.statusPending', 'Pending')}</span>
      <strong class="pl-card-title">${escHtml(req.topic)}</strong>
      <p class="pl-card-sub">${t('pl.submittedOn', 'Submitted')} ${formatTimestamp(req.requestedAt)}</p>
    </div>`;
}

function renderFulfilledCard(lesson) {
  return `
    <div class="pl-card fulfilled">
      <span class="pl-card-status">✅ ${t('pl.statusReady', 'Ready')}</span>
      <strong class="pl-card-title">${escHtml(lesson.title)}</strong>
      <p class="pl-card-sub">${escHtml(lesson.topic || '')}</p>
      <button type="button" class="pl-open-btn" data-open-lesson="${lesson.id}">${t('pl.openLesson', 'Open lesson')}</button>
    </div>`;
}

function renderDeclinedCard(req) {
  return `
    <div class="pl-card declined">
      <span class="pl-card-status">❌ ${t('pl.statusDeclined', 'Declined')}</span>
      <strong class="pl-card-title">${escHtml(req.topic)}</strong>
      ${req.adminNote ? `<p class="pl-card-note">${escHtml(req.adminNote)}</p>` : ''}
      <button type="button" class="pl-again-btn" data-again="${escHtml(req.topic)}">${t('pl.requestAgain', 'Request again')}</button>
    </div>`;
}

/** Switches the main panel + sidebar into the request form, optionally pre-filling a topic. */
function showPersonalizedForm(prefillTopic = null) {
  personalizedFormPrefill = typeof prefillTopic === 'string' ? prefillTopic : null;
  personalizedView = 'form';
  renderPersonalizedMainPanel();
  renderPersonalizedSidebarNav();
}

/** Request form: topic, a short questionnaire, targeting fields, and an optional profile-file upload. */
function renderPersonalizedForm() {
  const suggestedTopics = LMS_CONFIG.modules.map(m => m.title);
  const prefill         = personalizedFormPrefill;
  const prefillIsKnown  = !!prefill && suggestedTopics.includes(prefill);

  personalizedPanel.innerHTML = `
    <div class="pl-form-wrap">
      <button type="button" class="pl-back-btn" id="pl-back-btn">← ${t('pl.back', 'Back')}</button>
      <div class="pl-form-header">
        <span class="pl-form-eyebrow">✨ ${t('pl.fieldTitle', 'Personalized Lessons')}</span>
        <h2>${t('pl.formHeading', 'Request a personalized lesson')}</h2>
        <p>${t('pl.formBody', 'Tell us what you want to learn and answer a few quick questions. An instructor will build a lesson just for you.')}</p>
      </div>
      <form class="pl-form" id="pl-form" novalidate>

        <div class="pl-section">
          <div class="pl-section-label">${t('pl.sectionTopic', 'Topic')}</div>
          <div class="pl-field">
            <label for="pl-topic-select">${t('pl.topicLabel', 'Topic')}</label>
            <select id="pl-topic-select">
              ${suggestedTopics.map(topic => `<option value="${escHtml(topic)}" ${prefillIsKnown && prefill === topic ? 'selected' : ''}>${escHtml(topic)}</option>`).join('')}
              <option value="__other__" ${!prefillIsKnown ? 'selected' : ''}>${t('pl.topicOther', 'Other (describe below)')}</option>
            </select>
          </div>
          <div class="pl-field" id="pl-topic-custom-field" ${prefillIsKnown ? 'hidden' : ''}>
            <label for="pl-topic-custom">${t('pl.topicCustomLabel', 'Describe your topic')}</label>
            <input type="text" id="pl-topic-custom" placeholder="${t('pl.topicCustomPlaceholder', 'e.g. GraphQL fundamentals')}" value="${!prefillIsKnown && prefill ? escHtml(prefill) : ''}" />
          </div>
        </div>

        <div class="pl-section">
          <div class="pl-section-label">${t('pl.sectionAboutYou', 'About you')}</div>
          <div class="pl-field-row">
            <div class="pl-field">
              <label for="pl-role">${t('pl.roleLabel', 'Your current role')}</label>
              <input type="text" id="pl-role" placeholder="${t('pl.rolePlaceholder', 'e.g. Junior backend developer')}" />
            </div>
            <div class="pl-field">
              <label for="pl-level">${t('pl.levelLabel', 'Experience level')}</label>
              <select id="pl-level">
                <option value="beginner">${t('pl.levelBeginner', 'Beginner')}</option>
                <option value="intermediate">${t('pl.levelIntermediate', 'Intermediate')}</option>
                <option value="advanced">${t('pl.levelAdvanced', 'Advanced')}</option>
              </select>
            </div>
          </div>
          <div class="pl-field">
            <label for="pl-goal">${t('pl.goalLabel', 'What do you want to achieve?')}</label>
            <textarea id="pl-goal" placeholder="${t('pl.goalPlaceholder', 'e.g. Be ready for a take-home backend assignment')}"></textarea>
          </div>
          <div class="pl-field">
            <label for="pl-gaps">${t('pl.gapsLabel', 'Specific gaps or pain points (optional)')}</label>
            <textarea id="pl-gaps"></textarea>
          </div>
          <div class="pl-field">
            <label for="pl-deadline">${t('pl.deadlineLabel', 'Deadline (optional)')}</label>
            <input type="date" id="pl-deadline" />
          </div>
        </div>

        <div class="pl-section">
          <div class="pl-section-label">${t('pl.sectionTargeting', 'What you’re aiming for')} <span class="pl-section-optional">${t('pl.optional', '(optional)')}</span></div>
          <p class="pl-section-hint">${t('pl.targetingHint', 'Give us a target job or the abilities you want to build toward — write it out, or upload a posting / brief instead.')}</p>

          ${renderToggleField({
            group:        'target-job',
            label:        t('pl.targetJobLabel', 'Target job'),
            writeId:      'pl-target-job',
            writeTag:     'input',
            writePlaceholder: t('pl.targetJobPlaceholder', 'e.g. Senior Backend Engineer at a fintech startup'),
            fileId:       'pl-target-job-file',
            fileHint:     t('pl.targetJobFileHint', 'PDF or DOCX, up to 5MB — e.g. a job posting.')
          })}

          ${renderToggleField({
            group:        'target-abilities',
            label:        t('pl.targetAbilitiesLabel', 'Target skills / abilities'),
            writeId:      'pl-target-abilities',
            writeTag:     'textarea',
            writePlaceholder: t('pl.targetAbilitiesPlaceholder', 'e.g. System design, Kubernetes, technical leadership'),
            fileId:       'pl-target-abilities-file',
            fileHint:     t('pl.targetAbilitiesFileHint', 'PDF or DOCX, up to 5MB — e.g. a skills checklist or curriculum.')
          })}
        </div>

        <div class="pl-section">
          <div class="pl-section-label">${t('pl.sectionAttachments', 'Attachments')}</div>
          <div class="pl-field">
            <label for="pl-file">${t('pl.fileLabel', 'Upload your CV / profile (optional)')}</label>
            <input type="file" id="pl-file" accept=".pdf,.doc,.docx" />
            <p class="pl-file-hint">${t('pl.fileHint', 'PDF or DOCX, up to 5MB.')}</p>
          </div>
        </div>

        <p class="pl-form-error" id="pl-form-error" hidden></p>
        <div class="pl-form-actions">
          <button type="submit" class="pl-submit-btn" id="pl-submit-btn">${t('pl.submit', 'Submit request')}</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('pl-back-btn').addEventListener('click', () => {
    personalizedView        = 'list';
    personalizedFormPrefill = null;
    renderPersonalizedMainPanel();
    renderPersonalizedSidebarNav();
  });

  document.getElementById('pl-topic-select').addEventListener('change', (e) => {
    document.getElementById('pl-topic-custom-field').hidden = e.target.value !== '__other__';
  });

  // Wire every Write/Upload toggle generically — works for any current or
  // future .pl-mode-switch without one-off listeners per field.
  personalizedPanel.querySelectorAll('.pl-mode-switch').forEach(switchEl => {
    const group = switchEl.dataset.group;
    switchEl.querySelectorAll('.pl-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        switchEl.querySelectorAll('.pl-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const writePanel  = personalizedPanel.querySelector(`[data-panel="${group}-write"]`);
        const uploadPanel = personalizedPanel.querySelector(`[data-panel="${group}-upload"]`);
        if (writePanel)  writePanel.hidden  = btn.dataset.mode !== 'write';
        if (uploadPanel) uploadPanel.hidden = btn.dataset.mode !== 'upload';
      });
    });
  });

  document.getElementById('pl-form').addEventListener('submit', handlePersonalizedSubmit);
}

/**
 * Builds a "Write or Upload" field group: a label-sized Write/Upload toggle
 * next to the field label, and two mutually-exclusive panels — a text
 * input/textarea for typed answers, a file input for an uploaded document.
 * Only one panel is visible at a time; handlePersonalizedSubmit reads
 * whichever mode is currently active via the .pl-mode-btn.active button.
 *
 * @param {{ group: string, label: string, writeId: string,
 *           writeTag: 'input'|'textarea', writePlaceholder: string,
 *           fileId: string, fileHint: string }} cfg
 */
function renderToggleField(cfg) {
  const writeControl = cfg.writeTag === 'textarea'
    ? `<textarea id="${cfg.writeId}" placeholder="${escHtml(cfg.writePlaceholder)}"></textarea>`
    : `<input type="text" id="${cfg.writeId}" placeholder="${escHtml(cfg.writePlaceholder)}" />`;

  return `
    <div class="pl-field pl-toggle-field">
      <div class="pl-toggle-field-head">
        <label for="${cfg.writeId}">${escHtml(cfg.label)}</label>
        <div class="pl-mode-switch" data-group="${cfg.group}">
          <button type="button" class="pl-mode-btn active" data-mode="write">✏️ ${t('pl.modeWrite', 'Write')}</button>
          <button type="button" class="pl-mode-btn" data-mode="upload">📎 ${t('pl.modeUpload', 'Upload')}</button>
        </div>
      </div>
      <div class="pl-mode-panel" data-panel="${cfg.group}-write">
        ${writeControl}
      </div>
      <div class="pl-mode-panel" data-panel="${cfg.group}-upload" hidden>
        <input type="file" id="${cfg.fileId}" accept=".pdf,.doc,.docx" />
        <p class="pl-file-hint">${escHtml(cfg.fileHint)}</p>
      </div>
    </div>`;
}

/** Returns 'write' or 'upload' — whichever mode is active for a toggle-field group. */
function getToggleFieldMode(group) {
  const activeBtn = personalizedPanel.querySelector(`.pl-mode-switch[data-group="${group}"] .pl-mode-btn.active`);
  return activeBtn ? activeBtn.dataset.mode : 'write';
}

/**
 * Validates and submits the request form: writes the Firestore request doc,
 * uploads the profile file (if any) and links it back to the request, then
 * refreshes local state and returns to the list view.
 */
async function handlePersonalizedSubmit(e) {
  e.preventDefault();
  if (!currentUser) return; // field is gated to signed-in users; shouldn't be reachable

  const errorEl   = document.getElementById('pl-form-error');
  const submitBtn = document.getElementById('pl-submit-btn');
  errorEl.hidden  = true;

  const topicSelect = document.getElementById('pl-topic-select').value;
  const customTopic = document.getElementById('pl-topic-custom').value.trim();
  const topic        = topicSelect === '__other__' ? customTopic : topicSelect;

  if (!topic) {
    errorEl.textContent = t('pl.errorTopic', 'Please choose or describe a topic.');
    errorEl.hidden = false;
    return;
  }

  const file = document.getElementById('pl-file').files[0] || null;

  // Target job / target abilities each resolve to EITHER typed text OR an
  // uploaded file, depending on which mode is active in their toggle.
  const targetJobMode       = getToggleFieldMode('target-job');
  const targetAbilitiesMode = getToggleFieldMode('target-abilities');

  const targetJobText       = targetJobMode === 'write'
    ? (document.getElementById('pl-target-job').value.trim() || null) : null;
  const targetJobFile       = targetJobMode === 'upload'
    ? (document.getElementById('pl-target-job-file').files[0] || null) : null;

  const targetAbilitiesText = targetAbilitiesMode === 'write'
    ? (document.getElementById('pl-target-abilities').value.trim() || null) : null;
  const targetAbilitiesFile = targetAbilitiesMode === 'upload'
    ? (document.getElementById('pl-target-abilities-file').files[0] || null) : null;

  // Validate every attached file BEFORE any Firestore write — same rules,
  // applied uniformly so a bad target-job/target-abilities upload can't
  // slip through just because the profile-file checks happened to pass.
  const filesToValidate = [
    { file, label: t('pl.fileLabelShort', 'CV / profile file') },
    { file: targetJobFile, label: t('pl.targetJobLabel', 'Target job') },
    { file: targetAbilitiesFile, label: t('pl.targetAbilitiesLabel', 'Target skills / abilities') }
  ];
  for (const { file: f, label } of filesToValidate) {
    if (!f) continue;
    if (!PL_ALLOWED_FILE_TYPES.includes(f.type)) {
      errorEl.textContent = t('pl.errorFileTypeNamed', `${label}: only PDF or DOCX files are allowed.`);
      errorEl.hidden = false;
      return;
    }
    if (f.size > PL_MAX_FILE_SIZE) {
      errorEl.textContent = t('pl.errorFileSizeNamed', `${label}: file must be 5MB or smaller.`);
      errorEl.hidden = false;
      return;
    }
  }

  const answers = {
    role:            document.getElementById('pl-role').value.trim(),
    level:           document.getElementById('pl-level').value,
    goal:            document.getElementById('pl-goal').value.trim(),
    gaps:            document.getElementById('pl-gaps').value.trim(),
    deadline:        document.getElementById('pl-deadline').value || null,
    targetJob:       targetJobText,
    targetAbilities: targetAbilitiesText
  };

  submitBtn.disabled    = true;
  submitBtn.textContent = t('pl.submitting', 'Submitting…');

  try {
    const requestId = await createPersonalizedRequest(currentUser.uid, { topic, answers });

    if (file) {
      const { url, name } = await uploadProfileFile(currentUser.uid, requestId, file);
      await updatePersonalizedRequestFile(requestId, url, name);
    }
    if (targetJobFile) {
      const { url, name } = await uploadProfileFile(currentUser.uid, requestId, targetJobFile, 'targetJob');
      await updatePersonalizedRequestFile(requestId, url, name, 'targetJob');
    }
    if (targetAbilitiesFile) {
      const { url, name } = await uploadProfileFile(currentUser.uid, requestId, targetAbilitiesFile, 'targetAbilities');
      await updatePersonalizedRequestFile(requestId, url, name, 'targetAbilities');
    }

    await refreshPersonalizedData();
    personalizedView        = 'list';
    personalizedFormPrefill = null;
    renderPersonalizedMainPanel();
    renderPersonalizedSidebarNav();
  } catch (err) {
    errorEl.textContent   = err.message || t('pl.errorGeneric', 'Something went wrong. Please try again.');
    errorEl.hidden         = false;
    submitBtn.disabled     = false;
    submitBtn.textContent  = t('pl.submit', 'Submit request');
  }
}

/**
 * Loads a fulfilled personalized lesson into the iframe. Content loading is
 * shared with dynamic course lessons via loadInlineHtmlLesson() — see that
 * function for the html-vs-htmlStorageURL handling.
 */
function openPersonalizedLesson(lesson) {
  activeLessonId = lesson.id;

  if (!loadInlineHtmlLesson(lesson)) return; // nothing to show

  frame.classList.add('visible');
  welcomePanel.classList.add('hidden');
  personalizedPanel.hidden = true;
  renderPersonalizedSidebarNav();
}

/** Minimal HTML escaping for user/admin-authored free text rendered via innerHTML. */
function escHtml(str = '') {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/** Formats a Firestore Timestamp (or any Date-ish value) for card display. */
function formatTimestamp(ts) {
  if (!ts) return '';
  const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString();
}

function render() {
  const hasFields = (LMS_CONFIG.fields?.length ?? 0) > 0;
  // Checks actual membership, not just truthiness — a stale activeModuleId
  // left over from a different field (or the very first synchronous render,
  // which seeds activeModuleId from LMS_CONFIG.modules[0] for the no-fields
  // backward-compat case) should land on the module picker too, not silently
  // fall through to an empty/mismatched shell.
  const moduleIsValidForField = Boolean(activeModuleId) && getActiveFieldModules().some(m => m.id === activeModuleId);
  if (activeFieldId === 'personalized') {
    renderPersonalizedShell();
  } else if (hasFields && activeFieldId === null) {
    renderFieldsLanding();
  } else if (hasFields && activeFieldId !== null && !moduleIsValidForField) {
    // A field has been entered but no (valid) module picked yet — show the
    // module-picker sub-page instead of jumping straight into the shell.
    renderFieldOverview();
  } else {
    renderShell();
  }

  // The floating account widget (landing-account) only makes sense on the
  // two pages that sit outside #app-shell — once the app-shell is showing,
  // its own sidebar account section takes over, so hide the floating one to
  // avoid showing two sign-in entry points at once.
  if (landingAccount) landingAccount.hidden = !appShell.hidden;
  if (landingLangSwitcher) landingLangSwitcher.hidden = !appShell.hidden;
}

// ── AUTH UI HELPERS ────────────────────────────────────────────────────────

/**
 * Switch the auth panel into signed-in mode.
 * Populates the avatar, display name, and tier badge from live Firebase user
 * data and the Firestore profile document.
 *
 * @param {import('firebase/auth').User} user
 * @param {{ tier?: string } | null} profile - Firestore user document, or null
 *   if the document hasn't been written yet (edge case on very first sign-up).
 */
function showSignedIn(user, profile) {
  // Hide sign-out trigger row content, reveal signed-in trigger row content
  authSignedOut.hidden = true;
  authSignedIn.hidden  = false;

  // Avatar
  authAvatar.src = user.photoURL || '';
  authAvatar.alt = user.displayName || user.email || 'User';

  // Display name
  authDisplayName.textContent =
    user.displayName || user.email?.split('@')[0] || 'User';

  // Tier badge
  const tier = profile?.tier || 'free';
  authTierBadge.textContent = tier;
  authTierBadge.className   = `tier-badge${tier === 'pro' ? ' pro' : ''}`;

  // In the expanded panel: show sign-out button, hide sign-in inputs
  const signoutBtn = document.getElementById('btn-signout');
  const googleBtn  = document.getElementById('btn-google-signin');
  const emailInput = document.getElementById('auth-email');
  const pwInput    = document.getElementById('auth-password');
  const divider    = document.querySelector('#auth-panel .auth-divider');
  const authActions = document.querySelector('#auth-panel .auth-actions');
  if (googleBtn)   googleBtn.hidden   = true;
  if (emailInput)  emailInput.hidden  = true;
  if (pwInput)     pwInput.hidden     = true;
  if (divider)     divider.hidden     = true;
  if (authActions) authActions.hidden = true;

  // Update the sidebar trigger aria label
  const trigger = document.getElementById('sidebar-account-trigger');
  if (trigger) trigger.setAttribute('aria-label', user.displayName || 'Account');

  hideAuthError();

  // ── Mirror the same state onto the floating landing/field-overview widget ──
  if (landingSignedOut) {
    landingSignedOut.hidden = true;
    landingSignedIn.hidden  = false;

    landingAvatar.src = user.photoURL || '';
    landingAvatar.alt = user.displayName || user.email || 'User';

    landingDisplayName.textContent =
      user.displayName || user.email?.split('@')[0] || 'User';

    landingTierBadge.textContent = tier;
    landingTierBadge.className   = `tier-badge${tier === 'pro' ? ' pro' : ''}`;

    const lSignoutBtn  = document.getElementById('landing-btn-signout');
    const lGoogleBtn   = document.getElementById('landing-btn-google-signin');
    const lEmailInput  = document.getElementById('landing-auth-email');
    const lPwInput     = document.getElementById('landing-auth-password');
    const lDivider     = document.querySelector('#landing-account-panel .auth-divider');
    const lAuthActions = document.querySelector('#landing-account-panel .auth-actions');
    if (lSignoutBtn)  lSignoutBtn.hidden  = false;
    if (lGoogleBtn)   lGoogleBtn.hidden   = true;
    if (lEmailInput)  lEmailInput.hidden  = true;
    if (lPwInput)     lPwInput.hidden     = true;
    if (lDivider)     lDivider.hidden     = true;
    if (lAuthActions) lAuthActions.hidden = true;

    const lTrigger = document.getElementById('landing-account-trigger');
    if (lTrigger) lTrigger.setAttribute('aria-label', user.displayName || 'Account');
  }
}

/**
 * Switch the auth panel back to the signed-out (sign-in form) state.
 * Clears all personal data from the DOM for privacy.
 */
function showSignedOut() {
  authSignedIn.hidden  = true;
  authSignedOut.hidden = false;

  // Clear personal data
  authAvatar.src              = '';
  authAvatar.alt              = '';
  authDisplayName.textContent = '';
  authTierBadge.textContent   = '';
  authTierBadge.className     = 'tier-badge';

  // Show sign-in form inputs, hide sign-out button
  const signoutBtn = document.getElementById('btn-signout');
  const googleBtn  = document.getElementById('btn-google-signin');
  const emailInput = document.getElementById('auth-email');
  const pwInput    = document.getElementById('auth-password');
  const divider    = document.querySelector('#auth-panel .auth-divider');
  const authActions = document.querySelector('#auth-panel .auth-actions');
  if (signoutBtn)  signoutBtn.hidden  = true;
  if (googleBtn)   googleBtn.hidden   = false;
  if (emailInput)  emailInput.hidden  = false;
  if (pwInput)     pwInput.hidden     = false;
  if (divider)     divider.hidden     = false;
  if (authActions) authActions.hidden = false;

  const trigger = document.getElementById('sidebar-account-trigger');
  if (trigger) trigger.setAttribute('aria-label', 'Sign in');

  hideAuthError();

  // ── Mirror the same reset onto the floating landing/field-overview widget ──
  if (landingSignedOut) {
    landingSignedIn.hidden  = true;
    landingSignedOut.hidden = false;

    landingAvatar.src              = '';
    landingAvatar.alt              = '';
    landingDisplayName.textContent = '';
    landingTierBadge.textContent   = '';
    landingTierBadge.className     = 'tier-badge';

    const lSignoutBtn  = document.getElementById('landing-btn-signout');
    const lGoogleBtn   = document.getElementById('landing-btn-google-signin');
    const lEmailInput  = document.getElementById('landing-auth-email');
    const lPwInput     = document.getElementById('landing-auth-password');
    const lDivider     = document.querySelector('#landing-account-panel .auth-divider');
    const lAuthActions = document.querySelector('#landing-account-panel .auth-actions');
    if (lSignoutBtn)  lSignoutBtn.hidden  = true;
    if (lGoogleBtn)   lGoogleBtn.hidden   = false;
    if (lEmailInput)  lEmailInput.hidden  = false;
    if (lPwInput)     lPwInput.hidden     = false;
    if (lDivider)     lDivider.hidden     = false;
    if (lAuthActions) lAuthActions.hidden = false;

    const lTrigger = document.getElementById('landing-account-trigger');
    if (lTrigger) lTrigger.setAttribute('aria-label', 'Sign in');
  }
}

/**
 * Display an inline error message below the email/password inputs.
 * Called from catch() handlers on all sign-in / sign-up actions.
 *
 * @param {string} message
 */
function showAuthError(message) {
  authError.textContent = message;
  authError.hidden      = false;
  if (landingAuthError) {
    landingAuthError.textContent = message;
    landingAuthError.hidden      = false;
  }
}

/** Hide the inline auth error — called on successful auth and on sign-out. */
function hideAuthError() {
  authError.textContent = '';
  authError.hidden      = true;
  if (landingAuthError) {
    landingAuthError.textContent = '';
    landingAuthError.hidden      = true;
  }
}

// ── AUTH STATE OBSERVER ────────────────────────────────────────────────────
// Registered early; fires immediately with the persisted auth state (or null)
// and again on every subsequent sign-in / sign-out event.
onAuthChange(async (user) => {
  currentUser = user;

  if (user) {
    userProfile = await getUserProfile(user.uid);

    // Keep the admin panel's userIndex entry current (displayName/photoURL
    // can change between sessions; email users never re-register).
    await upsertUserIndex(user);

    // If the user's Firestore profile has a different language preference,
    // apply it and persist locally so the shell reflects it on next load.
    if (userProfile?.lang && userProfile.lang !== localStorage.getItem(LANG_KEY)) {
      await loadLanguage(userProfile.lang);
      localStorage.setItem(LANG_KEY, userProfile.lang);
      document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === userProfile.lang);
      });
      applyTranslations();
    }

    showSignedIn(user, userProfile);
  } else {
    userProfile = null;
    showSignedOut();
  }

  // Recompute which modules this user can see. Anonymous users fall back to
  // the platform's accessControl.mode default (handled inside access.js).
  // userProfile is reused here (already fetched above) so tier resolution
  // doesn't cost a second Firestore read.
  //
  // IMPORTANT: this runs (and render() fires) BEFORE migrateLocalStorageToFirestore
  // below, not after. migrateLocalStorageToFirestore loops through every
  // storage key with a *sequential* await per key, which can take a few
  // seconds for users with a lot of saved progress. It used to run first,
  // which meant the UI kept showing the pre-sign-in access list (often more
  // permissive, e.g. an unconfigured tier falling back to accessControl.mode
  // = 'open') for however long that loop took — a visible flash of "everything
  // unlocked" before the real tier-based restrictions kicked in. Access
  // control isn't supposed to depend on progress-sync latency, so it's
  // resolved and rendered first; the progress sync is allowed to finish
  // afterward, in the background.
  const [visible, courses, plLessons, plRequests] = await Promise.all([
    getVisibleModules(user?.uid ?? null, userProfile),
    loadCourseModules(user?.uid ?? null, userProfile?.tier ?? null),
    user ? getPersonalizedLessons(user.uid).catch(err => {
      console.warn('[LMS] boot: personalized lessons fetch failed', err);
      return [];
    }) : Promise.resolve([]),
    user ? getMyPersonalizedRequests(user.uid).catch(err => {
      console.warn('[LMS] boot: personalized requests fetch failed', err);
      return [];
    }) : Promise.resolve([])
  ]);
  visibleModules       = visible;
  courseModules        = courses.accessible;
  lockedCourseModules  = courses.locked;
  personalizedLessons  = plLessons;
  personalizedRequests = plRequests;

  // If the currently selected module is no longer valid (access revoked, a
  // course got unpublished, or the user signed out of a 'controlled'
  // platform), reset the selection to the first available module so the
  // shell doesn't render a dangling state. courseModules only exists from
  // this point on — a deep link to a course (?module=<courseId>) resolves
  // synchronously below in restoreStateFromURL() to an unconfirmed ID, and
  // is only validated here once Firestore data has actually arrived.
  const activeModuleStillValid = visibleModules.find(m => m.id === activeModuleId)
                               || courseModules.find(m => m.id === activeModuleId);
  if (activeModuleId && !activeModuleStillValid) {
    activeModuleId = visibleModules[0]?.id ?? courseModules[0]?.id ?? null;
    activeLessonId = null;
  } else if (activeModuleId && !activeFieldId) {
    // Confirmed a dynamic course module via deep link — infer its field now
    // that we have the data (mirrors the static-module inference in
    // restoreStateFromURL, which can't run for dynamic ids before this point).
    const dynMod = courseModules.find(m => m.id === activeModuleId);
    if (dynMod?.fieldId) activeFieldId = dynMod.fieldId;
  }

  // Show/hide the admin panel link based on role. Guarded with optional
  // chaining — the element may not exist on every shell variant.
  const adminLink = document.getElementById('btn-admin-panel');
  if (adminLink) adminLink.hidden = !isAdmin(userProfile);
  const landingAdminLink = document.getElementById('landing-btn-admin-panel');
  if (landingAdminLink) landingAdminLink.hidden = !isAdmin(userProfile);

  render();

  // Merge Firestore progress into localStorage on sign-in. No longer gates
  // render() above — access control already reflects the correct state by
  // the time this resolves. Once it's done, refresh just the progress
  // bars/lesson nav so the (until now possibly stale/local-only) numbers
  // catch up without re-running the whole render/access pipeline.
  if (user) {
    await migrateLocalStorageToFirestore(user.uid);
    renderProgressBars();
    renderLessonNav();
  }
});

// ── LANGUAGE SWITCHER ──────────────────────────────────────────────────────
async function switchLanguage(lang) {
  await loadLanguage(lang);
  localStorage.setItem(LANG_KEY, lang);

  if (currentUser) {
    await updateUserLang(currentUser.uid, lang);
  }

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // When switching back to English, applyTranslations() alone won't reset
  // static data-i18n elements because the English translation map is empty
  // (English is the source of truth in the HTML, not a separate i18n file).
  // Explicitly restore each element's text from its data-i18n-en attribute
  // (set on first render below) or from the t() fallback via render().
  if (lang === 'en') {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      // Restore the original English text stored when the page first loaded.
      if (el.dataset.i18nEn !== undefined) {
        el.textContent = el.dataset.i18nEn;
      }
    });
  }

  applyTranslations();
  render();

  // Touch point ②: notify the open lesson iframe to switch its tab live.
  if (frame.classList.contains('visible') && frame.contentWindow) {
    try { frame.contentWindow.postMessage({ type: 'lms:setLang', lang }, '*'); } catch (_) {}
  }
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => switchLanguage(btn.dataset.lang));
});

// ── STARTUP ────────────────────────────────────────────────────────────────
// Snapshot the English (source-of-truth) text for every static data-i18n
// element before any language override is applied. Stored in data-i18n-en so
// switchLanguage('en') can restore them instantly without needing a separate
// English translation file (English lives in the HTML, not in i18n/en.js).
document.querySelectorAll('[data-i18n]').forEach(el => {
  el.dataset.i18nEn = el.textContent;
});

// Restore state from URL params. This is the entry point for:
//   • Direct deep links (e.g. bookmarks to ?field=backend&module=database)
//   • Redirects from the legacy field.html and module.html shim pages
//
// Must run before the first render() so the correct view is shown immediately.
// visibleModules is seeded synchronously above, so STATIC module ids can be
// validated without waiting for Firestore. Dynamic course ids cannot — that
// data only exists in Firestore, fetched later in onAuthChange — so a
// moduleId that doesn't match a static module is trusted tentatively here
// and confirmed (or reset) once the boot fetch resolves.
(function restoreStateFromURL() {
  const params    = new URLSearchParams(location.search);
  const fieldId   = params.get('field');
  const moduleId  = params.get('module');

  // 'personalized' is a valid field id even though it's never in
  // LMS_CONFIG.fields (see state comment above) — accept it explicitly.
  // renderPersonalizedShell() itself handles the signed-out edge case
  // gracefully, so no auth check is needed here.
  const fieldValid = fieldId === 'personalized' || (fieldId && LMS_CONFIG.fields?.find(f => f.id === fieldId));

  // A moduleId might be a static LMS_CONFIG module (checkable synchronously)
  // OR a dynamic course (only confirmable after the Firestore fetch in the
  // onAuthChange boot sequence resolves — courseModules is empty until
  // then). Tentatively trust ANY non-empty moduleId here, the same way
  // 'personalized' is trusted above without a static lookup; the post-boot
  // validity check (see "activeModuleStillValid" in onAuthChange) corrects
  // activeModuleId back to a real one once we know which case it was.
  const moduleValid = fieldId !== 'personalized' && Boolean(moduleId);

  if (fieldValid)  activeFieldId  = fieldId;
  if (moduleValid) activeModuleId = moduleId;
  // If a moduleId was given but not a fieldId, infer the field from the module.
  // field-page.js passes ?from=<fieldId>&id=<moduleId>; the redirect shim
  // re-maps those to ?field=&module=, but this guard handles any edge case.
  // Only works for STATIC modules here — dynamic-course field inference for
  // this same case happens post-boot (see onAuthChange), since
  // LMS_CONFIG.fields can't know about a course's fieldId.
  if (moduleValid && !fieldValid) {
    const inferredField = LMS_CONFIG.fields?.find(f => f.moduleIds.includes(moduleId));
    if (inferredField) activeFieldId = inferredField.id;
  }
})();

// Handle browser back/forward — re-read the URL and re-render. Unlike
// restoreStateFromURL above, courseModules is already populated by the time
// a user can trigger popstate (it only fires after the app has finished
// booting and rendered at least once), so dynamic course ids can be
// validated directly here — no deferred-trust trick needed.
window.addEventListener('popstate', () => {
  const params   = new URLSearchParams(location.search);
  const fieldId  = params.get('field')  ?? null;
  const moduleId = params.get('module') ?? null;

  activeFieldId  = fieldId  && LMS_CONFIG.fields?.find(f => f.id === fieldId)  ? fieldId  : null;
  activeModuleId = moduleId && (LMS_CONFIG.modules.find(m => m.id === moduleId) || courseModules.find(m => m.id === moduleId))
    ? moduleId
    : null;
  activeLessonId = null;
  frame.src = '';
  frame.classList.remove('visible');
  welcomePanel?.classList.remove('hidden');
  render();
});

const savedLang = localStorage.getItem(LANG_KEY) || 'en';
await loadLanguage(savedLang);

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.classList.toggle('active', btn.dataset.lang === savedLang);
});

render();
applyTranslations();

// ── EVENT WIRING ───────────────────────────────────────────────────────────
// Shell
frame.addEventListener('load', () => {
  setTimeout(renderProgressBars, PROGRESS_UPDATE_DELAY);
  // Touch point ②: tell the freshly loaded lesson which language to show.
  const lang = localStorage.getItem(LANG_KEY) || 'en';
  try { frame.contentWindow?.postMessage({ type: 'lms:setLang', lang }, '*'); } catch (_) {}
});
resetButton.addEventListener('click', resetAllProgress);
// Shell back button: goes to the field-overview module picker (not all the
// way back to the fields landing). For 'personalized' or no-field mode,
// exitToFieldOverview() falls back to exitToFields() automatically.
backToFieldsButton.addEventListener('click', exitToFieldOverview);
backToFieldsFromOverviewButton.addEventListener('click', exitToFields);

// Auth buttons
document.getElementById('btn-google-signin').addEventListener('click', () =>
  signInWithGoogle().catch(err => showAuthError(err.message))
);

document.getElementById('btn-email-signin').addEventListener('click', () => {
  const email = document.getElementById('auth-email').value.trim();
  const pw    = document.getElementById('auth-password').value;
  signInWithEmail(email, pw).catch(err => showAuthError(err.message));
});

document.getElementById('btn-email-signup').addEventListener('click', () => {
  const email = document.getElementById('auth-email').value.trim();
  const pw    = document.getElementById('auth-password').value;
  signUpWithEmail(email, pw).catch(err => showAuthError(err.message));
});

document.getElementById('btn-signout').addEventListener('click', signOutUser);

// Floating widget's auth buttons (fields-landing / field-overview pages) —
// same handlers as the sidebar's, just reading from the landing-* inputs.
document.getElementById('landing-btn-google-signin').addEventListener('click', () =>
  signInWithGoogle().catch(err => showAuthError(err.message))
);

document.getElementById('landing-btn-email-signin').addEventListener('click', () => {
  const email = document.getElementById('landing-auth-email').value.trim();
  const pw    = document.getElementById('landing-auth-password').value;
  signInWithEmail(email, pw).catch(err => showAuthError(err.message));
});

document.getElementById('landing-btn-email-signup').addEventListener('click', () => {
  const email = document.getElementById('landing-auth-email').value.trim();
  const pw    = document.getElementById('landing-auth-password').value;
  signUpWithEmail(email, pw).catch(err => showAuthError(err.message));
});

document.getElementById('landing-btn-signout').addEventListener('click', signOutUser);

// ── FLOATING ACCOUNT WIDGET TOGGLE ──────────────────────────────────────────
// Same open/close-on-outside-click pattern as wireSidebarAccount() below,
// for the floating pill shown on the landing and field-overview pages.
(function wireLandingAccount() {
  const trigger = document.getElementById('landing-account-trigger');
  const panel   = document.getElementById('landing-account-panel');
  if (!trigger || !panel) return;

  trigger.addEventListener('click', () => {
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    trigger.setAttribute('aria-expanded', String(!isOpen));
    trigger.classList.toggle('open', !isOpen);
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('landing-account')?.contains(e.target)) {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.classList.remove('open');
    }
  });
})();

// ── SIDEBAR ACCOUNT TOGGLE ─────────────────────────────────────────────────
// Clicking the sidebar account trigger row opens/closes the auth panel
// inline, and rotates the chevron arrow. Works for both signed-in and
// signed-out states — the panel content changes via showSignedIn/showSignedOut.
(function wireSidebarAccount() {
  const trigger = document.getElementById('sidebar-account-trigger');
  const panel   = document.getElementById('auth-panel');
  if (!trigger || !panel) return;

  trigger.addEventListener('click', () => {
    const isOpen = !panel.hidden;
    panel.hidden = isOpen;
    trigger.setAttribute('aria-expanded', String(!isOpen));
    trigger.classList.toggle('open', !isOpen);
  });

  // Close the panel when the user clicks anywhere outside the sidebar account
  document.addEventListener('click', (e) => {
    if (!document.getElementById('sidebar-account')?.contains(e.target)) {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.classList.remove('open');
    }
  });
})();

// ── MOBILE SIDEBAR DRAWER ──────────────────────────────────────────────────
// Injects a slim topbar (hamburger + brand) into #app-shell on mobile.
// The sidebar becomes a fixed off-canvas drawer toggled by this button.
// Works for both LTR and RTL layouts (see CSS: :dir(rtl) .sidebar rules).
(function wireMobileSidebar() {
  const shell   = document.getElementById('app-shell');
  const sidebar = shell?.querySelector('.sidebar');
  if (!shell || !sidebar) return;

  // ── Mobile topbar ──────────────────────────────────────────────────────
  const topbar = document.createElement('div');
  topbar.className   = 'mob-topbar';
  topbar.setAttribute('role', 'banner');
  topbar.innerHTML = `
    <button class="mob-menu-btn" type="button" aria-label="Open navigation" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
    <div class="mob-topbar-brand" aria-hidden="true">SkillMap<span>·LMS</span></div>
  `;
  // Insert as first child so it sits above .sidebar (fixed) and .main
  shell.insertBefore(topbar, shell.firstChild);

  // ── Backdrop ───────────────────────────────────────────────────────────
  const backdrop = document.createElement('div');
  backdrop.className = 'mob-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.appendChild(backdrop);

  const menuBtn = topbar.querySelector('.mob-menu-btn');

  function openDrawer() {
    sidebar.classList.add('mob-open');
    backdrop.classList.add('visible');
    menuBtn.classList.add('open');
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Close navigation');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    sidebar.classList.remove('mob-open');
    backdrop.classList.remove('visible');
    menuBtn.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Open navigation');
    document.body.style.overflow = '';
  }

  menuBtn.addEventListener('click', () =>
    sidebar.classList.contains('mob-open') ? closeDrawer() : openDrawer()
  );

  // Tap backdrop to dismiss
  backdrop.addEventListener('click', closeDrawer);

  // Auto-close when a lesson or back-button is tapped inside the drawer
  sidebar.addEventListener('click', (e) => {
    if (window.innerWidth <= 900 && e.target.closest('.nav-btn, .back-btn')) {
      setTimeout(closeDrawer, 110); // slight delay so active state flashes
    }
  });

  // Close if user resizes back to desktop width
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeDrawer();
  }, { passive: true });
})();

// ── PROGRESS IPC (Issue 3 fix) ─────────────────────────────────────────────
// Lesson iframes can only communicate progress changes via two mechanisms:
//
//   1. window.storage event — fires immediately in this window whenever a
//      DIFFERENT tab/window writes to localStorage. This covers the case where
//      a user has two tabs open and checks a box in one — the other updates
//      within milliseconds instead of waiting up to 3 seconds.
//      NOTE: the storage event does NOT fire in the same tab that wrote the
//      value. That's why we still need the poll below.
//
//   2. setInterval poll — catches same-tab checkbox writes from the lesson
//      iframe (iframes share localStorage with the parent page but do NOT
//      trigger the parent's storage event). Kept at 3 s; the storage event
//      handles cross-tab latency so there is no reason to shorten the interval.
//
//   3. postMessage (lms:openLesson) — lesson pages that contain links to
//      sibling lessons post a message instead of navigating the iframe directly.
//      Ported from module-shell.js so that file can be deleted (Issue 1 cleanup).
//      Message shape: { type: 'lms:openLesson', route: 'lms/modules/.../file.html' }
//
//   4. postMessage (lms:progressChanged) — lesson-ui.js posts this whenever a
//      q-card is opened. Triggers an immediate renderProgressBars() +
//      renderLessonNav() + syncProgressToFirestore() instead of waiting up to
//      3 s for the poll. Message shape: { type: 'lms:progressChanged', storageKey }
//
//   5. postMessage (lms:requestProgress) — lesson-ui.js posts this on
//      DOMContentLoaded so the shell can send back the Firestore-authoritative
//      progress object for that lesson. The iframe uses it to restore q-card
//      open states seen on other devices.
//      Message shape: { type: 'lms:requestProgress', storageKey }
//      Shell reply:   { type: 'lms:progressData', storageKey, data }

// ① Instant update on cross-tab localStorage writes
window.addEventListener('storage', (e) => {
  // Only re-render for keys we actually track — ignore unrelated writes.
  const trackedKeys = new Set(getAllStorageKeys());
  if (!trackedKeys.has(e.key)) return;
  renderProgressBars();
  renderLessonNav();
});

// ② Periodic poll — same-tab iframe writes + Firestore sync
setInterval(async () => {
  renderProgressBars();
  renderLessonNav();
  await syncProgressToFirestore();
}, PROGRESS_POLL_INTERVAL);

// ③ postMessage handler — lesson-to-lesson navigation from inside the iframe
// Ported from module-shell.js. Strategy:
//   • Registered route → open via openLesson() so the sidebar highlights and
//     progress is tracked correctly.
//   • Unregistered route (deep-dive / reference file not in the registry) →
//     load directly into the iframe; sidebar keeps its current state.
//   • lms:langChanged → lesson tab click keeps the shell lang switcher in sync.
window.addEventListener('message', (e) => {
  // Touch point ③: lesson tab clicked → sync shell language.
  if (e.data?.type === 'lms:langChanged') {
    const lang = e.data.lang;
    // Guard: only act if the lang genuinely changed — prevents the
    // switchLanguage → lms:setLang → switchTab → lms:langChanged loop.
    if (lang && ['en', 'de', 'ar'].includes(lang) &&
        lang !== (localStorage.getItem(LANG_KEY) || 'en')) {
      switchLanguage(lang);
    }
    return;
  }

  // ④ Progress bridge — lesson iframe opened a q-card.
  //    Re-render sidebar bars immediately (instead of waiting for the 3 s poll)
  //    and trigger an out-of-band Firestore sync for signed-in users.
  if (e.data?.type === 'lms:progressChanged') {
    renderProgressBars();
    renderLessonNav();
    syncProgressToFirestore().catch(err =>
      console.warn('[LMS] lms:progressChanged: Firestore sync failed', err)
    );
    return;
  }

  // ⑤ Progress bridge — lesson iframe requested its stored progress on load.
  //    Read localStorage (already hydrated from Firestore by
  //    migrateLocalStorageToFirestore on sign-in) and post it back so the
  //    iframe can open any q-cards the user completed on another device.
  if (e.data?.type === 'lms:requestProgress') {
    const sk = e.data.storageKey;
    if (sk && typeof sk === 'string') {
      const data = safeReadStorage(sk);
      try {
        frame.contentWindow?.postMessage(
          { type: 'lms:progressData', storageKey: sk, data },
          '*'
        );
      } catch (_) {}
    }
    return;
  }

  // ⑥ Nav info bridge — lesson iframe requested prev/next lesson info on load.
  //    Finds the lesson by its route and sends adjacent lesson data back so the
  //    iframe can enable its Prev / Next buttons (injected by lesson-ui.js).
  //    Message shape in:  { type: 'lms:requestNavInfo', route: 'lms/modules/…/file.html' }
  //    Message shape out: { type: 'lms:navInfo', prev: {title,route}|null, next: {title,route}|null }
  if (e.data?.type === 'lms:requestNavInfo') {
    const navRoute = e.data.route;
    if (!navRoute || typeof navRoute !== 'string') return;

    const navMod = getActiveFieldModules().find(m => m.id === activeModuleId);
    if (!navMod) return;

    const navIdx = navMod.lessons.findIndex(l => l.route === navRoute);
    if (navIdx === -1) return;

    const prevLesson = navIdx > 0                          ? navMod.lessons[navIdx - 1] : null;
    const nextLesson = navIdx < navMod.lessons.length - 1  ? navMod.lessons[navIdx + 1] : null;

    try {
      frame.contentWindow?.postMessage({
        type: 'lms:navInfo',
        prev: prevLesson ? { title: prevLesson.title, route: prevLesson.route } : null,
        next: nextLesson ? { title: nextLesson.title, route: nextLesson.route } : null
      }, '*');
    } catch (_) {}
    return;
  }

  if (e.data?.type !== 'lms:openLesson') return;
  const route = e.data.route;
  if (!route || typeof route !== 'string') return;

  const mod = getActiveFieldModules().find(m => m.id === activeModuleId);
  if (!mod) return;

  const registered = mod.lessons.find(l => l.route === route);
  if (registered) {
    // Registered lesson — use the normal path so the sidebar highlights correctly.
    openLesson(registered.id);
  } else {
    // Unregistered file (deep-dive, reference doc, etc.) — load into the iframe
    // directly. The sidebar stays as-is; progress bar is unaffected.
    activeLessonId = null;
    frame.src = route;
    frame.classList.add('visible');
    welcomePanel.classList.add('hidden');
    renderLessonNav();   // clears the active highlight
  }
});