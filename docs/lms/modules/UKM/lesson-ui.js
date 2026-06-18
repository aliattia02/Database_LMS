/**
 * lesson-ui.js — Interview-main shared UI utilities
 *
 * Provides:
 *   switchTab(lang, btn)          — tab bar switching (EN / DE)
 *   toggleAcc(trigger)            — single-open accordion (acc-trigger / acc-body)
 *   toggleSection(trigger)        — collapsible section (section-toggle / section-body)
 *   toggle(btn)                   — q-card accordion with progress tracking
 *   updateProgress()              — recalculate progress bars for both tabs
 *   initMindmap(DATA)             — build the branch-grid mindmap (topic0)
 *   toggleMindmapItem(id, color)  — mindmap item expand/collapse, EN/DE-synced
 *   applyMindmapOpenState(lang)   — internal: re-render open/closed state for one grid
 *   initMindmapAdvanced(DATA)     — build the richer "amap-" branch-grid mindmap (topic0b)
 *   toggleMindmapItemAdvanced(id, ...) — advanced mindmap item expand / collapse
 *
 * Usage in a lesson page:
 *   <script src="../shared/lesson-ui.js"></script>
 *   Then call whichever functions you need from onclick= attributes or
 *   DOMContentLoaded listeners in a small inline <script>.
 */

/* ─────────────────────────────────────────────────────────────
   TAB SWITCHING
───────────────────────────────────────────────────────────── */

/**
 * Switch the visible tab and optionally close open accordions.
 * @param {string}          lang       - tab id suffix, e.g. 'en' or 'de'
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
 * Recalculate and update progress bars for both EN and DE tabs.
 * Looks for elements: #prog-{lang} (fill bar) and #prog-count-{lang} (label).
 */
function updateProgress() {
  ['en', 'de'].forEach(function(lang) {
    var tab = document.getElementById('tab-' + lang);
    if (!tab) return;
    var total  = tab.querySelectorAll('.q-card').length;
    var count  = tab.querySelectorAll('.q-trigger.open').length;
    var pct    = total > 0 ? Math.round((count / total) * 100) : 0;

    var fill   = document.getElementById('prog-' + lang);
    var label  = document.getElementById('prog-count-' + lang);
    if (fill)  fill.style.width = pct + '%';
    if (label) label.textContent = lang === 'en'
      ? count + ' / ' + total + ' opened'
      : count + ' / ' + total + ' geöffnet';
  });
}

/* ─────────────────────────────────────────────────────────────
   MINDMAP  (topic0-mindmap.html pattern)
   The EN and DE grids are two renderings of one open/closed
   state (mindmapOpenKey/mindmapOpenColor below), so switching
   tabs always shows the same conceptually-open item rather than
   a stale one from whichever tab was last clicked.
───────────────────────────────────────────────────────────── */

var mindmapOpenKey   = null;
var mindmapOpenColor = null;

/**
 * Build the branch-grid mindmap from a DATA object.
 * Called once per language on DOMContentLoaded.
 *
 * Expected DATA shape:
 * {
 *   en: {
 *     legendTitle: string,
 *     legendMust:  string,
 *     whyLabel:    string,
 *     studyLabel:  string,
 *     mustLabel:   string,
 *     branches: [
 *       { color, bg, border, title, children: [
 *         { label, mk, info, why, topic }
 *       ]}
 *     ]
 *   },
 *   de: { ... }
 * }
 *
 * @param {object} DATA - the mindmap data object
 */
function initMindmap(DATA) {
  document.addEventListener('DOMContentLoaded', function() {
    ['en', 'de'].forEach(function(lang) { buildGrid(lang, DATA); });
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
            + ' style="border-left-color:' + b.color + ';background:' + b.bg + '">';
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

  // Re-apply whatever item is currently open, so rebuilding a
  // grid (e.g. on first load) reflects shared state immediately.
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
 * Toggle a mindmap item open/closed, keeping the EN and DE grids
 * in sync (closing one closes both; opening one opens the same
 * conceptual item in both).
 * @param {string} id    - the branch-child id, e.g. "en-0-1"
 * @param {string} color - branch accent colour (active button fill)
 */
function toggleMindmapItem(id, color) {
  // id is "<lang>-<branchIndex>-<itemIndex>" — key drops the language
  var parts = id.split('-');
  var key   = parts[1] + '-' + parts[2];

  if (mindmapOpenKey === key) {
    mindmapOpenKey   = null;
    mindmapOpenColor = null;
  } else {
    mindmapOpenKey   = key;
    mindmapOpenColor = color;
  }

  applyMindmapOpenState('en');
  applyMindmapOpenState('de');

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
 * Build the advanced mindmap from a DATA object (same shape as
 * initMindmap's DATA — see docblock above). Wires DOMContentLoaded
 * automatically, once per language.
 * Expects containers: <div id="agrid-{lang}"></div> and <div id="alegend-{lang}"></div>
 * @param {object} DATA - the mindmap data object
 */
function initMindmapAdvanced(DATA) {
  document.addEventListener('DOMContentLoaded', function() {
    ['en', 'de'].forEach(function(lang) { buildGridAdvanced(lang, DATA); });
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
            + ' style="border-left-color:' + b.color + ';background:' + b.bg + '">';
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
 * @param {string} id     - the branch-child id, e.g. "en-0-1"
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