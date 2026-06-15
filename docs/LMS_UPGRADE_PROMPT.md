# LMS Platform — Upgrade Implementation Prompt

> **Purpose:** This document is a complete implementation brief for upgrading the LMS Platform. Feed it directly to an AI coding assistant (e.g. Claude, Cursor, Copilot) and work through the phases in order. Each phase is independently deployable.

---

## Project Snapshot

The current LMS is a static site (GitHub Pages compatible) with:
- `index.html` — iframe shell
- `lms/core/app.js` — navigation and progress runtime
- `lms/core/registry.js` — single source of truth for modules/lessons
- `lms/core/styles.css` — shared shell styles
- Per-lesson HTML files in `lms/modules/<module-id>/lessons/`
- Progress stored in `localStorage` per lesson via `storageKey` values defined in the registry

**Do not break any of this.** All upgrades must remain backward-compatible with existing lessons and progress data.

---

## Upgrade Scope

| # | Feature | Priority |
|---|---|---|
| 0 | **Fields hierarchy** — top-level grouping above modules; landing page shows field cards; a module can appear in multiple fields | P0 |
| 1 | **Generify the platform** — remove DB/interview-specific hardcoding | P0 |
| 2 | **Multilingual support** — English embedded in HTML, Arabic as override | P0 |
| 3 | **Auth** — Google Sign In + email/password | P1 |
| 4 | **Cross-device progress sync** — Firestore replaces/augments localStorage for signed-in users | P1 |
| 5 | **Personalised lessons** — AI-generated content gated for signed-in or paying users | P2 |
| 6 | **User tier system** — free vs pro, used to gate personalised lessons | P2 |
| 7 | **Admin authorization** — admin can grant/revoke per-user access at field level (shortcut) or module level (granular); unauthorized modules hidden | P1 |

---

## Architecture Decisions (Non-Negotiable)

### BaaS: Firebase
Auth + cloud persistence on a zero-server static site requires a BaaS. Use **Firebase** (not Supabase, not Auth0). Reasons:
- Google Sign In is a first-class Firebase primitive — no extra OAuth wiring.
- `firebase/auth` handles email/password natively.
- Firestore replaces localStorage for signed-in users with no schema migrations.
- Firebase Hosting integrates with GitHub Pages workflows.
- Free Spark tier is sufficient until real users arrive.

**SDK:** Use the **Firebase JS SDK v10+ (modular/tree-shakeable)** loaded from CDN in `index.html`. Do **not** bundle — the platform is still a static site.

```html
<!-- In index.html <head> — load Firebase modular SDK from CDN -->
<script type="module">
  import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js';
  import { getAuth } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-auth.js';
  import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js';
  // ... expose on window for app.js to import
</script>
```

### Firebase config
Create `lms/core/firebase-config.js` with the project's public config object. This file is safe to commit (Firebase API keys are not secrets — security is enforced by Firestore rules).

```js
// lms/core/firebase-config.js
export const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

---

## Phase 0 — Fields Hierarchy

**Goal:** Introduce a `fields` layer above modules. The first screen the user sees is a full-page card grid of fields. Clicking a field enters the existing module+lesson shell, scoped only to that field's modules. Modules can be shared across multiple fields — their progress data is shared too (a lesson completed in "Backend" also advances it in "Data Science"). The entire feature degrades gracefully: if `LMS_CONFIG.fields` is absent or empty, the shell loads directly showing all modules, unchanged from today.

---

### Registry additions

Add a top-level `fields` array to `LMS_CONFIG`. **Modules remain exactly as defined** — fields reference them by ID, they do not own them.

```js
export const LMS_CONFIG = {
  appName: 'LMS Platform',
  storagePrefix: 'lms',
  accessControl: { mode: 'open' },

  fields: [                              // NEW — optional; omit for backward compat
    {
      id: 'backend',                     // lowercase kebab-case, stable slug
      title: 'Backend Development',
      subtitle: 'Databases, server logic, and infrastructure',
      icon: '🗄️',                        // emoji shown on the field card
      theme: {
        accent: '#2563eb',
        accentSoft: '#dbeafe'
      },
      moduleIds: ['database', 'python']  // ordered list of module IDs in this field
    },
    {
      id: 'frontend',
      title: 'Frontend Development',
      subtitle: 'Web components, state management, and mobile',
      icon: '⚛️',
      theme: {
        accent: '#0369a1',
        accentSoft: '#e0f2fe'
      },
      moduleIds: ['react', 'react-native', 'python']
      // python appears here AND in backend — its progress is the same either way
    }
  ],

  modules: [ /* unchanged */ ]
};
```

**Field contract rules:**
- `id` is a stable slug. Renaming after users have progress orphans nothing (fields don't own storage), but breaks bookmarks.
- `moduleIds` is a reference list, not ownership. Order determines sidebar display order inside the shell.
- A module can appear in zero, one, or many fields. A module with no field reference is only reachable if the platform has no `fields` array at all.
- `theme` on a field overrides the shell's accent colours while that field is active, the same way a module's theme does today.

---

### View state machine in `app.js`

Add `activeFieldId` alongside the existing state variables:

```js
let activeFieldId  = null;   // null  → show fields landing
let activeModuleId = null;   // null  → no module selected in shell
let activeLessonId = null;
```

The `render()` function becomes a router:

```js
function render() {
  const hasFields = (LMS_CONFIG.fields?.length ?? 0) > 0;
  if (hasFields && activeFieldId === null) {
    renderFieldsLanding();
  } else {
    renderShell();
  }
}
```

**Entering and leaving a field:**

```js
function enterField(fieldId) {
  activeFieldId  = fieldId;
  activeModuleId = null;
  activeLessonId = null;
  frame.src      = '';
  frame.classList.remove('visible');
  welcome.classList.remove('hidden');
  render();
}

function exitToFields() {
  activeFieldId  = null;
  activeModuleId = null;
  activeLessonId = null;
  render();
}
```

**`getActiveFieldModules()`** — the key scoping helper. Every function that previously used `visibleModules` (or `LMS_CONFIG.modules`) directly now calls this instead:

```js
function getActiveFieldModules() {
  if (!activeFieldId) return visibleModules;           // no field selected → all visible
  const field = LMS_CONFIG.fields?.find(f => f.id === activeFieldId);
  if (!field) return visibleModules;
  // Preserves field's display order; drops modules the user has no access to
  return field.moduleIds
    .map(id => visibleModules.find(m => m.id === id))
    .filter(Boolean);
}
```

Replace every use of `visibleModules` (and any remaining `LMS_CONFIG.modules`) in `renderModuleNav`, `renderLessonNav`, `computeGlobalProgress`, and `resetAllProgress` with `getActiveFieldModules()`.

---

### `index.html` structural change

Wrap the existing `.app-shell` div and add a sibling `#fields-landing` section. Both are top-level children of `<body>`:

