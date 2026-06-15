import { LMS_CONFIG } from './registry.js';

document.title = LMS_CONFIG.appName;

import { loadLanguage, applyTranslations, t } from './i18n.js';
import {
  onAuthChange,
  signInWithGoogle,
  signUpWithEmail,
  signInWithEmail,
  signOutUser
} from './auth.js';
import { getUserProfile, getLessonProgress, setLessonProgress, updateUserLang, upsertUserIndex } from './db.js';
import { getVisibleModules, isAdmin } from './access.js';

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

// ── PROGRESS HELPERS ───────────────────────────────────────────────────────

/**
 * Returns the deduplicated set of all checklist storageKeys across every
 * module in the registry. Progress is global (not field-scoped), so this
 * must scan ALL modules, not just the active field's modules.
 * @returns {string[]}
 */
function getAllStorageKeys() {
  const keys = new Set();
  for (const mod of LMS_CONFIG.modules) {
    for (const lesson of mod.lessons) {
      const cfg = lesson.progress;
      if (cfg?.type === 'checklist' && cfg.storageKey) {
        keys.add(cfg.storageKey);
      }
    }
  }
  return Array.from(keys);
}

function safeReadStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function computeLessonProgress(lesson) {
  const cfg = lesson.progress || { type: 'untracked' };
  if (cfg.type !== 'checklist') return { done: 0, total: cfg.total || 0, pct: 100 };
  const raw    = safeReadStorage(cfg.storageKey);
  const ignore = new Set(cfg.ignoreKeys || []);
  const done   = Object.entries(raw).filter(([k, v]) => !ignore.has(k) && !!v).length;
  const total  = cfg.total || 0;
  const clamped = Math.min(done, total);
  const pct    = total > 0 ? Math.round((clamped / total) * 100) : 0;
  return { done: clamped, total, pct };
}

function computeModuleProgress(mod) {
  const trackable = mod.lessons.filter(l => (l.progress?.type || 'untracked') === 'checklist');
  const totals = trackable.reduce((acc, lesson) => {
    const p = computeLessonProgress(lesson);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
  const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;
  return { ...totals, pct };
}

function computeGlobalProgress() {
  const totals = getActiveFieldModules().reduce((acc, mod) => {
    const p = computeModuleProgress(mod);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
  const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;
  return { ...totals, pct };
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

// ── FIELD / MODULE SCOPING ─────────────────────────────────────────────────
function getActiveFieldModules() {
  if (!activeFieldId) return visibleModules;
  const field = LMS_CONFIG.fields?.find(f => f.id === activeFieldId);
  if (!field) return visibleModules;
  return field.moduleIds
    .map(id => visibleModules.find(m => m.id === id))
    .filter(Boolean);
}

function enterField(fieldId) {
  activeFieldId  = fieldId;
  activeModuleId = null;
  activeLessonId = null;
  frame.src = '';
  frame.classList.remove('visible');
  welcomePanel.classList.remove('hidden');
  render();
}

function exitToFields() {
  activeFieldId  = null;
  activeModuleId = null;
  activeLessonId = null;
  render();
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
      render();
    });
    moduleNav.appendChild(btn);
  });
}

function openLesson(lessonId) {
  const mod    = getActiveFieldModules().find(m => m.id === activeModuleId);
  const lesson = mod?.lessons.find(l => l.id === lessonId);
  if (!lesson) return;
  activeLessonId = lessonId;
  frame.src = lesson.route;
  frame.classList.add('visible');
  welcomePanel.classList.add('hidden');
  renderLessonNav();
}

function renderLessonNav() {
  lessonNav.innerHTML = '';
  const mod = getActiveFieldModules().find(m => m.id === activeModuleId);
  if (!mod) return;
  mod.lessons.forEach(lesson => {
    const p   = computeLessonProgress(lesson);
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = `nav-btn ${lesson.id === activeLessonId ? 'active' : ''}`;
    const progressLabel = (lesson.progress?.type || 'untracked') === 'checklist'
      ? `${p.done}/${p.total} · ${p.pct}%`
      : t('lesson.referenceLabel', 'Reference');
    btn.innerHTML = `<strong>${lesson.title}</strong><small>${lesson.subtitle}</small><small>${progressLabel}</small>`;
    btn.addEventListener('click', () => openLesson(lesson.id));
    lessonNav.appendChild(btn);
  });
}

function renderProgressBars() {
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
    const fieldModules = field.moduleIds
      .map(id => visibleModules.find(m => m.id === id))
      .filter(Boolean);

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

function render() {
  const hasFields = (LMS_CONFIG.fields?.length ?? 0) > 0;
  if (hasFields && activeFieldId === null) {
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
    if (userProfile?.lang && userProfile.lang !== localStorage.getItem('lms_lang')) {
      await loadLanguage(userProfile.lang);
      localStorage.setItem('lms_lang', userProfile.lang);
      document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === userProfile.lang);
      });
      applyTranslations();
    }

    showSignedIn(user, userProfile);

    // Merge Firestore progress into localStorage on first sign-in.
    // Must complete before render() so that progress bars reflect the
    // full cross-device state on the very first paint.
    await migrateLocalStorageToFirestore(user.uid);
  } else {
    userProfile = null;
    showSignedOut();
  }

  // Recompute which modules this user can see. Anonymous users fall back to
  // the platform's accessControl.mode default (handled inside access.js).
  visibleModules = await getVisibleModules(user?.uid ?? null);

  // If the currently selected module is no longer visible (access revoked,
  // or user signed out of a 'controlled' platform), reset the selection to
  // the first visible module so the shell doesn't render a dangling state.
  if (activeModuleId && !visibleModules.find(m => m.id === activeModuleId)) {
    activeModuleId = visibleModules[0]?.id ?? null;
    activeLessonId = null;
  }

  // Show/hide the admin panel link based on role. Guarded with optional
  // chaining — the element may not exist on every shell variant.
  const adminLink = document.getElementById('btn-admin-panel');
  if (adminLink) adminLink.hidden = !isAdmin(userProfile);

  render();
});

// ── LANGUAGE SWITCHER ──────────────────────────────────────────────────────
async function switchLanguage(lang) {
  await loadLanguage(lang);
  localStorage.setItem('lms_lang', lang);

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
const savedLang = localStorage.getItem('lms_lang') || 'en';
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

// ── PROGRESS POLLING ───────────────────────────────────────────────────────
// Runs every 3 seconds to detect checkbox changes made inside the lesson
// iframe (the iframe can only communicate via shared localStorage).
// When signed in, each tick also syncs dirty keys to Firestore so progress
// is visible on other devices within one poll cycle.
setInterval(async () => {
  renderProgressBars();
  await syncProgressToFirestore();
}, PROGRESS_POLL_INTERVAL);