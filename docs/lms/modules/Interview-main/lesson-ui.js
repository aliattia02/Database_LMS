/**
 * lesson-ui.js — Interview-main shared UI utilities
 *
 * Provides:
 *   switchTab(lang, btn)          — tab bar switching (EN / DE / AR)
 *   toggleAcc(trigger)            — single-open accordion (acc-trigger / acc-body)
 *   toggleSection(trigger)        — collapsible section (section-toggle / section-body)
 *   toggle(btn)                   — q-card accordion with progress tracking
 *   updateProgress()              — recalculate progress bars for all language tabs
 *   initMindmap(DATA)             — build the branch-grid mindmap (topic0)
 *   toggleMindmapItem(id, color)  — mindmap item expand/collapse, all-lang-synced
 *   applyMindmapOpenState(lang)   — internal: re-render open/closed state for one grid
 *   initMindmapAdvanced(DATA)     — build the richer "amap-" branch-grid mindmap (topic0b)
 *   toggleMindmapItemAdvanced(id, ...) — advanced mindmap item expand / collapse
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
});

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
  } else {
    html += '<h2 class="ntb-title">This lesson isn\u2019t available in '
          + (lang === 'de' ? 'German' : lang.toUpperCase())
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
 */
function updateProgress() {
  LANGS.forEach(function(lang) {
    var tab = document.getElementById('tab-' + lang);
    if (!tab) return;
    var total  = tab.querySelectorAll('.q-card').length;
    var count  = tab.querySelectorAll('.q-trigger.open').length;
    var pct    = total > 0 ? Math.round((count / total) * 100) : 0;

    var fill   = document.getElementById('prog-' + lang);
    var label  = document.getElementById('prog-count-' + lang);
    if (fill)  fill.style.width = pct + '%';
    if (label) {
      if (lang === 'en') label.textContent = count + ' / ' + total + ' opened';
      else if (lang === 'de') label.textContent = count + ' / ' + total + ' geöffnet';
      else if (lang === 'ar') label.textContent = count + ' / ' + total + ' مفتوح';
      else label.textContent = count + ' / ' + total;
    }
  });
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
  }

  // Sync all language grids
  LANGS.forEach(function(lang) { applyMindmapOpenState(lang); });

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
    setTimeout(function() { panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
  }
}