```html
<body>

  <!-- ① Fields landing — shown when activeFieldId is null -->
  <div id="fields-landing" class="fields-landing">
    <header class="fields-header">
      <h1 id="fields-brand">LMS<span>·Platform</span></h1>
      <p id="fields-tagline" data-i18n="fields.tagline">Choose a field to begin</p>
    </header>
    <div id="fields-grid" class="fields-grid">
      <!-- field cards injected by renderFieldsLanding() -->
    </div>
  </div>

  <!-- ② Module/lesson shell — hidden until a field is picked -->
  <div id="app-shell" class="app-shell" hidden>

    <aside class="sidebar">

      <!-- Back button — NEW, top of sidebar -->
      <button id="btn-back-fields" class="back-btn" type="button">
        ← <span data-i18n="shell.backToFields">Fields</span>
      </button>

      <!-- All existing sidebar content below — unchanged -->
      <div class="brand"> ... </div>
      <section class="panel-block"> ... module nav ... </section>
      <section class="panel-block"> ... lesson nav ... </section>
      <section class="panel-block stats-block"> ... progress bars ... </section>
      <!-- auth panel (Phase 3) -->
      <button id="reset-progress" class="danger-btn" type="button">Reset all progress</button>

    </aside>

    <main class="main">
      <!-- unchanged -->
    </main>

  </div>

  <script type="module" src="lms/core/app.js"></script>
</body>
```

Wire the back button in `app.js`:
```js
document.getElementById('btn-back-fields').addEventListener('click', exitToFields);
```

---

### `renderFieldsLanding()` in `app.js`

```js
function renderFieldsLanding() {
  document.getElementById('fields-landing').hidden = false;
  document.getElementById('app-shell').hidden      = true;

  const grid = document.getElementById('fields-grid');
  grid.innerHTML = '';

  (LMS_CONFIG.fields || []).forEach(field => {

    // Aggregate progress across this field's accessible modules
    const fieldModules = field.moduleIds
      .map(id => visibleModules.find(m => m.id === id))
      .filter(Boolean);

    const totals = fieldModules.reduce((acc, mod) => {
      const p = computeModuleProgress(mod);
      return { done: acc.done + p.done, total: acc.total + p.total };
    }, { done: 0, total: 0 });
    const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;

    // A field is locked when the user has access to none of its modules
    const isLocked = fieldModules.length === 0;

    const card = document.createElement('button');
    card.type      = 'button';
    card.className = `field-card${isLocked ? ' locked' : ''}`;
    card.style.setProperty('--field-accent', field.theme?.accent     ?? 'var(--accent)');
    card.style.setProperty('--field-soft',   field.theme?.accentSoft ?? 'var(--accent-soft)');

    card.innerHTML = `
      <div class="field-card-icon">${field.icon ?? '📚'}</div>
      <div class="field-card-body">
        <strong class="field-card-title">${field.title}</strong>
        <p    class="field-card-sub">${field.subtitle}</p>
        <div  class="field-card-meta">
          <span>${fieldModules.length} ${t('field.modules', 'modules')}</span>
          <span class="field-card-pct">${pct}% ${t('field.complete', 'complete')}</span>
        </div>
        <div class="field-card-bar">
          <div class="field-card-fill" style="width:${pct}%"></div>
        </div>
      </div>
      ${isLocked ? `<div class="field-locked-badge" title="${t('field.locked','No access')}">🔒</div>` : ''}
    `;

    if (!isLocked) card.addEventListener('click', () => enterField(field.id));
    grid.appendChild(card);
  });
}

function renderShell() {
  document.getElementById('fields-landing').hidden = true;
  document.getElementById('app-shell').hidden      = false;

  // Apply the active field's theme (overrides module theme until a module is selected)
  const field = LMS_CONFIG.fields?.find(f => f.id === activeFieldId);
  if (field?.theme) updateTheme(field);

  renderModuleNav();
  renderHeader();
  renderLessonNav();
  renderProgressBars();
  const mod = getActiveFieldModules().find(m => m.id === activeModuleId);
  if (mod?.theme) updateTheme(mod);  // module theme wins once a module is active
}
```

---

### CSS additions in `styles.css`

```css
/* ── FIELDS LANDING ──────────────────────────────────────────────────────── */
.fields-landing {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 24px 40px;
}

.fields-header {
  text-align: center;
  margin-bottom: 44px;
}
.fields-header h1 {
  font-size: 34px;
  font-weight: 800;
  margin: 0 0 10px;
  color: var(--text);
}
.fields-header h1 span { color: var(--accent); }
.fields-header p {
  font-size: 15px;
  color: var(--muted);
  margin: 0;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 980px;
}

/* ── FIELD CARD ──────────────────────────────────────────────────────────── */
.field-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
  transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
}
/* accent stripe at top */
.field-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: var(--field-accent, var(--accent));
  border-radius: 14px 14px 0 0;
}
.field-card:hover:not(.locked) {
  transform: translateY(-3px);
  box-shadow: 0 10px 28px rgba(0,0,0,.09);
  border-color: var(--field-accent, var(--accent));
}
.field-card.locked {
  opacity: .55;
  cursor: not-allowed;
}

.field-card-icon { font-size: 34px; line-height: 1; }
.field-card-body { flex: 1; }
.field-card-title {
  display: block;
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 5px;
}
.field-card-sub {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.55;
  margin: 0 0 12px;
}
.field-card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 7px;
}
.field-card-pct {
  font-weight: 700;
  color: var(--field-accent, var(--accent));
}
.field-card-bar {
  height: 4px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}
.field-card-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--field-accent, var(--accent));
  transition: width .4s ease;
}
.field-locked-badge {
  position: absolute;
  top: 14px; right: 14px;
  font-size: 15px;
}

/* ── BACK BUTTON ─────────────────────────────────────────────────────────── */
.back-btn {
  border: none;
  background: none;
  color: var(--muted);
  font-size: 13px;
  padding: 2px 0 10px;
  text-align: left;
  cursor: pointer;
  transition: color .15s;
  display: block;
  width: 100%;
}
.back-btn:hover { color: var(--accent); }

/* ── FIELDS LANDING RESPONSIVE ───────────────────────────────────────────── */
@media (max-width: 600px) {
  .fields-landing { padding: 32px 16px 28px; }
  .fields-header h1 { font-size: 26px; }
  .fields-grid { grid-template-columns: 1fr; gap: 14px; }
  .field-card { padding: 18px; }
}

/* RTL support for fields */
[dir="rtl"] .field-card { text-align: right; }
[dir="rtl"] .field-card-meta { flex-direction: row-reverse; }
[dir="rtl"] .field-locked-badge { left: 14px; right: auto; }
[dir="rtl"] .back-btn { text-align: right; }
```

