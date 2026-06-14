import { LMS_CONFIG } from './registry.js';
import { loadLanguage, applyTranslations, t } from './i18n.js';
import {
  onAuthChange,
  signInWithGoogle,
  signUpWithEmail,
  signInWithEmail,
  signOutUser
} from './auth.js';
import { getUserProfile } from './db.js';

// ── DOM REFERENCES ─────────────────────────────────────────────────────────
const moduleNav             = document.getElementById('module-nav');
const lessonNav             = document.getElementById('lesson-nav');
const moduleProgress        = document.getElementById('module-progress');
const moduleProgressFill    = document.getElementById('module-progress-fill');
const globalProgress        = document.getElementById('global-progress');
const globalProgressFill    = document.getElementById('global-progress-fill');
const moduleTitle           = document.getElementById('active-module-title');
const moduleSubtitle        = document.getElementById('active-module-subtitle');
const welcome               = document.getElementById('welcome');
const welcomeHeading        = welcome.querySelector('h3');
const welcomeBody           = welcome.querySelector('p');
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

// ── PROGRESS HELPERS ───────────────────────────────────────────────────────
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

// ── FIELD / MODULE SCOPING ─────────────────────────────────────────────────
function getActiveFieldModules() {
  if (!activeFieldId) return LMS_CONFIG.modules;
  const field = LMS_CONFIG.fields?.find(f => f.id === activeFieldId);
  if (!field) return LMS_CONFIG.modules;
  return field.moduleIds
    .map(id => LMS_CONFIG.modules.find(m => m.id === id))
    .filter(Boolean);
}

function enterField(fieldId) {
  activeFieldId  = fieldId;
  activeModuleId = null;
  activeLessonId = null;
  frame.src = '';
  frame.classList.remove('visible');
  welcome.classList.remove('hidden');
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
  welcome.classList.add('hidden');
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
  moduleProgress.textContent    = `${mp.pct}%`;
  moduleProgressFill.style.width = `${mp.pct}%`;
  globalProgress.textContent    = `${gp.pct}%`;
  globalProgressFill.style.width = `${gp.pct}%`;
}

function renderHeader() {
  const mod = getActiveFieldModules().find(m => m.id === activeModuleId);
  if (!mod) return;
  moduleTitle.textContent    = mod.title;
  moduleSubtitle.textContent = mod.subtitle;
}

function resetAllProgress() {
  const keys = new Set();
  getActiveFieldModules().forEach(mod => {
    mod.lessons.forEach(lesson => {
      const cfg = lesson.progress;
      if (cfg?.type === 'checklist' && cfg.storageKey) keys.add(cfg.storageKey);
    });
  });
  keys.forEach(key => localStorage.removeItem(key));
  render();
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
      .map(id => LMS_CONFIG.modules.find(m => m.id === id))
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
  renderHeader();
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

// ── PHASE 4 STUB ───────────────────────────────────────────────────────────
// migrateLocalStorageToFirestore will be implemented in Phase 4 (cross-device
// progress sync). Called here so the onAuthChange handler is already in its
// final shape and Phase 4 only needs to fill in the body.
async function migrateLocalStorageToFirestore(_uid) {
  // TODO (Phase 4): read Firestore progress for each storageKey, merge with
  // localStorage (Firestore wins on conflict), write merged result back.
}

// ── AUTH STATE OBSERVER ────────────────────────────────────────────────────
// Registered early; fires immediately with the persisted auth state (or null)
// and again on every subsequent sign-in / sign-out event.
onAuthChange(async (user) => {
  currentUser = user;

  if (user) {
    userProfile = await getUserProfile(user.uid);

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
    await migrateLocalStorageToFirestore(user.uid);
  } else {
    userProfile = null;
    showSignedOut();
  }

  render();
});

// ── LANGUAGE SWITCHER ──────────────────────────────────────────────────────
async function switchLanguage(lang) {
  await loadLanguage(lang);
  localStorage.setItem('lms_lang', lang);

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

// Progress polling — keeps the sidebar in sync with iframe checkbox changes
setInterval(renderProgressBars, PROGRESS_POLL_INTERVAL);