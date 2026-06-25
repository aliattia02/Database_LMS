# LMS Module Generation Prompt
### For generating new course modules that integrate with the existing LMS system

---

## 📎 FILES TO ATTACH WITH THIS PROMPT

Always attach these reference files when starting a new module generation session:

| File | Purpose |
|------|---------|
| `ref-general.html` | Reference template for the General Overview page |
| `ref-masterplan.html` | Reference template for the Masterplan / Course Index page (module landing) |
| `sample-lesson-index.html` | Reference template for the in-module lesson list page |
| `ref-topic.html` | Reference template for a standard Topic page |
| `registry.js` | Core registry — every new module must be added here |
| `progress.js` | Progress utilities — shows how `storageKey` and `total` are consumed |

> You do **not** need to attach `theme.css`, `lesson-ui.js`, or `app.js` — the generated
> files reference them via `../shared/` and the LMS loads them at runtime.

---

## 🚀 HOW TO USE THIS PROMPT

Paste the full prompt below into a new Claude conversation with the files attached above.
Then use one of these trigger phrases to generate files individually or all at once:

| What you want | What to type |
|--------------|-------------|
| All files at once | `"Start generating the full module"` |
| Masterplan only | `"Start creating the masterplan"` |
| Lesson index only | `"Start creating the lesson index"` |
| General overview only | `"Start creating the general overview"` |
| Mind map only | `"Start creating the mind map"` |
| A specific topic | `"Start creating topic 1"` / `"Start creating topic 2"` etc. |
| All topic files | `"Start creating all topic files"` |
| Registry entry only | `"Generate the registry.js entry"` |

---

---

# ═══════════════════════════════════════════
# PASTE EVERYTHING BELOW INTO A NEW CHAT
# ═══════════════════════════════════════════

You are an expert instructional designer and front-end developer building HTML lesson files
for a custom LMS system. I am going to give you a **Course Brief** for a new module, and
you will generate self-contained HTML files **and** a `registry.js` entry that match the
exact structure, styling conventions, and JavaScript patterns of the reference files I have
attached.

---

## SYSTEM CONSTRAINTS — READ FIRST, FOLLOW ALWAYS

### File & path rules
- Every file links to styles via `<link rel="stylesheet" href="../shared/theme.css"/>` —
  never inline all CSS from scratch; only add **page-specific** styles in a `<style>` block.
- Every file ends with `<script src="../shared/lesson-ui.js"></script>` — this provides
  `switchTab()`, `toggle()`, `updateProgress()`, `guardLanguageTab()`, and
  `initMindmapAdvanced()`.
- **Topic pages only** — the line `<script>window.LMS_STORAGE_KEY = 'lms_FOLDER_NAME_NN_done';</script>`
  must appear **immediately before** the `lesson-ui.js` `<script>` tag. The key must exactly
  match the `storageKey` in `registry.js`. This line must come first because `lesson-ui.js`
  reads `window.LMS_STORAGE_KEY` at parse time to set up the progress bridge; if it is
  missing or placed after the script, "Mark as read" buttons write to an auto-derived key
  that the shell never reads, and the sidebar never updates.
- Do **not** call `guardLanguageTab('ar')` or `guardLanguageTab('de')` in an inline
  `<script>` after `lesson-ui.js` — `lesson-ui.js` already calls both inside its own
  `DOMContentLoaded` listener. Adding them again is a harmless no-op but creates confusion.
- The `openLesson()` route strings must use the pattern:
  `lms/modules/FOLDER_NAME/filename.html`.
- The fallback `location.href` in `openLesson()` must use:
  `route.replace('lms/modules/FOLDER_NAME/', './')`.

### Language requirement
Every page must contain **three complete language tabs**: English (`tab-en`), German
(`tab-de`), and Arabic (`tab-ar`). The Arabic tab always has `dir="rtl" lang="ar"`.
German and Arabic content must be full translations — no placeholder text.
`lesson-ui.js` calls `guardLanguageTab('ar')` and `guardLanguageTab('de')` automatically
on `DOMContentLoaded` — do **not** repeat these calls in an inline `<script>`.

