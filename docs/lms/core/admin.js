// lms/core/admin.js
// Runs only in lms/admin/index.html. Never imported by app.js.
//
// SDK version pin: 10.12.0 — keep in sync with auth.js / db.js.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, updateDoc,
         addDoc, deleteDoc, where, query, orderBy, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { FIREBASE_CONFIG } from './firebase-config.js';
import { LMS_CONFIG } from './registry.js';

// ── Initialise Firebase ────────────────────────────────────────────────────
const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── CONSTANTS ────────────────────────────────────────────────────────────
// Phase 4: MODULE_IDS / MODULE_TITLES start from static config then get
// extended with dynamic course IDs by syncCourseRegistry() once loadCourses()
// resolves. Keeping them `let` (not `const`) allows that post-boot merge.
let MODULE_IDS    = LMS_CONFIG.modules.map(m => m.id);
let MODULE_TITLES = Object.fromEntries(LMS_CONFIG.modules.map(m => [m.id, m.title]));
const ACCESS_MODE   = LMS_CONFIG.accessControl?.mode ?? 'open';

// Module → field titles it belongs to. Length > 1 means the module is shared
// across multiple fields (e.g. "python" in both Backend and Frontend) — such
// modules get a chip rendered once per field group they appear in, so the UI
// marks them explicitly (see renderChip / renderTierChip) and the toggle
// handlers keep every copy in sync (see toggleTierChip / handleChipToggle).
const MODULE_FIELD_TITLES = {};
(LMS_CONFIG.fields ?? []).forEach(f => {
  f.moduleIds.forEach(mid => {
    (MODULE_FIELD_TITLES[mid] ??= []).push(f.title);
  });
});

// Phase 4 — Course IDs / titles / field assignments.
// Populated by syncCourseRegistry() after loadCourses() completes.
// These are kept separate from the static MODULE_* constants so that:
//   a) renderModuleTogglesForUser / renderTierCard can identify which chips
//      are courses (and group them under a "📚" header instead of a field group)
//   b) grant/revoke-field handlers can extend the field's module list with
//      course IDs that share the same fieldId
// COURSE_IDS IS also merged into MODULE_IDS after sync, so grant-all /
// revoke-all automatically include courses without any extra code.
let COURSE_IDS    = [];   // course.id values for ALL courses (draft + published)
let COURSE_TITLES = {};   // { [courseId]: course.title }
let COURSE_FIELD  = {};   // { [courseId]: course.fieldId | null }

// Tier definitions — order = display order. `locked` tiers are shown
// read-only (admins always get full access, no Firestore config needed).
const TIER_DEFS = [
  { id: 'anonymous', name: 'Non-registered', icon: '👤', desc: 'Visitors without an account',         locked: false },
  { id: 'free',      name: 'Free User',       icon: '🆓', desc: 'Registered users — no subscription', locked: false },
  { id: 'pro',       name: 'Paid User',       icon: '⭐', desc: 'Active subscribers',                locked: false },
  { id: 'custom',    name: 'Custom User',     icon: '🎓', desc: 'Hand-picked course access for specific users (e.g. corporate partners, cohorts)', locked: false },
  { id: 'admin',     name: 'Admin',           icon: '🛡️', desc: 'Full access — not configurable',    locked: true  },
];

// ── STATE ────────────────────────────────────────────────────────────────
let currentAdmin    = null;
let allUsers        = [];
let accessCache     = {};   // { [uid]: { [moduleId]: true|false|undefined } | null }
let profileCache    = {};   // { [uid]: { role, tier, ... } }
let tiersCache      = {};   // { [tierId]: { [moduleId]: boolean } }
let tiersLoadError  = null; // set when loadTiers() fails (e.g. rules not deployed yet)

// ── REQUESTS TAB STATE ────────────────────────────────────────────────────
let allRequests     = [];          // all personalizedLessonRequests docs, most recent first
let requestsFilter  = 'pending';   // 'all' | 'pending' | 'in_review' | 'fulfilled' | 'declined'
let collapsedRequestGroups = new Set(); // uids whose per-user group is collapsed (persists across re-renders)

// ── COURSES TAB STATE ────────────────────────────────────────────────────
let allCourses      = [];   // [{id, title, subtitle, icon, fieldId, order, status, ...}]
let courseLessons   = {};   // { [courseId]: [{id, title, subtitle, order, html, ...}] }
let editingCourseId = null; // null = list view; 'new' = create form; '<id>' = edit existing
let editingLessonId = null; // null | 'new' | '<lessonId>'
// Phase 5: which status bucket the course list shows.
// 'active'   = draft + published (the normal working set)
// 'archived' = soft-deleted courses awaiting restore or permanent removal
let coursesViewFilter = 'active';

// ── BOOT ─────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (!user) { redirectToLogin(); return; }

  const profileSnap = await getDoc(doc(db, 'users', user.uid));
  if (!profileSnap.exists() || profileSnap.data().role !== 'admin') {
    document.body.innerHTML = '<p style="padding:40px;color:#ef4444">Access denied. Admin only.</p>';
    return;
  }

  currentAdmin = user;

  // Load users, tiers, personalized requests, and courses in parallel.
  // syncCourseRegistry() runs after loadCourses() so MODULE_IDS / MODULE_TITLES
  // are extended before any tab renders chip toggles.
  await Promise.all([loadUsers(), loadTiers(), loadRequests(), loadCourses()]);
  syncCourseRegistry();

  renderTable(allUsers);
  renderAccessModeBanner();
  wireSearch();
  wireTabs();

  // Delegated click handler on tbody — attached ONCE to avoid duplicate handlers
  // on each renderTable() call (see Bug #6 in original admin.js).
  document.getElementById('user-rows').addEventListener('click', handleTableClick);
  // Delegated change handler for tier <select> elements
  document.getElementById('user-rows').addEventListener('change', handleTableChange);
});

// ── DATA ─────────────────────────────────────────────────────────────────

async function loadUsers() {
  const snap = await getDocs(collection(db, 'userIndex'));
  allUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));

  // Load access maps AND user profiles in parallel for all users
  await Promise.all(allUsers.map(async (u) => {
    const [aSnap, pSnap] = await Promise.all([
      getDoc(doc(db, 'users', u.uid, 'access', 'modules')),
      getDoc(doc(db, 'users', u.uid))
    ]);
    accessCache[u.uid]  = aSnap.exists() ? aSnap.data() : null;
    profileCache[u.uid] = pSnap.exists() ? pSnap.data() : {};
  }));
}

async function loadTiers() {
  try {
    const snap = await getDocs(collection(db, 'tiers'));
    tiersCache = {};
    snap.docs.forEach(d => { tiersCache[d.id] = d.data(); });
    tiersLoadError = null;
  } catch (err) {
    // Don't let this take down the Users tab — most likely cause is the
    // 'tiers' collection rule not being deployed yet. Show defaults and
    // surface the error inside the Categories tab itself instead.
    console.error('Failed to load tiers (check Firestore rules for the tiers collection):', err);
    tiersCache = {};
    tiersLoadError = err?.message ?? String(err);
  }
}

async function loadRequests() {
  try {
    const q    = query(
      collection(db, 'personalizedLessonRequests'),
      orderBy('requestedAt', 'desc')
    );
    const snap = await getDocs(q);
    allRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Don't let a missing rules deployment take down the other tabs.
    console.error('Failed to load personalized lesson requests:', err);
    allRequests = [];
  }
}

