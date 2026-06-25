# New LMS Module Creation Prompt
<!-- Save this file. To create a new module, paste its entire contents into a new
     Claude conversation, then add your instructions below the divider at the bottom. -->

> **Scope note:** this prompt covers **Path A — static, file-based modules**
> registered in `registry.js`. The platform is Firebase-backed (auth,
> per-user/tier access control, an admin console, personalized lessons, and
> admin-authored dynamic courses) — see the platform documentation and
> `repository-structure.md` for the full picture. If the content doesn't
> need to live in git (AI-drafted, one-off, or frequently revised), use the
> admin **Courses** tab or **Requests** tab instead; see
> `contribution-workflow.md`.

---

## Context: what this LMS is

A file-based learning system. No build step, no framework. Every module is a self-contained folder inside `docs/lms/modules/` (or `docs/lms/personalied_modules/` for a personalized-tree variant — note the intentionally-kept folder-name typo, see `naming-versioning-conventions.md`). Each module folder holds only its own content:

| File | Role |
|---|---|
| `index.html` | Module landing page — links to all topic pages |
| `topicN-slug.html` | Individual topic/lesson pages |

`theme.css` (design tokens/styles) and `lesson-ui.js` (tab switching, accordions, sections, progress bars, mindmap) are **not** duplicated per module — they live once at `docs/lms/modules/shared/` (or `docs/lms/personalied_modules/shared/` for the personalized tree) and every module folder references them one directory up: `../shared/theme.css`, `../shared/lesson-ui.js`. Same-folder links (`./index.html`) are used only for files that actually live in that module's own folder. No CDN, no imports, no bundler.

---

## Folder naming convention

```
docs/lms/modules/<module-id>/
```

`<module-id>` should be lowercase kebab-case and match the `id` you'll register in `registry.js` exactly (see `naming-versioning-conventions.md`). A `<Category>-<name>` style id (e.g. `Interview-main`) is acceptable for thematic grouping but is **not required** — plain kebab-case names (`database`, `python`, `react`, `react-native`) are equally valid and are what most existing modules use. Don't invent a new prefix scheme; check `registry.js` for the closest existing module and follow its pattern.

Examples already in the repo:
- `Interview-main/` — Treuhandstelle interview prep
- `database/` — MariaDB/MySQL curriculum
- `python/` — Python curriculum
- `react/`, `react-native/` — frontend curricula

Personalized-tree variants live in `docs/lms/personalied_modules/<module-id>_pers/` (e.g. `database_pers/`), registered as a separate module id suffixed `-pers`.

---

## Shared files — reference, don't copy

The design system and runtime live **once**, shared across all modules in a
tree:

```
docs/lms/modules/shared/theme.css
docs/lms/modules/shared/lesson-ui.js
```

(the personalized tree has its own parallel copy at
`docs/lms/personalied_modules/shared/`). **Do not copy these files into
your new module folder** — every module folder references the shared
files one directory up:

```html
<link rel="stylesheet" href="../shared/theme.css" />
<script src="../shared/lesson-ui.js"></script>
```

Copying them per-module would defeat the point of having a shared design
system (every module would drift independently). If you genuinely need new
shared components or styles, add them to the shared files directly — see
`module-authoring-guide.md`.

---

## Files to generate

### 1. `index.html` — module landing page