---

### `access.js` — field-aware additions

Append these helpers to the existing `access.js`:

```js
// Returns all fields, annotated with how many of their modules the user can access.
// Fields where accessibleModuleCount === 0 are locked.
export async function getAccessibleFields(uid) {
  const visible    = await getVisibleModules(uid);
  const visibleIds = new Set(visible.map(m => m.id));

  return (LMS_CONFIG.fields ?? []).map(field => {
    const accessibleModuleCount =
      field.moduleIds.filter(id => visibleIds.has(id)).length;
    return { ...field, accessibleModuleCount, isLocked: accessibleModuleCount === 0 };
  });
}

// Returns only the modules the user can access within a specific field,
// preserving the field's display order.
export async function getVisibleModulesForField(uid, fieldId) {
  const field = LMS_CONFIG.fields?.find(f => f.id === fieldId);
  if (!field) return [];
  const visible    = await getVisibleModules(uid);
  const visibleIds = new Set(visible.map(m => m.id));
  return field.moduleIds
    .map(id => LMS_CONFIG.modules.find(m => m.id === id))
    .filter(mod => mod && visibleIds.has(mod.id));
}
```

---

### i18n keys added for fields

Add to `lms/i18n/ar.js`:

```js
// Append to the existing translations object:
'fields.tagline':      'اختر مجالاً للبدء',
'field.modules':       'وحدات',
'field.complete':      'مكتمل',
'field.locked':        'لا يوجد وصول',
'shell.backToFields':  'المجالات',
```

---

## Phase 1 — Generify the Platform

**Goal:** Remove every hardcoded reference to "Database", interview prep, or the specific DB module from the shell files. The shell must be content-neutral.

### Changes required

**`index.html`**
- Change `<title>` to read from `LMS_CONFIG.appName` at runtime (set by `app.js` after load).
- Change the `<p>` brand subtitle from `"Database · Python · React · React Native"` to be dynamically rendered from the registered module titles.
- Remove the hardcoded welcome panel copy. Replace with a generic message rendered from `LMS_CONFIG.welcome` (add this optional field to the registry contract — see below).

**`registry.js` — extended contract**
Add two optional top-level fields to `LMS_CONFIG`:

```js
export const LMS_CONFIG = {
  appName: 'LMS Platform',          // existing
  storagePrefix: 'lms',             // existing
  welcome: {                        // NEW — optional
    heading: 'Your learning platform',
    body: 'Select a module to begin.'
  },
  modules: [ /* ... unchanged ... */ ]
};
```

`app.js` renders `LMS_CONFIG.welcome.heading` and `LMS_CONFIG.welcome.body` into the welcome panel if the fields are present; falls back to the current hardcoded strings if absent (backward compat).

**`app.js`**
- Render `<title>` from `LMS_CONFIG.appName`.
- Render the brand subtitle by joining active module titles: `modules.map(m => m.title).join(' · ')`.
- Render the welcome panel from `LMS_CONFIG.welcome` if present.

**No changes to lesson HTML files** — lesson content is module-owned and appropriately specific.

---

## Phase 2 — Multilingual Support (i18n)

### Design contract (read carefully — this is the most specific part)

**English is the source of truth. It lives inside the files themselves.** There is no `en.js` translation file. The HTML and JS files are authored in English by default.

**Translated languages** (starting with Arabic, `ar`) are stored in separate override files:
```
lms/
  i18n/
    ar.js      ← Arabic overrides
    fr.js      ← (future)
    de.js      ← (future)
```

**When content changes:** update the original HTML/JS file (English) AND the relevant language override file(s). Never create or maintain a separate English file.

**When a new language is added:** create a new `lms/i18n/<lang>.js` file. No other files need changing.

### How the system works

#### 1. Marking translatable strings

In any shell HTML or JS-rendered string, mark translatable content with a `data-i18n` attribute using a dot-notation key:

```html
<!-- index.html -->
<h3 id="welcome-heading" data-i18n="welcome.heading">Your learning platform</h3>
<p id="welcome-body" data-i18n="welcome.body">Select a module to begin.</p>
<button id="reset-progress" data-i18n="shell.resetButton">Reset all progress</button>
```

For JS-rendered content (nav buttons, progress labels), use a helper function:

```js
// lms/core/i18n.js
export function t(key, fallback) {
  return window.__LMS_TRANSLATIONS__?.[key] ?? fallback;
}
```

Usage in `app.js`:
```js
import { t } from './i18n.js';
// ...
btn.querySelector('small').textContent = t('lesson.referenceLabel', 'Reference');
```

#### 2. Override file format

```js
// lms/i18n/ar.js
export const translations = {
  'welcome.heading':      'منصة التعلم الخاصة بك',
  'welcome.body':         'اختر وحدة للبدء.',
  'shell.resetButton':    'إعادة تعيين جميع التقدم',
  'lesson.referenceLabel':'مرجع',
  'progress.complete':    '٪ مكتمل',
  // ... only keys that differ from the English default
};
```

#### 3. Language loader

Create `lms/core/i18n.js`:

```js
// lms/core/i18n.js

const SUPPORTED_LANGS = ['en', 'ar'];
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
```

#### 4. Startup sequence in `app.js`

```js
import { loadLanguage, applyTranslations } from './i18n.js';

// Read persisted language preference (from localStorage or Firestore user profile)
const savedLang = localStorage.getItem('lms_lang') || 'en';
await loadLanguage(savedLang);

// After render(), apply translations to all shell elements
render();
applyTranslations();
```

#### 5. Language switcher UI

Add a minimal language switcher to the shell sidebar:

```html
<!-- index.html, inside .sidebar, below .brand -->
<div class="lang-switcher">
  <button data-lang="en" class="lang-btn active">EN</button>
  <button data-lang="ar" class="lang-btn">AR</button>
</div>
```

On click: call `loadLanguage(lang)`, persist to `localStorage.setItem('lms_lang', lang)` (and to Firestore user profile if signed in — see Phase 3), then call `applyTranslations()` and re-render dynamic content.

#### 6. Lesson HTML files and i18n

Lesson files are **standalone HTML pages** and do NOT share the shell's i18n loader. Translating lesson content is a **separate concern**:

- Lesson files can optionally include their own inline `data-i18n` attributes and a lightweight inline `<script>` that reads `window.parent.__LMS_TRANSLATIONS__` if it exists (shell is same origin).
- Or, if the lesson is authored with translations: include a `<script>` block at the bottom of the lesson that applies overrides based on `localStorage.getItem('lms_lang')`.
- For Phase 2, **only shell strings need translation**. Lesson translation is out of scope and should be tackled per-module.

