// lms/core/module-shell.js
// Drives lms/modules/module.html — reads ?id=<moduleId>&from=<fieldId>
// Renders the lesson sidebar and hosts the lesson iframe.

import { LMS_CONFIG } from '../core/registry.js';
import { loadLanguage, applyTranslations, t } from '../core/i18n.js';

const IFRAME_RELOAD_DELAY    = 50;
const PROGRESS_UPDATE_DELAY  = 150;
const PROGRESS_POLL_INTERVAL = 3000;

// ── i18n startup ─────────────────────────────────────────────────────────────
const savedLang = localStorage.getItem('lms_lang') || 'en';
await loadLanguage(savedLang);

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.classList.toggle('active', btn.dataset.lang === savedLang);
  btn.addEventListener('click', async () => {
    await loadLanguage(btn.dataset.lang);
    localStorage.setItem('lms_lang', btn.dataset.lang);
    document.querySelectorAll('.lang-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === btn.dataset.lang));
    applyTranslations();
    renderLessonNav(); // refresh dynamic labels
  });
});

// ── resolve module + back-link from query string ─────────────────────────────
const params   = new URLSearchParams(location.search);
const moduleId = params.get('id');
const fromId   = params.get('from'); // field id, may be null
const mod      = LMS_CONFIG.modules.find(m => m.id === moduleId);

if (!mod) {
  document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">Module not found. <a href="../../index.html">Back to fields</a></p>';
  throw new Error(`Unknown module id: ${moduleId}`);
}

// Wire back link
const backBtn  = document.getElementById('btn-back-field');
const backHref = fromId
  ? `../fields/field.html?id=${fromId}`
  : '../../index.html';
backBtn.href = backHref;

// Apply module theme
if (mod.theme) {
  document.documentElement.style.setProperty('--accent',      mod.theme.accent);
  document.documentElement.style.setProperty('--accent-soft', mod.theme.accentSoft);
}

// Page title + topbar
document.title = `${mod.title} — LMS Platform`;
document.getElementById('active-module-title').textContent    = mod.title;
document.getElementById('active-module-subtitle').textContent = mod.subtitle;
document.getElementById('brand-subtitle').textContent         = mod.title;

// ── progress helpers ─────────────────────────────────────────────────────────
function safeReadStorage(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); }
  catch { return {}; }
}

function computeLessonProgress(lesson) {
  const cfg = lesson.progress || { type: 'untracked' };
  if (cfg.type !== 'checklist') return { done: 0, total: cfg.total || 0, pct: 100 };
  const raw    = safeReadStorage(cfg.storageKey);
  const ignore = new Set(cfg.ignoreKeys || []);
  const done   = Object.entries(raw).filter(([k, v]) => !ignore.has(k) && !!v).length;
  const total  = cfg.total || 0;
  const clamped = Math.min(done, total);
  return { done: clamped, total, pct: total > 0 ? Math.round((clamped / total) * 100) : 0 };
}

function computeModuleProgress() {
  const trackable = mod.lessons.filter(l => (l.progress?.type || 'untracked') === 'checklist');
  const totals = trackable.reduce((acc, lesson) => {
    const p = computeLessonProgress(lesson);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
  return totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const lessonNav          = document.getElementById('lesson-nav');
const moduleProgress     = document.getElementById('module-progress');
const moduleProgressFill = document.getElementById('module-progress-fill');
const welcome            = document.getElementById('welcome');
const frame              = document.getElementById('lesson-frame');
const resetButton        = document.getElementById('reset-progress');

let activeLessonId = null;

// ── render lesson nav ────────────────────────────────────────────────────────
function renderLessonNav() {
  lessonNav.innerHTML = '';
  mod.lessons.forEach(lesson => {
    const p = computeLessonProgress(lesson);
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = `nav-btn ${lesson.id === activeLessonId ? 'active' : ''}`;
    const progressLabel = (lesson.progress?.type || 'untracked') === 'checklist'
      ? `${p.done}/${p.total} · ${p.pct}%`
      : t('lesson.referenceLabel', 'Reference');
    btn.innerHTML = `
      <strong>${lesson.title}</strong>
      <small>${lesson.subtitle}</small>
      <small>${progressLabel}</small>
    `;
    btn.addEventListener('click', () => openLesson(lesson.id));
    lessonNav.appendChild(btn);
  });
}

// ── progress bar ─────────────────────────────────────────────────────────────
function renderProgressBar() {
  const pct = computeModuleProgress();
  moduleProgress.textContent      = `${pct}%`;
  moduleProgressFill.style.width  = `${pct}%`;
}

// ── open lesson ───────────────────────────────────────────────────────────────
function openLesson(lessonId) {
  const lesson = mod.lessons.find(l => l.id === lessonId);
  if (!lesson) return;
  activeLessonId = lessonId;

  // Resolve path relative to the module.html location (lms/modules/)
  // Lesson routes in the registry are relative to the project root,
  // so we need to prefix with ../../ to get back there.
  frame.src = `../../${lesson.route}`;
  frame.classList.add('visible');
  welcome.classList.add('hidden');
  renderLessonNav();
}

// ── reset progress ────────────────────────────────────────────────────────────
function resetAllProgress() {
  mod.lessons.forEach(lesson => {
    const cfg = lesson.progress;
    if (cfg?.type === 'checklist' && cfg.storageKey) {
      localStorage.removeItem(cfg.storageKey);
    }
  });
  renderLessonNav();
  renderProgressBar();
  if (frame.src) {
    const src = frame.src;
    frame.src = '';
    setTimeout(() => { frame.src = src; }, IFRAME_RELOAD_DELAY);
  }
}

// ── event wiring ─────────────────────────────────────────────────────────────
frame.addEventListener('load', () =>
  setTimeout(() => { renderProgressBar(); renderLessonNav(); }, PROGRESS_UPDATE_DELAY)
);
resetButton.addEventListener('click', resetAllProgress);
setInterval(() => { renderProgressBar(); renderLessonNav(); }, PROGRESS_POLL_INTERVAL);

// ── cross-iframe lesson navigation ────────────────────────────────────────────
// Lesson pages (e.g. db-masterplan-v2.html) that contain links to sibling
// lesson files post a message here instead of navigating the iframe directly.
// This keeps the shell chrome (sidebar, progress bar, theme) intact.
//
// Message shape: { type: 'lms:openLesson', route: 'lms/modules/.../file.html' }
//
// Strategy:
//   1. Try to find a registered lesson with that route and open it normally
//      (sidebar highlights, progress tracked).
//   2. If the route isn't in the registry (e.g. deep-dive files that aren't
//      listed as lessons), load it directly into the iframe so the user still
//      sees the content — just without a sidebar entry.
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'lms:openLesson') return;
  const route = e.data.route;
  if (!route || typeof route !== 'string') return;

  const registered = mod.lessons.find(l => l.route === route);
  if (registered) {
    // Registered lesson: use the normal path so the sidebar highlights correctly.
    openLesson(registered.id);
  } else {
    // Unregistered file (deep-dive, reference doc, etc.): load into iframe
    // directly. The sidebar stays as-is; progress bar is unaffected.
    activeLessonId = null;          // deselect current sidebar item
    frame.src = `../../${route}`;
    frame.classList.add('visible');
    welcome.classList.add('hidden');
    renderLessonNav();              // clears the active highlight
  }
});

// ── initial render ────────────────────────────────────────────────────────────
renderLessonNav();
renderProgressBar();
applyTranslations();