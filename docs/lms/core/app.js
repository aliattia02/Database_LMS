import { LMS_CONFIG } from './registry.js';

const moduleNav = document.getElementById('module-nav');
const lessonNav = document.getElementById('lesson-nav');
const moduleProgress = document.getElementById('module-progress');
const moduleProgressFill = document.getElementById('module-progress-fill');
const globalProgress = document.getElementById('global-progress');
const globalProgressFill = document.getElementById('global-progress-fill');
const moduleTitle = document.getElementById('active-module-title');
const moduleSubtitle = document.getElementById('active-module-subtitle');
const welcome = document.getElementById('welcome');
const frame = document.getElementById('lesson-frame');
const resetButton = document.getElementById('reset-progress');

let activeModuleId = LMS_CONFIG.modules[0]?.id ?? null;
let activeLessonId = null;

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
  const raw = safeReadStorage(cfg.storageKey);
  const ignore = new Set(cfg.ignoreKeys || []);
  const done = Object.entries(raw).filter(([k, v]) => !ignore.has(k) && !!v).length;
  const total = cfg.total || 0;
  const clamped = Math.min(done, total);
  const pct = total > 0 ? Math.round((clamped / total) * 100) : 0;
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
  const totals = LMS_CONFIG.modules.reduce((acc, mod) => {
    const p = computeModuleProgress(mod);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
  const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;
  return { ...totals, pct };
}

function updateTheme(mod) {
  if (!mod?.theme) return;
  document.documentElement.style.setProperty('--accent', mod.theme.accent);
  document.documentElement.style.setProperty('--accent-soft', mod.theme.accentSoft);
}

function renderModuleNav() {
  moduleNav.innerHTML = '';
  LMS_CONFIG.modules.forEach(mod => {
    const p = computeModuleProgress(mod);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nav-btn ${mod.id === activeModuleId ? 'active' : ''}`;
    btn.innerHTML = `<strong>${mod.title}</strong><small>${mod.subtitle}</small><small>${p.pct}% complete</small>`;
    btn.addEventListener('click', () => {
      activeModuleId = mod.id;
      activeLessonId = null;
      render();
    });
    moduleNav.appendChild(btn);
  });
}

function openLesson(lessonId) {
  const mod = LMS_CONFIG.modules.find(m => m.id === activeModuleId);
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
  const mod = LMS_CONFIG.modules.find(m => m.id === activeModuleId);
  if (!mod) return;
  mod.lessons.forEach(lesson => {
    const p = computeLessonProgress(lesson);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nav-btn ${lesson.id === activeLessonId ? 'active' : ''}`;
    const progressLabel = (lesson.progress?.type || 'untracked') === 'checklist'
      ? `${p.done}/${p.total} · ${p.pct}%`
      : 'Reference';
    btn.innerHTML = `<strong>${lesson.title}</strong><small>${lesson.subtitle}</small><small>${progressLabel}</small>`;
    btn.addEventListener('click', () => openLesson(lesson.id));
    lessonNav.appendChild(btn);
  });
}

function renderProgressBars() {
  const mod = LMS_CONFIG.modules.find(m => m.id === activeModuleId);
  const mp = mod ? computeModuleProgress(mod) : { pct: 0 };
  const gp = computeGlobalProgress();
  moduleProgress.textContent = `${mp.pct}%`;
  moduleProgressFill.style.width = `${mp.pct}%`;
  globalProgress.textContent = `${gp.pct}%`;
  globalProgressFill.style.width = `${gp.pct}%`;
}

function renderHeader() {
  const mod = LMS_CONFIG.modules.find(m => m.id === activeModuleId);
  if (!mod) return;
  moduleTitle.textContent = mod.title;
  moduleSubtitle.textContent = mod.subtitle;
}

function resetAllProgress() {
  const keys = new Set();
  LMS_CONFIG.modules.forEach(mod => {
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
    setTimeout(() => { frame.src = src; }, 50);
  }
}

function render() {
  renderModuleNav();
  renderHeader();
  renderLessonNav();
  renderProgressBars();
  const mod = LMS_CONFIG.modules.find(m => m.id === activeModuleId);
  updateTheme(mod);
}

frame.addEventListener('load', () => setTimeout(renderProgressBars, 150));
resetButton.addEventListener('click', resetAllProgress);
setInterval(renderProgressBars, 3000);

render();
