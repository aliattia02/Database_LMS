// lms/core/admin.js
// Runs only in lms/admin/index.html. Never imported by app.js.
//
// SDK version pin: 10.12.0 — keep in sync with auth.js / db.js.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { FIREBASE_CONFIG } from './firebase-config.js';
import { LMS_CONFIG } from './registry.js';

// ── Initialise Firebase ────────────────────────────────────────────────────
const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── CONSTANTS ────────────────────────────────────────────────────────────
const MODULE_IDS    = LMS_CONFIG.modules.map(m => m.id);
const MODULE_TITLES = Object.fromEntries(LMS_CONFIG.modules.map(m => [m.id, m.title]));
const ACCESS_MODE   = LMS_CONFIG.accessControl?.mode ?? 'open';

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
let currentAdmin  = null;
let allUsers      = [];
let accessCache   = {};   // { [uid]: { [moduleId]: true|false|undefined } | null }
let profileCache  = {};   // { [uid]: { role, tier, ... } }
let tiersCache    = {};   // { [tierId]: { [moduleId]: boolean } }

// ── BOOT ─────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (!user) { redirectToLogin(); return; }

  const profileSnap = await getDoc(doc(db, 'users', user.uid));
  if (!profileSnap.exists() || profileSnap.data().role !== 'admin') {
    document.body.innerHTML = '<p style="padding:40px;color:#ef4444">Access denied. Admin only.</p>';
    return;
  }

  currentAdmin = user;

  // Load users and tiers in parallel
  await Promise.all([loadUsers(), loadTiers()]);

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
  const snap = await getDocs(collection(db, 'tiers'));
  tiersCache = {};
  snap.docs.forEach(d => { tiersCache[d.id] = d.data(); });
}

// ── RENDER — USERS TAB ───────────────────────────────────────────────────

function renderModuleTogglesForUser(uid, accessMap) {
  const fields = LMS_CONFIG.fields ?? [];
  const fieldedModuleIds = new Set(fields.flatMap(f => f.moduleIds));
  let html = '';

  fields.forEach(field => {
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

function renderChip(uid, moduleId, accessMap) {
  let state;
  if (accessMap === null || accessMap[moduleId] === undefined) {
    state = ACCESS_MODE === 'open' ? 'granted' : 'revoked';
  } else {
    state = accessMap[moduleId] ? 'granted' : 'revoked';
  }
  const isExplicit = accessMap !== null && accessMap[moduleId] !== undefined;
  return `<button
    class="toggle-chip ${state}"
    data-uid="${uid}"
    data-module="${moduleId}"
    data-state="${state}"
    title="${isExplicit ? 'Explicit override' : 'Default (' + ACCESS_MODE + ')'}"
  >${MODULE_TITLES[moduleId]}${isExplicit ? '' : ' *'}</button>`;
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
  let togglesHtml = '';

  fields.forEach(field => {
    togglesHtml += `
      <div class="tier-field-group">
        <div class="tier-field-label">${field.icon ?? ''} ${field.title}</div>
        <div class="module-toggle">
          ${field.moduleIds.map(mid => renderTierChip(tierDef.id, mid, access)).join('')}
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

function renderTierChip(tierId, moduleId, access) {
  const granted = access[moduleId] === true;
  return `<button
    class="tier-chip toggle-chip ${granted ? 'granted' : 'revoked'}"
    data-tier="${tierId}"
    data-module="${moduleId}"
    data-state="${granted ? 'granted' : 'revoked'}">
    ${MODULE_TITLES[moduleId]}
  </button>`;
}

/** Local toggle only — Firestore is written on Save. */
function toggleTierChip(chip) {
  const newState = chip.dataset.state === 'granted' ? 'revoked' : 'granted';
  chip.dataset.state = newState;
  chip.className = `tier-chip toggle-chip ${newState}`;
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
      // Render lazily on first visit (or re-render to pick up any tier saves)
      if (tab === 'categories') renderCategoriesTab();
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

    chip.className   = `toggle-chip ${newState ? 'granted' : 'revoked'}`;
    chip.dataset.state = newState ? 'granted' : 'revoked';
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
      const updates = Object.fromEntries(field.moduleIds.map(id => [id, granted]));
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

// ── SEARCH ───────────────────────────────────────────────────────────────

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