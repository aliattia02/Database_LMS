// lms/core/progress.js
// Shared progress-computation utilities.
//
// Extracted from app.js (Issue 2) to eliminate the identical copies that
// previously lived in both app.js and landing.js. Import from here instead
// of re-declaring these functions in any new file.
//
// Nothing in this module touches the DOM, Firebase, or auth — it is a pure
// data layer that reads localStorage and returns plain objects. It is safe to
// import from any page (landing, field shell, lesson iframes, tests).

import { LMS_CONFIG } from './registry.js';

// ── LOW-LEVEL STORAGE ────────────────────────────────────────────────────────

/**
 * Safely parse a JSON object from localStorage.
 * Returns {} on missing key, null, or invalid JSON — never throws.
 * @param {string} key
 * @returns {Record<string, unknown>}
 */
export function safeReadStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

// ── STORAGE KEY ENUMERATION ──────────────────────────────────────────────────

/**
 * Returns the deduplicated set of all checklist storageKeys declared across
 * every module in the registry.
 *
 * Progress is global (not field-scoped) — a module like `python` that appears
 * in both `backend` and `frontend` fields shares one progress record. This
 * function therefore scans ALL modules, not just the active field's subset.
 *
 * Used by:
 *   • app.js  → syncProgressToFirestore, migrateLocalStorageToFirestore,
 *               resetAllProgress
 *   • db.js   → clearAllProgress (receives the array as an argument)
 *
 * @returns {string[]}
 */
export function getAllStorageKeys() {
  const keys = new Set();
  for (const mod of LMS_CONFIG.modules) {
    for (const lesson of mod.lessons) {
      const cfg = lesson.progress;
      if (cfg?.type === 'checklist' && cfg.storageKey) {
        keys.add(cfg.storageKey);
        // Also include the _acc suffix key written by toggleAcc() in lesson-ui.js.
        // Accordion-based lessons (phase-02 through phase-07) persist opens there;
        // without this entry the key is never synced to Firestore and is invisible
        // to migrateLocalStorageToFirestore / resetAllProgress on other devices.
        keys.add(cfg.storageKey + '_acc');
      }
    }
  }
  return Array.from(keys);
}

// ── PROGRESS COMPUTATION ─────────────────────────────────────────────────────

/**
 * Computes progress for a single lesson from localStorage.
 *
 * For `untracked` lessons (overviews, masterplans) the function returns
 * pct = 100 so they don't drag down module-level percentages — they are
 * intentionally excluded from `trackable` in computeModuleProgress below.
 *
 * @param {object} lesson  — lesson object from LMS_CONFIG
 * @returns {{ done: number, total: number, pct: number }}
 */
export function computeLessonProgress(lesson) {
  const cfg = lesson.progress || { type: 'untracked' };
  if (cfg.type !== 'checklist') {
    return { done: 0, total: cfg.total || 0, pct: 100 };
  }
  const ignore = new Set(cfg.ignoreKeys || []);

  // Count q-card marks from the base storageKey ({ q_0: true, … })
  const raw  = safeReadStorage(cfg.storageKey);
  const qDone = Object.entries(raw).filter(([k, v]) => !ignore.has(k) && !!v).length;

  // Count accordion marks from the _acc suffix key ({ acc_0: true, … })
  // Written by lesson-ui.js _lmsSaveAccProgress() for .acc-item lessons.
  const rawAcc  = safeReadStorage(cfg.storageKey + '_acc');
  const accDone = Object.values(rawAcc).filter(Boolean).length;

  const done    = qDone + accDone;
  const total   = cfg.total || 0;
  const clamped = Math.min(done, total);
  return {
    done:  clamped,
    total,
    pct:   total > 0 ? Math.round((clamped / total) * 100) : 0
  };
}

/**
 * Computes the aggregate progress for a module by summing its checklist
 * lessons. Untracked lessons (type !== 'checklist') are excluded.
 *
 * @param {object} mod  — module object from LMS_CONFIG
 * @returns {{ done: number, total: number, pct: number }}
 */
export function computeModuleProgress(mod) {
  const trackable = mod.lessons.filter(
    l => (l.progress?.type || 'untracked') === 'checklist'
  );
  const totals = trackable.reduce((acc, lesson) => {
    const p = computeLessonProgress(lesson);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
  return {
    ...totals,
    pct: totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0
  };
}

/**
 * Computes the aggregate progress across a specific set of module objects.
 * Pass the result of getActiveFieldModules() (app.js) or any filtered list.
 *
 * @param {object[]} modules  — array of module objects from LMS_CONFIG
 * @returns {{ done: number, total: number, pct: number }}
 */
export function computeGroupProgress(modules) {
  const totals = modules.reduce((acc, mod) => {
    const p = computeModuleProgress(mod);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
  return {
    ...totals,
    pct: totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0
  };
}