async function loadCourses() {
  try {
    const q    = query(collection(db, 'courses'), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    allCourses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Failed to load courses:', err);
    allCourses = [];
  }
}

/**
 * Phase 4 — Extends MODULE_IDS, MODULE_TITLES, and MODULE_FIELD_TITLES with
 * every course from allCourses so that:
 *
 *  • Per-user access chips (Users tab) include course toggle chips.
 *  • Tier/category chips (Categories tab) include course toggle chips.
 *  • grant-all / revoke-all bulk actions cover courses automatically.
 *  • grant-field / revoke-field include courses assigned to that field.
 *
 * Must be called after loadCourses() resolves. Re-calling it is safe —
 * it rebuilds from allCourses from scratch each time (idempotent).
 */
function syncCourseRegistry() {
  // Reset course-specific lookups so repeated calls stay clean.
  COURSE_IDS    = [];
  COURSE_TITLES = {};
  COURSE_FIELD  = {};

  for (const course of allCourses) {
    COURSE_IDS.push(course.id);
    COURSE_TITLES[course.id] = course.title;
    COURSE_FIELD[course.id]  = course.fieldId ?? null;

    // Also populate MODULE_FIELD_TITLES so that isShared / title-tooltip logic
    // in renderChip / renderTierChip works for courses just like static modules.
    // A course belongs to at most one field, so isShared will always be false —
    // but the entry is still needed so MODULE_FIELD_TITLES[courseId] is defined.
    const fieldObj = course.fieldId
      ? (LMS_CONFIG.fields ?? []).find(f => f.id === course.fieldId)
      : null;
    if (fieldObj) {
      MODULE_FIELD_TITLES[course.id] = [fieldObj.title];
    } else {
      MODULE_FIELD_TITLES[course.id] = [];
    }
  }

  // Merge course IDs + titles into the unified MODULE_* registries so existing
  // code paths that iterate MODULE_IDS (grant-all, revoke-all, handleSaveTier)
  // pick up courses without modification.
  MODULE_IDS    = [...LMS_CONFIG.modules.map(m => m.id), ...COURSE_IDS];
  MODULE_TITLES = {
    ...Object.fromEntries(LMS_CONFIG.modules.map(m => [m.id, m.title])),
    ...COURSE_TITLES
  };
}

async function loadCourseLessons(courseId) {
  try {
    const q    = query(
      collection(db, 'courses', courseId, 'lessons'),
      orderBy('order', 'asc')
    );
    const snap = await getDocs(q);
    courseLessons[courseId] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error(`Failed to load lessons for course ${courseId}:`, err);
    courseLessons[courseId] = [];
  }
}

// ── RENDER — USERS TAB ───────────────────────────────────────────────────

function renderModuleTogglesForUser(uid, accessMap) {
  const fields = LMS_CONFIG.fields ?? [];
  const fieldedModuleIds = new Set(fields.flatMap(f => f.moduleIds));
  // Courses that have a fieldId matching one of LMS_CONFIG.fields are shown
  // inline inside that field group. All other courses (fieldId null, or pointing
  // to a field that no longer exists in config) land in "📚 Other courses".
  const validFieldIds   = new Set(fields.map(f => f.id));
  const fieldedCourseIds = new Set(
    COURSE_IDS.filter(id => COURSE_FIELD[id] && validFieldIds.has(COURSE_FIELD[id]))
  );
  let html = '';

  fields.forEach(field => {
    // Courses assigned to this field — sorted by their position in allCourses
    const fieldCourses = allCourses.filter(
      c => c.fieldId === field.id
    );
    html += `
      <div class="field-group" data-field="${field.id}">
        <div class="field-group-header">
          <span class="field-group-label">${field.icon ?? ''} ${field.title}</span>
          <button class="promote-btn" data-uid="${uid}" data-action="grant-field"
                  data-field="${field.id}">Grant field</button>
          <button class="promote-btn" data-uid="${uid}" data-action="revoke-field"
                  data-field="${field.id}">Revoke field</button>
        </div>
        <div class="module-toggle">
          ${field.moduleIds.map(mid => renderChip(uid, mid, accessMap)).join('')}
          ${fieldCourses.map(c => renderChip(uid, c.id, accessMap, true)).join('')}
        </div>
      </div>`;
  });

  const orphaned = LMS_CONFIG.modules.filter(m => !fieldedModuleIds.has(m.id));
  if (orphaned.length > 0) {
    html += `
      <div class="field-group">
        <div class="field-group-header">
          <span class="field-group-label">📦 Other modules</span>
        </div>
        <div class="module-toggle">
          ${orphaned.map(m => renderChip(uid, m.id, accessMap)).join('')}
        </div>
      </div>`;
  }

  // Courses with no (or unrecognised) fieldId
  const ungroupedCourses = allCourses.filter(c => !fieldedCourseIds.has(c.id));
  if (ungroupedCourses.length > 0) {
    html += `
      <div class="field-group">
        <div class="field-group-header">
          <span class="field-group-label">📚 Other courses</span>
        </div>
        <div class="module-toggle">
          ${ungroupedCourses.map(c => renderChip(uid, c.id, accessMap, true)).join('')}
        </div>
      </div>`;
  }
  return html;
}

function renderTable(users) {
  const tbody = document.getElementById('user-rows');
  tbody.innerHTML = '';

  users.forEach(user => {
    const accessMap = accessCache[user.uid];
    const profile   = profileCache[user.uid] ?? {};
    const role      = profile.role ?? 'user';
    const tier      = profile.tier ?? 'free';
    const tr        = document.createElement('tr');
    tr.dataset.uid  = user.uid;

    tr.innerHTML = `
      <td>
        <strong>${escHtml(user.displayName || '(no name)')}</strong>
      </td>
      <td>${escHtml(user.email)}</td>
      <td>
        <span class="role-label" id="role-${user.uid}">${role}</span>
        <button class="promote-btn" data-uid="${user.uid}" title="Toggle admin role">⬆ promote</button>
      </td>
      <td>
        <select class="tier-select" data-uid="${user.uid}">
          ${TIER_DEFS.map(t =>
            `<option value="${t.id}" ${tier === t.id ? 'selected' : ''}>${t.icon} ${t.name}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <div id="toggles-${user.uid}">
          ${renderModuleTogglesForUser(user.uid, accessMap)}
        </div>
      </td>
      <td>
        <button class="promote-btn" data-uid="${user.uid}" data-action="grant-all">Grant all</button>
        <button class="promote-btn" data-uid="${user.uid}" data-action="revoke-all">Revoke all</button>
        <button class="promote-btn" data-uid="${user.uid}" data-action="reset-access">Reset (default)</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderChip(uid, moduleId, accessMap, isCourse = false) {
  let state;
  if (accessMap === null || accessMap[moduleId] === undefined) {
    state = ACCESS_MODE === 'open' ? 'granted' : 'revoked';
  } else {
    state = accessMap[moduleId] ? 'granted' : 'revoked';
  }
  const isExplicit  = accessMap !== null && accessMap[moduleId] !== undefined;
  const fieldTitles = MODULE_FIELD_TITLES[moduleId] ?? [];
  const isShared     = fieldTitles.length > 1;

  const titleParts = [isExplicit ? 'Explicit override' : 'Default (' + ACCESS_MODE + ')'];
  if (isCourse) titleParts.unshift('Course');
  if (isShared) {
    titleParts.push(`Shared module — also appears under: ${fieldTitles.join(', ')}. Toggling it here (or via Grant/Revoke field) updates all of them together.`);
  }

  // Course chips get a small "📚" prefix in the label so they're visually
  // distinct from static module chips inside the same field group.
  const label = (isCourse ? '📚 ' : '') + MODULE_TITLES[moduleId];

  return `<button
    class="toggle-chip ${state}${isShared ? ' shared' : ''}${isCourse ? ' course-chip' : ''}"
    data-uid="${uid}"
    data-module="${moduleId}"
    data-state="${state}"
    title="${titleParts.join(' — ')}"
  >${label}${isExplicit ? '' : ' *'}${isShared ? ' 🔗' : ''}</button>`;
}

function renderAccessModeBanner() {
  document.getElementById('access-mode-banner').innerHTML = `
    <strong>Access mode:</strong> <code>${ACCESS_MODE}</code> &nbsp;
    ${ACCESS_MODE === 'open'
      ? '— All users see all modules by default. Revoke to restrict.'
      : '— Users see no modules by default. Grant to allow.'}
    &nbsp;<small style="color:var(--muted)">(Change via <code>LMS_CONFIG.accessControl.mode</code>)</small>
  `;
}

// ── RENDER — CATEGORIES TAB ───────────────────────────────────────────────

/**
 * Rebuilds the entire categories tab. Called lazily when the user first
 * clicks the tab, and again after any save to reflect the latest tiersCache.
 */
function renderCategoriesTab() {
  const el = document.getElementById('tab-categories');
  el.innerHTML = `
    <p class="categories-intro">
      Define default module access for each user category.
      Per-user overrides (Users tab) always take precedence over category settings.
      <br><strong>Non-registered</strong> applies to anonymous visitors.
    </p>
    ${tiersLoadError ? `
      <p style="font-size:13px;color:#ef4444;background:color-mix(in srgb, #ef4444 8%, transparent);
                 border:1px solid color-mix(in srgb, #ef4444 30%, transparent);border-radius:8px;
                 padding:10px 14px;margin-bottom:16px">
        ⚠ Couldn't load saved tier data: <code>${escHtml(tiersLoadError)}</code><br>
        This usually means the <code>tiers</code> collection rule hasn't been deployed in
        Firestore Security Rules yet. The cards below are showing blank defaults, not your
        real saved settings — fix the rules and reload before saving anything here.
      </p>` : ''}
    ${TIER_DEFS.map(t => renderTierCard(t)).join('')}
  `;

  // Wire tier chip toggles (local toggle — no Firestore write yet)
  el.querySelectorAll('.tier-chip').forEach(chip => {
    chip.addEventListener('click', () => toggleTierChip(chip));
  });
  // Wire per-tier bulk grant/revoke (also local-only — staged until Save)
  el.querySelectorAll('[data-tier-action]').forEach(btn => {
    btn.addEventListener('click', () => handleTierBulkToggle(btn.dataset.tier, btn.dataset.tierAction));
  });
  // Wire save buttons
  el.querySelectorAll('[data-save-tier]').forEach(btn => {
    btn.addEventListener('click', () => handleSaveTier(btn.dataset.saveTier));
  });
}

function renderTierCard(tierDef) {
  if (tierDef.locked) {
    return `
      <div class="tier-card">
        <div class="tier-header">
          <span class="tier-icon">${tierDef.icon}</span>
          <div>
            <strong>${tierDef.name}</strong>
            <span class="tier-desc">${tierDef.desc}</span>
          </div>
        </div>
        <p style="font-size:12px;color:var(--muted);margin:4px 0 0">
          Admins always have full access to all modules — not configurable here.
        </p>
      </div>`;
  }

  const access = tiersCache[tierDef.id] ?? {};
  const fields = LMS_CONFIG.fields ?? [];
  const fieldedModuleIds = new Set(fields.flatMap(f => f.moduleIds));
  const validFieldIds    = new Set(fields.map(f => f.id));
  const fieldedCourseIds = new Set(
    COURSE_IDS.filter(id => COURSE_FIELD[id] && validFieldIds.has(COURSE_FIELD[id]))
  );
  let togglesHtml = '';

  fields.forEach(field => {
    const fieldCourses = allCourses.filter(c => c.fieldId === field.id);
    togglesHtml += `
      <div class="tier-field-group">
        <div class="tier-field-label">${field.icon ?? ''} ${field.title}</div>
        <div class="module-toggle">
          ${field.moduleIds.map(mid => renderTierChip(tierDef.id, mid, access)).join('')}
          ${fieldCourses.map(c => renderTierChip(tierDef.id, c.id, access, true)).join('')}
        </div>
      </div>`;
  });

  const orphaned = LMS_CONFIG.modules.filter(m => !fieldedModuleIds.has(m.id));
  if (orphaned.length) {
    togglesHtml += `
      <div class="tier-field-group">
        <div class="tier-field-label">📦 Other modules</div>
        <div class="module-toggle">
          ${orphaned.map(m => renderTierChip(tierDef.id, m.id, access)).join('')}
        </div>
      </div>`;
  }

  const ungroupedCourses = allCourses.filter(c => !fieldedCourseIds.has(c.id));
  if (ungroupedCourses.length) {
    togglesHtml += `
      <div class="tier-field-group">
        <div class="tier-field-label">📚 Other courses</div>
        <div class="module-toggle">
          ${ungroupedCourses.map(c => renderTierChip(tierDef.id, c.id, access, true)).join('')}
        </div>
      </div>`;
  }

  return `
    <div class="tier-card" id="tier-card-${tierDef.id}">
      <div class="tier-header">
        <span class="tier-icon">${tierDef.icon}</span>
        <div>
          <strong>${tierDef.name}</strong>
          <span class="tier-desc">${tierDef.desc}</span>
        </div>
        <button class="promote-btn" data-tier-action="grant-all" data-tier="${tierDef.id}">Grant all</button>
        <button class="promote-btn" data-tier-action="revoke-all" data-tier="${tierDef.id}">Revoke all</button>
        <button class="promote-btn" data-save-tier="${tierDef.id}">Save</button>
      </div>
      <div id="tier-toggles-${tierDef.id}">
        ${togglesHtml}
      </div>
    </div>`;
}

function renderTierChip(tierId, moduleId, access, isCourse = false) {
  const granted     = access[moduleId] === true;
  const fieldTitles = MODULE_FIELD_TITLES[moduleId] ?? [];
  const isShared     = fieldTitles.length > 1;
  const title = isShared
    ? `Shared module — also appears under: ${fieldTitles.join(', ')}. Toggling any copy of this chip updates them all together.`
    : isCourse ? 'Course' : '';
  const label = (isCourse ? '📚 ' : '') + MODULE_TITLES[moduleId];
  return `<button
    class="tier-chip toggle-chip ${granted ? 'granted' : 'revoked'}${isShared ? ' shared' : ''}${isCourse ? ' course-chip' : ''}"
    data-tier="${tierId}"
    data-module="${moduleId}"
    data-state="${granted ? 'granted' : 'revoked'}"
    title="${title}">
    ${label}${isShared ? ' 🔗' : ''}
  </button>`;
}

/** Local toggle only — Firestore is written on Save. */
function toggleTierChip(chip) {
  const newState = chip.dataset.state === 'granted' ? 'revoked' : 'granted';
  const { tier: tierId, module: moduleId } = chip.dataset;

  // A shared module (e.g. "python") can render more than one chip in this
  // same tier card — one per field it belongs to. handleSaveTier() reads
  // EVERY .tier-chip for this tier, so if duplicates disagreed, whichever
  // one happened to come later in the DOM would silently overwrite the
  // other on Save. Keep all copies in lockstep so that can't happen.
  document
    .querySelectorAll(`.tier-chip[data-tier="${tierId}"][data-module="${moduleId}"]`)
    .forEach(c => {
      c.dataset.state = newState;
      c.className     = `tier-chip toggle-chip ${newState}${c.classList.contains('shared') ? ' shared' : ''}`;
    });
}

/**
 * Sets every chip for a tier to granted/revoked in one click — e.g. "Revoke
 * all" then individually granting the 2-3 courses a tailored tier should
 * see. Local only, same as toggleTierChip — committed on the next Save.
 */
function handleTierBulkToggle(tierId, action) {
  const granted = action === 'grant-all';
  document.querySelectorAll(`.tier-chip[data-tier="${tierId}"]`).forEach(chip => {
    chip.dataset.state = granted ? 'granted' : 'revoked';
    chip.className = `tier-chip toggle-chip ${granted ? 'granted' : 'revoked'}`;
  });
}

// ── TAB SWITCHING ─────────────────────────────────────────────────────────

function wireTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('tab-users').hidden      = tab !== 'users';
      document.getElementById('tab-categories').hidden = tab !== 'categories';
      document.getElementById('tab-requests').hidden   = tab !== 'requests';
      document.getElementById('tab-courses').hidden    = tab !== 'courses';
      // Render lazily on first visit (or re-render to pick up any tier saves)
      if (tab === 'categories') renderCategoriesTab();
      if (tab === 'requests')   renderRequestsTab();
      if (tab === 'courses')    renderCoursesTab();
    });
  });
}