#### 7. RTL layout support

Add to `styles.css`:

```css
/* RTL support */
[dir="rtl"] .sidebar {
  border-right: none;
  border-left: 1px solid var(--border);
  order: 2;  /* push sidebar to the right in grid */
}
[dir="rtl"] .app-shell {
  grid-template-columns: 1fr 300px;
}
[dir="rtl"] .nav-btn { text-align: right; }
[dir="rtl"] .stat-row { flex-direction: row-reverse; }
```

---

## Phase 3 — Authentication (Google Sign In + Email)

### Auth flow overview

```
User visits index.html
  │
  ├── Not signed in → show sign-in panel in sidebar (Google button + email form)
  │                   Progress still works via localStorage (anonymous mode)
  │
  └── Signed in     → show user avatar/name in sidebar
                      Progress syncs to Firestore (see Phase 4)
                      Personalised lessons unlocked if tier === 'pro'
```

### New file: `lms/core/auth.js`

```js
// lms/core/auth.js
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-auth.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js';
import { FIREBASE_CONFIG } from './firebase-config.js';
import { ensureUserDocument } from './db.js';

const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  await ensureUserDocument(result.user);
  return result.user;
}

export async function signUpWithEmail(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await ensureUserDocument(result.user);
  return result.user;
}

export async function signInWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export function signOutUser() {
  return signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}
```

### New file: `lms/core/db.js`

Handles all Firestore reads/writes:

```js
// lms/core/db.js
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js';

export const db = getFirestore();

// Firestore document structure:
// users/{uid}/
//   profile: { displayName, email, tier, lang, createdAt, lastSeen }
//   progress/{storageKey}: { <checkboxKey>: true/false, ... }

export async function ensureUserDocument(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: user.displayName || '',
      email: user.email || '',
      tier: 'free',         // 'free' | 'pro'
      lang: localStorage.getItem('lms_lang') || 'en',
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp()
    });
  } else {
    await updateDoc(ref, { lastSeen: serverTimestamp() });
  }
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function getLessonProgress(uid, storageKey) {
  const snap = await getDoc(doc(db, 'users', uid, 'progress', storageKey));
  return snap.exists() ? snap.data() : {};
}

export async function setLessonProgress(uid, storageKey, data) {
  await setDoc(doc(db, 'users', uid, 'progress', storageKey), data, { merge: true });
}

export async function clearAllProgress(uid) {
  // Firestore doesn't support collection deletion client-side.
  // Set all known storageKeys to empty objects instead.
  // Pass storageKeys array from registry.
}

export async function updateUserLang(uid, lang) {
  await updateDoc(doc(db, 'users', uid), { lang });
}

// ── ACCESS CONTROL ────────────────────────────────────────────────────────

// Returns the moduleAccess map for a user, e.g. { database: true, python: false }
// Returns null when no access document exists (means "not configured" — see Phase 6).
export async function getModuleAccess(uid) {
  const snap = await getDoc(doc(db, 'users', uid, 'access', 'modules'));
  return snap.exists() ? snap.data() : null;
}

// Admin: write the full access map for a user (overwrites).
export async function setModuleAccess(uid, accessMap) {
  await setDoc(doc(db, 'users', uid, 'access', 'modules'), accessMap);
}

// Admin: toggle a single module on or off for a user.
export async function toggleModuleAccess(uid, moduleId, granted) {
  await setDoc(
    doc(db, 'users', uid, 'access', 'modules'),
    { [moduleId]: granted },
    { merge: true }
  );
}

// Admin: fetch all users from the public userIndex collection.
export async function getAllUsers() {
  const { collection, getDocs } = await import(
    'https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js'
  );
  const snap = await getDocs(collection(db, 'userIndex'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// Called on every sign-in: write basic info to userIndex so the admin
// panel can enumerate all registered accounts without querying auth.
export async function upsertUserIndex(user) {
  await setDoc(doc(db, 'userIndex', user.uid), {
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || ''
  }, { merge: true });
}
```

### Auth UI in `index.html`

Add an auth section to the sidebar **above** the reset button:

```html
<!-- Auth panel — toggled by app.js based on auth state -->
<section id="auth-panel" class="panel-block">
  <!-- Signed-out view -->
  <div id="auth-signed-out">
    <div class="panel-title" data-i18n="auth.signInTitle">Sign in to sync progress</div>
    <button id="btn-google-signin" class="auth-btn google-btn" type="button">
      <svg><!-- Google G icon SVG --></svg>
      <span data-i18n="auth.googleButton">Continue with Google</span>
    </button>
    <div class="auth-divider" data-i18n="auth.orDivider">or</div>
    <input id="auth-email" type="email" placeholder="Email" autocomplete="email" />
    <input id="auth-password" type="password" placeholder="Password" autocomplete="current-password" />
    <div class="auth-actions">
      <button id="btn-email-signin" type="button" data-i18n="auth.signInButton">Sign in</button>
      <button id="btn-email-signup" type="button" data-i18n="auth.signUpButton">Sign up</button>
    </div>
    <p id="auth-error" class="auth-error" hidden></p>
  </div>

  <!-- Signed-in view -->
  <div id="auth-signed-in" hidden>
    <div class="auth-user">
      <img id="auth-avatar" src="" alt="" class="auth-avatar" />
      <span id="auth-display-name"></span>
      <span id="auth-tier-badge" class="tier-badge"></span>
    </div>
    <button id="btn-signout" type="button" class="danger-btn" data-i18n="auth.signOut">Sign out</button>
  </div>
</section>
```

### Auth styles in `styles.css`

```css
/* ── AUTH PANEL ───────────────────────────────────────────────────────────── */
.auth-btn {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 9px 12px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface);
  cursor: pointer; font-size: 13px; font-weight: 500;
  transition: background .15s, border-color .15s;
}
.auth-btn:hover { background: var(--accent-soft); border-color: var(--accent); }
.auth-divider { text-align: center; color: var(--muted); font-size: 11px; margin: 6px 0; }
#auth-email, #auth-password {
  width: 100%; padding: 8px 10px; border-radius: 6px;
  border: 1px solid var(--border); font-size: 13px;
  background: var(--surface); color: var(--text);
  margin-bottom: 6px;
}
.auth-actions { display: flex; gap: 6px; }
.auth-actions button {
  flex: 1; padding: 8px; border-radius: 6px; cursor: pointer;
  font-size: 12px; border: 1px solid var(--border);
  background: var(--accent); color: #fff; font-weight: 600;
}
.auth-actions button:last-child {
  background: var(--surface); color: var(--accent);
}
.auth-error { color: var(--danger); font-size: 11px; margin: 4px 0 0; }
.auth-user { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.auth-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
.tier-badge {
  margin-left: auto; padding: 2px 7px; border-radius: 999px;
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  background: var(--accent-soft); color: var(--accent);
}
.tier-badge.pro { background: #fef9c3; color: #854d0e; }
```

