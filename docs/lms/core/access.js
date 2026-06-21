// lms/core/access.js
// Determines which modules (and fields) a given user is allowed to see.
//
// Visibility rules (Phase 6 + Phase 7):
//   Resolution order, highest precedence first:
//     1. Admins (userProfile.role === 'admin') always see every module.
//     2. An explicit per-user override (users/{uid}/access/modules) wins
//        when present, regardless of tier.
//     3. The user's tier default (tiers/{tierId}, managed from the admin
//        Categories tab) wins when the tier has been configured.
//     4. Otherwise, fall back to the platform-wide accessControl.mode:
//          'open'       → modules are visible by default
//          'controlled' → modules are hidden by default
//
//   Anonymous users (uid is null/undefined) resolve via the 'anonymous'
//   tier instead of a per-user doc, then fall back to the platform default
//   exactly as above if that tier has never been configured.
//
//   A tier that has never been saved from the Categories tab (tierAccessMap
//   === null) behaves as "not configured" — same as an unconfigured
//   per-user doc — so existing deployments are unaffected until an admin
//   actually visits the Categories tab and saves a tier.

import { LMS_CONFIG } from './registry.js';
import { getModuleAccess, getTierAccess } from './db.js';

// ── MODULE-LEVEL VISIBILITY ─────────────────────────────────────────────────

/**
 * Returns the list of module objects visible to the given user.
 *
 * @param {string|null|undefined} uid
 * @param {{ role?: string, tier?: string } | null} [profile] — the user's
 *   Firestore profile document, if already fetched by the caller (app.js
 *   fetches it once via getUserProfile and reuses it here to avoid a
 *   redundant read). Pass null/omit for anonymous users.
 * @returns {Promise<object[]>} array of module objects from LMS_CONFIG.modules
 */
export async function getVisibleModules(uid, profile = null) {
  const allModules = LMS_CONFIG.modules;
  const mode = LMS_CONFIG.accessControl?.mode ?? 'open';

  // Admins always see everything — short-circuits before any tier/override
  // lookups, so admin Firestore reads stay cheap.
  if (isAdmin(profile)) return allModules;

  // Anonymous (signed-out) users have no per-user override — resolve
  // purely from the 'anonymous' tier, then the platform default.
  if (!uid) {
    const tierAccessMap = await getTierAccess('anonymous');
    return filterByAccess(allModules, null, tierAccessMap, mode);
  }

  const tierId = profile?.tier || 'free';
  const [accessMap, tierAccessMap] = await Promise.all([
    getModuleAccess(uid),
    getTierAccess(tierId)
  ]);

  return filterByAccess(allModules, accessMap, tierAccessMap, mode);
}

/**
 * Layered visibility filter shared by signed-in and anonymous resolution.
 * @param {object[]} allModules
 * @param {Object<string, boolean>|null} accessMap — per-user override, or null
 * @param {Object<string, boolean>|null} tierAccessMap — tier default, or null
 * @param {'open'|'controlled'} mode — platform-wide fallback
 */
function filterByAccess(allModules, accessMap, tierAccessMap, mode) {
  return allModules.filter(mod => {
    if (accessMap && accessMap[mod.id] !== undefined) {
      return accessMap[mod.id] === true;
    }
    if (tierAccessMap && tierAccessMap[mod.id] !== undefined) {
      return tierAccessMap[mod.id] === true;
    }
    return mode === 'open';
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
 * @param {object|null} [profile]
 * @returns {Promise<Array<object & { accessibleModuleCount: number, isLocked: boolean }>>}
 */
export async function getAccessibleFields(uid, profile = null) {
  const visible    = await getVisibleModules(uid, profile);
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
 * @param {object|null} [profile]
 * @returns {Promise<object[]>} array of module objects, possibly empty
 */
export async function getVisibleModulesForField(uid, fieldId, profile = null) {
  const field = LMS_CONFIG.fields?.find(f => f.id === fieldId);
  if (!field) return [];
  const visible    = await getVisibleModules(uid, profile);
  const visibleIds = new Set(visible.map(m => m.id));
  return field.moduleIds
    .map(id => LMS_CONFIG.modules.find(m => m.id === id))
    .filter(mod => mod && visibleIds.has(mod.id));
}