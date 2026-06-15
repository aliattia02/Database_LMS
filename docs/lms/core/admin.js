// lms/core/admin.js
// Runs only in lms/admin/index.html. Never imported by app.js.
//
// SDK version pin: 10.12.0 — keep in sync with auth.js / db.js. Import
// specifiers must be static string literals (see note in auth.js).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { FIREBASE_CONFIG } from './firebase-config.js';
import { LMS_CONFIG } from './registry.js';

// ── Initialise Firebase app ────────────────────────────────────────────────
const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── CONSTANTS ────────────────────────────────────────────────────────────
const MODULE_IDS    = LMS_CONFIG.modules.map(m => m.id);
const MODULE_TITLES = Object.fromEntries(LMS_CONFIG.modules.map(m => [m.id, m.title]));
const ACCESS_MODE   = LMS_CONFIG.accessControl?.mode ?? 'open';

// ── STATE ────────────────────────────────────────────────────────────────
let currentAdmin = null;
let allUsers     = [];   // [{ uid, displayName, email, photoURL }]
let accessCache  = {};   // { [uid]: { [moduleId]: true|false|undefined } | null }

// ── BOOT ─────────────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (!user) { redirectToLogin(); return; }

  const profileSnap = await getDoc(doc(db, 'users', user.uid));
  if (!profileSnap.exists() || profileSnap.data().role !== 'admin') {
    document.body.innerHTML = '<p style="padding:40px;color:#ef4444">Access denied. Admin only.</p>';
    return;
  }

  currentAdmin = user;
  await loadUsers();
  renderTable(allUsers);
  renderAccessModeBanner();
  wireSearch();

  // Wire the table's delegated click handler ONCE — renderTable() is called
  // repeatedly (every search keystroke) and must not re-attach this listener
  // each time, or handlers fire multiple times per click (see Bug #6).
  document.getElementById('user-rows').addEventListener('click', handleTableClick);
});

// ── DATA ─────────────────────────────────────────────────────────────────

async function loadUsers() {
  const snap = await getDocs(collection(db, 'userIndex'));
  allUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));

  // Pre-load access maps for all users in parallel
  const accessPromises = allUsers.map(async (u) => {
    const aSnap = await getDoc(doc(db, 'users', u.uid, 'access', 'modules'));
    accessCache[u.uid] = aSnap.exists() ? aSnap.data() : null;
  });
  await Promise.all(accessPromises);
}

// ── RENDER ───────────────────────────────────────────────────────────────

// Builds the grouped module-toggle HTML for a single user.
// Modules are grouped by field. Modules in multiple fields appear under each.
// Modules not in any field fall into an "Other modules" catch-all group.
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
    const tr = document.createElement('tr');
    tr.dataset.uid = user.uid;

    tr.innerHTML = `
      <td>
        <strong>${escHtml(user.displayName || '(no name)')}</strong>
      </td>
      <td>${escHtml(user.email)}</td>
      <td>
        <span class="role-label" id="role-${user.uid}">loading…</span>
        <button class="promote-btn" data-uid="${user.uid}" title="Toggle admin role">⬆ promote</button>
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
    loadRoleLabel(user.uid);
  });
}

function renderChip(uid, moduleId, accessMap) {
  let state;
  if (accessMap === null || accessMap[moduleId] === undefined) {
    state = ACCESS_MODE === 'open' ? 'granted' : 'revoked';  // platform default
  } else {
    state = accessMap[moduleId] ? 'granted' : 'revoked';
  }
  const isExplicit = accessMap !== null && accessMap[moduleId] !== undefined;
  return `<button
    class="toggle-chip ${state}"
    data-uid="${uid}"
    data-module="${moduleId}"
    data-state="${state}"
    title="${isExplicit ? 'Explicit' : 'Default (' + ACCESS_MODE + ')'}"
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

// ── ACTIONS ──────────────────────────────────────────────────────────────

async function handleTableClick(e) {
  const chip       = e.target.closest('.toggle-chip');
  const actionBtn  = e.target.closest('[data-action]');
  const promoteBtn = e.target.closest('.promote-btn:not([data-action])');

  if (chip) {
    await handleChipToggle(chip);
  } else if (actionBtn) {
    // fieldId is set only for grant-field / revoke-field buttons
    await handleBulkAction(
      actionBtn.dataset.uid,
      actionBtn.dataset.action,
      actionBtn.dataset.field ?? null
    );
  } else if (promoteBtn) {
    await handlePromote(promoteBtn.dataset.uid);
  }
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
    // Update cache
    if (!accessCache[uid]) accessCache[uid] = {};
    accessCache[uid][moduleId] = newState;

    // Re-render just this chip
    chip.className = `toggle-chip ${newState ? 'granted' : 'revoked'}`;
    chip.dataset.state = newState ? 'granted' : 'revoked';
    setStatus(`✓ Updated.`);
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
      // Only touch modules belonging to the target field — other fields unaffected
      const field = LMS_CONFIG.fields?.find(f => f.id === fieldId);
      if (!field) { setStatus('Field not found.'); return; }
      const granted  = action === 'grant-field';
      const updates  = Object.fromEntries(field.moduleIds.map(id => [id, granted]));
      await setDoc(
        doc(db, 'users', uid, 'access', 'modules'),
        updates,
        { merge: true }   // ← merge: other fields' modules are untouched
      );
      if (!accessCache[uid]) accessCache[uid] = {};
      Object.assign(accessCache[uid], updates);
      setStatus(`✓ ${field.title} ${granted ? 'granted' : 'revoked'}.`);
      document.getElementById(`toggles-${uid}`).innerHTML =
        renderModuleTogglesForUser(uid, accessCache[uid]);
      return;   // early return — re-render already done above
    }

    // Re-render the full toggle group for this user
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
    const snap = await getDoc(doc(db, 'users', uid));
    const current = snap.data()?.role;
    const newRole = current === 'admin' ? 'user' : 'admin';
    await updateDoc(doc(db, 'users', uid), { role: newRole });
    document.getElementById(`role-${uid}`).textContent = newRole;
    setStatus(`✓ Role set to "${newRole}".`);
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

async function loadRoleLabel(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  const role = snap.data()?.role || 'user';
  const el = document.getElementById(`role-${uid}`);
  if (el) el.textContent = role;
}

// ── SEARCH ───────────────────────────────────────────────────────────────

function wireSearch() {
  document.getElementById('search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = allUsers.filter(u =>
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
    renderTable(filtered);
  });
}

// ── UTIL ─────────────────────────────────────────────────────────────────

function setStatus(msg) {
  document.getElementById('status').textContent = msg;
}

function escHtml(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
  );
}

function redirectToLogin() {
  window.location.href = '../../index.html';
}