// ── ACTIONS — USERS TAB ───────────────────────────────────────────────────

async function handleTableClick(e) {
  const chip       = e.target.closest('.toggle-chip:not(.tier-chip)');
  const actionBtn  = e.target.closest('[data-action]');
  const promoteBtn = e.target.closest('.promote-btn:not([data-action])');

  if (chip)       await handleChipToggle(chip);
  else if (actionBtn)  await handleBulkAction(actionBtn.dataset.uid, actionBtn.dataset.action, actionBtn.dataset.field ?? null);
  else if (promoteBtn) await handlePromote(promoteBtn.dataset.uid);
}

async function handleTableChange(e) {
  const select = e.target.closest('.tier-select');
  if (select) await handleTierChange(select);
}

async function handleChipToggle(chip) {
  const { uid, module: moduleId } = chip.dataset;
  const currentlyGranted = chip.dataset.state === 'granted';
  const newState = !currentlyGranted;

  setStatus(`Updating ${MODULE_TITLES[moduleId]} for ${uid}…`);
  try {
    await setDoc(
      doc(db, 'users', uid, 'access', 'modules'),
      { [moduleId]: newState },
      { merge: true }
    );
    if (!accessCache[uid]) accessCache[uid] = {};
    accessCache[uid][moduleId] = newState;

    // A shared module (e.g. "python") renders one chip per field it belongs
    // to, so more than one chip in this user's toggle area can share the
    // same data-module. Sync ALL of them — not just the one clicked — or
    // the duplicates silently drift apart until the next full re-render.
    document
      .querySelectorAll(`#toggles-${uid} .toggle-chip[data-module="${moduleId}"]`)
      .forEach(c => {
        c.className     = `toggle-chip ${newState ? 'granted' : 'revoked'}${c.classList.contains('shared') ? ' shared' : ''}`;
        c.dataset.state = newState ? 'granted' : 'revoked';
      });

    setStatus('✓ Updated.');
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

async function handleBulkAction(uid, action, fieldId) {
  setStatus(`Applying "${action}" for ${uid}…`);
  try {
    if (action === 'reset-access') {
      await setDoc(doc(db, 'users', uid, 'access', 'modules'), {});
      accessCache[uid] = {};

    } else if (action === 'grant-all' || action === 'revoke-all') {
      const granted = action === 'grant-all';
      const map = Object.fromEntries(MODULE_IDS.map(id => [id, granted]));
      await setDoc(doc(db, 'users', uid, 'access', 'modules'), map);
      accessCache[uid] = map;

    } else if (action === 'grant-field' || action === 'revoke-field') {
      const field = LMS_CONFIG.fields?.find(f => f.id === fieldId);
      if (!field) { setStatus('Field not found.'); return; }
      const granted = action === 'grant-field';
      // Phase 4: also include courses assigned to this field so that
      // Grant/Revoke field covers dynamic courses alongside static modules.
      const fieldCourseIds = COURSE_IDS.filter(id => COURSE_FIELD[id] === fieldId);
      const updates = Object.fromEntries(
        [...field.moduleIds, ...fieldCourseIds].map(id => [id, granted])
      );
      await setDoc(doc(db, 'users', uid, 'access', 'modules'), updates, { merge: true });
      if (!accessCache[uid]) accessCache[uid] = {};
      Object.assign(accessCache[uid], updates);
      setStatus(`✓ ${field.title} ${granted ? 'granted' : 'revoked'}.`);
      document.getElementById(`toggles-${uid}`).innerHTML =
        renderModuleTogglesForUser(uid, accessCache[uid]);
      return;
    }

    document.getElementById(`toggles-${uid}`).innerHTML =
      renderModuleTogglesForUser(uid, accessCache[uid]);
    setStatus('✓ Done.');
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

async function handlePromote(uid) {
  setStatus(`Toggling admin role for ${uid}…`);
  try {
    const snap    = await getDoc(doc(db, 'users', uid));
    const current = snap.data()?.role;
    const newRole = current === 'admin' ? 'user' : 'admin';
    await updateDoc(doc(db, 'users', uid), { role: newRole });
    profileCache[uid] = { ...profileCache[uid], role: newRole };
    const el = document.getElementById(`role-${uid}`);
    if (el) el.textContent = newRole;
    setStatus(`✓ Role set to "${newRole}".`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

/** Called when the tier <select> changes for a user row. */
async function handleTierChange(select) {
  const uid     = select.dataset.uid;
  const newTier = select.value;
  setStatus(`Updating tier for ${uid}…`);
  try {
    await updateDoc(doc(db, 'users', uid), { tier: newTier });
    profileCache[uid] = { ...profileCache[uid], tier: newTier };
    setStatus(`✓ Tier set to "${newTier}".`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    // Revert select to cached value on failure
    select.value = profileCache[uid]?.tier ?? 'free';
  }
}

// ── ACTIONS — CATEGORIES TAB ──────────────────────────────────────────────

async function handleSaveTier(tierId) {
  const chips = document.querySelectorAll(`.tier-chip[data-tier="${tierId}"]`);
  const moduleAccess = {};
  chips.forEach(c => { moduleAccess[c.dataset.module] = c.dataset.state === 'granted'; });

  setStatus(`Saving "${tierId}" tier…`);
  try {
    await setDoc(doc(db, 'tiers', tierId), moduleAccess);
    tiersCache[tierId] = moduleAccess;
    setStatus(`✓ "${tierId}" tier saved.`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

// ── RENDER — REQUESTS TAB ────────────────────────────────────────────────

/**
 * Rebuilds the Requests tab. Called lazily on first tab visit and after
 * every publish/decline action. requestsFilter controls which status bucket
 * is visible — default is 'pending' so the queue is actionable on open.
 */
function renderRequestsTab() {
  const el = document.getElementById('tab-requests');
  const statuses = ['pending', 'in_review', 'fulfilled', 'declined', 'all'];

  const counts = {
    all:        allRequests.length,
    pending:    allRequests.filter(r => r.status === 'pending').length,
    in_review:  allRequests.filter(r => r.status === 'in_review').length,
    fulfilled:  allRequests.filter(r => r.status === 'fulfilled').length,
    declined:   allRequests.filter(r => r.status === 'declined').length,
  };

  const filtered = requestsFilter === 'all'
    ? allRequests
    : allRequests.filter(r => r.status === requestsFilter);

  const groups = groupRequestsByUser(filtered);

  const filterBar = statuses.map(s => `
    <button class="req-filter-btn${requestsFilter === s ? ' active' : ''}" data-filter="${s}">
      ${s === 'all' ? '📋 All' : s === 'pending' ? '⏳ Pending' : s === 'in_review' ? '🔍 In review' : s === 'fulfilled' ? '✅ Fulfilled' : '❌ Declined'}
      <span class="req-filter-count">${counts[s]}</span>
    </button>`).join('');

  el.innerHTML = `
    <div class="req-toolbar">
      <div class="req-filter-bar">${filterBar}</div>
      <button class="promote-btn" id="btn-refresh-requests">↻ Refresh</button>
    </div>
    ${groups.length === 0
      ? `<p style="font-size:13px;color:var(--muted);padding:20px 0">No requests with status "${requestsFilter}".</p>`
      : groups.map(g => renderUserRequestGroup(g)).join('')}
  `;

  // Filter buttons
  el.querySelectorAll('.req-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      requestsFilter = btn.dataset.filter;
      renderRequestsTab();
    });
  });

  // Per-user group collapse/expand
  el.querySelectorAll('.req-group-header').forEach(header => {
    header.addEventListener('click', () => {
      const { uid } = header.dataset;
      if (collapsedRequestGroups.has(uid)) collapsedRequestGroups.delete(uid);
      else collapsedRequestGroups.add(uid);
      renderRequestsTab();
    });
  });

  // Refresh button
  document.getElementById('btn-refresh-requests')?.addEventListener('click', async () => {
    setStatus('Refreshing requests…');
    await loadRequests();
    renderRequestsTab();
    setStatus('✓ Requests refreshed.');
  });

  // Expand/collapse questionnaire answers
  el.querySelectorAll('.req-answers-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const isHidden = target.hidden;
      target.hidden  = !isHidden;
      btn.textContent = isHidden ? '▲ Hide answers' : '▼ Show answers';
    });
  });

  // Live preview button — toggle an srcdoc iframe
  el.querySelectorAll('.req-preview-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { reqId } = btn.dataset;
      const htmlEl    = document.getElementById(`req-html-${reqId}`);
      const previewEl = document.getElementById(`req-preview-${reqId}`);
      if (!htmlEl || !previewEl) return;
      const nowHidden = previewEl.hidden;
      previewEl.hidden = !nowHidden;
      btn.textContent  = nowHidden ? '👁 Hide preview' : '👁 Preview';
      if (nowHidden) previewEl.srcdoc = htmlEl.value;
    });
  });

  // Publish / decline / mark-in-review action buttons
  el.querySelectorAll('[data-req-action]').forEach(btn => {
    btn.addEventListener('click', () => handleRequestAction(btn));
  });
}

/**
 * Renders one row of the target-job / target-abilities section: the typed
 * text if the user wrote it, a download link if they uploaded a file
 * instead, or '' (rendered as nothing) if neither was provided.
 *
 * @param {string} label
 * @param {string|null|undefined} text
 * @param {string|null|undefined} fileURL
 * @param {string|null|undefined} fileName
 */
function renderTargetRow(label, text, fileURL, fileName) {
  if (text) {
    return `<div class="req-target-row"><strong>${escHtml(label)}:</strong> ${escHtml(text)}</div>`;
  }
  if (fileURL) {
    return `<div class="req-target-row"><strong>${escHtml(label)}:</strong> <a href="${escHtml(fileURL)}" target="_blank" rel="noopener noreferrer" class="req-file-link promote-btn">📎 ${escHtml(fileName || 'Download file')}</a></div>`;
  }
  return '';
}

/**
 * Groups a (status-filtered) list of requests by uid, preserving the order
 * each uid first appears in. allRequests is always loaded most-recent-first,
 * so this naturally surfaces the user with the most recent activity first
 * without needing a separate sort step.
 *
 * @param {Array<object>} requests
 * @returns {Array<{ uid: string, userName: string, userEmail: string, requests: Array<object> }>}
 */
function groupRequestsByUser(requests) {
  const order  = [];
  const groups = new Map();

  for (const req of requests) {
    if (!groups.has(req.uid)) {
      const user = allUsers.find(u => u.uid === req.uid);
      groups.set(req.uid, {
        uid:       req.uid,
        userName:  user ? (user.displayName || user.email || req.uid) : req.uid,
        userEmail: user?.email ?? '',
        requests:  []
      });
      order.push(req.uid);
    }
    groups.get(req.uid).requests.push(req);
  }

  return order.map(uid => groups.get(uid));
}

/**
 * Renders one user's section of the (per-user-grouped) Requests tab: a
 * clickable header with an initial-letter avatar, name/email, and a count
 * badge for however many requests are in the current status filter — followed
 * by that user's request cards. Collapse state lives in collapsedRequestGroups
 * (keyed by uid) so it survives re-renders triggered by filter changes or
 * publish/decline actions elsewhere on the tab.
 *
 * @param {{ uid: string, userName: string, userEmail: string, requests: Array<object> }} group
 */
function renderUserRequestGroup(group) {
  const isCollapsed = collapsedRequestGroups.has(group.uid);
  const initial      = (group.userName || '?').trim().charAt(0).toUpperCase() || '?';

  return `
    <div class="req-group">
      <button class="req-group-header" data-uid="${escHtml(group.uid)}" aria-expanded="${!isCollapsed}">
        <span class="req-group-avatar">${escHtml(initial)}</span>
        <span class="req-group-info">
          <span class="req-group-name">${escHtml(group.userName)}</span>
          ${group.userEmail ? `<span class="req-group-email">${escHtml(group.userEmail)}</span>` : ''}
        </span>
        <span class="req-group-count">${group.requests.length}</span>
        <span class="req-group-chevron">${isCollapsed ? '▶' : '▼'}</span>
      </button>
      ${isCollapsed ? '' : `
        <div class="req-group-body">
          ${group.requests.map(req => renderRequestCard(req)).join('')}
        </div>
      `}
    </div>`;
}

/**
 * Renders a single request as a collapsible card showing status, user info,
 * questionnaire answers, optional file link, and (for actionable requests)
 * the lesson-authoring form with title input, HTML textarea, and action buttons.
 */
function renderRequestCard(req) {
  const dateStr   = formatTimestamp(req.requestedAt);
  const isActionable = req.status === 'pending' || req.status === 'in_review';

  // Target job / target abilities are surfaced in their own always-visible
  // section (not buried in the collapsible answers list below) since they
  // directly inform what the admin authors. Each one is either typed text
  // (stored in req.answers, same as role/level/goal/gaps) or an uploaded
  // file (stored as top-level …FileURL/…FileName fields), depending on
  // which mode the user picked in the request form — never both.
  const targetRowsHtml = [
    renderTargetRow('🎯 Target job', req.answers?.targetJob, req.targetJobFileURL, req.targetJobFileName),
    renderTargetRow('🎯 Target abilities', req.answers?.targetAbilities, req.targetAbilitiesFileURL, req.targetAbilitiesFileName)
  ].filter(Boolean).join('');

  // Questionnaire answers — skip blank values and the two target fields
  // above (already rendered in targetRowsHtml).
  const answersHtml = Object.entries(req.answers ?? {})
    .filter(([k, v]) => v && k !== 'targetJob' && k !== 'targetAbilities')
    .map(([k, v]) => `<div class="req-answer-row"><strong>${escHtml(k)}:</strong> ${escHtml(String(v))}</div>`)
    .join('');

  return `
    <div class="req-card req-card-${escHtml(req.status)}" id="req-card-${req.id}">

      <div class="req-card-header">
        <div class="req-meta">
          <span class="req-status-badge req-status-${escHtml(req.status)}">${statusLabel(req.status)}</span>
          <strong class="req-topic">${escHtml(req.topic)}</strong>
          <span class="req-date">${dateStr}</span>
        </div>
        ${req.profileFileURL ? `
          <a href="${escHtml(req.profileFileURL)}" target="_blank" rel="noopener noreferrer"
             class="req-file-link promote-btn">📎 ${escHtml(req.profileFileName || 'Download file')}</a>
        ` : ''}
      </div>

      ${targetRowsHtml ? `<div class="req-target-section">${targetRowsHtml}</div>` : ''}

      ${answersHtml ? `
        <div class="req-answers-section">
          <button class="req-answers-toggle promote-btn" data-target="req-answers-${req.id}">▼ Show answers</button>
          <div id="req-answers-${req.id}" class="req-answers" hidden>${answersHtml}</div>
        </div>
      ` : ''}

      ${req.adminNote ? `<div class="req-admin-note">📝 ${escHtml(req.adminNote)}</div>` : ''}

      ${isActionable ? `
        <div class="req-author-section">
          <div class="req-author-header">
            <span class="req-author-label">Author lesson</span>
            ${req.status === 'pending' ? `
              <button class="promote-btn" data-req-action="in_review" data-req-id="${req.id}">
                🔍 Mark in review
              </button>` : ''}
          </div>
          <input
            type="text"
            class="req-title-input"
            id="req-title-${req.id}"
            placeholder="Lesson title…"
            value="${escHtml(req.topic)}" />
          <textarea
            class="req-html-input"
            id="req-html-${req.id}"
            placeholder="Paste lesson HTML here… (full <html> document or a fragment)"
            rows="10"></textarea>
          <div class="req-author-actions">
            <button class="req-preview-btn promote-btn" data-req-id="${req.id}">👁 Preview</button>
            <button class="promote-btn req-publish-btn"
                    data-req-action="publish"
                    data-req-id="${req.id}"
                    data-uid="${escHtml(req.uid)}">✅ Publish lesson</button>
            <span style="flex:1"></span>
            <button class="promote-btn req-decline-btn"
                    data-req-action="decline"
                    data-req-id="${req.id}">❌ Decline</button>
          </div>
          <iframe id="req-preview-${req.id}" class="req-preview-frame" hidden sandbox="allow-scripts"></iframe>
        </div>
      ` : req.status === 'fulfilled' ? `
        <div class="req-outcome-note req-fulfilled-note">
          ✅ Lesson published${req.fulfilledAt ? ` · ${formatTimestamp(req.fulfilledAt)}` : ''}.
          Lesson ID: <code>${escHtml(req.lessonId ?? '')}</code>
        </div>
      ` : req.status === 'declined' ? `
        <div class="req-outcome-note req-declined-note">
          ❌ Declined${req.fulfilledAt ? ` · ${formatTimestamp(req.fulfilledAt)}` : ''}.
          ${req.adminNote ? `Note to user: <em>${escHtml(req.adminNote)}</em>` : ''}
        </div>
      ` : ''}
    </div>`;
}

// ── ACTIONS — REQUESTS TAB ───────────────────────────────────────────────

/**
 * Dispatches publish / decline / in_review actions from the Requests tab.
 * All three write to Firestore directly (same pattern as other admin actions)
 * then update local allRequests state and re-render the tab.
 */
async function handleRequestAction(btn) {
  const action    = btn.dataset.reqAction;
  const requestId = btn.dataset.reqId;
  const uid       = btn.dataset.uid;   // only present on publish

  if (action === 'in_review') {
    setStatus('Marking as in review…');
    try {
      await updateDoc(doc(db, 'personalizedLessonRequests', requestId), { status: 'in_review' });
      const req = allRequests.find(r => r.id === requestId);
      if (req) req.status = 'in_review';
      renderRequestsTab();
      setStatus('✓ Marked as in review.');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }

  } else if (action === 'publish') {
    const title = document.getElementById(`req-title-${requestId}`)?.value.trim();
    const html  = document.getElementById(`req-html-${requestId}`)?.value.trim();

    if (!title) { setStatus('Please enter a lesson title before publishing.'); return; }
    if (!html)  { setStatus('Please paste the lesson HTML before publishing.'); return; }

    const req = allRequests.find(r => r.id === requestId);
    if (!req) { setStatus('Request not found in local cache — try refreshing.'); return; }

    setStatus('Publishing lesson…');
    btn.disabled = true;
    try {
      // 1. Write the lesson doc first — so the user can always query it once the request flips.
      const lessonRef = doc(collection(db, 'users', uid, 'personalized_lessons'));
      const lessonId  = lessonRef.id;
      await setDoc(lessonRef, {
        title,
        topic:     req.topic,
        html,
        createdAt: serverTimestamp(),
        requestId,
        progress:  { type: 'untracked', total: 0 }
      });

      // 2. Stamp the request as fulfilled (lesson doc already exists at this point).
      await updateDoc(doc(db, 'personalizedLessonRequests', requestId), {
        status:      'fulfilled',
        fulfilledAt: serverTimestamp(),
        fulfilledBy: currentAdmin.uid,
        lessonId
      });

      // Update local cache so the re-render reflects the new state immediately.
      Object.assign(req, { status: 'fulfilled', lessonId, fulfilledBy: currentAdmin.uid });

      // Switch the filter to 'fulfilled' so the just-published request is visible.
      requestsFilter = 'fulfilled';
      renderRequestsTab();
      setStatus('✓ Lesson published.');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
      btn.disabled = false;
    }

  } else if (action === 'decline') {
    // Use a native prompt so no extra form markup is needed in the card.
    const note = window.prompt(
      'Optional: add a note for the user (shown on their declined card). Leave blank to decline without comment.'
    );
    if (note === null) return; // admin cancelled the prompt

    setStatus('Declining request…');
    try {
      await updateDoc(doc(db, 'personalizedLessonRequests', requestId), {
        status:      'declined',
        fulfilledBy: currentAdmin.uid,
        fulfilledAt: serverTimestamp(),
        adminNote:   note.trim() || null
      });

      const req = allRequests.find(r => r.id === requestId);
      if (req) Object.assign(req, {
        status:      'declined',
        adminNote:   note.trim() || null,
        fulfilledBy: currentAdmin.uid
      });

      requestsFilter = 'declined';
      renderRequestsTab();
      setStatus('✓ Request declined.');
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    }
  }
}

// ── UTIL — REQUESTS TAB ──────────────────────────────────────────────────

/** Human-readable label for a request status value. */
function statusLabel(status) {
  return {
    pending:   '⏳ Pending',
    in_review: '🔍 In review',
    fulfilled: '✅ Fulfilled',
    declined:  '❌ Declined'
  }[status] ?? status;
}

/** Formats a Firestore Timestamp (or epoch-ms number) for display. */
function formatTimestamp(ts) {
  if (!ts) return '';
  const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString();
}



// ── RENDER — COURSES TAB (list view) ─────────────────────────────────────

/**
 * Top-level dispatcher: shows the course list or editor depending on state.
 * Called lazily on first tab click and after any action that needs a full
 * refresh (create/delete). Targeted sub-renders (lesson edits, status
 * toggles) update their own DOM slice instead of calling this.
 */
function renderCoursesTab() {
  if (editingCourseId !== null) {
    renderCourseEditor();
  } else {
    renderCourseList();
  }
}

function renderCourseList() {
  const el = document.getElementById('tab-courses');
  el.innerHTML = `
    <div class="courses-toolbar">
      <button class="promote-btn courses-new-btn" id="btn-new-course">＋ New course</button>
      <button class="promote-btn" id="btn-refresh-courses">↻ Refresh</button>
    </div>
    ${allCourses.length === 0
      ? `<p style="font-size:13px;color:var(--muted);padding:20px 0">
           No courses yet — click "New course" to create one.
         </p>`
      : allCourses.map((c, i) => renderCourseCard(c, i)).join('')}
  `;

  document.getElementById('btn-new-course').addEventListener('click', () => {
    editingCourseId = 'new';
    editingLessonId = null;
    renderCoursesTab();
  });

  document.getElementById('btn-refresh-courses').addEventListener('click', async () => {
    setStatus('Refreshing courses…');
    await loadCourses();
    renderCoursesTab();
    setStatus('✓ Courses refreshed.');
  });

  el.querySelectorAll('[data-course-action]').forEach(btn => {
    btn.addEventListener('click', () => handleCourseListAction(btn));
  });
}

function renderCourseCard(course, index) {
  const isFirst    = index === 0;
  const isLast     = index === allCourses.length - 1;
  const updatedStr = formatTimestamp(course.updatedAt);
  const lessons    = courseLessons[course.id];
  const countStr   = lessons ? `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}` : '';
  const statusClass = course.status === 'published' ? 'course-status-published' : 'course-status-draft';
  const fieldLabel  = course.fieldId
    ? (LMS_CONFIG.fields ?? []).find(f => f.id === course.fieldId)?.title ?? course.fieldId
    : '';

  return `
    <div class="course-card" id="course-card-${course.id}">
      <div class="course-card-header">
        <span class="course-card-icon">${escHtml(course.icon ?? '📘')}</span>
        <div class="course-card-body">
          <div class="course-card-title-row">
            <span class="course-card-title">${escHtml(course.title)}</span>
            <span class="course-status-badge ${statusClass}">
              ${course.status === 'published' ? '🟢 Published' : '⚫ Draft'}
            </span>
          </div>
          ${course.subtitle ? `<div class="course-card-subtitle">${escHtml(course.subtitle)}</div>` : ''}
          <div class="course-card-meta">
            ${[countStr, fieldLabel ? `Field: ${escHtml(fieldLabel)}` : '', updatedStr ? `Updated ${updatedStr}` : ''].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <div class="course-card-actions">
        <button class="promote-btn" data-course-action="edit" data-course-id="${course.id}">✏️ Edit</button>
        <button class="promote-btn" data-course-action="toggle-status"
                data-course-id="${course.id}" data-current-status="${course.status}">
          ${course.status === 'published' ? '🔒 Unpublish' : '🚀 Publish'}
        </button>
        <button class="promote-btn" data-course-action="move-up"
                data-course-id="${course.id}" ${isFirst ? 'disabled' : ''}>↑</button>
        <button class="promote-btn" data-course-action="move-down"
                data-course-id="${course.id}" ${isLast ? 'disabled' : ''}>↓</button>
        <button class="promote-btn courses-delete-btn" data-course-action="delete"
                data-course-id="${course.id}">🗑 Delete</button>
      </div>
    </div>`;
}

// ── ACTIONS — COURSES LIST ────────────────────────────────────────────────

async function handleCourseListAction(btn) {
  const action   = btn.dataset.courseAction;
  const courseId = btn.dataset.courseId;

  if (action === 'edit') {
    editingCourseId = courseId;
    editingLessonId = null;
    if (!courseLessons[courseId]) {
      setStatus('Loading lessons…');
      await loadCourseLessons(courseId);
      setStatus('');
    }
    renderCoursesTab();

  } else if (action === 'toggle-status') {
    const current = btn.dataset.currentStatus;
    const next    = current === 'published' ? 'draft' : 'published';
    const verb    = next === 'published' ? 'Publish' : 'Unpublish';
    const course  = allCourses.find(c => c.id === courseId);
    if (!window.confirm(`${verb} "${course?.title}"?`)) return;
    setStatus(`${verb}ing course…`);
    try {
      await updateDoc(doc(db, 'courses', courseId), { status: next, updatedAt: serverTimestamp() });
      if (course) course.status = next;
      renderCourseList();
      setStatus(`✓ Course ${next}.`);
    } catch (err) { setStatus(`Error: ${err.message}`); }

  } else if (action === 'move-up' || action === 'move-down') {
    const idx  = allCourses.findIndex(c => c.id === courseId);
    const swap = action === 'move-up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= allCourses.length) return;
    [allCourses[idx], allCourses[swap]] = [allCourses[swap], allCourses[idx]];
    setStatus('Saving order…');
    try {
      await Promise.all(
        allCourses.map((c, i) => updateDoc(doc(db, 'courses', c.id), { order: i }))
      );
      allCourses.forEach((c, i) => { c.order = i; });
      setStatus('✓ Order saved.');
    } catch (err) { setStatus(`Error: ${err.message}`); }
    renderCourseList();

  } else if (action === 'delete') {
    const course = allCourses.find(c => c.id === courseId);
    if (!window.confirm(
      `Delete "${course?.title}"? This also deletes all its lessons and cannot be undone.`
    )) return;
    setStatus('Deleting course…');
    try {
      const lessonsSnap = await getDocs(collection(db, 'courses', courseId, 'lessons'));
      await Promise.all(lessonsSnap.docs.map(d => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'courses', courseId));
      allCourses = allCourses.filter(c => c.id !== courseId);
      delete courseLessons[courseId];
      // Re-normalize order so no gaps remain
      await Promise.all(
        allCourses.map((c, i) => updateDoc(doc(db, 'courses', c.id), { order: i }))
      );
      allCourses.forEach((c, i) => { c.order = i; });
      renderCourseList();
      setStatus('✓ Course deleted.');
    } catch (err) { setStatus(`Error: ${err.message}`); }
  }
}

// ── RENDER — COURSE EDITOR ────────────────────────────────────────────────

/**
 * Renders the full course editor view (metadata form + lesson list).
 * Handles both "new" (editingCourseId === 'new') and existing courses.
 * Called on first entering edit mode; targeted updates (lesson edits,
 * status toggles) refresh only their own slice of the DOM after this.
 */
async function renderCourseEditor() {
  const el    = document.getElementById('tab-courses');
  const isNew = editingCourseId === 'new';
  const course = isNew ? null : allCourses.find(c => c.id === editingCourseId);

  const fields = LMS_CONFIG.fields ?? [];
  const fieldOptions = [
    `<option value="">— None —</option>`,
    ...fields.map(f =>
      `<option value="${escHtml(f.id)}" ${course?.fieldId === f.id ? 'selected' : ''}>
         ${escHtml((f.icon ?? '') + ' ' + f.title)}
       </option>`
    )
  ].join('');

  const lessons     = isNew ? [] : (courseLessons[editingCourseId] ?? []);
  const statusClass = course?.status === 'published' ? 'course-status-published' : 'course-status-draft';

  el.innerHTML = `
    <div class="course-editor-header">
      <button class="promote-btn" id="btn-back-courses">← Back</button>
      <h2 class="course-editor-title">
        ${isNew ? '📚 New course' : `${escHtml(course?.icon ?? '📘')} ${escHtml(course?.title ?? '')}`}
      </h2>
      ${!isNew ? `
        <span class="course-status-badge ${statusClass}" id="editor-status-badge">
          ${course?.status === 'published' ? '🟢 Published' : '⚫ Draft'}
        </span>
        <button class="promote-btn" id="btn-editor-toggle-status"
                data-current-status="${course?.status}">
          ${course?.status === 'published' ? '🔒 Unpublish' : '🚀 Publish'}
        </button>` : ''}
    </div>

    <!-- ── Metadata form ──────────────────────────────────────────────── -->
    <div class="course-meta-form">
      <span class="course-form-section-label">Course metadata</span>

      <div class="course-form-row" style="display:flex;gap:12px;align-items:flex-end">
        <div style="flex-shrink:0">
          <label class="course-form-label" for="course-icon">Icon</label>
          <input class="course-form-input" id="course-icon" type="text" maxlength="4"
                 value="${escHtml(course?.icon ?? '📘')}" placeholder="📘"
                 style="width:54px;text-align:center;font-size:20px;padding:4px" />
        </div>
        <div style="flex:1">
          <label class="course-form-label" for="course-title">
            Title <span style="color:#ef4444">*</span>
          </label>
          <input class="course-form-input" id="course-title" type="text"
                 value="${escHtml(course?.title ?? '')}" placeholder="e.g. SQL Fundamentals" />
        </div>
      </div>

      <div class="course-form-row">
        <label class="course-form-label" for="course-subtitle">Subtitle</label>
        <input class="course-form-input" id="course-subtitle" type="text"
               value="${escHtml(course?.subtitle ?? '')}"
               placeholder="Short description shown on the course card" />
      </div>

      <div class="course-form-row">
        <label class="course-form-label" for="course-field">Field assignment</label>
        <select class="course-form-select" id="course-field">${fieldOptions}</select>
      </div>

      <div class="course-form-row" style="display:flex;gap:20px;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="course-requires-auth" ${course?.requiresAuth ? 'checked' : ''} />
          Requires login
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="course-requires-pro" ${course?.requiresPro ? 'checked' : ''} />
          Requires Pro
        </label>
      </div>

      <div style="margin-top:16px">
        <button class="promote-btn course-save-meta-btn" id="btn-save-course-meta">
          ${isNew ? '✅ Create course' : '💾 Save metadata'}
        </button>
      </div>
    </div>

    ${!isNew ? `
      <!-- ── Lessons ──────────────────────────────────────────────────── -->
      <div class="course-lessons-section">
        <div class="course-lessons-header">
          <span class="course-form-section-label" style="margin-bottom:0" id="course-lessons-count">
            Lessons (${lessons.length})
          </span>
          <button class="promote-btn courses-new-btn" id="btn-add-lesson">＋ Add lesson</button>
        </div>
        <div id="lessons-list">
          ${renderLessonsListHtml(lessons)}
        </div>
      </div>
    ` : `
      <p style="font-size:13px;color:var(--muted);margin-top:4px">
        Save the course first to start adding lessons.
      </p>
    `}
  `;

  // Back button
  document.getElementById('btn-back-courses').addEventListener('click', () => {
    editingCourseId = null;
    editingLessonId = null;
    renderCoursesTab();
  });

  // Publish/Unpublish in editor header
  document.getElementById('btn-editor-toggle-status')?.addEventListener('click', async (e) => {
    const btn     = e.currentTarget;
    const current = btn.dataset.currentStatus;
    const next    = current === 'published' ? 'draft' : 'published';
    const verb    = next === 'published' ? 'Publish' : 'Unpublish';
    if (!window.confirm(`${verb} this course?`)) return;
    setStatus(`${verb}ing…`);
    try {
      await updateDoc(doc(db, 'courses', editingCourseId), { status: next, updatedAt: serverTimestamp() });
      const c = allCourses.find(c => c.id === editingCourseId);
      if (c) c.status = next;
      // Targeted update — don't re-render the whole editor or lose the lesson list
      btn.dataset.currentStatus = next;
      btn.textContent = next === 'published' ? '🔒 Unpublish' : '🚀 Publish';
      const badge = document.getElementById('editor-status-badge');
      if (badge) {
        badge.className = `course-status-badge ${next === 'published' ? 'course-status-published' : 'course-status-draft'}`;
        badge.textContent = next === 'published' ? '🟢 Published' : '⚫ Draft';
      }
      setStatus(`✓ Course ${next}.`);
    } catch (err) { setStatus(`Error: ${err.message}`); }
  });

  // Save / create metadata
  document.getElementById('btn-save-course-meta')
    .addEventListener('click', () => handleSaveCourseMeta());

  // Add lesson
  document.getElementById('btn-add-lesson')?.addEventListener('click', () => {
    if (editingLessonId === 'new') return; // already open
    editingLessonId = 'new';
    refreshLessonsList();
  });

  // Wire lesson actions on initial render
  wireCourseLessonActions();
}

// ── RENDER — LESSON LIST (within course editor) ───────────────────────────

/**
 * Returns the HTML string for the #lessons-list div. Separated from DOM
 * insertion so it can be called from both the initial editor render and
 * the targeted refreshLessonsList() helper.
 */
function renderLessonsListHtml(lessons) {
  let html = '';

  if (lessons.length === 0 && editingLessonId !== 'new') {
    html = `<p style="font-size:13px;color:var(--muted);padding:10px 0">
              No lessons yet — click "Add lesson" to create one.
            </p>`;
  } else {
    html = lessons.map((lesson, i) => renderLessonRow(lesson, i, lessons.length)).join('');
  }

  if (editingLessonId === 'new') {
    html += renderNewLessonForm();
  }

  return html;
}

/**
 * Replaces only #lessons-list and re-wires its event listeners.
 * Used after save/create/delete/reorder so the metadata form is untouched.
 */
function refreshLessonsList() {
  const listEl  = document.getElementById('lessons-list');
  const countEl = document.getElementById('course-lessons-count');
  if (!listEl) return;
  const lessons = courseLessons[editingCourseId] ?? [];
  listEl.innerHTML = renderLessonsListHtml(lessons);
  if (countEl) countEl.textContent = `Lessons (${lessons.length})`;
  wireCourseLessonActions();
}

/** Renders one lesson row in collapsed (view) or expanded (edit) state. */
function renderLessonRow(lesson, index, total) {
  const isEditing = editingLessonId === lesson.id;
  const isFirst   = index === 0;
  const isLast    = index === total - 1;

  if (isEditing) {
    return `
      <div class="lesson-row lesson-row-editing" id="lesson-row-${lesson.id}">
        <div class="lesson-editor">
          <div class="course-form-row">
            <label class="course-form-label">
              Title <span style="color:#ef4444">*</span>
            </label>
            <input class="course-form-input" id="lesson-title-${lesson.id}" type="text"
                   value="${escHtml(lesson.title ?? '')}" placeholder="Lesson title…" />
          </div>
          <div class="course-form-row">
            <label class="course-form-label">Subtitle</label>
            <input class="course-form-input" id="lesson-subtitle-${lesson.id}" type="text"
                   value="${escHtml(lesson.subtitle ?? '')}"
                   placeholder="Optional short description" />
          </div>
          <div class="course-form-row">
            <label class="course-form-label">HTML content</label>
            <textarea class="lesson-html-input" id="lesson-html-${lesson.id}" rows="12"
                      placeholder="Paste lesson HTML here… (full &lt;html&gt; document or a fragment)"
            >${escHtml(lesson.html ?? '')}</textarea>
          </div>
          <div class="req-author-actions">
            <button class="promote-btn" data-lesson-preview="${lesson.id}">👁 Preview</button>
            <button class="promote-btn req-publish-btn" data-lesson-save="${lesson.id}">
              💾 Save lesson
            </button>
            <span style="flex:1"></span>
            <button class="promote-btn" data-lesson-cancel="${lesson.id}">✕ Cancel</button>
          </div>
          <iframe id="lesson-preview-frame-${lesson.id}" class="req-preview-frame"
                  hidden sandbox="allow-scripts"></iframe>
        </div>
      </div>`;
  }

  return `
    <div class="lesson-row" id="lesson-row-${lesson.id}">
      <div class="lesson-row-header">
        <span class="lesson-order-badge">${index + 1}</span>
        <span class="lesson-row-title">${escHtml(lesson.title ?? '(untitled)')}</span>
        ${lesson.subtitle
          ? `<span class="lesson-row-subtitle">${escHtml(lesson.subtitle)}</span>`
          : ''}
        <div class="lesson-row-actions">
          <button class="promote-btn" data-lesson-edit="${lesson.id}">✏️ Edit</button>
          <button class="promote-btn" data-lesson-move="${lesson.id}" data-direction="up"
                  ${isFirst ? 'disabled' : ''}>↑</button>
          <button class="promote-btn" data-lesson-move="${lesson.id}" data-direction="down"
                  ${isLast ? 'disabled' : ''}>↓</button>
          <button class="promote-btn courses-delete-btn"
                  data-lesson-delete="${lesson.id}">🗑</button>
        </div>
      </div>
    </div>`;
}

/** Renders the "add new lesson" form appended below the existing lesson rows. */
function renderNewLessonForm() {
  return `
    <div class="lesson-row lesson-row-editing" id="lesson-row-new">
      <div class="lesson-editor">
        <div class="course-form-row">
          <label class="course-form-label">
            Title <span style="color:#ef4444">*</span>
          </label>
          <input class="course-form-input" id="lesson-title-new" type="text"
                 placeholder="Lesson title…" />
        </div>
        <div class="course-form-row">
          <label class="course-form-label">Subtitle</label>
          <input class="course-form-input" id="lesson-subtitle-new" type="text"
                 placeholder="Optional short description" />
        </div>
        <div class="course-form-row">
          <label class="course-form-label">HTML content</label>
          <textarea class="lesson-html-input" id="lesson-html-new" rows="12"
                    placeholder="Paste lesson HTML here… (full &lt;html&gt; document or a fragment)"></textarea>
        </div>
        <div class="req-author-actions">
          <button class="promote-btn" data-lesson-preview="new">👁 Preview</button>
          <button class="promote-btn req-publish-btn" data-lesson-save="new">
            ✅ Create lesson
          </button>
          <span style="flex:1"></span>
          <button class="promote-btn" data-lesson-cancel="new">✕ Cancel</button>
        </div>
        <iframe id="lesson-preview-frame-new" class="req-preview-frame"
                hidden sandbox="allow-scripts"></iframe>
      </div>
    </div>`;
}

/**
 * Attaches delegated event listeners to #lessons-list. Must be called
 * after every innerHTML replacement of that element.
 */
function wireCourseLessonActions() {
  const listEl = document.getElementById('lessons-list');
  if (!listEl) return;

  // Edit — expand inline editor for an existing lesson
  listEl.querySelectorAll('[data-lesson-edit]').forEach(btn => {
    btn.addEventListener('click', () => {
      editingLessonId = btn.dataset.lessonEdit;
      refreshLessonsList();
    });
  });

  // Cancel — collapse without saving
  listEl.querySelectorAll('[data-lesson-cancel]').forEach(btn => {
    btn.addEventListener('click', () => {
      editingLessonId = null;
      refreshLessonsList();
    });
  });

  // Save existing lesson or create new one
  listEl.querySelectorAll('[data-lesson-save]').forEach(btn => {
    btn.addEventListener('click', () => handleSaveLesson(btn.dataset.lessonSave));
  });

  // Delete
  listEl.querySelectorAll('[data-lesson-delete]').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteLesson(btn.dataset.lessonDelete));
  });

  // Move up / down
  listEl.querySelectorAll('[data-lesson-move]').forEach(btn => {
    btn.addEventListener('click', () =>
      handleMoveLesson(btn.dataset.lessonMove, btn.dataset.direction)
    );
  });

  // Preview toggle — renders the textarea content into an srcdoc iframe
  listEl.querySelectorAll('[data-lesson-preview]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id       = btn.dataset.lessonPreview;
      const htmlEl   = document.getElementById(`lesson-html-${id}`);
      const frameEl  = document.getElementById(`lesson-preview-frame-${id}`);
      if (!htmlEl || !frameEl) return;
      const nowHidden  = frameEl.hidden;
      frameEl.hidden   = !nowHidden;
      btn.textContent  = nowHidden ? '👁 Hide preview' : '👁 Preview';
      if (nowHidden) frameEl.srcdoc = htmlEl.value;
    });
  });
}