### Wiring auth in `app.js`

```js
import { onAuthChange, signInWithGoogle, signUpWithEmail,
         signInWithEmail, signOutUser } from './auth.js';
import { getUserProfile } from './db.js';

let currentUser = null;
let userProfile = null;

onAuthChange(async (user) => {
  currentUser = user;
  if (user) {
    userProfile = await getUserProfile(user.uid);
    // Sync lang preference from Firestore
    if (userProfile?.lang && userProfile.lang !== localStorage.getItem('lms_lang')) {
      await loadLanguage(userProfile.lang);
      localStorage.setItem('lms_lang', userProfile.lang);
    }
    showSignedIn(user, userProfile);
    await migrateLocalStorageToFirestore(user.uid);  // one-time migration on first login
  } else {
    userProfile = null;
    showSignedOut();
  }
  render();
});

// Wire up buttons
document.getElementById('btn-google-signin').addEventListener('click', () =>
  signInWithGoogle().catch(err => showAuthError(err.message)));

document.getElementById('btn-email-signin').addEventListener('click', () => {
  const email = document.getElementById('auth-email').value;
  const pw = document.getElementById('auth-password').value;
  signInWithEmail(email, pw).catch(err => showAuthError(err.message));
});

document.getElementById('btn-email-signup').addEventListener('click', () => {
  const email = document.getElementById('auth-email').value;
  const pw = document.getElementById('auth-password').value;
  signUpWithEmail(email, pw).catch(err => showAuthError(err.message));
});

document.getElementById('btn-signout').addEventListener('click', signOutUser);
```

---

## Phase 4 — Cross-Device Progress Sync

### Storage strategy

| Auth state | Read progress from | Write progress to |
|---|---|---|
| Anonymous (not signed in) | `localStorage` only | `localStorage` only |
| Signed in — free | `localStorage` + Firestore | Both (Firestore is source of truth) |
| Signed in — pro | Firestore | Firestore (localStorage as offline cache) |

**Lesson files write ONLY to localStorage** (unchanged). `app.js` is responsible for syncing localStorage writes to Firestore after the iframe's 3-second poll detects a change.

### Sync logic in `app.js`

Replace the progress polling section:

```js
// On every progress poll tick, sync dirty localStorage keys to Firestore
async function syncProgressToFirestore() {
  if (!currentUser) return;
  const keys = getAllStorageKeys();  // from registry
  for (const key of keys) {
    const localData = safeReadStorage(key);
    if (Object.keys(localData).length === 0) continue;
    await setLessonProgress(currentUser.uid, key, localData);
  }
}

// On sign-in: read Firestore progress and merge with localStorage
// (Firestore wins on conflict — it has the most recent cross-device data)
async function migrateLocalStorageToFirestore(uid) {
  const keys = getAllStorageKeys();
  for (const key of keys) {
    const remote = await getLessonProgress(uid, key);
    const local = safeReadStorage(key);
    // Merge: prefer remote truthy values, keep local truthy values not in remote
    const merged = { ...local, ...remote };
    localStorage.setItem(key, JSON.stringify(merged));
    if (Object.keys(merged).length > 0) {
      await setLessonProgress(uid, key, merged);
    }
  }
}
```

### Updated `computeLessonProgress`

For signed-in users, `app.js` reads progress from the **merged localStorage** (which has been synced from Firestore). No change to the computation function itself — it always reads from localStorage. The sync layer keeps localStorage up to date.

### Updated reset

```js
async function resetAllProgress() {
  const keys = getAllStorageKeys();
  keys.forEach(key => localStorage.removeItem(key));
  if (currentUser) {
    // Reset Firestore progress too
    for (const key of keys) {
      await setLessonProgress(currentUser.uid, key, {});
    }
  }
  render();
  // ... reload iframe as before
}
```

### Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own documents
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## Phase 5 — Personalised Lessons and User Tiers

### Tier system

Users have a `tier` field in their Firestore profile document: `'free'` or `'pro'`.

Setting `tier: 'pro'` is done manually (via Firebase console) or via a payment webhook (Stripe → Firebase Cloud Function → Firestore update). The payment integration itself is **out of scope** for this prompt — implement the tier-reading and lesson-gating logic only.

### Registry additions for personalised lessons

Add two optional fields to the lesson contract:

```js
{
  id: 'db-personalised-replication',
  title: 'Personalised: Replication Deep-Dive',
  subtitle: 'AI-generated for your profile',
  route: 'lms/modules/database/lessons/personalised-replication.html',
  progress: { type: 'checklist', storageKey: 'lms_db_personalised_replication_done', total: 8, ignoreKeys: ['home'] },
  // NEW optional fields:
  requiresAuth: true,      // hide/lock if not signed in
  requiresPro: true,       // hide/lock if tier !== 'pro'
  isPersonalised: true     // show a "✦ Personalised" badge in the lesson nav
}
```

### Lesson gating in `renderLessonNav`

```js
mod.lessons.forEach(lesson => {
  const isLocked =
    (lesson.requiresAuth && !currentUser) ||
    (lesson.requiresPro && userProfile?.tier !== 'pro');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `nav-btn ${lesson.id === activeLessonId ? 'active' : ''} ${isLocked ? 'locked' : ''}`;

  if (isLocked) {
    btn.innerHTML = `
      <strong>${lesson.title} 🔒</strong>
      <small>${lesson.requiresPro ? t('lesson.proRequired', 'Pro required') : t('lesson.signInRequired', 'Sign in required')}</small>
    `;
    btn.addEventListener('click', () => showUpgradePrompt(lesson));
  } else {
    // ... normal render with progress label
  }
  lessonNav.appendChild(btn);
});
```

Locked lesson CSS:
```css
.nav-btn.locked { opacity: 0.55; cursor: not-allowed; }
.nav-btn.locked strong { color: var(--muted); }
```

### Personalised lesson generation

Personalised lessons are generated using the **AI Lesson Generation prompt** defined in `DATABASE_MODULE_ANALYSIS.md` (the master prompt). The workflow:

1. User fills in their Job Profile + Learner Profile in a form (see Phase 5 UI below).
2. The form calls the Anthropic API (or your preferred LLM API) with the master prompt.
3. The generated HTML is stored in Firestore under `users/{uid}/personalised_lessons/{lessonId}`.
4. A dynamic lesson loader in `app.js` fetches this Firestore document and renders it in the iframe via a `blob:` URL or a data URI.

