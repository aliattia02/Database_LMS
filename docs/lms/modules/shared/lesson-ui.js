/**
 * lesson-ui.js — Interview-main shared UI utilities
 *
 * Provides:
 *   switchTab(lang, btn)          — tab bar switching (EN / DE / AR)
 *   toggleAcc(trigger)            — single-open accordion (acc-trigger / acc-body)
 *   toggleSection(trigger)        — collapsible section (section-toggle / section-body)
 *   toggle(btn)                   — q-card accordion with progress tracking + persistence
 *   updateProgress()              — recalculate progress bars for all language tabs
 *   initMindmap(DATA)             — build the branch-grid mindmap (topic0)
 *   toggleMindmapItem(id, color)  — mindmap item expand/collapse, all-lang-synced
 *   applyMindmapOpenState(lang)   — internal: re-render open/closed state for one grid
 *   initMindmapAdvanced(DATA)     — build the richer "amap-" branch-grid mindmap (topic0b)
 *   toggleMindmapItemAdvanced(id, ...) — advanced mindmap item expand / collapse
 *
 * LMS Progress Bridge (new — see section below):
 *   Automatically persists q-card "seen" state to localStorage whenever a
 *   card is opened and notifies the parent shell so its sidebar bars refresh
 *   and the data syncs to Firestore for signed-in users. No individual lesson
 *   file changes are needed — the bridge activates as soon as the lesson's
 *   registry entry carries  progress: { type:'checklist', storageKey, total }.
 *
 * Arabic (AR) notes:
 *   – Add <div id="tab-ar" class="tab-content" dir="rtl"> to lesson pages.
 *   – The #tab-ar div carries dir="rtl" so RTL CSS in theme.css auto-applies.
 *   – For mindmaps, add <div id="grid-ar"> / <div id="legend-ar"> containers.
 *   – For advanced mindmaps, add <div id="agrid-ar"> / <div id="alegend-ar">.
 *   – DATA objects must include an "ar" key with the same shape as "en"/"de".
 *
 * Usage in a lesson page:
 *   <script src="../shared/lesson-ui.js"></script>
 *   Then call whichever functions you need from onclick= attributes or
 *   DOMContentLoaded listeners in a small inline <script>.
 */

/* ─────────────────────────────────────────────────────────────
   SUPPORTED LANGUAGES
   Add or remove language codes here to extend the system.
───────────────────────────────────────────────────────────── */
var LANGS = ['en', 'de', 'ar'];

/* ─────────────────────────────────────────────────────────────
   TRANSLATION REQUEST URL  (set once here, used everywhere)
   When a lesson has no Arabic content, the "not yet translated"
   banner shows a CTA link pointing to this URL.
   – You can override it per-button with data-request-url="…".
   – Set to '' to show the banner without any link.
───────────────────────────────────────────────────────────── */
var LMS_DEFAULT_REQUEST_URL = 'https://github.com/YOUR_ORG/YOUR_REPO/issues/new?template=translation_request.md&title=Translation+request+%5BAR%5D&labels=translation';

/* ─────────────────────────────────────────────────────────────
   LMS BRIDGE
   Key used by lms/core/app.js to persist the selected language.
   Must match LANG_KEY exported from lms/core/registry.js.
───────────────────────────────────────────────────────────── */
var LMS_LANG_KEY = 'lms_lang';