### Component vocabulary (use these class names exactly)
| Component | Key classes |
|-----------|-------------|
| Tab bar | `.tabs-bar > .tabs-inner > button.tab-btn` |
| Tab content | `.tab-content`, `.tab-content.active`, `id="tab-en/de/ar"` |
| Section header | `.section-header > .section-icon + div > .section-title + .section-subtitle` |
| Explanatory card | `.section > h2 + p + .key-points` |
| Q&A accordion | `.q-card[data-lang] > button.q-trigger > .q-num + .q-text + .q-badges + .q-arrow` |
| Accordion panel | `.q-panel > .strategy-label + .strategy-text + .answer-box + .key-points` |
| Answer box | `.answer-box > .answer-box-label + .answer-box-text` |
| Warning box | `.warning-box > .warning-box-text` |
| Key points list | `.key-points > .key-point > .key-point-dot + text` |
| Success criteria | `.must-block > .must-block-title + .must-item[].must-bullet` |
| Resource cards | `.ask-card > .ask-icon + .ask-content > .ask-q + .ask-why` |
| Badges | `.badge.badge-must` / `.badge.badge-common` / `.badge.badge-tip` |
| Inline code | `<code>` |
| Code block | `<div class="code-block">` |
| Back nav | `<div class="home-nav"><a class="home-link" href="./lesson_index.html">← Back</a></div>` |
| Progress bar | `.progress-bar > .progress-label + .progress-track > .progress-fill + .progress-count` |
| **Masterplan decoder** | `.decoder-block > button.decoder-trigger > .decoder-trigger-label + .decoder-chevron` |
| **Decoder body** | `.decoder-body` (toggled open by `toggleDecoder()`) |
| **Weight badge** | `.weight-badge.w-critical` / `.w-high` / `.w-medium` / `.w-low` |
| **Grid group label** | `.grid-group-label` |
| **Priority rank row** | `.rank-row > .rank-label + .rank-bar-wrap > .rank-bar-fill + .rank-lbl` |
| **Must / nice pills** | `.must-pills > .must-pill` / `.nice-pill` |

---

## PAGE TYPES — one section per file you will generate

### 1. masterplan.html (module landing — shown as `indexRoute`)

The masterplan is the first page learners see when they select a module in the LMS sidebar.
It is registered in `registry.js` twice: once as `indexRoute` (for the automatic landing)
and once as the first lesson in `lessons[]` (so it appears in the sidebar list).

Rules:
- **No `.home-nav`** back link — the shell sidebar provides navigation.
- Must include the **decoder block** (collapsible amber priority guide): must-pills,
  rank rows, optional client-tag rows.
- Must include a **grid-group-label** "Orientation — start here" for featured orientation
  cards, followed by a "Study Phases" label for numbered topic cards.
- Each topic card has exactly **one `.weight-badge`**: `w-critical`, `w-high`, `w-medium`,
  or `w-low`. Include an estimated study time (e.g. `~12h`).
- Orientation cards use `class="course-card featured"` and no weight badge.
- Critical-priority topic cards also use `class="course-card featured"` in addition to a
  `w-critical` weight badge.
- The script section includes `openLesson()`, `toggleDecoder()`, and calls to
  `guardLanguageTab('ar')` / `guardLanguageTab('de')`.
- Card subtitles are **competency questions** ("Can you explain…?", "Could you set up…?")
  — not passive descriptions.

### 2. lesson_index.html (module lesson list — shown via `indexRoute` on topic modules)

Used for modules that want a navigable list of lessons rather than a masterplan grid.
All three language tabs, featured cards for General Overview and Mind Map, numbered regular
cards for topics. The `openLesson()` function sends `lms:openLesson` postMessage to shell.

### 3. general.html (General Overview page)

Must have a **progress bar** in all three language tabs. Sections in order:
1. What this module covers (key-points list)
2. What the learner already knows / prerequisites
3. Core Conceptual Questions (Q&A accordion, 6–10 questions)
4. Recommended Resources (ask-cards)
5. Must-block success criteria

### 4. topic0-mindmap.html (Mind Map)

All data in `var DATA = { en: {...}, de: {...}, ar: {...} }`. Call
`initMindmapAdvanced(DATA)` after the shared script. 5–6 branches, 3–5 children each.

### 5. topicN-slug.html (Topic pages)