Use this exact template. Fill in the three `<!-- FILL -->` values:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><!-- FILL: Module title --></title>
  <link rel="stylesheet" href="../shared/theme.css" />
  <style>
    body { padding: 24px; }
    .container {
      max-width: 900px; margin: 0 auto;
      background: var(--white); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 24px;
    }
    h1 { margin-top: 0; }
    p  { color: var(--muted); }
    a  { color: var(--blue); text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    .note {
      margin-top: 20px; padding: 12px; border: 1px solid var(--border);
      border-radius: 8px; background: #f1f5f9; color: var(--muted); font-size: 14px;
    }
    .meta-pill {
      display: inline-block; background: var(--blue-bg); color: var(--blue-text);
      border: 1px solid var(--blue-border); font-size: 11px; font-weight: 700;
      letter-spacing: .06em; text-transform: uppercase;
      padding: 3px 10px; border-radius: 99px; margin-bottom: 14px;
    }
    .topic-link {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 14px 16px; border: 1px solid var(--border);
      border-radius: var(--radius); margin-bottom: 10px;
      text-decoration: none; color: inherit;
      transition: border-color .15s, box-shadow .15s;
    }
    .topic-link:hover { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-bg); }
    .topic-num {
      flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
      background: var(--blue); color: #fff; font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; margin-top: 1px;
    }
    .topic-text strong { display: block; font-size: 14.5px; color: var(--navy); margin-bottom: 3px; }
    .topic-text span   { font-size: 12.5px; color: var(--muted); font-weight: 400; }
    ul.plain { list-style: none; padding: 0; margin: 0; }
  </style>
</head>
<body>
  <main class="container">
    <div class="meta-pill"><!-- FILL: Organisation · Department --></div>
    <h1><!-- FILL: Module title --></h1>
    <p><!-- FILL: One-sentence description of what this module covers --></p>

    <ul class="plain" style="margin-top: 20px;">

      <li>
        <a class="topic-link" href="./topic1-SLUG.html">
          <div class="topic-num">1</div>
          <div class="topic-text">
            <strong>Topic title</strong>
            <span>Keyword · Keyword · Keyword</span>
          </div>
        </a>
      </li>

      <!-- Duplicate the <li> block above for each additional topic -->

    </ul>

    <div class="note">
      Add new topic pages above as the module grows. Each page only needs content —
      all styles and scripts are in <code>theme.css</code> and <code>lesson-ui.js</code>.
    </div>
  </main>
</body>
</html>
```

---

### 2. `topicN-slug.html` — topic/lesson page

#### Page skeleton (always start here)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Topic N — Page Title | Module Name</title>
  <link rel="stylesheet" href="../shared/theme.css"/>
  <style>
    /* Page-specific styles only — no overriding theme.css base tokens here */
  </style>
</head>
<body>

<div class="home-nav">
  <a class="home-link" href="./index.html">← Back to main page</a>
</div>

<div class="header">
  <div class="header-inner">
    <div class="header-meta">Module Name &nbsp;·&nbsp; Topic N of X</div>
    <h1><span>Highlighted term</span> and rest of title</h1>
    <p class="header-sub">One-sentence context line shown under the title.</p>
  </div>
</div>

<div class="tabs-bar">
  <div class="tabs-inner">
    <button class="tab-btn active" onclick="switchTab('en', this)">English</button>
    <button class="tab-btn"        onclick="switchTab('de', this)">Deutsch</button>
  </div>
</div>

<div class="body">

<!-- ═══ ENGLISH TAB ═══ -->
<div id="tab-en" class="tab-content active">
  <!-- sections go here -->
</div>

<!-- ═══ DEUTSCH TAB ═══ (omit entirely if page is English-only) -->
<div id="tab-de" class="tab-content">
  <!-- sections go here -->
</div>

</div><!-- /body -->

<script src="../shared/lesson-ui.js"></script>
</body>
</html>
```

If the page is **single-language**, remove the `<div class="tabs-bar">` block and the second `tab-content` div, and change `id="tab-en" class="tab-content active"` to just `class="body-inner"` (or remove the wrapper entirely).

---

## Component library — copy-paste blocks

All components below are already styled by `theme.css`. Add page-specific CSS only for elements that do not exist in the theme.

---

### Collapsible section (outer container)

```html
<div class="section">
  <button class="section-toggle open" onclick="toggleSection(this)">
    <div class="toggle-left">
      <div class="section-label">Section N</div>
      <h2>Section heading</h2>
    </div>
    <span class="section-chevron">▾</span>
  </button>
  <div class="section-body">
    <!-- content here -->
  </div>
</div>
```

Remove `open` from `section-toggle` to render collapsed by default.