/* ─────────────────────────────────────────────────────────────
   LMS PROGRESS STORAGE KEY
   Determines which localStorage key this lesson writes q-card
   progress to, and which key the parent shell expects to find
   when it runs computeLessonProgress() / syncProgressToFirestore().

   Resolution order (highest precedence first):
     1. window.LMS_STORAGE_KEY — set by the lesson page before
        this script loads.  Use this for any lesson that needs a
        name that differs from the auto-derived default.
        Example (in the lesson's inline <script>):
          window.LMS_STORAGE_KEY = 'interview_general';
     2. Auto-derive from the URL path so that most lessons need
        zero per-file configuration.
        /lms/modules/Interview-main/general.html
          → "lms_modules_Interview-main_general"
        The derived key is stable across reloads and matches any
        storageKey value in registry.js that was built the same way.

   IMPORTANT — registry.js pairing:
     For the shell's progress bars to reflect this lesson's
     completion, its registry entry must declare:
       progress: {
         type:       'checklist',
         storageKey: '<key that matches _LMS_PROGRESS_KEY>',
         total:      <number of .q-card elements on the page>
       }
     Lessons left as  { type: 'untracked' }  still work fine; they
     just continue to show 100% in the sidebar (existing behaviour).
───────────────────────────────────────────────────────────── */
var _LMS_PROGRESS_KEY = (function () {
  if (typeof window.LMS_STORAGE_KEY === 'string' && window.LMS_STORAGE_KEY) {
    return window.LMS_STORAGE_KEY;
  }
  // Auto-derive: strip leading slash, replace path separators with underscores,
  // drop the .html extension.
  var p = location.pathname.replace(/^\//, '').replace(/\//g, '_');
  p = p.replace(/\.html$/i, '');
  return p || null;
}());

/* ─────────────────────────────────────────────────────────────
   LANGUAGE AVAILABILITY GUARD
   Runs on every page load — no per-file flag or config needed.

   How it works:
     Every lesson can include an Arabic tab button
       <button class="tab-btn" lang="ar"
               data-request-url="https://github.com/.../issues/new"
               onclick="switchTab('ar', this)">العربية</button>
     even before that lesson is translated.

   On load this function checks whether <div id="tab-ar"> exists:
     – Present  → button works normally, nothing changes.
     – Absent   → a placeholder #tab-ar div is injected on-the-fly
                  containing a "not yet translated" banner with a
                  Request Translation link (taken from the button's
                  data-request-url attribute, or omitted if absent).
                  The button stays active and clickable; clicking it
                  shows the banner instead of a blank page.

   To translate a lesson: just add the real #tab-ar block.
   The guard automatically steps aside the moment that block exists.
───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  guardLanguageTab('ar');
  guardLanguageTab('de');   // ← NEW: show banner when no DE tab content exists

  // Auto-inject progress bars into every tab that contains trackable content
  // (.q-card elements OR mindmap items). No per-page HTML changes needed.
  _injectProgressBars();

  // Auto-inject "Mark as read" buttons into every .q-panel AND every
  // .acc-body (accordion pattern used by phase-*.html lessons).
  // Must run after guardLanguageTab() so injected placeholder panels are included.
  _injectMarkReadButtons();
  _injectAccMarkReadButtons();

  // Inject prev/next lesson nav bar and request nav info from parent shell.
  _injectLessonNav();

  // Touch point ①: read the shell's saved language and switch to it immediately.
  // Works both when loaded inside the LMS iframe and when opened standalone.
  var savedLang = localStorage.getItem(LMS_LANG_KEY);
  if (savedLang && LANGS.indexOf(savedLang) !== -1) {
    var matchBtn = null;
    document.querySelectorAll('.tab-btn').forEach(function(b) {
      if ((b.getAttribute('lang') || '') === savedLang ||
          (b.getAttribute('onclick') || '').indexOf("switchTab('" + savedLang + "'") !== -1) {
        matchBtn = b;
      }
    });
    switchTab(savedLang, matchBtn);
  }

  // LMS progress bridge: restore q-card open state.
  // Step 1 — apply whatever is already in localStorage (immediate, offline-safe).
  if (_LMS_PROGRESS_KEY) {
    var localData = _lmsLoadProgress();
    if (Object.keys(localData).length > 0) {
      _lmsRestoreProgress(localData);
    }
    // Step 2 — ask the parent shell for Firestore-authoritative data.
    // If the user signed in on another device their Firestore progress may be
    // ahead of localStorage. The shell responds with lms:progressData (see the
    // message listener below), which merges and re-restores.
    if (window.parent !== window) {
      try {
        window.parent.postMessage(
          { type: 'lms:requestProgress', storageKey: _LMS_PROGRESS_KEY },
          '*'
        );
      } catch (_) {}
    }
  }
});

/* ─────────────────────────────────────────────────────────────
   PROGRESS BAR AUTO-INJECTION
   Called on DOMContentLoaded. For every language tab that contains
   trackable items (.q-card or mindmap items) a .progress-bar strip
   is prepended so pages never need to hand-code progress HTML.

   Trackable item detection:
     • .q-card elements  → counted/opened by toggle() / updateProgress()
     • .amap-item buttons (advanced mindmap) → counted by updateProgress()
     • .branch-item buttons (basic mindmap)  → counted by updateProgress()

   The injected HTML matches the .progress-bar / .progress-track /
   .progress-fill / .progress-count classes already in theme.css.
   IDs follow the updateProgress() convention:
     #prog-{lang}        → fill bar  (width set by updateProgress)
     #prog-count-{lang}  → text label

   Pages that already contain a #prog-{lang} element are left alone
   so hand-authored progress bars still work.
─────────────────────────────────────────────────────────────── */

/**
 * Labels for the progress bar strip, keyed by language code.
 * Add an entry here when adding a new language to LANGS.
 */
var _PROG_LABELS = {
  en: 'Progress',
  de: 'Fortschritt',
  ar: 'التقدم'
};

/**
 * Inject a progress-bar strip at the top of each tab that has trackable
 * content and does not already have a #prog-{lang} fill element.
 * Safe to call multiple times — the id-check makes it idempotent.
 */
function _injectProgressBars() {
  LANGS.forEach(function(lang) {
    var tab = document.getElementById('tab-' + lang);
    if (!tab) return;

    // Skip if a progress bar was hand-coded on the page
    if (document.getElementById('prog-' + lang)) return;

    // Count trackable items: q-cards + accordion items + mindmap buttons
    var trackable = tab.querySelectorAll('.q-card, .acc-item, .amap-item, .branch-item').length;
    if (trackable === 0) return;   // nothing to track — don't inject

    var label = _PROG_LABELS[lang] || 'Progress';
    var bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', '0');
    bar.innerHTML =
      '<span class="progress-label">' + label + '</span>'
      + '<div class="progress-track">'
      +   '<div class="progress-fill" id="prog-' + lang + '" style="width:0%"></div>'
      + '</div>'
      + '<span class="progress-count" id="prog-count-' + lang + '">0 / ' + trackable + '</span>';

    // Prepend inside the tab, before the first child
    tab.insertBefore(bar, tab.firstChild);
  });
}

/**
 * If no #tab-{lang} content block exists — or it exists but is empty
 * (an unfilled stub) — inject a friendly "not yet translated" banner
 * so the tab never goes blank.
 *
 * Two cases handled automatically:
 *   1. No #tab-{lang} div at all  → create and append one.
 *   2. #tab-{lang} exists but empty → fill it in-place.
 *
 * The banner includes a "Request translation" link taken from:
 *   a) data-request-url attribute on the tab button   (per-page override)
 *   b) LMS_DEFAULT_REQUEST_URL at the top of this file (global default)
 *   c) No link shown if both are empty strings / null.
 *
 * To translate a lesson: add a real #tab-{lang} block with content.
 * The guard automatically steps aside the moment content is present.
 *
 * @param {string} lang - language code, e.g. 'ar'
 */
function guardLanguageTab(lang) {
  var existing = document.getElementById('tab-' + lang);

  // Content present and non-empty — nothing to do
  if (existing && existing.innerHTML.trim() !== '') return;

  // Find the tab button for this language.
  // Prefer the lang="…" attribute (robust), fall back to onclick text.
  var targetBtn = null;
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    if (btn.getAttribute('lang') === lang ||
        (btn.getAttribute('onclick') || '').indexOf("switchTab('" + lang + "'") !== -1) {
      targetBtn = btn;
    }
  });
  if (!targetBtn) return; // no button for this lang on this page — nothing to do

  // Request URL: button attribute overrides the file-level default
  var requestUrl = targetBtn.getAttribute('data-request-url') || LMS_DEFAULT_REQUEST_URL || null;

  // Either fill the existing empty stub, or create and inject a new div
  var placeholder = existing || document.createElement('div');
  if (!existing) {
    placeholder.id        = 'tab-' + lang;
    placeholder.className = 'tab-content';
    var container = document.querySelector('.body')
                 || document.querySelector('main')
                 || document.body;
    container.appendChild(placeholder);
  }
  if (lang === 'ar') placeholder.setAttribute('dir', 'rtl');
  placeholder.innerHTML = buildNoTranslationBanner(lang, requestUrl);

  // Mark the button so CSS can render a subtle "pending" indicator
  targetBtn.classList.add('tab-pending');
  targetBtn.setAttribute('title', lang === 'ar'
    ? '\u0647\u0630\u0627 \u0627\u0644\u062f\u0631\u0633 \u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631 \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0628\u0639\u062f'
    : lang === 'de'
      ? 'Diese Lektion ist noch nicht auf Deutsch verf\u00fcgbar'
      : 'Translation not yet available');
}

/**
 * Build the HTML for the "not yet translated" banner.
 * Rendered in the lesson's target language when possible.
 *
 * @param  {string}      lang       - language code ('ar', etc.)
 * @param  {string|null} requestUrl - URL for the "request" CTA, or null
 * @return {string} HTML string
 */