> **Note on storage:** Storing full HTML in Firestore is limited to 1 MiB per document. Keep generated lessons under 800 KB. If larger, store in Firebase Storage and save the download URL in Firestore instead.

**Personalised lesson loader:**

```js
async function openPersonalisedLesson(lessonId) {
  if (!currentUser) return;
  const snap = await getDoc(doc(db, 'users', currentUser.uid, 'personalised_lessons', lessonId));
  if (!snap.exists()) {
    showGenerationUI(lessonId);  // lesson not yet generated
    return;
  }
  const html = snap.data().html;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  frame.src = url;
  frame.classList.add('visible');
  welcome.classList.add('hidden');
}
```

### Personalised lesson generation UI

Add a modal/panel that appears when a locked `isPersonalised` lesson is clicked and the user is signed in (but hasn't generated it yet):

```html
<dialog id="personalise-modal" class="modal">
  <div class="modal-header">
    <h3 data-i18n="personalise.title">Generate your personalised lesson</h3>
    <button id="modal-close" type="button">✕</button>
  </div>
  <div class="modal-body">
    <label>Job title <input id="personalise-role" type="text" /></label>
    <label>Company <input id="personalise-company" type="text" /></label>
    <label>Your background <textarea id="personalise-background"></textarea></label>
    <label>Your gaps <textarea id="personalise-gaps"></textarea></label>
  </div>
  <div class="modal-footer">
    <button id="btn-generate" type="button" data-i18n="personalise.generateButton">Generate lesson</button>
  </div>
</dialog>
```

---

## Phase 6 — Admin Authorization System

**Goal:** Give an admin user full control over which modules each account can see. Unauthorized modules are **completely hidden** from the learner's sidebar — not locked, not grayed out, not visible at all.

---

### Design decisions

**Access mode — `open` vs `controlled` (configured per platform)**

Add `accessControl.mode` to `LMS_CONFIG`:

```js
export const LMS_CONFIG = {
  appName: 'LMS Platform',
  storagePrefix: 'lms',
  accessControl: {
    mode: 'open'   // 'open' | 'controlled'
    // 'open'       → all modules visible unless admin explicitly revokes access
    // 'controlled' → no modules visible until admin explicitly grants access
  },
  // ...
};
```

Default is `'open'` — preserves the current behavior (every user sees every module) until an admin starts making changes. Switch to `'controlled'` when the platform grows and you want new accounts to see nothing until approved.

**No access document = platform default**

If a user has no `users/{uid}/access/modules` document in Firestore:
- `'open'` mode → they see all modules (same as today).
- `'controlled'` mode → they see no modules until an admin grants access.

This means existing users are unaffected when the feature ships.

**Admin role**

A user is an admin when their Firestore profile contains `role: 'admin'`. The first admin is set manually in the Firebase console. Subsequent admins are promoted by an existing admin through the admin panel.

---

### Firestore data model additions

```
userIndex/{uid}
  displayName: string
  email: string
  photoURL: string
  // Written by the user themselves on every sign-in.
  // Read by admins to list all accounts.

users/{uid}/access/modules
  database: true | false
  python: true | false
  react: true | false
  react-native: true | false
  // Keys match module IDs in registry.js exactly.
  // true = granted, false = explicitly revoked.
  // Missing key = falls through to accessControl.mode default.
```

---

### New file: `lms/core/access.js`

```js
// lms/core/access.js
// Determines which modules (and fields) a given user is allowed to see.

import { LMS_CONFIG } from './registry.js';
import { getModuleAccess } from './db.js';

// ── MODULE-LEVEL VISIBILITY ───────────────────────────────────────────────

// Returns the list of module objects visible to the current user.
// For anonymous users, falls back to accessControl.mode default.
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

// Returns true if the current user has admin role.
export function isAdmin(userProfile) {
  return userProfile?.role === 'admin';
}

// ── FIELD-LEVEL VISIBILITY (added in Phase 0) ─────────────────────────────
// See Phase 0 for full implementation of:
//   getAccessibleFields(uid)          — all fields annotated with accessibleModuleCount
//   getVisibleModulesForField(uid, fieldId) — modules accessible in one field
```

---

### Shell changes in `app.js`

Add a `visibleModules` variable that replaces direct use of `LMS_CONFIG.modules` everywhere in the render cycle:

```js
import { getVisibleModules, isAdmin } from './access.js';

let visibleModules = [];   // populated on auth change and on every render

// In the onAuthChange handler, after loading the user profile:
onAuthChange(async (user) => {
  currentUser = user;
  if (user) {
    userProfile = await getUserProfile(user.uid);
    await upsertUserIndex(user);  // keep userIndex up to date
  } else {
    userProfile = null;
  }
  visibleModules = await getVisibleModules(user?.uid ?? null);

  // If the currently selected module is no longer visible, reset selection
  if (activeModuleId && !visibleModules.find(m => m.id === activeModuleId)) {
    activeModuleId = visibleModules[0]?.id ?? null;
    activeLessonId = null;
  }

  render();
});
```

Replace every occurrence of `LMS_CONFIG.modules` in rendering functions with `visibleModules`:

```js
// renderModuleNav — iterate visibleModules, not LMS_CONFIG.modules
function renderModuleNav() {
  moduleNav.innerHTML = '';
  visibleModules.forEach(mod => { /* ... unchanged logic ... */ });
}

// computeGlobalProgress — only count visible modules
function computeGlobalProgress() {
  const totals = visibleModules.reduce((acc, mod) => {
    const p = computeModuleProgress(mod);
    return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
  const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;
  return { ...totals, pct };
}
```

**Admin panel button:** If the signed-in user is an admin, show an "Admin" button in the sidebar that navigates to the admin panel:

```js
// In showSignedIn():
if (isAdmin(userProfile)) {
  document.getElementById('btn-admin-panel').hidden = false;
}
```

```html
<!-- index.html, inside #auth-signed-in -->
<a id="btn-admin-panel" href="lms/admin/" target="_blank"
   class="admin-link" hidden data-i18n="auth.adminPanel">Admin panel ↗</a>
```

---

### New file: `lms/admin/index.html`

The admin panel is a **separate static page** at `lms/admin/index.html`. It loads independently (not in an iframe) and requires the user to already be signed in as admin. It imports Firebase directly and enforces the admin role client-side; the Firestore rules enforce it server-side.

**Page structure:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>LMS Admin — Access Control</title>
  <link rel="stylesheet" href="../core/styles.css" />
  <style>
    /* Admin-specific styles */
    .admin-shell { max-width: 960px; margin: 0 auto; padding: 24px; }
    .admin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .user-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .user-table th, .user-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; }
    .user-table th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
    .user-table tr:hover td { background: var(--surface-2); }
    .module-toggle { display: flex; gap: 6px; flex-wrap: wrap; }
    .toggle-chip {
      padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600;
      border: 1px solid var(--border); cursor: pointer;
      background: var(--surface); color: var(--muted);
      transition: background .15s, color .15s, border-color .15s;
    }
    .toggle-chip.granted { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
    .toggle-chip.revoked { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
    .search-bar { padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; width: 280px; font-size: 13px; }
    .promote-btn { font-size: 11px; padding: 3px 8px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer; }
    .status-msg { font-size: 12px; color: var(--muted); padding: 4px 0; }
    /* Field groups inside the module-access cell */
    .field-group { margin-bottom: 14px; }
    .field-group-header {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .06em; color: var(--muted);
      margin-bottom: 6px; padding-bottom: 4px;
      border-bottom: 1px solid var(--border);
    }
    .field-group-label { flex: 1; }
  </style>
</head>
<body>
  <div class="admin-shell">
    <div class="admin-header">
      <h1>Access Control <span style="color:var(--muted);font-size:14px;font-weight:400">— LMS Admin Panel</span></h1>
      <div>
        <input id="search" class="search-bar" type="search" placeholder="Filter by name or email…" />
      </div>
    </div>

    <div id="access-mode-banner" class="panel-block" style="margin-bottom:16px">
      <!-- Populated by JS: shows current mode and a toggle -->
    </div>

    <div id="status" class="status-msg"></div>

    <table class="user-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Email</th>
          <th>Role</th>
          <th>Module access</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="user-rows">
        <!-- Populated by admin.js -->
      </tbody>
    </table>
  </div>

  <script type="module" src="../core/admin.js"></script>
</body>
</html>
```

---

### New file: `lms/core/admin.js`

```js
// lms/core/admin.js
// Runs only in lms/admin/index.html. Never imported by app.js.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-app.js';
import { getAuth, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, updateDoc }
  from 'https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js';
import { FIREBASE_CONFIG } from './firebase-config.js';
import { LMS_CONFIG } from './registry.js';

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

const MODULE_IDS = LMS_CONFIG.modules.map(m => m.id);
const MODULE_TITLES = Object.fromEntries(LMS_CONFIG.modules.map(m => [m.id, m.title]));
const ACCESS_MODE = LMS_CONFIG.accessControl?.mode ?? 'open';

let currentAdmin = null;
let allUsers = [];      // [{ uid, displayName, email, photoURL }]
let accessCache = {};   // { [uid]: { [moduleId]: true|false|undefined } }

// ── BOOT ──────────────────────────────────────────────────────────────────

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
});