---

### Amber must-know / warning panel

Same structure as a section, but use `<div class="must-know">` as the outer wrapper:

```html
<div class="must-know">
  <button class="section-toggle open" onclick="toggleSection(this)">
    <div class="toggle-left">
      <div class="section-label">Section N</div>
      <h2>Heading</h2>
    </div>
    <span class="section-chevron">▾</span>
  </button>
  <div class="section-body">
    <div class="must-know-list">
      <div class="must-know-item"><span class="flag">⚑</span><span>Item text</span></div>
      <div class="must-know-item"><span class="flag">⚑</span><span>Item text</span></div>
    </div>
  </div>
</div>
```

---

### Accordion (single-open, inside a section-body)

```html
<div class="accordion">

  <div class="acc-item">
    <button class="acc-trigger" onclick="toggleAcc(this)">
      <span>Question or trigger label</span>
      <span class="acc-chevron">▾</span>
    </button>
    <div class="acc-body">
      <div class="acc-strategy-label">Your response</div>
      <p>Answer text here.</p>
    </div>
  </div>

  <!-- repeat acc-item blocks -->

</div>
```

---

### Learning ladder (numbered phases or levels)

```html
<div class="ladder">

  <div class="ladder-level">
    <div class="level-head">
      <span class="level-pill l1">Phase 1</span>  <!-- l1 grey · l2 blue · l3 green · l4 purple -->
      <span class="level-title">Phase or level title</span>
    </div>
    <div class="level-bullets"><ul>
      <li>Bullet point</li>
      <li>Bullet point</li>
    </ul></div>
  </div>

  <!-- repeat ladder-level blocks -->

</div>
```

Pill colour classes: `l1` (grey) · `l2` (blue) · `l3` (green) · `l4` (purple). For an amber highlight, add inline style `background: #d97706; color: #fff;` or define `.ph-amber` in your page-specific CSS.

---

### Connection / action cards grid

```html
<div class="connections-grid">
  <div class="connection-card">
    <span class="conn-badge">Label</span>
    <span class="conn-text">Card body text.</span>
  </div>
  <!-- repeat -->
</div>
```

---

### Phrase box (German phrase + English gloss)

Add `.phrase-box`, `.phrase-de`, `.phrase-en` to your page-specific CSS if this page needs them (copy from `meeting-hoffmann.html`):

```css
.phrase-box {
  background: #f0f9ff; border: 1px solid #bae6fd;
  border-left: 4px solid #0284c7; border-radius: 8px;
  padding: 13px 16px; margin-bottom: 10px;
}
.phrase-de {
  display: block; font-style: italic; font-weight: 600;
  color: #0c4a6e; font-size: 13.5px; line-height: 1.55; margin-bottom: 5px;
}
.phrase-en { display: block; color: #64748b; font-size: 12px; line-height: 1.5; }
.phrase-note { font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 6px; margin-bottom: 10px; }
```

Usage:
```html
<div class="phrase-box">
  <span class="phrase-de">German phrase here.</span>
  <span class="phrase-en">English translation here.</span>
</div>
<p class="phrase-note">Context note in small text.</p>
```

---

### Status table (document checklist style)

```html
<table class="glossary-table">
  <thead><tr><th>Item</th><th>Details</th><th>Status</th></tr></thead>
  <tbody>
    <tr class="table-group-header"><td colspan="3">Group heading</td></tr>
    <tr>
      <td>Document name</td>
      <td>Detail text</td>
      <td><span class="doc-ok">✓ Ready</span></td>
    </tr>
    <tr>
      <td>Document name</td>
      <td>Detail text</td>
      <td><span class="doc-pending">⚠ Pending</span></td>
    </tr>
  </tbody>
</table>
```

Add `.doc-ok` / `.doc-pending` / `.table-group-header` to page CSS if not already there (copy from `meeting-hoffmann.html` `<style>` block).

---

### Q&A card with progress tracking (general.html style)

Used for interview Q&A with a checkbox/progress system. Requires this structure:

```html
<div class="q-card" id="q1">
  <button class="q-trigger" onclick="toggle(this)">
    <span class="q-num">1</span>
    <span class="q-text">Question text?</span>
    <span class="badge badge-must">Must</span>   <!-- or badge-common / badge-tricky -->
    <span class="q-arrow">▾</span>
  </button>
  <div class="q-panel">
    <div class="strategy-label">Strategy</div>
    <div class="strategy-text">Framing advice here.</div>
    <div class="answer-box">
      <div class="answer-box-label">Sample answer</div>
      <div class="answer-box-text">Answer text here.</div>
    </div>
  </div>
</div>
```

Add `.badge`, `.badge-must`, `.badge-common`, `.badge-tricky`, `.q-trigger`, `.q-panel`, `.strategy-label`, `.strategy-text`, `.answer-box`, `.answer-box-label`, `.answer-box-text` to your page CSS (copy from `general.html`).

---

## Rules for converting an existing HTML page into a topic page

If the user provides an existing `.html` file as content for a topic, apply these changes:

1. **`<title>`** → `Topic N — Page title | Module Name`
2. **`header-meta`** → `Module Name &nbsp;·&nbsp; Topic N &nbsp;·&nbsp; [date or context]`
3. **`<link rel="stylesheet">`** → must point to `../shared/theme.css`
4. **`<script src="...">`** → must point to `../shared/lesson-ui.js` and be the last element before `</body>`
5. **Back link** → `<a class="home-link" href="./index.html">← Back to main page</a>` — already correct if the file already uses `./index.html`
6. Do **not** change any content, component structure, or page-specific CSS.

---

## How to use this prompt

1. Start a new Claude conversation.
2. Paste this entire file.
3. Upload any existing HTML files that will become topic pages.
4. Then add your specific instruction, for example:

---

### Your instruction goes here

> **Module name:** [e.g. Interview-research]
> **Folder:** `docs/lms/modules/Interview-research/`
> **Organisation / department pill:** [e.g. Universitätsmedizin Frankfurt · IMI]
> **Module title:** [e.g. Research Interview Prep]
> **Module description:** [one sentence]
>
> **Topics:**
> - Topic 1: [title] — [filename slug] — [attached file or "create from scratch"]
> - Topic 2: [title] — [filename slug] — [attached file or "create from scratch"]
>
> **Language tabs:** EN only / EN + DE / DE only
>
> **Field:** [backend / frontend / career / new field — if new, give title + icon + accent colour]
>
> **Additional notes:** [anything special — new CSS components needed, specific content requirements, etc.]

---

## Registry update — `docs/lms/core/registry.js`

Every new module must be registered in `LMS_CONFIG` in `registry.js`. There are **two places** to edit.

### Step 1 — add the module to a field's `moduleIds`

Find the right field object in the `fields` array and append your new module id:

| Field id | Use for |
|---|---|
| `backend` | Databases, servers, infrastructure |
| `frontend` | React, React Native, web UI |
| `career` | Interview prep, job start, onboarding, workplace German |

If none of the existing fields fits, add a new field object to the `fields` array:

```js
{
  id: 'your-field-id',
  title: 'Field Display Name',
  subtitle: 'One-line description',
  icon: '📋',                              // pick a relevant emoji
  theme: { accent: '#HEX', accentSoft: '#HEX' },
  moduleIds: ['your-module-id']
}
```

A module can appear in more than one field (like `python` appears in both `backend` and `frontend`) — progress is shared.

---

### Step 2 — add the module object to `modules`

Append a new object to the `modules` array. Place it near related modules (e.g. after `interview` for a career module):