function buildNoTranslationBanner(lang, requestUrl) {
  var isAr = (lang === 'ar');
  var isDe = (lang === 'de');
  var html = '<div class="ntb-wrap"><div class="ntb-card">'
           + '<div class="ntb-globe">&#127760;</div>';

  if (isAr) {
    html += '<h2 class="ntb-title">'
          + '\u0647\u0630\u0627 \u0627\u0644\u062f\u0631\u0633 \u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0628\u0639\u062f'
          + '</h2>'
          + '<p class="ntb-body">'
          + '\u0644\u0645 \u062a\u062a\u0645 \u062a\u0631\u062c\u0645\u0629 \u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0636\u0648\u0639 \u0625\u0644\u0649 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u062d\u062a\u0649 \u0627\u0644\u0622\u0646. '
          + '\u064a\u0645\u0643\u0646\u0643 \u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u0642\u0631\u0627\u0621\u0629 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629 \u0623\u0648 \u0627\u0644\u0623\u0644\u0645\u0627\u0646\u064a\u0629 \u0641\u064a \u0627\u0644\u0648\u0642\u062a \u0627\u0644\u062d\u0627\u0644\u064a.'
          + '</p>';
    if (requestUrl) {
      html += '<a class="ntb-request" href="' + requestUrl + '" target="_blank" rel="noopener">'
            + '\u0627\u0637\u0644\u0628 \u062a\u0631\u062c\u0645\u0629 \u0647\u0630\u0627 \u0627\u0644\u062f\u0631\u0633 \u2190'
            + '</a>';
    }

  } else if (isDe) {
    // ── German banner (shown in German) ──────────────────────────
    html += '<h2 class="ntb-title">'
          + 'Diese Lektion ist noch nicht auf Deutsch verf\u00fcgbar'
          + '</h2>'
          + '<p class="ntb-body">'
          + 'Dieses Thema wurde noch nicht \u00fcbersetzt. '
          + 'Du kannst es vorerst auf Englisch weiterlesen.'
          + '</p>';
    if (requestUrl) {
      html += '<a class="ntb-request" href="' + requestUrl + '" target="_blank" rel="noopener">'
            + '\u00dcbersetzung anfragen \u2192'
            + '</a>';
    }

  } else {
    // ── Fallback for any other future language ───────────────────
    html += '<h2 class="ntb-title">This lesson isn\u2019t available in '
          + lang.toUpperCase()
          + ' yet</h2>'
          + '<p class="ntb-body">This topic hasn\u2019t been translated yet. '
          + 'Continue reading in English for now.</p>';
    if (requestUrl) {
      html += '<a class="ntb-request" href="' + requestUrl + '" target="_blank" rel="noopener">'
            + 'Request a translation \u2192'
            + '</a>';
    }
  }

  html += '</div></div>';
  return html;
}

/* ─────────────────────────────────────────────────────────────
   LMS PROGRESS BRIDGE
   Connects in-lesson q-card interactions to the parent shell's
   sidebar progress bars and Firestore for signed-in users.

   How the full data flow works:

     Lesson opens
       → DOMContentLoaded reads localStorage immediately (offline-safe)
       → also posts lms:requestProgress to parent shell
       → shell replies with lms:progressData (localStorage value which
         was already hydrated from Firestore on sign-in)
       → bridge merges remote wins on conflict (same rule as
         migrateLocalStorageToFirestore in app.js) and restores
         q-card open states

     User clicks "Mark as read"  (markCardRead() → _lmsMarkCard())
       → card index written as true in localStorage under _LMS_PROGRESS_KEY
       → lms:progressChanged posted to parent shell
       → shell calls renderProgressBars() + renderLessonNav() immediately
         (instead of waiting up to 3 s for the poll)
       → shell calls syncProgressToFirestore() immediately

   Storage format:
     { "q_0": true, "q_3": true, … }
     Keys are 0-based q-card indices; value is always true when seen.
     Marking is one-way — the button locks after clicking and never reverts.
     computeLessonProgress() counts truthy values against cfg.total.

   No per-lesson file changes required.
───────────────────────────────────────────────────────────── */

/**
 * Read this lesson's progress object from localStorage.
 * Returns {} on missing key or invalid JSON — never throws.
 * @returns {Object<string, boolean>}
 */
