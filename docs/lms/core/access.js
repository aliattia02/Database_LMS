// lms/core/access.js
// Determines which modules (and fields) a given user is allowed to see.
//
// Visibility rules (Phase 6):
//   - accessControl.mode === 'open'       → modules are visible by default;
//                                            an explicit `false` entry hides one.
//   - accessControl.mode === 'controlled' → modules are hidden by default;
//                                            an explicit `true` entry shows one.
//   - Anonymous users (uid is null/undefined) always fall back to the
//     platform default for `mode` — there is no per-user access document.
//   - A user with NO access document (accessMap === null) also falls back
//     to the platform default — this keeps existing users unaffected when
//     the feature ships.

import { LMS_CONFIG } from './registry.js';
import { getModuleAccess } from './db.js';

// ── MODULE-LEVEL VISIBILITY ─────────────────────────────────────────────────

/**
 * Returns the list of module objects visible to the given user.
 * For anonymous users (uid is null/undefined), falls back to the platform's
 * accessControl.mode default.
 *
 * @param {string|null|undefined} uid
 * @returns {Promise<object[]>} array of module objects from LMS_CONFIG.modules
 */
export async function getVisibleModules(uid) {
  const allModules = LMS_CONFIG.modules;
  const mode = LMS_CONFIG.accessControl?.mode ?? 'open';

  if (!uid) {
    return mode === 'controlled' ? [] : allModules;
  }

  const accessMap = await getModuleAccess(uid);

  // No access document yet — fall back to platform default
  if (accessMap === null) {
    return mode === 'controlled' ? [] : allModules;
  }

  return allModules.filter(mod => {
    const entry = accessMap[mod.id];
    if (entry === undefined) return mode === 'open';
    return entry === true;
  });
}

/**
 * Returns true if the given user profile belongs to an admin.
 * @param {{ role?: string } | null | undefined} userProfile
 * @returns {boolean}
 */
export function isAdmin(userProfile) {
  return userProfile?.role === 'admin';
}

// ── FIELD-LEVEL VISIBILITY (Phase 0) ────────────────────────────────────────

/**
 * Returns all fields from LMS_CONFIG, each annotated with how many of their
 * modules the given user can access. A field is locked when
 * accessibleModuleCount === 0.
 *
 * @param {string|null|undefined} uid
 * @returns {Promise<Array<object & { accessibleModuleCount: number, isLocked: boolean }>>}
 */
export async function getAccessibleFields(uid) {
  const visible    = await getVisibleModules(uid);
  const visibleIds = new Set(visible.map(m => m.id));

  return (LMS_CONFIG.fields ?? []).map(field => {
    const accessibleModuleCount =
      field.moduleIds.filter(id => visibleIds.has(id)).length;
    return { ...field, accessibleModuleCount, isLocked: accessibleModuleCount === 0 };
  });
}

/**
 * Returns only the modules the given user can access within a specific
 * field, preserving the field's display order.
 *
 * @param {string|null|undefined} uid
 * @param {string} fieldId
 * @returns {Promise<object[]>} array of module objects, possibly empty
 */
export async function getVisibleModulesForField(uid, fieldId) {
  const field = LMS_CONFIG.fields?.find(f => f.id === fieldId);
  if (!field) return [];
  const visible    = await getVisibleModules(uid);
  const visibleIds = new Set(visible.map(m => m.id));
  return field.moduleIds
    .map(id => LMS_CONFIG.modules.find(m => m.id === id))
    .filter(mod => mod && visibleIds.has(mod.id));
}