// ── ACTIONS — COURSE EDITOR ───────────────────────────────────────────────

/**
 * Creates a new course doc (editingCourseId === 'new') or updates metadata
 * for an existing one. On creation, transitions editingCourseId to the new
 * document ID so the lessons section becomes visible.
 */
async function handleSaveCourseMeta() {
  const title       = document.getElementById('course-title')?.value.trim();
  const subtitle    = document.getElementById('course-subtitle')?.value.trim() ?? '';
  const icon        = document.getElementById('course-icon')?.value.trim() || '📘';
  const fieldId     = document.getElementById('course-field')?.value || null;
  const requiresAuth = document.getElementById('course-requires-auth')?.checked ?? false;
  const requiresPro  = document.getElementById('course-requires-pro')?.checked  ?? false;

  if (!title) { setStatus('Course title is required.'); return; }

  const saveBtn = document.getElementById('btn-save-course-meta');
  if (saveBtn) saveBtn.disabled = true;
  setStatus('Saving…');

  try {
    if (editingCourseId === 'new') {
      // Create
      const docRef = await addDoc(collection(db, 'courses'), {
        title, subtitle, icon,
        fieldId:      fieldId || null,
        order:        allCourses.length,
        status:       'draft',
        requiresAuth, requiresPro,
        createdBy:    currentAdmin.uid,
        createdAt:    serverTimestamp(),
        updatedAt:    serverTimestamp()
      });
      const newCourse = {
        id: docRef.id, title, subtitle, icon,
        fieldId: fieldId || null,
        order: allCourses.length, status: 'draft',
        requiresAuth, requiresPro
      };
      allCourses.push(newCourse);
      courseLessons[docRef.id] = [];
      editingCourseId = docRef.id;
      setStatus('✓ Course created — add lessons below.');
      renderCourseEditor(); // Re-render now we have a real ID (reveals lessons section)
    } else {
      // Update existing
      await updateDoc(doc(db, 'courses', editingCourseId), {
        title, subtitle, icon, fieldId: fieldId || null, requiresAuth, requiresPro,
        updatedAt: serverTimestamp()
      });
      const course = allCourses.find(c => c.id === editingCourseId);
      if (course) Object.assign(course, { title, subtitle, icon, fieldId: fieldId || null, requiresAuth, requiresPro });
      // Targeted DOM update — keeps the lesson list intact
      const titleEl = document.querySelector('.course-editor-title');
      if (titleEl) titleEl.textContent = `${icon} ${title}`;
      setStatus('✓ Metadata saved.');
      if (saveBtn) saveBtn.disabled = false;
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`);
    if (saveBtn) saveBtn.disabled = false;
  }
}

/**
 * Saves an edited lesson (lessonId is an existing doc ID) or creates a new
 * one (lessonId === 'new'). Updates courseLessons cache in both cases and
 * refreshes the lesson list without touching the metadata form.
 */
async function handleSaveLesson(lessonId) {
  const courseId = editingCourseId;
  const title    = document.getElementById(`lesson-title-${lessonId}`)?.value.trim();
  const subtitle = document.getElementById(`lesson-subtitle-${lessonId}`)?.value.trim() ?? '';
  const html     = document.getElementById(`lesson-html-${lessonId}`)?.value ?? '';

  if (!title) { setStatus('Lesson title is required.'); return; }

  setStatus('Saving lesson…');
  try {
    if (lessonId === 'new') {
      const lessons = courseLessons[courseId] ?? [];
      const docRef  = await addDoc(collection(db, 'courses', courseId, 'lessons'), {
        title, subtitle,
        order:          lessons.length,
        html:           html || null,
        htmlStorageURL: null,
        requiresAuth:   false,
        requiresPro:    false,
        progress:       { type: 'untracked', total: 0 },
        createdAt:      serverTimestamp(),
        updatedAt:      serverTimestamp()
      });
      courseLessons[courseId].push({
        id: docRef.id, title, subtitle, html: html || null,
        order: lessons.length, requiresAuth: false, requiresPro: false
      });
      // Keep the course's updatedAt fresh
      await updateDoc(doc(db, 'courses', courseId), { updatedAt: serverTimestamp() });
      const c = allCourses.find(c => c.id === courseId);
      if (c) c.updatedAt = new Date(); // good-enough local timestamp
    } else {
      await updateDoc(doc(db, 'courses', courseId, 'lessons', lessonId), {
        title, subtitle, html: html || null, updatedAt: serverTimestamp()
      });
      const lesson = (courseLessons[courseId] ?? []).find(l => l.id === lessonId);
      if (lesson) Object.assign(lesson, { title, subtitle, html: html || null });
    }
    editingLessonId = null;
    refreshLessonsList();
    setStatus('✓ Lesson saved.');
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

async function handleDeleteLesson(lessonId) {
  const lesson = (courseLessons[editingCourseId] ?? []).find(l => l.id === lessonId);
  if (!window.confirm(`Delete lesson "${lesson?.title ?? lessonId}"? This cannot be undone.`)) return;
  setStatus('Deleting lesson…');
  try {
    await deleteDoc(doc(db, 'courses', editingCourseId, 'lessons', lessonId));
    courseLessons[editingCourseId] =
      (courseLessons[editingCourseId] ?? []).filter(l => l.id !== lessonId);
    // Re-normalize order so numbers stay gapless
    await Promise.all(
      (courseLessons[editingCourseId] ?? []).map((l, i) =>
        updateDoc(doc(db, 'courses', editingCourseId, 'lessons', l.id), { order: i })
      )
    );
    (courseLessons[editingCourseId] ?? []).forEach((l, i) => { l.order = i; });
    if (editingLessonId === lessonId) editingLessonId = null;
    refreshLessonsList();
    setStatus('✓ Lesson deleted.');
  } catch (err) { setStatus(`Error: ${err.message}`); }
}

async function handleMoveLesson(lessonId, direction) {
  const lessons = courseLessons[editingCourseId] ?? [];
  const idx     = lessons.findIndex(l => l.id === lessonId);
  const swap    = direction === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= lessons.length) return;
  [lessons[idx], lessons[swap]] = [lessons[swap], lessons[idx]];
  setStatus('Saving lesson order…');
  try {
    await Promise.all(
      lessons.map((l, i) =>
        updateDoc(doc(db, 'courses', editingCourseId, 'lessons', l.id), { order: i })
      )
    );
    lessons.forEach((l, i) => { l.order = i; });
    setStatus('✓ Order saved.');
  } catch (err) { setStatus(`Error: ${err.message}`); }
  refreshLessonsList();
}

// ── SEARCH ────────────────────────────────────────────────────────────────

function wireSearch() {
  document.getElementById('search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allUsers.filter(u =>
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
    renderTable(filtered);
  });
}

// ── UTIL ─────────────────────────────────────────────────────────────────

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

function escHtml(str = '') {
  return str.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function redirectToLogin() {
  window.location.href = '../../index.html';
}