function _lmsLoadProgress() {
  if (!_LMS_PROGRESS_KEY) return {};
  try {
    return JSON.parse(localStorage.getItem(_LMS_PROGRESS_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

/**
 * Write progress to localStorage AND notify the parent shell.
 * The shell responds by re-rendering its sidebar bars and syncing
 * to Firestore for signed-in users (no 3-second poll delay).
 * @param {Object<string, boolean>} data
 */
function _lmsSaveProgress(data) {
  if (!_LMS_PROGRESS_KEY) return;
  localStorage.setItem(_LMS_PROGRESS_KEY, JSON.stringify(data));
  if (window.parent !== window) {
    try {
      window.parent.postMessage(
        { type: 'lms:progressChanged', storageKey: _LMS_PROGRESS_KEY },
        '*'
      );
    } catch (_) {}
  }
}

/**
 * Write to localStorage only — no postMessage to parent.
 * Used when merging a lms:progressData response so we don't
 * echo a spurious lms:progressChanged back to the shell.
 * @param {Object<string, boolean>} data
 */
function _lmsWriteLocalOnly(data) {
  if (!_LMS_PROGRESS_KEY) return;
  localStorage.setItem(_LMS_PROGRESS_KEY, JSON.stringify(data));
}

/**
 * Mark the q-card at `index` as seen. One-way: once true, never cleared.
 * @param {number} index  0-based position in document.querySelectorAll('.q-card')
 */
function _lmsMarkCard(index) {
  var key  = 'q_' + index;
  var data = _lmsLoadProgress();
  if (!data[key]) {       // no-op if already marked — avoids redundant writes
    data[key] = true;
    _lmsSaveProgress(data);
  }
}

/**
 * Open any q-cards that appear in `data` and restore "Mark as read" button
 * states, then refresh the in-lesson progress bars. Called on page load
 * (from localStorage or Firestore) and when a lms:progressData message arrives.
 * @param {Object<string, boolean>} data
 */
function _lmsRestoreProgress(data) {
  var allCards = document.querySelectorAll('.q-card');
  allCards.forEach(function (card, index) {
    if (data['q_' + index]) {
      // Re-open the card so the user can see previously read content
      var trigger = card.querySelector('.q-trigger');
      var panel   = card.querySelector('.q-panel');
      if (trigger && panel && !trigger.classList.contains('open')) {
        trigger.classList.add('open');
        panel.classList.add('open');
      }
      // Restore the "Mark as read" button to its done state
      var btn = card.querySelector('.mrb-btn');
      if (btn && !btn.classList.contains('mrb-done')) {
        btn.innerHTML = _mrbDoneHTML();
        btn.className = 'mrb-btn mrb-done';
      }
    }
  });
  updateProgress();
}

/* ─────────────────────────────────────────────────────────────
   TAB SWITCHING
───────────────────────────────────────────────────────────── */

/**
 * Switch the visible tab and optionally close open accordions.
 * When switching to 'ar', the #tab-ar div already carries dir="rtl"
 * (set in HTML), so RTL layout is scoped to the content pane only —
 * the header and tab bar remain LTR.
 *
 * @param {string}          lang       - tab id suffix: 'en', 'de', or 'ar'
 * @param {HTMLElement|null} btn       - the clicked .tab-btn element
 * @param {boolean}         [closeAcc] - if true, collapse open accordions on switch (default: true)
 */
function switchTab(lang, btn, closeAcc) {
  closeAcc = (closeAcc !== false);

  document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(el)     { el.classList.remove('active'); });

  var target = document.getElementById('tab-' + lang);
  if (target) {
    target.classList.add('active');
    if (closeAcc) {
      target.querySelectorAll('.acc-body.open').forEach(function(b)   { b.classList.remove('open'); });
      target.querySelectorAll('.acc-trigger.open').forEach(function(t){ t.classList.remove('open'); });
    }
  }
  if (btn) btn.classList.add('active');

  // Refresh progress bars if they exist on the page
  if (typeof updateProgress === 'function') updateProgress();

  // Re-apply mindmap open state if a mindmap grid exists on the page
  if (typeof applyMindmapOpenState === 'function') applyMindmapOpenState(lang);

  // Touch point ③: tell the parent shell the user switched tabs, so its
  // lang-btn active state and localStorage stay in sync.
  if (window.parent !== window) {
    try { window.parent.postMessage({ type: 'lms:langChanged', lang: lang }, '*'); } catch (_) {}
  }

  // Refresh lesson nav bar labels for the new language.
  _lmsUpdateNavLabels(lang);
}

/* ─────────────────────────────────────────────────────────────
   ACCORDION  (acc-trigger / acc-body pattern)
   One item open at a time within the same tab-content.
───────────────────────────────────────────────────────────── */

/**
 * Toggle an .acc-trigger / .acc-body accordion pair.
 * Closes siblings within the same .tab-content (or document root).
 * @param {HTMLElement} trigger - the clicked .acc-trigger button
 */
function toggleAcc(trigger) {
  var body   = trigger.nextElementSibling;
  var isOpen = body.classList.contains('open');
  var scope  = trigger.closest('.tab-content') || document;

  scope.querySelectorAll('.acc-body.open').forEach(function(b)    { b.classList.remove('open'); });
  scope.querySelectorAll('.acc-trigger.open').forEach(function(t) { t.classList.remove('open'); });

  if (!isOpen) {
    body.classList.add('open');
    trigger.classList.add('open');
  }
}

/* ─────────────────────────────────────────────────────────────
   COLLAPSIBLE SECTION  (section-toggle / section-body pattern)
───────────────────────────────────────────────────────────── */

/**
 * Toggle a .section-toggle / .section-body pair.
 * @param {HTMLElement} trigger - the clicked .section-toggle button
 */
function toggleSection(trigger) {
  var body   = trigger.nextElementSibling;
  var isOpen = trigger.classList.contains('open');
  if (isOpen) {
    trigger.classList.remove('open');
    body.classList.add('hidden');
  } else {
    trigger.classList.add('open');
    body.classList.remove('hidden');
  }
}

/* ─────────────────────────────────────────────────────────────
   Q-CARD TOGGLE  (general.html pattern, with progress tracking)
───────────────────────────────────────────────────────────── */

/**
 * Toggle a .q-trigger / .q-panel pair and update progress bars.
 * Progress is NOT marked here — the user must click "Mark as read" inside
 * the panel. This keeps progress intentional rather than accidental.
 * @param {HTMLElement} btn - the clicked .q-trigger button
 */
function toggle(btn) {
  var card   = btn.closest('.q-card');
  var panel  = card.querySelector('.q-panel');
  var isOpen = btn.classList.contains('open');

  btn.classList.toggle('open', !isOpen);
  panel.classList.toggle('open', !isOpen);

  updateProgress();
}

/**
 * Recalculate and update progress bars for all language tabs.
 * Looks for elements: #prog-{lang} (fill bar) and #prog-count-{lang} (label).
 * Progress label text is localised per language.
 *
 * Counts four kinds of trackable item:
 *   • .q-card / "Mark as read" clicked  — standard Q&A cards (explicit marking)
 *   • .acc-item / .acc-trigger.open     — accordion sections (phase-*.html pattern)
 *   • .amap-item.active                 — advanced mindmap items (topic0-mindmap.html)
 *   • .branch-item.active               — basic mindmap items (older mindmap pattern)
 *
 * Fill-bar resolution — #prog-{lang} may point to two different DOM shapes:
 *   A) Auto-injected: #prog-{lang} IS the .progress-fill element — set width directly.
 *   B) Hand-coded (phase-*.html): #prog-{lang} is the .prog-bar TRACK wrapper that
 *      contains a .prog-fill child — set width on the child instead.
 * updateProgress handles both automatically.
 */
function updateProgress() {
  var allCards = document.querySelectorAll('.q-card');

  LANGS.forEach(function(lang) {
    var tab = document.getElementById('tab-' + lang);
    if (!tab) return;

    // ── Q-cards — count explicit "Mark as read" clicks from localStorage ────────
    var qTotal = tab.querySelectorAll('.q-card').length;
    var qMarked = _lmsCountQCardsSeen(tab, allCards);

    // ── Accordion items (acc-trigger / acc-body — phase-*.html pattern) ──────
    // Each .acc-item is one trackable unit; count items whose trigger is open.
    var accTotal = tab.querySelectorAll('.acc-item').length;
    var accOpen  = tab.querySelectorAll('.acc-trigger.open').length;

    // ── Advanced mindmap (amap-item) ─────────────────────────────────────────
    var amapTotal  = tab.querySelectorAll('.amap-item').length;
    var amapActive = tab.querySelectorAll('.amap-item.active').length;
    var amapSeen   = _lmsCountMinimapSeen('amap', lang, amapTotal);

    // ── Basic mindmap (branch-item) ──────────────────────────────────────────
    var bmapTotal = tab.querySelectorAll('.branch-item').length;
    var bmapSeen  = _lmsCountMinimapSeen('bmap', lang, bmapTotal);

    // ── Acc-item seen count from localStorage ─────────────────────────────────
    // Like mindmaps, acc-items are one-way tracked (opening marks them; the bar
    // doesn't shrink when you close them). Falls back to accOpen if no storage.
    var accSeen = _lmsCountAccSeen(lang, accTotal);
    if (accSeen === 0 && accOpen > 0) accSeen = accOpen;

    var total = qTotal + accTotal + amapTotal + bmapTotal;
    var count = qMarked + accSeen  + amapSeen  + bmapSeen;
    // Mindmap fallback to currently-active when no localStorage data yet
    if (amapSeen === 0 && amapActive > 0) count = qMarked + accSeen + amapActive + bmapSeen;

    var pct = total > 0 ? Math.round((count / total) * 100) : 0;

    // ── DOM update ─────────────────────────────────────────────────────────────
    // Support two fill-bar shapes:
    //   Shape A (auto-injected): #prog-{lang} has class "progress-fill" → set directly
    //   Shape B (hand-coded):    #prog-{lang} has class "prog-bar" (track wrapper) →
    //                            set width on its first-child .prog-fill
    var fillEl = document.getElementById('prog-' + lang);
    if (fillEl) {
      var target = fillEl.classList.contains('prog-bar')
        ? fillEl.querySelector('.prog-fill')
        : fillEl;
      if (target) {
        target.style.width = pct + '%';
        // Green at 100 %
        target.style.background = pct >= 100 ? '#16a34a' : '';
      }
      var bar = fillEl.closest('[role="progressbar"]');
      if (bar) bar.setAttribute('aria-valuenow', pct);
    }

    var label = document.getElementById('prog-count-' + lang);
    if (label) {
      if (lang === 'ar') label.textContent = count + ' / ' + total + ' \u0645\u0643\u062a\u0645\u0644';
      else if (lang === 'de') label.textContent = count + ' / ' + total + ' gelesen';
      else label.textContent = count + ' / ' + total + ' read';
    }
  });
}

/**
 * Count how many q-cards in `tab` have been explicitly marked as read
 * via the "Mark as read" button. Uses localStorage `_LMS_PROGRESS_KEY`
 * with the same { "q_0": true } format as _lmsMarkCard().
 *
 * Cards are identified by their global DOM index (across all tabs) so
 * the key space is shared — marking an EN card writes q_0, not q_en_0.
 *
 * @param {Element}   tab      - the tab's DOM element (e.g. #tab-en)
 * @param {NodeList}  allCards - document.querySelectorAll('.q-card') — pass
 *                               in from the caller to avoid repeated queries
 * @returns {number} count of marked cards within this tab
 */
function _lmsCountQCardsSeen(tab, allCards) {
  if (!_LMS_PROGRESS_KEY) return 0;
  var data     = _lmsLoadProgress();
  var tabCards = tab.querySelectorAll('.q-card');
  var count    = 0;
  tabCards.forEach(function(card) {
    var idx = Array.prototype.indexOf.call(allCards, card);
    if (idx !== -1 && data['q_' + idx]) count++;
  });
  return count;
}

/**
 * Read how many accordion items (.acc-item, phase-*.html pattern) the user
 * has seen from localStorage. Nothing currently writes to this key (toggleAcc
 * is visual-only and does not persist), so this will normally return 0 and
 * the caller falls back to accOpen (the currently-open count) — see
 * updateProgress(). Defined for parity with _lmsCountMinimapSeen so that if
 * persistence is added later, no caller needs to change.
 *
 * @param {string} lang  - language tab, e.g. 'en'
 * @param {number} total - total .acc-item count in this tab
 * @returns {number} items seen (clamped to total)
 */
function _lmsCountAccSeen(lang, total) {
  if (!_LMS_PROGRESS_KEY || total === 0) return 0;
  var storageKey = _LMS_PROGRESS_KEY + '_acc';
  try {
    var raw  = JSON.parse(localStorage.getItem(storageKey) || '{}');
    var seen = Object.values(raw).filter(Boolean).length;
    return Math.min(seen, total);
  } catch (_) {
    return 0;
  }
}

/**
 * Read how many mindmap items the user has seen from localStorage.
 * Each mindmap item gets its own seen-key when the user opens it
 * (stored by _lmsMindmapMark).
 *
 * @param {'amap'|'bmap'} kind  - which mindmap variant
 * @param {string}        lang  - language tab, e.g. 'en'
 * @param {number}        total - total item count in this tab
 * @returns {number} items seen (clamped to total)
 */
function _lmsCountMinimapSeen(kind, lang, total) {
  if (!_LMS_PROGRESS_KEY || total === 0) return 0;
  var storageKey = _LMS_PROGRESS_KEY + '_' + kind;
  try {
    var raw  = JSON.parse(localStorage.getItem(storageKey) || '{}');
    var seen = Object.values(raw).filter(Boolean).length;
    return Math.min(seen, total);
  } catch (_) {
    return 0;
  }
}

/**
 * Mark a mindmap item as seen in localStorage and notify the parent shell.
 * Called automatically from toggleMindmapItem / toggleMindmapItemAdvanced
 * on the first open of each item.
 *
 * @param {'amap'|'bmap'} kind  - which mindmap variant
 * @param {string}        id    - the item's id string (e.g. "en-0-1")
 */
function _lmsMindmapMark(kind, id) {
  if (!_LMS_PROGRESS_KEY) return;
  var storageKey = _LMS_PROGRESS_KEY + '_' + kind;
  try {
    var raw = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (!raw[id]) {
      raw[id] = true;
      localStorage.setItem(storageKey, JSON.stringify(raw));
      if (window.parent !== window) {
        try {
          window.parent.postMessage(
            { type: 'lms:progressChanged', storageKey: _LMS_PROGRESS_KEY },
            '*'
          );
        } catch (_) {}
      }
    }
  } catch (_) {}
}

/* ─────────────────────────────────────────────────────────────
   MARK AS READ BUTTON
   Injected automatically into every .q-panel on DOMContentLoaded.
   Clicking it explicitly marks the card as read in localStorage
   and notifies the parent shell — no auto-marking on open.

   Button states:
     idle   → "○ Mark as read"         (outlined, muted)
     done   → "✓ Marked as read"       (green fill)
     done+hover → "↩ Undo"             (red fill — click reverts to idle)

   The injected structure inside each .q-panel:
     <div class="mrb-wrap">
       <button class="mrb-btn [mrb-done]"
               onclick="markCardRead(this)">…</button>
     </div>
───────────────────────────────────────────────────────────── */

/**
 * Inject one set of button styles into <head> — idempotent.
 */
function _injectMarkReadStyles() {
  if (document.getElementById('mrb-styles')) return;
  var style = document.createElement('style');
  style.id  = 'mrb-styles';
  style.textContent = [
    '.mrb-wrap {',
    '  display: flex; justify-content: flex-end;',
    '  padding: 14px 0 2px;',
    '  border-top: 1px solid var(--border, #e2e8f0);',
    '  margin-top: 16px;',
    '}',
    '[dir="rtl"] .mrb-wrap { justify-content: flex-start; }',
    '.mrb-btn {',
    '  display: inline-flex; align-items: center; gap: 7px;',
    '  font-size: 12.5px; font-weight: 600; font-family: inherit;',
    '  padding: 7px 16px; border-radius: 6px; cursor: pointer;',
    '  border: 1.5px solid #cbd5e1;',
    '  background: #fff; color: #64748b;',
    '  transition: background .15s, color .15s, border-color .15s;',
    '  white-space: nowrap;',
    '}',
    '.mrb-btn:hover { border-color: #2563eb; color: #2563eb; background: #eff6ff; }',
    '.mrb-btn.mrb-done { background: #16a34a; border-color: #16a34a; color: #fff; }',
    '.mrb-btn.mrb-done:hover { background: #dc2626; border-color: #dc2626; color: #fff; }',
    '.mrb-btn .mrb-undo { display: none; align-items: center; gap: 7px; }',
    '.mrb-btn.mrb-done:hover .mrb-label { display: none; }',
    '.mrb-btn.mrb-done:hover .mrb-undo  { display: inline-flex; }',
    '.mrb-icon { font-size: 14px; line-height: 1; }'
  ].join('\n');
  document.head.appendChild(style);
}

/**
 * Inject a "Mark as read" button into every .q-panel that does not
 * already have one. Safe to call multiple times (idempotent).
 */
function _injectMarkReadButtons() {
  _injectMarkReadStyles();
  var data     = _lmsLoadProgress();
  var allCards = document.querySelectorAll('.q-card');

  allCards.forEach(function(card, index) {
    var panel = card.querySelector('.q-panel');
    if (!panel || panel.querySelector('.mrb-wrap')) return; // already injected

    var already = !!(data['q_' + index]);
    var wrap    = document.createElement('div');
    wrap.className = 'mrb-wrap';

    var btn = document.createElement('button');
    btn.className = 'mrb-btn' + (already ? ' mrb-done' : '');
    btn.setAttribute('onclick', 'markCardRead(this)');
    btn.innerHTML = already
      ? _mrbDoneHTML()
      : _mrbIdleHTML();

    wrap.appendChild(btn);
    panel.appendChild(wrap);
  });
}

/** @returns {string} innerHTML for the idle (not-yet-read) button state */
function _mrbIdleHTML() {
  return '<span class="mrb-icon">○</span> Mark as read';
}

/** @returns {string} innerHTML for the done button state (two spans for CSS undo-reveal) */
function _mrbDoneHTML() {
  return '<span class="mrb-label"><span class="mrb-icon">✓</span> Marked as read</span>'
       + '<span class="mrb-undo"><span class="mrb-icon">↩</span> Undo</span>';
}

/**
 * Toggle the read state of the q-card containing this button.
 * - Not done → marks as read (green, shows undo on hover)
 * - Done     → removes the mark (back to idle state)
 * Called from the "Mark as read" button's onclick.
 *
 * @param {HTMLElement} btn - the clicked .mrb-btn element
 */
function markCardRead(btn) {
  var card     = btn.closest('.q-card');
  var allCards = document.querySelectorAll('.q-card');
  var index    = Array.prototype.indexOf.call(allCards, card);
  if (index === -1) return;

  if (btn.classList.contains('mrb-done')) {
    // ── Undo: remove the mark ──────────────────────────────────────────────
    _lmsUnmarkCard(index);
    btn.innerHTML = _mrbIdleHTML();
    btn.className = 'mrb-btn';
  } else {
    // ── Mark as read ───────────────────────────────────────────────────────
    _lmsMarkCard(index);
    btn.innerHTML = _mrbDoneHTML();
    btn.className = 'mrb-btn mrb-done';
  }

  updateProgress();
}

/**
 * Remove the read mark for q-card at `index` from localStorage.
 * Deletes the key entirely (falsy absence = same effect as false).
 * Notifies the parent shell so the sidebar and Firestore update.
 * @param {number} index  0-based position in document.querySelectorAll('.q-card')
 */
function _lmsUnmarkCard(index) {
  var key  = 'q_' + index;
  var data = _lmsLoadProgress();
  if (data[key]) {
    delete data[key];
    _lmsSaveProgress(data);
  }
}

/* ─────────────────────────────────────────────────────────────
   MINDMAP  (topic0-mindmap.html pattern)
   The EN, DE, and AR grids share one open/closed state
   (mindmapOpenKey / mindmapOpenColor), so switching tabs always
   shows the same conceptually-open item across all languages.
───────────────────────────────────────────────────────────── */

var mindmapOpenKey   = null;
var mindmapOpenColor = null;

/**
 * Build the branch-grid mindmap from a DATA object.
 * Called once per language on DOMContentLoaded.
 *
 * Expected DATA shape:
 * {
 *   en: { legendTitle, legendMust, whyLabel, studyLabel, mustLabel,
 *         branches: [{ color, bg, border, title, children: [{ label, mk, info, why, topic }] }] },
 *   de: { ... },
 *   ar: { ... }   ← add this key to enable Arabic mindmap
 * }
 *
 * Expects containers: <div id="grid-{lang}"> and <div id="legend-{lang}">
 * @param {object} DATA - the mindmap data object
 */
function initMindmap(DATA) {
  document.addEventListener('DOMContentLoaded', function() {
    LANGS.forEach(function(lang) { buildGrid(lang, DATA); });
  });
}

function buildGrid(lang, DATA) {
  var d    = DATA[lang];
  var grid = document.getElementById('grid-' + lang);
  var leg  = document.getElementById('legend-' + lang);
  if (!grid || !d) return;

  var html = '';
  d.branches.forEach(function(b, bi) {
    html += '<div class="branch-card">'
          + '<div class="branch-header" style="background:' + b.bg + ';border-bottom-color:' + b.border + '">'
          + '<span class="branch-dot" style="background:' + b.color + '"></span>'
          + '<span class="branch-title">' + b.title + '</span>'
          + '</div><div class="branch-items">';

    b.children.forEach(function(c, ci) {
      var id = lang + '-' + bi + '-' + ci;
      html += '<button class="branch-item" id="btn-' + id + '"'
            + ' style="background:' + b.bg + ';border-color:' + b.border + '"'
            + ' onclick="toggleMindmapItem(\'' + id + '\',\'' + b.color + '\',\'' + b.bg + '\',\'' + b.border + '\')">'
            + '<span class="item-label">' + c.label + '</span>';
      if (c.mk) html += '<span class="must-badge">&#9873;</span>';
      html += '</button>';

      html += '<div class="item-panel" id="panel-' + id + '"'
            + ' style="border-left-color:' + b.color + ';border-right-color:' + b.color + ';background:' + b.bg + '">';
      if (c.mk) html += '<div class="must-know-inline">&#9873; ' + d.mustLabel + '</div>';
      html += '<p class="panel-info">' + c.info + '</p>'
            + '<div class="panel-meta">'
            + '<div class="panel-row"><span class="panel-row-label">' + d.whyLabel + '</span>'
            + '<span class="panel-row-text">' + c.why + '</span></div>'
            + '<div class="panel-row"><span class="panel-row-label">' + d.studyLabel + '</span>'
            + '<span class="panel-topic" style="color:' + b.color + '">' + c.topic + '</span></div>'
            + '</div></div>';
    });

    html += '</div></div>';
  });
  grid.innerHTML = html;

  if (leg) {
    var lh = '<div class="legend-title">' + d.legendTitle + '</div><div class="legend-items">';
    d.branches.forEach(function(b) {
      lh += '<div class="legend-item"><span class="legend-dot" style="background:' + b.color + '"></span>' + b.title + '</div>';
    });
    lh += '<div class="legend-must">' + d.legendMust + '</div></div>';
    leg.innerHTML = lh;
  }

  applyMindmapOpenState(lang);
}

function applyMindmapOpenState(lang) {
  var grid = document.getElementById('grid-' + lang);
  if (!grid) return;

  grid.querySelectorAll('.item-panel.open').forEach(function(p) { p.classList.remove('open'); });
  grid.querySelectorAll('.branch-item.active').forEach(function(b) {
    b.classList.remove('active');
    b.style.background  = '';
    b.style.borderColor = '';
    b.style.color       = '';
  });

  if (!mindmapOpenKey) return;

  var btn   = document.getElementById('btn-'   + lang + '-' + mindmapOpenKey);
  var panel = document.getElementById('panel-' + lang + '-' + mindmapOpenKey);
  if (!btn || !panel) return;

  panel.classList.add('open');
  btn.classList.add('active');
  btn.style.background  = mindmapOpenColor;
  btn.style.borderColor = mindmapOpenColor;
  btn.style.color       = '#fff';
}

/**
 * Toggle a mindmap item open/closed, keeping all language grids in sync.
 * Closing one closes all; opening one opens the same conceptual item in all.
 * @param {string} id    - the branch-child id, e.g. "en-0-1" or "ar-0-1"
 * @param {string} color - branch accent colour (active button fill)
 */
function toggleMindmapItem(id, color) {
  // id is "<lang>-<branchIndex>-<itemIndex>" — key drops the language prefix
  var parts = id.split('-');
  var key   = parts[1] + '-' + parts[2];

  if (mindmapOpenKey === key) {
    mindmapOpenKey   = null;
    mindmapOpenColor = null;
  } else {
    mindmapOpenKey   = key;
    mindmapOpenColor = color;
    // Mark as seen on first open (one-way, like q-card tracking)
    _lmsMindmapMark('bmap', id);
  }

  // Sync all language grids
  LANGS.forEach(function(lang) { applyMindmapOpenState(lang); });

  updateProgress();   // ← refresh bar immediately after each open

  if (mindmapOpenKey) {
    var panel = document.getElementById('panel-' + id);
    if (panel) {
      setTimeout(function() { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
    }
  }
}

/* ─────────────────────────────────────────────────────────────
   ADVANCED MINDMAP  (topic0b pattern, see theme.css .amap-*)
   Richer variant: must-know pill badge, structured why/study
   rows, colour-filled active state. Uses "amap-" classes and
   "agrid-"/"alegend-"/"abtn-"/"apanel-" ids exclusively so it
   never collides with the plain initMindmap() pattern above —
   safe to use both patterns in the same project.
───────────────────────────────────────────────────────────── */

/**
 * Build the advanced mindmap from a DATA object (same shape as initMindmap's DATA).
 * Wires DOMContentLoaded automatically, once per language.
 * Expects containers: <div id="agrid-{lang}"></div> and <div id="alegend-{lang}"></div>
 * Add an "ar" key to DATA to enable the Arabic grid.
 * @param {object} DATA - the mindmap data object
 */
function initMindmapAdvanced(DATA) {
  document.addEventListener('DOMContentLoaded', function() {
    LANGS.forEach(function(lang) { buildGridAdvanced(lang, DATA); });
  });
}

function buildGridAdvanced(lang, DATA) {
  var d    = DATA[lang];
  var grid = document.getElementById('agrid-' + lang);
  var leg  = document.getElementById('alegend-' + lang);
  if (!grid || !d) return;

  // Stamp the layout classes onto the containers if they are missing.
  // Without amap-grid the cards have no CSS grid parent and render as
  // invisible stacked blocks; without amap-legend the legend box is unstyled.
  if (!grid.classList.contains('amap-grid'))   grid.classList.add('amap-grid');
  if (leg && !leg.classList.contains('amap-legend')) leg.classList.add('amap-legend');

  var html = '';
  d.branches.forEach(function(b, bi) {
    html += '<div class="amap-card">'
          + '<div class="amap-header" style="background:' + b.bg + ';border-bottom-color:' + b.border + '">'
          + '<span class="amap-dot" style="background:' + b.color + '"></span>'
          + '<span class="amap-title">' + b.title + '</span>'
          + '</div><div class="amap-items">';

    b.children.forEach(function(c, ci) {
      var id = lang + '-' + bi + '-' + ci;
      html += '<button class="amap-item" id="abtn-' + id + '"'
            + ' style="background:' + b.bg + ';border-color:' + b.border + '"'
            + ' onclick="toggleMindmapItemAdvanced(\'' + id + '\',\'' + b.color + '\',\'' + b.bg + '\',\'' + b.border + '\')">'
            + '<span class="amap-item-label">' + c.label + '</span>';
      if (c.mk) html += '<span class="amap-badge">&#9873;</span>';
      html += '</button>';

      html += '<div class="amap-panel" id="apanel-' + id + '"'
            + ' style="border-left-color:' + b.color + ';border-right-color:' + b.color + ';background:' + b.bg + '">';
      if (c.mk) html += '<div class="amap-panel-must">&#9873; ' + d.mustLabel + '</div>';
      html += '<p class="amap-panel-info">' + c.info + '</p>'
            + '<div class="amap-panel-meta">'
            + '<div class="amap-panel-row"><span class="amap-row-label">' + d.whyLabel + '</span>'
            + '<span class="amap-row-text">' + c.why + '</span></div>'
            + '<div class="amap-panel-row"><span class="amap-row-label">' + d.studyLabel + '</span>'
            + '<span class="amap-panel-topic" style="color:' + b.color + '">' + c.topic + '</span></div>'
            + '</div></div>';
    });

    html += '</div></div>';
  });
  grid.innerHTML = html;

  if (leg) {
    var lh = '<div class="amap-legend-title">' + d.legendTitle + '</div><div class="amap-legend-items">';
    d.branches.forEach(function(b) {
      lh += '<div class="amap-legend-item"><span class="amap-legend-dot" style="background:' + b.color + '"></span>' + b.title + '</div>';
    });
    lh += '<div class="amap-legend-must">' + d.legendMust + '</div></div>';
    leg.innerHTML = lh;
  }
}

/**
 * Toggle an advanced-mindmap item open/closed.
 * Closes siblings within the same .tab-content (or document root).
 * @param {string} id     - the branch-child id, e.g. "ar-0-1"
 * @param {string} color  - branch accent colour (active button fill)
 * @param {string} bg     - branch background colour (idle button fill)
 * @param {string} border - branch border colour (idle button border)
 */
function toggleMindmapItemAdvanced(id, color, bg, border) {
  var panel  = document.getElementById('apanel-' + id);
  var btn    = document.getElementById('abtn-'   + id);
  if (!panel || !btn) return;
  var isOpen = panel.classList.contains('open');

  var tab = btn.closest('.tab-content') || document;
  tab.querySelectorAll('.amap-panel.open').forEach(function(p) { p.classList.remove('open'); });
  tab.querySelectorAll('.amap-item.active').forEach(function(b) {
    b.classList.remove('active');
    b.style.background  = '';
    b.style.borderColor = '';
    b.style.color       = '';
  });

  if (!isOpen) {
    panel.classList.add('open');
    btn.classList.add('active');
    btn.style.background  = color;
    btn.style.borderColor = color;
    btn.style.color       = '#fff';
    // Mark as seen on first open (one-way, like q-card tracking)
    _lmsMindmapMark('amap', id);
    setTimeout(function() { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
  }

  updateProgress();   // ← refresh bar immediately after each toggle
}

/* ─────────────────────────────────────────────────────────────
   LESSON NAVIGATION BAR  (Prev / Next)
   Auto-injected at the bottom of each lesson when running inside
   the LMS shell iframe. No per-lesson HTML changes required.

   Flow:
     DOMContentLoaded → _injectLessonNav()
       → appends .lnav to <body> (hidden)
       → posts lms:requestNavInfo to parent shell
     Parent shell (app.js) replies with lms:navInfo
       → _lmsApplyNavInfo() enables buttons and shows the bar
     switchTab(lang) → _lmsUpdateNavLabels(lang)
       → refreshes button text for the active language
     Button click → _lmsNavOpen(route)
       → posts lms:openLesson to parent (same bridge as lesson_index.html)
───────────────────────────────────────────────────────────── */

/** Multilingual button label strings. */
var _NAV_LABELS = {
  en: { prev: 'Previous Lesson', next: 'Next Lesson' },
  de: { prev: 'Vorherige Lektion', next: 'N\u00e4chste Lektion' },
  ar: { prev: '\u0627\u0644\u062f\u0631\u0633 \u0627\u0644\u0633\u0627\u0628\u0642', next: '\u0627\u0644\u062f\u0631\u0633 \u0627\u0644\u062a\u0627\u0644\u064a' }
};

/** Cached nav info so label updates survive language switches. */
var _navInfo = null;

/**
 * Inject the nav bar and ask the parent shell for prev/next data.
 * No-op when opened standalone (not inside the LMS iframe) or already injected.
 */
function _injectLessonNav() {
  if (window.parent === window) return;                         // standalone — skip
  if (document.getElementById('lms-lesson-nav')) return;       // already present

  var nav = document.createElement('nav');
  nav.id        = 'lms-lesson-nav';
  nav.className = 'lnav';
  nav.setAttribute('aria-label', 'Lesson navigation');
  nav.innerHTML =
      '<div class="lnav-inner">'
    +   '<button id="lnav-prev" class="lnav-btn lnav-prev" type="button"'
    +          ' disabled aria-disabled="true">'
    +     '<span class="lnav-arrow" aria-hidden="true">\u2190</span>'
    +     '<span class="lnav-text">'
    +       '<span class="lnav-label">Previous Lesson</span>'
    +       '<span class="lnav-title"></span>'
    +     '</span>'
    +   '</button>'
    +   '<button id="lnav-next" class="lnav-btn lnav-next" type="button"'
    +          ' disabled aria-disabled="true">'
    +     '<span class="lnav-text">'
    +       '<span class="lnav-label">Next Lesson</span>'
    +       '<span class="lnav-title"></span>'
    +     '</span>'
    +     '<span class="lnav-arrow" aria-hidden="true">\u2192</span>'
    +   '</button>'
    + '</div>';

  document.body.appendChild(nav);

  // Request prev/next info from the parent shell
  try {
    window.parent.postMessage({
      type:  'lms:requestNavInfo',
      route: location.pathname.replace(/^\//, '')   // e.g. lms/modules/github/topic1-branches.html
    }, '*');
  } catch (_) {}
}

/**
 * Apply nav info received from the parent shell.
 * Shows the bar only when at least one direction is navigable.
 * @param {{ prev:{title:string,route:string}|null, next:{title:string,route:string}|null }} info
 */
function _lmsApplyNavInfo(info) {
  _navInfo = info;
  var prevBtn = document.getElementById('lnav-prev');
  var nextBtn = document.getElementById('lnav-next');
  var navEl   = document.getElementById('lms-lesson-nav');
  if (!prevBtn || !nextBtn || !navEl) return;
  if (!info.prev && !info.next) return;    // no neighbours — keep bar hidden

  var lang = localStorage.getItem(LMS_LANG_KEY) || 'en';
  _lmsRenderNav(prevBtn, nextBtn, navEl, lang, info);
  navEl.style.display = 'block';
}

/**
 * Refresh button labels after a language switch.
 * No-op if nav info hasn't arrived yet or bar isn't visible.
 * @param {string} lang - 'en' | 'de' | 'ar'
 */
function _lmsUpdateNavLabels(lang) {
  if (!_navInfo) return;
  var prevBtn = document.getElementById('lnav-prev');
  var nextBtn = document.getElementById('lnav-next');
  var navEl   = document.getElementById('lms-lesson-nav');
  if (!prevBtn || !nextBtn || !navEl) return;
  _lmsRenderNav(prevBtn, nextBtn, navEl, lang, _navInfo);
}

/**
 * Internal: write button states, labels, titles and RTL direction.
 */
function _lmsRenderNav(prevBtn, nextBtn, navEl, lang, info) {
  var labels = _NAV_LABELS[lang] || _NAV_LABELS['en'];
  var isRtl  = (lang === 'ar');

  navEl.setAttribute('dir', isRtl ? 'rtl' : 'ltr');

  // ── Prev ────────────────────────────────────────────────────────────────
  if (info.prev) {
    prevBtn.disabled = false;
    prevBtn.removeAttribute('aria-disabled');
    prevBtn.querySelector('.lnav-label').textContent = labels.prev;
    prevBtn.querySelector('.lnav-title').textContent = info.prev.title;
    prevBtn.onclick = function() { _lmsNavOpen(info.prev.route); };
  } else {
    prevBtn.disabled = true;
    prevBtn.setAttribute('aria-disabled', 'true');
    prevBtn.querySelector('.lnav-label').textContent = labels.prev;
    prevBtn.querySelector('.lnav-title').textContent = '';
    prevBtn.onclick = null;
  }

  // ── Next ─────────────────────────────────────────────────────────────────
  if (info.next) {
    nextBtn.disabled = false;
    nextBtn.removeAttribute('aria-disabled');
    nextBtn.querySelector('.lnav-label').textContent = labels.next;
    nextBtn.querySelector('.lnav-title').textContent = info.next.title;
    nextBtn.onclick = function() { _lmsNavOpen(info.next.route); };
  } else {
    nextBtn.disabled = true;
    nextBtn.setAttribute('aria-disabled', 'true');
    nextBtn.querySelector('.lnav-label').textContent = labels.next;
    nextBtn.querySelector('.lnav-title').textContent = '';
    nextBtn.onclick = null;
  }
}

/**
 * Open a lesson via the parent shell's lms:openLesson bridge.
 * Keeps sidebar highlight and progress tracking accurate.
 * @param {string} route - registry route, e.g. 'lms/modules/github/topic2-pull-requests.html'
 */
function _lmsNavOpen(route) {
  if (window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'lms:openLesson', route: route }, '*');
      return;
    } catch (_) {}
  }
  location.href = route;   // standalone fallback
}

/* ─────────────────────────────────────────────────────────────
   LMS BRIDGE — postMessage listener
   Handles messages from the parent shell:

   lms:setLang      — Touch point ②: shell switched language;
                      mirror the change inside the lesson iframe.

   lms:progressData — Response to lms:requestProgress sent on load.
                      Contains the Firestore-authoritative progress
                      object for this lesson. Bridge merges it with
                      localStorage (remote wins on conflict, matching
                      migrateLocalStorageToFirestore in app.js) and
                      re-restores q-card open states.
───────────────────────────────────────────────────────────── */
window.addEventListener('message', function(e) {
  if (!e.data) return;

  // lms:setLang — existing touch point ②
  if (e.data.type === 'lms:setLang') {
    var lang = e.data.lang;
    if (!lang || LANGS.indexOf(lang) === -1) return;
    var matchBtn = null;
    document.querySelectorAll('.tab-btn').forEach(function(b) {
      if ((b.getAttribute('lang') || '') === lang ||
          (b.getAttribute('onclick') || '').indexOf("switchTab('" + lang + "'") !== -1) {
        matchBtn = b;
      }
    });
    switchTab(lang, matchBtn);
    return;
  }

  // lms:progressData — Firestore-authoritative state from parent shell
  if (e.data.type === 'lms:progressData' &&
      _LMS_PROGRESS_KEY &&
      e.data.storageKey === _LMS_PROGRESS_KEY) {
    var remoteData = e.data.data || {};
    if (Object.keys(remoteData).length === 0) return;

    var local  = _lmsLoadProgress();
    // Merge strategy: local first (baseline), remote overwrites on conflict.
    // This mirrors the merge in migrateLocalStorageToFirestore() in app.js so
    // both sides agree on which source wins (Firestore / most-recent-device).
    var merged = {};
    Object.keys(local).forEach(function(k)      { merged[k] = local[k]; });
    Object.keys(remoteData).forEach(function(k) { merged[k] = remoteData[k]; });

    _lmsWriteLocalOnly(merged);   // persist without echoing lms:progressChanged
    _lmsRestoreProgress(merged);  // open any newly-revealed q-cards
  }

  // lms:navInfo — prev/next lesson data from parent shell
  if (e.data.type === 'lms:navInfo') {
    _lmsApplyNavInfo(e.data);
  }
});