// lms/core/landing.js
// Drives index.html — renders the fields grid and navigates to lms/fields/field.html?id=<fieldId>

import { LMS_CONFIG } from './registry.js';
import { loadLanguage, applyTranslations, t } from './i18n.js';

// ── i18n startup ────────────────────────────────────────────────────────────
const savedLang = localStorage.getItem('lms_lang') || 'en';
await loadLanguage(savedLang);

// ── helpers ─────────────────────────────────────────────────────────────────
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

function fieldProgress(field) {
  const modules = field.moduleIds
    .map(id => LMS_CONFIG.modules.find(m => m.id === id))
    .filter(Boolean);
  const totals = modules.reduce((acc, mod) => {
    const p = computeModuleProgress(mod);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
  return {
    modules,
    pct: totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0,
  };
}

// ── render ───────────────────────────────────────────────────────────────────
const grid = document.getElementById('fields-grid');

(LMS_CONFIG.fields || []).forEach(field => {
  const { modules, pct } = fieldProgress(field);
  const isLocked = modules.length === 0;

  const card = document.createElement('a');
  card.className = `field-card${isLocked ? ' locked' : ''}`;
  card.href = isLocked ? '#' : `lms/fields/field.html?id=${field.id}`;
  card.style.setProperty('--field-accent', field.theme?.accent     ?? 'var(--accent)');
  card.style.setProperty('--field-soft',   field.theme?.accentSoft ?? 'var(--accent-soft)');

  card.innerHTML = `
    <div class="field-card-icon">${field.icon ?? '📚'}</div>
    <div class="field-card-body">
      <strong class="field-card-title">${field.title}</strong>
      <p class="field-card-sub">${field.subtitle}</p>
      <div class="field-card-meta">
        <span>${modules.length} ${t('field.modules', 'modules')}</span>
        <span class="field-card-pct">${pct}% ${t('field.complete', 'complete')}</span>
      </div>
      <div class="field-card-bar">
        <div class="field-card-fill" style="width:${pct}%"></div>
      </div>
    </div>
    ${isLocked ? `<div class="field-locked-badge" title="${t('field.locked', 'No access')}">🔒</div>` : ''}
  `;

  if (isLocked) card.addEventListener('click', e => e.preventDefault());
  grid.appendChild(card);
});

applyTranslations();