// ── DATA ──────────────────────────────────────────────────────────────────

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

// ── RENDER ────────────────────────────────────────────────────────────────

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

  tbody.addEventListener('click', handleTableClick);
}

function renderChip(uid, moduleId, accessMap) {
  const ACCESS_MODE = LMS_CONFIG.accessControl?.mode ?? 'open';
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

// ── ACTIONS ───────────────────────────────────────────────────────────────

async function handleTableClick(e) {
  const chip      = e.target.closest('.toggle-chip');
  const actionBtn = e.target.closest('[data-action]');
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

// ── SEARCH ────────────────────────────────────────────────────────────────

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

// ── UTIL ──────────────────────────────────────────────────────────────────

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
```

---

### Updated Firestore security rules

Replace the Phase 4 rules with this complete ruleset:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: check if the requester is an admin
    function isAdmin() {
      return request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // User profile + progress: own read/write; admin read/write
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null
        && (request.auth.uid == userId || isAdmin());
    }

    // userIndex: any signed-in user writes their own entry; admins read all
    match /userIndex/{userId} {
      allow write: if request.auth != null && request.auth.uid == userId;
      allow read:  if isAdmin();
    }
  }
}
```

---

### Bootstrap: setting the first admin

The first admin account cannot promote itself through the UI (there is no admin to grant it). Set it manually:

1. Sign in to the platform with the account you want to make admin.
2. Open the **Firebase console** → Firestore → `users` collection → find the document with your UID.
3. Add or edit the field: `role` = `"admin"` (string).
4. Reload the platform — the "Admin panel ↗" link will now appear in your sidebar.

All subsequent admin promotions can be done through the admin panel UI.

---

## Phase 7 — Upgrade Checklist

Run through each item in the browser after completing each phase:

### Phase 0 — Fields Hierarchy
- [ ] First screen on load is the fields card grid, not the module sidebar
- [ ] Each field card shows icon, title, subtitle, module count, and aggregate progress %
- [ ] Clicking a field card transitions to the shell and shows only that field's modules
- [ ] Modules shared across two fields show consistent progress on both field cards
- [ ] Progress on a shared module updated in one field immediately reflects on the other
- [ ] "← Fields" back button returns to the full-page card grid and clears module/lesson selection
- [ ] If `LMS_CONFIG.fields` is absent or empty, the shell loads directly with all modules (backward compat)
- [ ] Locked field cards (all modules inaccessible to the user) render with the 🔒 badge and are non-clickable
- [ ] Field card progress bar advances as lessons are checked off inside the shell
- [ ] The shell's accent colours update to the active field's theme on entry
- [ ] Admin panel module toggles are grouped by field with "Grant field" and "Revoke field" buttons
- [ ] "Grant field" grants only that field's modules — other fields' settings are untouched
- [ ] "Revoke field" revokes only that field's modules — other fields' settings are untouched
- [ ] A module appearing in two field groups shows the same chip state in both (same underlying Firestore value)
- [ ] RTL (Arabic) renders correctly on the fields landing grid
- [ ] Adding a new field to `LMS_CONFIG.fields` with existing `moduleIds` requires no other changes

### Phase 1 — Genericification
- [ ] `<title>` reflects `LMS_CONFIG.appName`
- [ ] Brand subtitle renders from registered module list
- [ ] Welcome panel copy comes from `LMS_CONFIG.welcome` or graceful fallback
- [ ] No "Database Engineering" or interview-specific text in shell files

### Phase 2 — i18n
- [ ] Language switcher visible in sidebar
- [ ] Switching to Arabic applies RTL direction and translates all `data-i18n` elements
- [ ] Switching back to English restores LTR and English defaults
- [ ] Language preference persists across page refresh via localStorage
- [ ] Lesson iframes are unaffected by shell language switch
- [ ] Adding a new `lms/i18n/fr.js` file and a `fr` button makes French work with zero other changes

### Phase 3 — Auth
- [ ] Google Sign In popup works and shows user avatar + name in sidebar
- [ ] Email sign-up creates account and signs user in
- [ ] Email sign-in authenticates existing user
- [ ] Auth errors surface clearly in the UI (bad password, network error, etc.)
- [ ] Sign-out returns to anonymous mode
- [ ] Auth state persists across page refresh (Firebase handles this)

### Phase 4 — Progress sync
- [ ] Checking items in a lesson while signed in writes to Firestore (verify in Firebase console)
- [ ] Signing out and back in on a different browser restores progress from Firestore
- [ ] Reset clears both localStorage and Firestore
- [ ] Anonymous progress is preserved during sign-in (merge, not overwrite)

### Phase 5 — Personalisation
- [ ] Lessons with `requiresAuth: true` are locked and show sign-in prompt when not signed in
- [ ] Lessons with `requiresPro: true` are locked and show upgrade prompt for free users
- [ ] `tier: 'pro'` users see personalised lessons unlocked
- [ ] Personalised lesson generation form collects correct inputs
- [ ] Generated lesson loads in the iframe correctly

### Phase 6 — Admin Authorization
- [ ] "Admin panel ↗" link only appears in the sidebar for users with `role: 'admin'`
- [ ] Admin panel page redirects non-admins back to `index.html`
- [ ] Admin panel lists all registered accounts from `userIndex`
- [ ] Module chips correctly show granted/revoked state, with `*` on defaulted entries
- [ ] Clicking a chip toggles the module and updates Firestore immediately
- [ ] "Grant all" grants every module for the selected user
- [ ] "Revoke all" revokes every module for the selected user
- [ ] "Reset (default)" deletes the explicit access map so platform mode takes over
- [ ] Promote button toggles a user between `role: 'user'` and `role: 'admin'`
- [ ] Search bar filters the user list by name or email in real time
- [ ] In `'open'` mode: a user with no access document sees all modules (existing behavior)
- [ ] In `'controlled'` mode: a user with no access document sees no modules
- [ ] Switching `accessControl.mode` in `registry.js` immediately changes default behavior without any Firestore migration
- [ ] Module visibility updates in the shell within one page load after admin changes access
- [ ] Firestore rules block a non-admin from reading `userIndex` or other users' access documents
- [ ] First admin set via Firebase console can immediately use the admin panel

---

## File Index — What Changes

| File | Change type | Notes |
|---|---|---|
| `lms/core/app.js` | **Major edit** | Add `activeFieldId` state, `renderFieldsLanding`, `renderShell`, `enterField`, `exitToFields`, `getActiveFieldModules`; auth wiring; i18n; tier gating; sync |
| `lms/core/registry.js` | **Minor edit** | Add `fields[]`, `welcome`, `accessControl`, `requiresAuth`, `requiresPro`, `isPersonalised` — all optional |
| `lms/core/styles.css` | **Moderate edit** | Add fields landing, field cards, back button, auth panel, lang switcher, locked lesson, RTL CSS |
| `index.html` | **Moderate edit** | Add `#fields-landing` + `#app-shell` wrapper, back button, auth panel, lang switcher, personalise modal |
| `lms/core/i18n.js` | **New file** | Language loader and `t()` helper |
| `lms/core/auth.js` | **New file** | Firebase Auth wrapper |
| `lms/core/db.js` | **New file** | Firestore helpers: progress, access control, userIndex |
| `lms/core/access.js` | **New file** | `getVisibleModules`, `getAccessibleFields`, `getVisibleModulesForField`, `isAdmin` |
| `lms/core/admin.js` | **New file** | Admin panel runtime — field-grouped toggles, field-level bulk actions |
| `lms/core/firebase-config.js` | **New file** | Firebase project config (safe to commit) |
| `lms/admin/index.html` | **New file** | Admin panel page — access control UI with field grouping |
| `lms/i18n/ar.js` | **New file** | Arabic overrides including field-landing strings |
| All lesson HTML files | **No change** | Module-owned; untouched by all phases |

---

## Invariants — Must Not Break

These things must remain exactly as they are after all upgrades:

1. **localStorage keys are unchanged.** Existing user progress data (keys like `phase_01_done`, `lms_python_01_done`) must continue to work without migration.
2. **Anonymous mode is fully functional.** The entire platform works without any authentication. Auth is additive.
3. **Lesson HTML files have zero dependencies on the shell.** They remain standalone files that can be opened directly in a browser.
4. **The registry contract is backward-compatible.** All existing module/lesson entries in `registry.js` remain valid. Every new field (`fields[]`, `requiresAuth`, `requiresPro`, `accessControl`, etc.) is optional.
5. **`LMS_CONFIG.fields` being absent or empty is a valid state.** If no fields are defined, the shell loads directly and shows all modules — identical to the current behavior. The fields landing is never rendered.
6. **GitHub Pages / static hosting compatibility is preserved.** No server-side rendering. No build step introduced.
7. **The 3-second progress poll continues to run.** It is the only mechanism for detecting lesson checkbox changes from inside the iframe.
8. **Existing users see no change until an admin acts.** With `accessControl.mode: 'open'` (the default), all modules remain visible to all users. The authorization system is dormant until an admin makes an explicit change.
9. **A module's progress is global, not field-scoped.** Completing a lesson advances that module's progress everywhere it appears — in the sidebar, on every field card that includes it, and in the global percentage.

---

## Implementation Order

Work through phases strictly in order. Each phase is independently deployable — commit and test before moving to the next.

```
Phase 0 (Fields)         →  commit & test  ← purely client-side; no Firebase needed
Phase 1 (Genericify)     →  commit & test
Phase 2 (i18n)           →  commit & test
Phase 3 (Auth UI)        →  commit & test  ← requires Firebase project setup first
Phase 4 (Sync)           →  commit & test
Phase 5 (Personalised)   →  commit & test
Phase 6 (Authorization)  →  commit & test  ← Firestore rules must be updated before testing
```

**Phase 0 is purely client-side.** No Firebase, no backend. Just registry changes, `app.js` additions, `index.html` restructuring, and CSS. You can ship it immediately without any external dependencies.

Firebase project setup (before Phase 3):
1. Create project at `console.firebase.google.com`.
2. Enable Authentication → Sign-in methods → Google and Email/Password.
3. Create Firestore database (start in test mode, apply security rules after Phase 4).
4. Copy the project config object into `lms/core/firebase-config.js`.
5. Set Firestore rules from the Phase 4 rules block (update to Phase 6 rules after Phase 6 ships).

Phase 6 bootstrap (after deploying Phase 6):
1. Sign in to the platform with your admin account.
2. Manually set `role: "admin"` in Firebase console → Firestore → `users/{yourUid}`.
3. Reload the platform — "Admin panel ↗" appears in your sidebar.
4. All future admin promotions happen through the admin panel UI.