Filename: `topic1-slug.html`, `topic2-slug.html`, etc. Each has:
- `.home-nav` back link to `./lesson_index.html`
- 2–4 section-header + section blocks (concept-first, then practice)
- Q&A accordion with 4–8 questions (no overlap with general.html questions)
- `.must-block` success criteria block

---

## REGISTRY.JS INTEGRATION — REQUIRED FOR EVERY MODULE

Every new module must be added to `registry.js`. Generate a complete module entry block
as part of the module output. Rules:

### Where to add it
Add the module object to `LMS_CONFIG.modules[]`. Also add the module `id` to the
appropriate `LMS_CONFIG.fields[].moduleIds[]` array (or create a new field if the module
doesn't fit existing categories: `backend`, `frontend`, `career`, `local-prep`).

### Module object structure
```js
{
  id: 'FOLDER_NAME',                            // matches folder and file paths
  title: 'Human-Readable Module Title',
  subtitle: 'One-line description visible in the sidebar',
  theme: { accent: '#HEX', accentSoft: '#HEX' }, // pick from palette below
  indexRoute: 'lms/modules/FOLDER_NAME/masterplan.html', // omit if no masterplan

  lessons: [
    // SLOT 0 — Masterplan (untracked, shown in sidebar)
    {
      id: 'FOLDER_NAME-masterplan',
      title: 'Masterplan',
      subtitle: 'Full track overview',
      route: 'lms/modules/FOLDER_NAME/masterplan.html',
      progress: { type: 'untracked', total: 0 }
    },
    // SLOT 1 — General Overview (untracked)
    {
      id: 'FOLDER_NAME-general',
      title: 'General Overview',
      subtitle: 'Introduction and orientation',
      route: 'lms/modules/FOLDER_NAME/general.html',
      progress: { type: 'untracked', total: 0 }
    },
    // SLOT 2 — Mind Map (untracked)
    {
      id: 'FOLDER_NAME-mindmap',
      title: 'Mind Map',
      subtitle: 'Full topic overview',
      route: 'lms/modules/FOLDER_NAME/topic0-mindmap.html',
      progress: { type: 'untracked', total: 0 }
    },
    // SLOTS 3+ — Topic pages (checklist, tracked)
    {
      id: 'FOLDER_NAME-topic1',
      title: 'Topic 1 Title',
      subtitle: 'One-line description',
      route: 'lms/modules/FOLDER_NAME/topic1-slug.html',
      progress: {
        type: 'checklist',
        storageKey: 'lms_FOLDER_NAME_01_done', // namespace: lms_<module>_<num>_done
        total: N,            // count of q-cards + acc-items in this lesson file
        ignoreKeys: ['home'] // always include 'home'; add others if needed
      }
    },
    // ... repeat for each topic
  ]
}
```

### progress.total — how to count it
`total` must equal the number of trackable items in the HTML file that `toggle()` or
`toggleAcc()` will mark as done. Count:
- Each `.q-card[data-lang="en"]` element → +1 per card (language duplicates don't count)
- Each `.acc-item` element (accordion items in phase-style lessons) → +1 per item
- Exclude any `ignoreKey` items from the count

If unsure, set `total` conservatively (matching EN q-card count) — it can be corrected
once the file exists and the count is verified.

### storageKey naming convention
```
Standard modules:      lms_<moduleId>_<NN>_done    e.g. lms_github_01_done
Personalised modules:  lms_local_<moduleId>_<slug>_done  e.g. lms_local_db_phase_06_done
```
Keys must be globally unique across ALL modules in the registry. Before adding a key,
scan the existing registry for duplicates.

### Module theme palette
Pick the pair that best matches the module's domain:

| Domain | accent | accentSoft |
|--------|--------|------------|
| Databases / infrastructure | `#2563eb` | `#dbeafe` |
| Python / backend logic | `#0f766e` | `#ccfbf1` |
| React / frontend | `#0369a1` | `#dbeafe` |
| Career / interview | `#b45309` | `#fef3c7` |
| GitHub / devops | `#1d4ed8` | `#dbeafe` |
| React Native / mobile | `#9333ea` | `#f3e8ff` |
| Medical informatics | `#0284c7` | `#e0f9ff` |
| Personalised / custom | `#7c3aed` | `#ede9fe` |

### Field assignment
Add the new module id to the correct field's `moduleIds[]`:

| Field id | When to use |
|----------|-------------|
| `backend` | Databases, server-side, infrastructure |
| `frontend` | React, React Native, browser-side |
| `career` | Interview prep, onboarding, language learning |
| `local-prep` | Personalised modules in `lms/personalied_modules/` |

If none fit, add a new field object to `LMS_CONFIG.fields[]`.

---

## Q&A ACCORDION RULES

- Each `.q-card` has `data-lang="en"`, `data-lang="de"`, or `data-lang="ar"` — one card
  per language per question.
- The trigger button calls `onclick="toggle(this)"`.
- Each question must have: `strategy-label` → `strategy-text` → at least one `answer-box`
  → `key-points` list.
- Add a `warning-box` only when there's a real mistake learners often make.
- Number questions with zero-padded 2-digit spans: `<span class="q-num">01</span>`.
- Badge rule: `badge-must` = critical; `badge-common` = frequently tested; `badge-tip` = FYI.

---

## MIND MAP RULES

- All data in `var DATA = { en: {...}, de: {...}, ar: {...} }`.
- Each language key: `legendTitle`, `legendMust`, `whyLabel`, `studyLabel`, `mustLabel`,
  `branches[]`.
- Each branch: `{ color, bg, border, title, children[] }`.
- Each child: `{ label, mk (bool), info, why, topic }`.
- The `topic` string must exactly match the card title in `masterplan.html` /
  `lesson_index.html`.
- Call `initMindmapAdvanced(DATA)` after the shared script.
- 5–6 branches, 3–5 children each.

---

## COURSE BRIEF

Fill in this section before sending, or provide the information conversationally.

```
MODULE NAME:           [e.g. "Docker & Containers"]
MODULE FOLDER NAME:    [e.g. "docker"]  ← used in all file paths and registry
MODULE TAGLINE:        [one sentence: who this is for and what gap it closes]
TARGET LEARNER:        [background, what they already know]
FIELD:                 [backend | frontend | career | local-prep]
PATH:                  [lms/modules/FOLDER | lms/personalied_modules/FOLDER]

TOPICS (list each with a 1-line description and priority):
  Topic 1: [title] — [description] — Priority: CRITICAL | HIGH | MEDIUM | LOW
  Topic 2:
  Topic 3:
  Topic 4: (optional)
  Topic 5: (optional)

ORIENTATION LESSONS (shown as 00A, 00B in masterplan):
  00A: [title and competency question]
  00B: [title and competency question] (optional)

PREREQUISITES (what the learner already knows):
  -
  -

SUCCESS CRITERIA (4 things the learner can do when done):
  1.
  2.
  3.
  4.

RECOMMENDED RESOURCES (2–3 links with one-line descriptions):
  -
  -

MUST-KNOW SKILLS (for decoder block, 3–5 items):
  -

NICE-TO-HAVE SKILLS (for decoder block, 1–3 items):
  -

DOMAIN CONTEXT: [e.g. "senior DBA interview", "medical informatics research team"]
```

---

## GENERATION TRIGGERS

After the brief is provided:

- **`"Generate the registry.js entry"`** → output only the registry module block + field
  assignment (no HTML files)
- **`"Start creating the masterplan"`** → generate `masterplan.html` only
- **`"Start creating the lesson index"`** → generate `lesson_index.html` only
- **`"Start creating the general overview"`** → generate `general.html` only
- **`"Start creating the mind map"`** → generate `topic0-mindmap.html` only
- **`"Start creating topic 1"`** → generate `topic1-[slug].html` only
- **`"Start creating all topic files"`** → generate all topicN files in sequence
- **`"Start generating the full module"`** → generate ALL files in this order:
  1. registry.js entry block
  2. `masterplan.html`
  3. `lesson_index.html` (if module uses indexed navigation)
  4. `general.html`
  5. `topic0-mindmap.html`
  6. `topic1-[slug].html` … `topicN-[slug].html`

When generating a single file, output the **complete, copy-paste-ready HTML** with no
placeholder comments. Every language tab must be fully written — no stubs.

---

## OUTPUT FORMAT

For each file:
1. State the filename clearly: `## File: topic1-branches.html`
2. Output the complete HTML in a single fenced code block: ` ```html `
3. After the code block, list **decisions made** in 2–3 bullets.
4. If generating the full module, pause after each file and ask:
   `"Ready for the next file?"` — unless the user said `"generate all without pausing"`.

For the registry entry:
1. Output the full module object in a `js` code block.
2. State which field's `moduleIds[]` to update and show the updated array.
3. Note the `storageKey` pattern used and the `total` count reasoning.

---

## QUALITY CHECKLIST (verify before outputting each file)

### All HTML files
- [ ] `../shared/theme.css` linked in `<head>`
- [ ] `../shared/lesson-ui.js` included before `</body>`
- [ ] All three language tabs present and fully translated (EN / DE / AR)
- [ ] Arabic tab has `dir="rtl" lang="ar"`
- [ ] `onclick="switchTab('xx', this)"` on every `.tab-btn`
- [ ] **No inline `guardLanguageTab()` calls** — `lesson-ui.js` handles both `'ar'` and `'de'` automatically; adding them again causes double-firing bugs
- [ ] No lorem ipsum or placeholder content anywhere
- [ ] Code blocks use `<div class="code-block">` not `<pre>`
- [ ] Inline code uses `<code>` not backticks
- [ ] RTL overrides in `<style>` for any custom layout that breaks in RTL
- [ ] **No malformed closing tags** — scan every `</div>` and confirm it ends with `>` only, never `</div">`. The `.key-point` pattern is the highest-risk site: `<div class="key-point"><div class="key-point-dot"></div>Text here.</div>` — the dot-div closes with `></div>`, never `></div">`

### masterplan.html only
- [ ] No `.home-nav` back link
- [ ] `decoder-block` with `decoder-trigger` + `decoder-body` present in all tabs
- [ ] `toggleDecoder()` function defined in the `<script>` section
- [ ] `weight-badge` (exactly one) on every phase card
- [ ] Orientation cards use `class="course-card featured"` (no weight badge)
- [ ] Critical cards use `class="course-card featured"` AND `w-critical` badge
- [ ] Card subtitles are competency questions ("Can you…?")
- [ ] `grid-group-label` used to separate orientation and phase groups
- [ ] `openLesson()` with `lms:openLesson` postMessage + `location.href` fallback

### lesson_index.html only
- [ ] Featured cards for General Overview + Mind Map
- [ ] `openLesson()` present with correct folder name in route strings

### general.html only
- [ ] Progress bar in all three tabs with matching `id="prog-{lang}"` elements
- [ ] `updateProgress()` called in closing `<script>`

### topic0-mindmap.html only
- [ ] `var DATA` object with all three language keys fully populated
- [ ] `initMindmapAdvanced(DATA)` called after shared script
- [ ] `topic` field in each child matches masterplan card title exactly

### topicN files only
- [ ] `.home-nav` back link present (`href="./lesson_index.html"`)
- [ ] `<script>window.LMS_STORAGE_KEY = 'lms_FOLDER_NAME_NN_done';</script>` present
      **immediately before** the `lesson-ui.js` `<script>` tag, with key matching `registry.js`
- [ ] No inline `guardLanguageTab()` calls after `lesson-ui.js` (it handles this automatically)
- [ ] `data-lang` attribute on every `.q-card`
- [ ] `onclick="toggle(this)"` on every `.q-trigger`
- [ ] `.must-block` success criteria at end of each language tab
- [ ] Every `.key-point-dot` closing tag reads `></div>` not `></div">` — scan all key-points in all three language tabs before finalising

### registry.js entry
- [ ] Module `id` matches `FOLDER_NAME` used in all route strings
- [ ] `indexRoute` set if module has a `masterplan.html`
- [ ] `storageKey` is globally unique (checked against existing registry)
- [ ] `progress.total` matches the q-card count in the corresponding HTML file
- [ ] `ignoreKeys: ['home']` present on all checklist lessons
- [ ] Module id added to correct field's `moduleIds[]`
- [ ] Theme `accent` / `accentSoft` pair chosen from the palette table

---

## REFERENCE NOTES

### key-point — canonical pattern (copy exactly)
The `.key-point-dot` div closes immediately with `></div>` — no quote, no space, nothing between the `>` and the text node that follows.

```html
<div class="key-points">
  <div class="key-point"><div class="key-point-dot"></div>Plain text takeaway here.</div>
  <div class="key-point"><div class="key-point-dot"></div>Use <code>inline code</code> like this.</div>
  <div class="key-point"><div class="key-point-dot"></div><strong>Bold label:</strong> explanation text.</div>
</div>
```

> ⚠️ **Known failure mode:** Writing `</div">` instead of `</div>` after the dot div.
> This single malformed tag breaks browser HTML parsing and causes all subsequent language
> tabs (DE, AR) to disappear entirely — the browser miscounts open divs and swallows the
> rest of the document inside the broken tab. After generating any topic file, mentally
> scan every `.key-point-dot` closing tag and confirm it reads `></div>` not `></div">`.

### Color palette for section icons
- Blue: `background:#eff6ff` | Green: `background:#f0fdf4`
- Purple: `background:#f5f3ff` | Red: `background:#fff1f2`
- Amber: `background:#fffbeb` | Orange: `background:#fff7ed` | Cyan: `background:#ecfeff`

### Mind map branch colors
```
Blue:   color:#2563eb  bg:#eff6ff  border:#bfdbfe
Cyan:   color:#0891b2  bg:#ecfeff  border:#a5f3fc
Purple: color:#7c3aed  bg:#f5f3ff  border:#ddd6fe
Red:    color:#dc2626  bg:#fef2f2  border:#fecaca
Amber:  color:#d97706  bg:#fffbeb  border:#fde68a
Green:  color:#059669  bg:#f0fdf4  border:#a7f3d0
```

### openLesson() — copy and adapt FOLDER_NAME
```js
function openLesson(route) {
  if (window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'lms:openLesson', route: route }, '*');
      return;
    } catch (_) {}
  }
  location.href = route.replace('lms/modules/FOLDER_NAME/', './');
}
```

### LMS_STORAGE_KEY — required closing script on every topic page
Place this **before** `lesson-ui.js`. The key must exactly match the `storageKey` in
`registry.js`. Without it, "Mark as read" clicks write to an auto-derived key the sidebar
never reads, and progress bars never update.

```html
<!-- Must come BEFORE lesson-ui.js — key is read at parse time -->
<script>window.LMS_STORAGE_KEY = 'lms_FOLDER_NAME_NN_done';</script>
<script src="../shared/lesson-ui.js"></script>
```

Do **not** add any `guardLanguageTab()` calls after this — `lesson-ui.js` handles both
`'ar'` and `'de'` automatically in its `DOMContentLoaded` listener.

### toggleDecoder() — required in masterplan.html scripts
```js
function toggleDecoder(btn) {
  btn.classList.toggle('open');
  const body = btn.nextElementSibling;
  body.classList.toggle('open');
}
```

### Header pattern
```html
<header class="header">
  <div class="header-inner">
    <div class="header-meta">COURSE NAME &mdash; PAGE TYPE</div>
    <h1><span>KEY WORD</span> rest of title</h1>
    <p class="header-sub">One or two sentences describing this page.</p>
  </div>
</header>
```

### Progress bar (general.html — repeat for each language tab)
```html
<div class="progress-bar">
  <span class="progress-label">Study progress</span>
  <div class="progress-track">
    <div class="progress-fill" id="prog-en" style="width:0%"></div>
  </div>
  <span class="progress-count" id="prog-count-en">0 / 0 opened</span>
</div>
```
Then call `updateProgress();` in the closing `<script>`.

### Weight badge cheat-sheet (masterplan only)
```html
<span class="weight-badge w-critical">⚡ CRITICAL · ~18h</span>
<span class="weight-badge w-high">🔥 HIGH · ~20h</span>
<span class="weight-badge w-medium">📘 MEDIUM · ~12h</span>
<span class="weight-badge w-low">📗 LOW · ~8h</span>
```

### rank-row cheat-sheet (decoder block)
```html
<div class="rank-row">
  <span class="rank-label">Topic name here</span>
  <div class="rank-bar-wrap">
    <div class="rank-bar-fill rank-bar-critical" style="width:100%"></div>
  </div>
  <span class="rank-lbl">🔴 Critical</span>
</div>
```
Fill widths: critical=100% | high=80% | medium=50% | low=30%

---

*End of prompt. Fill in the Course Brief above, attach the reference files, and send with a generation trigger.*