```js
{
  id: 'your-module-id',           // must match what you put in moduleIds above
  title: 'Module Display Name',
  subtitle: 'One-line description shown in the sidebar',
  theme: { accent: '#HEX', accentSoft: '#HEX' },
  indexRoute: 'lms/modules/FOLDER-NAME/index.html',   // optional — shows this page immediately on module select instead of the generic welcome panel
  lessons: [
    {
      id: 'lesson-unique-id',     // kebab-case, unique across ALL modules
      title: 'Lesson Title',
      subtitle: 'Short description shown under the title',
      route: 'lms/modules/FOLDER-NAME/topicN-slug.html',   // relative to docs/
      progress: { type: 'untracked', total: 0 },           // see progress types below
      requiresAuth: false,        // optional — gate this lesson behind sign-in
      requiresPro: false          // optional — gate behind the 'pro' tier; implies requiresAuth
    }
    // add more lessons here
  ]
}
```

Omit `requiresAuth`/`requiresPro` entirely for an ungated lesson — don't set them to `false` explicitly unless you're intentionally documenting that the gate was considered and rejected.

#### Progress types

| `type` | When to use | Extra fields needed |
|---|---|---|
| `untracked` | Static/reference pages — no checkboxes | none |
| `checklist` | Pages with interactive checkboxes | `storageKey` (unique string), `total` (number of checkboxes), `ignoreKeys: ['home']` |

`storageKey` naming convention:
- Shared-tree modules: `lms_<moduleid>_<lessonN>_done` — e.g. `lms_ukm_01_done`.
- Personalized-tree modules (`lms/personalied_modules/`): `lms_local_<slug>_done`.

**Storage keys are global, not per-field or per-module** — pick one that doesn't collide with any other lesson's key anywhere in `registry.js`, not just within this module.

If you're duplicating an existing module into the personalized tree, register it as a separate module id (e.g. `<name>-pers`) with `route`s pointing at the `personalied_modules/` copies.

---

### Complete example — the UKM module (already in registry)

> Note: in the current repo, the UKM content lives in the **personalized
> tree** (`docs/lms/personalied_modules/UKM_pers/`), not
> `docs/lms/modules/UKM/`. The example below reflects that — if you're
> registering a genuinely shared (non-personalized) module, point `route`
> at `lms/modules/<id>/...` instead.

```js
// In fields:
{
  id: 'career',
  title: 'Career & Onboarding',
  subtitle: 'Interview prep, job start, and workplace German',
  icon: '🎯',
  theme: { accent: '#b45309', accentSoft: '#fef3c7' },
  moduleIds: ['interview', 'ukm-prep']
}

// In modules:
{
  id: 'ukm-prep',
  title: 'UKM Job Start',
  subtitle: 'Contract signing, onboarding, and first weeks at UKM Münster',
  theme: { accent: '#0284c7', accentSoft: '#e0f9ff' },
  lessons: [
    {
      id: 'ukm-hoffmann',
      title: 'Meeting: Frau Hoffmann',
      subtitle: 'Contract signing & §16 TV-L Stufe request',
      route: 'lms/personalied_modules/UKM_pers/topic1-meeting-hoffmann.html',
      progress: { type: 'untracked', total: 0 }
    }
  ]
}
```

---

## Updated output checklist

For every new module, the deliverables are:

- [ ] `index.html` — landing page listing all topics
- [ ] `topicN-slug.html` — one file per topic
- [ ] **`registry.js` patch** — field update + new module object
- [ ] Confirm both `<link>`/`<script>` tags reference the shared files at `../shared/theme.css` and `../shared/lesson-ui.js` — do **not** copy them into the new module folder.
- [ ] If the module/field id is new, reminder to add `module.<id>.*` /
      `field.<id>.*` / `lesson.<id>.*` keys to `lms/i18n/de.js` and
      `lms/i18n/ar.js` if translations exist (optional — missing keys fall
      back to English silently).
- [ ] If any lesson should be gated, reminder to set `requiresAuth`/
      `requiresPro` and to verify the gate in the admin Users/Categories
      tabs once deployed (see `quality-gates.md`).
- [ ] Reminder to run through `quality-gates.md` before considering the
      module onboarded.

Do **not** output `theme.css` or `lesson-ui.js` — they already exist once in the shared folder and should never be regenerated or duplicated per module.