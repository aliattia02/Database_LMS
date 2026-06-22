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
const appShell              = document.getElementById('app-shell');
const backToFieldsButton    = document.getElementById('btn-back-fields');
const personalizedPanel     = document.getElementById('personalized-panel');
// Auth panel elements
const authSignedOut         = document.getElementById('auth-signed-out');
const authSignedIn          = document.getElementById('auth-signed-in');
const authAvatar            = document.getElementById('auth-avatar');
const authDisplayName       = document.getElementById('auth-display-name');
const authTierBadge         = document.getElementById('auth-tier-badge');
const authError             = document.getElementById('auth-error');

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const IFRAME_RELOAD_DELAY    = 50;
const PROGRESS_UPDATE_DELAY  = 150;
const PROGRESS_POLL_INTERVAL = 3000;

// ── STATE ──────────────────────────────────────────────────────────────────
let activeFieldId  = null;   // null → show fields landing (when LMS_CONFIG.fields is non-empty)
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
 * @param {string|null} uid   — current user uid, or null if signed out
 * @param {string|null} tier  — current user tier ('free'|'pro'|…), or null
 * @returns {Promise<Array<object>>}
 */
async function loadCourseModules(uid = null, tier = null) {
  const accessMode = LMS_CONFIG.accessControl?.mode ?? 'open';

  let courses;
  try {
    courses = await getPublishedCourses();
  } catch (err) {
    console.warn('[LMS] boot: published courses fetch failed', err);
    return [];
  }

  // Fetch the per-user and tier access maps in parallel.
  // These are the same Firestore docs that access.js reads for static modules —
  // running them here in parallel with getVisibleModules() means only one
  // extra round-trip even if the SDK doesn't cache the reads.
  const [accessMap, tierMap] = await Promise.all([
    uid  ? getModuleAccess(uid).catch(() => null) : Promise.resolve(null),
    tier ? getTierAccess(tier).catch(() => null)  : Promise.resolve(null)
  ]);

  // Filter: keep only courses this user is allowed to see.
  // Precedence: per-user override → tier default → accessControl.mode.
  const visibleCourses = courses.filter(course => {
    if (accessMap !== null && course.id in accessMap) return accessMap[course.id];
    if (tierMap   !== null && course.id in tierMap)   return tierMap[course.id];
    return accessMode === 'open';
  });

  const lessonsByCourse = await Promise.all(
    visibleCourses.map(course =>
      getCourseLessons(course.id).catch(err => {
        console.warn(`[LMS] boot: lessons fetch failed for course "${course.id}"`, err);
        return [];
      })
    )
  );

  return visibleCourses.map((course, i) => ({
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
}

// ── FIELD / MODULE SCOPING ─────────────────────────────────────────────────

/**
 * Returns every module — static LMS_CONFIG modules AND published dynamic
 * courses — that belongs to a given field. When fieldId is falsy (or
 * doesn't match a configured field — e.g. it was removed from the registry),
 * falls back to ALL static modules plus every dynamic course that isn't
 * assigned to any field, mirroring the original "show everything" fallback.
 *
 * Single source of truth for field membership: both renderFieldsLanding()
 * (module counts/progress on the landing cards) and getActiveFieldModules()
 * (the in-field nav once a field is entered) call this, so they can never
 * disagree about what's inside a field.
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

function getActiveFieldModules() {
  return getFieldModules(activeFieldId);
}

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
  getActiveFieldModules().forEach(mod => {
    const p   = computeModuleProgress(mod);
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = `nav-btn ${mod.id === activeModuleId ? 'active' : ''}`;
    btn.innerHTML = `<strong>${mod.title}</strong><small>${mod.subtitle}</small><small>${p.pct}% ${t('field.complete', 'complete')}</small>`;
    btn.addEventListener('click', () => {
      activeModuleId = mod.id;
      activeLessonId = null;
      updateURL();   // replaceState — module switches don't need history entries
      render();
    });
    moduleNav.appendChild(btn);
  });
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
      const accountBar = document.getElementById('account-bar');
      // account-bar is a collapsed <details> disclosure (Phase 0 fix) — open
      // it first, or the email field below would be hidden and unfocusable.
      if (accountBar) accountBar.open = true;
      authPanel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Small delay so the scroll completes before focus triggers any
      // scroll-into-view from the browser's focus handling.
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
      <strong>${lesson.title}</strong>
      <small>${lesson.subtitle}</small>
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

  fieldsGrid.innerHTML = '';

  (LMS_CONFIG.fields || []).forEach(field => {
    const fieldModules = getFieldModules(field.id);

    const totals = fieldModules.reduce((acc, mod) => {
      const p = computeModuleProgress(mod);
      return { done: acc.done + p.done, total: acc.total + p.total };
    }, { done: 0, total: 0 });
    const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

    const isLocked = fieldModules.length === 0;

    const card = document.createElement('button');
    card.type      = 'button';
    card.className = `field-card${isLocked ? ' locked' : ''}`;
    card.style.setProperty('--field-accent', field.theme?.accent     ?? 'var(--accent)');
    card.style.setProperty('--field-soft',   field.theme?.accentSoft ?? 'var(--accent-soft)');

    card.innerHTML = `
      <div class="field-card-icon">${field.icon ?? '📚'}</div>
      <div class="field-card-body">
        <strong class="field-card-title">${field.title}</strong>
        <p    class="field-card-sub">${field.subtitle}</p>
        <div  class="field-card-meta">
          <span>${fieldModules.length} ${t('field.modules', 'modules')}</span>
          <span class="field-card-pct">${pct}% ${t('field.complete', 'complete')}</span>
        </div>
        <div class="field-card-bar">
          <div class="field-card-fill" style="width:${pct}%"></div>
        </div>
      </div>
      ${isLocked ? `<div class="field-locked-badge" title="${t('field.locked', 'No access')}">🔒</div>` : ''}
    `;

    if (!isLocked) card.addEventListener('click', () => enterField(field.id));
    fieldsGrid.appendChild(card);
  });

  // Personalized Lessons card — always appended last. Not part of
  // LMS_CONFIG.fields (see state comment above), so it's built and inserted
  // here rather than coming from the .forEach() above.
  fieldsGrid.appendChild(renderPersonalizedFieldCard());
}

/**
 * Builds the Personalized Lessons field card for the landing grid.
 * Locked (🔒, non-clickable) for anonymous visitors, since every request is
 * tied to a uid. Shows a "N lessons ready" count instead of a % bar, since
 * this field has no fixed module count to measure progress against.
 */
function renderPersonalizedFieldCard() {
  const isLocked = !currentUser;

  const card = document.createElement('button');
  card.type      = 'button';
  card.className = `field-card pl-field-card${isLocked ? ' locked' : ''}`;

  card.innerHTML = `
    <div class="field-card-icon">✨</div>
    <div class="field-card-body">
      <strong class="field-card-title">${t('pl.fieldTitle', 'Personalized Lessons')}</strong>
      <p    class="field-card-sub">${t('pl.fieldSubtitle', 'Lessons built just for you')}</p>
      <div  class="field-card-meta">
        <span>${isLocked
          ? t('pl.signInRequired', 'Sign in required')
          : `${personalizedLessons.length} ${t('pl.lessonsReady', 'lessons ready')}`}</span>
      </div>
    </div>
    ${isLocked ? `<div class="field-locked-badge" title="${t('pl.signInTooltip', 'Sign in to request personalized lessons')}">🔒</div>` : ''}
  `;

  if (!isLocked) card.addEventListener('click', () => enterField('personalized'));
  return card;
}

function renderBrandSubtitle() {
  brandSubtitle.textContent = getActiveFieldModules().map(mod => mod.title).join(' · ');
}

function renderWelcomePanel() {
  const cfg = LMS_CONFIG.welcome;
  if (!cfg) return;
  if (cfg.heading) welcomeHeading.textContent = t('welcome.heading', cfg.heading);
  if (cfg.body)    welcomeBody.textContent    = t('welcome.body',    cfg.body);
}

function renderShell() {
  fieldsLanding.hidden = true;
  appShell.hidden      = false;

  // Undo anything Personalized Lessons mode hid/repurposed, in case the user
  // is arriving here straight from that field (e.g. via "← Fields" then into
  // a normal field, or a popstate jump).
  document.getElementById('lesson-nav-block').hidden = false;
  personalizedPanel.hidden = true;

  const field = LMS_CONFIG.fields?.find(f => f.id === activeFieldId);
  if (field?.theme) updateTheme(field);

  renderModuleNav();
  renderLessonNav();
  renderProgressBars();
  renderBrandSubtitle();
  renderWelcomePanel();

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

  document.getElementById('lesson-nav-block').hidden = true;
  brandSubtitle.textContent = t('pl.fieldSubtitle', 'Lessons built just for you');

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
      <button type="button" class="pl-cta-btn" id="pl-cta-new">${t('pl.requestCta', '+ Request a lesson')}</button>
    </div>
    ${isEmpty ? `
      <div class="pl-empty-state">
        <div class="pl-empty-icon">✨</div>
        <h3>${t('pl.emptyHeading', 'No personalized lessons yet')}</h3>
        <p>${t('pl.emptyBody', 'Tell us what you want to learn and an instructor will build a lesson just for you.')}</p>
        <button type="button" class="pl-cta-btn" id="pl-cta-empty">${t('pl.requestCta', '+ Request a lesson')}</button>
      </div>
    ` : `<div class="pl-cards-grid">${cardsHtml}</div>`}
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
  if (activeFieldId === 'personalized') {
    renderPersonalizedShell();
  } else if (hasFields && activeFieldId === null) {
    renderFieldsLanding();
  } else {
    renderShell();
  }
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
  // Hide sign-out view, reveal signed-in view
  authSignedOut.hidden = true;
  authSignedIn.hidden  = false;

  // Avatar — fall back to a blank placeholder if Google didn't provide one
  authAvatar.src = user.photoURL || '';
  authAvatar.alt = user.displayName || user.email || 'User';

  // Display name — prefer displayName (Google), fall back to email prefix
  authDisplayName.textContent =
    user.displayName || user.email?.split('@')[0] || 'User';

  // Tier badge — reads from Firestore profile ('free' | 'pro')
  const tier = profile?.tier || 'free';
  authTierBadge.textContent = tier;
  authTierBadge.className   = `tier-badge${tier === 'pro' ? ' pro' : ''}`;

  // Clear any leftover error from a previous failed attempt
  hideAuthError();
}

/**
 * Switch the auth panel back to the signed-out (sign-in form) state.
 * Clears all personal data from the DOM for privacy.
 */
function showSignedOut() {
  authSignedIn.hidden  = true;
  authSignedOut.hidden = false;

  // Clear personal data so it isn't visible when re-opening the panel
  authAvatar.src              = '';
  authAvatar.alt              = '';
  authDisplayName.textContent = '';
  authTierBadge.textContent   = '';
  authTierBadge.className     = 'tier-badge';

  hideAuthError();
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
}

/** Hide the inline auth error — called on successful auth and on sign-out. */
function hideAuthError() {
  authError.textContent = '';
  authError.hidden      = true;
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
  courseModules        = courses;
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

  applyTranslations();
  render();
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => switchLanguage(btn.dataset.lang));
});

// ── STARTUP ────────────────────────────────────────────────────────────────
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
frame.addEventListener('load', () =>
  setTimeout(renderProgressBars, PROGRESS_UPDATE_DELAY)
);
resetButton.addEventListener('click', resetAllProgress);
backToFieldsButton.addEventListener('click', exitToFields);

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
window.addEventListener('message', (e) => {
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