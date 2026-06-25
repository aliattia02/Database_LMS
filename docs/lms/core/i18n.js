// lms/core/i18n.js

const SUPPORTED_LANGS = ['en', 'ar', 'de'];
const RTL_LANGS = ['ar'];

export async function loadLanguage(lang) {
  if (!lang || lang === 'en' || !SUPPORTED_LANGS.includes(lang)) {
    window.__LMS_TRANSLATIONS__ = {};
    applyDirection('en');
    return;
  }
  try {
    const mod = await import(`../i18n/${lang}.js`);
    window.__LMS_TRANSLATIONS__ = mod.translations || {};
  } catch {
    window.__LMS_TRANSLATIONS__ = {};
  }
  applyDirection(lang);
}

function applyDirection(lang) {
  document.documentElement.setAttribute('dir', RTL_LANGS.includes(lang) ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
}

export function t(key, fallback = '') {
  return window.__LMS_TRANSLATIONS__?.[key] ?? fallback;
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translated = window.__LMS_TRANSLATIONS__?.[key];
    if (translated) el.textContent = translated;
  });
}