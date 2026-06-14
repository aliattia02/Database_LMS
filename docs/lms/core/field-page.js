// lms/core/field-page.js
// Drives lms/fields/field.html — reads ?id=<fieldId>, renders module cards,
// each linking to lms/modules/module.html?id=<moduleId>&from=<fieldId>

import { LMS_CONFIG } from './registry.js';
import { loadLanguage, applyTranslations, t } from './i18n.js';

// ── i18n startup ─────────────────────────────────────────────────────────────
const savedLang = localStorage.getItem('lms_lang') || 'en';
await loadLanguage(savedLang);

// Reflect saved lang on switcher buttons
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.classList.toggle('active', btn.dataset.lang === savedLang);
});

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    await loadLanguage(btn.dataset.lang);
    localStorage.setItem('lms_lang', btn.dataset.lang);
    document.querySelectorAll('.lang-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === btn.dataset.lang));
    applyTranslations();
    renderModuleCards(); // re-render dynamic text
  });
});

// ── resolve field from query string ─────────────────────────────────────────
const params  = new URLSearchParams(location.search);
const fieldId = params.get('id');
const field   = LMS_CONFIG.fields?.find(f => f.id === fieldId);

if (!field) {
  document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">Field not found. <a href="../../index.html">Back to fields</a></p>';
  throw new Error(`Unknown field id: ${fieldId}`);
}

// Apply field theme
document.documentElement.style.setProperty('--accent',      field.theme?.accent     ?? '#2563eb');
document.documentElement.style.setProperty('--accent-soft', field.theme?.accentSoft ?? '#dbeafe');

// Set page title and header
document.title = `${field.title} — LMS Platform`;
document.getElementById('field-icon').textContent     = field.icon ?? '📚';
document.getElementById('field-title').textContent    = field.title;
document.getElementById('field-subtitle').textContent = field.subtitle;

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

function computeModuleProgress(mod) {
  const trackable = mod.lessons.filter(l => (l.progress?.type || 'untracked') === 'checklist');
  const totals = trackable.reduce((acc, lesson) => {
    const p = computeLessonProgress(lesson);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
  return { ...totals, pct: totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0 };
}

// ── render module cards ───────────────────────────────────────────────────────
const grid = document.getElementById('modules-grid');

function renderModuleCards() {
  grid.innerHTML = '';

  const fieldModules = field.moduleIds
    .map(id => LMS_CONFIG.modules.find(m => m.id === id))
    .filter(Boolean);

  fieldModules.forEach(mod => {
    const p = computeModuleProgress(mod);
    const lessonCount = mod.lessons.length;

    const card = document.createElement('a');
    card.className = 'field-card';
    card.href = `../modules/module.html?id=${mod.id}&from=${fieldId}`;
    card.style.setProperty('--field-accent', mod.theme?.accent     ?? 'var(--accent)');
    card.style.setProperty('--field-soft',   mod.theme?.accentSoft ?? 'var(--accent-soft)');

    card.innerHTML = `
      <div class="field-card-body">
        <strong class="field-card-title">${mod.title}</strong>
        <p class="field-card-sub">${mod.subtitle}</p>
        <div class="field-card-meta">
          <span>${lessonCount} ${t('module.lessons', 'lessons')}</span>
          <span class="field-card-pct">${p.pct}% ${t('field.complete', 'complete')}</span>
        </div>
        <div class="field-card-bar">
          <div class="field-card-fill" style="width:${p.pct}%"></div>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

renderModuleCards();
applyTranslations();
