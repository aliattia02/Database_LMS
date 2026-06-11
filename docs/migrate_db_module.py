"""
migrate_db_module.py
Run from docs/ directory:
    python migrate_db_module.py

Strips the internal nav bar, home page, and router JS from each DB lesson
file — in-place, with .bak backups created first.
"""

import re
import shutil
from pathlib import Path

LESSONS_DIR = Path("lms/modules/database/lessons")

FILES = [
    "db-masterplan-v2.html",
    "phase-00-db-overview.html",
    "phase-00-linux-redhat.html",
    "phase-01-sql-mysql.html",
    "phase-02-db-design.html",
    "phase-03-advanced-sql.html",
    "phase-04-db-internals.html",
    "phase-05-mariadb-admin.html",
    "phase-06-Galera.html",
    "phase-07-maxscale.html",
]


def refactor(content: str) -> str:

    # 1. Strip NAV CSS block
    nav_css    = content.find('\n\n/* NAV */')
    layout_css = content.find('\n\n/* LAYOUT */')
    if nav_css != -1 and layout_css != -1:
        content = content[:nav_css] + content[layout_css:]

    # 2. Strip HERO CSS block
    hero_css        = content.find('\n/* HERO */')
    page_header_css = content.find('\n/* PAGE HEADER */')
    if hero_css != -1 and page_header_css != -1:
        content = content[:hero_css] + content[page_header_css:]

    # 3. Make all .page divs visible (LMS shell owns navigation)
    content = content.replace('.page{display:none;', '.page{display:block;')
    content = re.sub(r'#page-home:not\(\.active\)\{display:none\}\n', '', content)

    # 4. Strip <nav> element
    nav_start = content.find('\n<nav>')
    nav_end   = content.find('</nav>\n')
    if nav_start != -1 and nav_end != -1:
        content = content[:nav_start] + content[nav_end + len('</nav>\n'):]

    # 5. Strip #page-home block
    home_start = content.find('\n<!-- ═══ HOME')
    next_page  = content.find('\n<!-- ═══ ', home_start + 10) if home_start != -1 else -1
    if home_start == -1:
        home_start = content.find('\n<div id="page-home"')
        next_page  = content.find('\n<!-- ═', home_start + 10) if home_start != -1 else -1
    if home_start != -1 and next_page != -1 and next_page > home_start:
        content = content[:home_start] + content[next_page:]

    # 6. Remove back-to-home buttons
    content = re.sub(
        r'\s*<button class="back-btn" onclick="goTo\(\'home\'\)">[^<]+</button>',
        '', content
    )

    # 7. Neutralise remaining goTo() calls (next/prev lesson buttons)
    content = re.sub(
        r'onclick="goTo\(\'[^\']+\'\)"',
        'onclick="window.scrollTo(0,0)" title="Use the LMS sidebar to navigate"',
        content
    )

    # 8. Rebuild clean script block
    script_start = content.find('<script>\n\n// ─── COLLAPSIBLE')
    script_end   = content.find('</script>', script_start) + len('</script>') if script_start != -1 else -1

    if script_start != -1 and script_end != -1:
        original_script = content[script_start:script_end]

        # Preserve per-file PHASE_KEY so existing localStorage progress survives
        phase_key_match = re.search(r"const PHASE_KEY = '([^']+)';", original_script)
        phase_key = phase_key_match.group(1) if phase_key_match else 'phase_done'

        lessons_match = re.search(r'const LESSONS = (\[[^\]]+\]);', original_script, re.DOTALL)
        lessons_val = lessons_match.group(1) if lessons_match else '[]'

        clean_js = f"""<script>

// ─── COLLAPSIBLE SECTIONS ────────────────────────────────────────────────────
function togSection(titleEl){{
  titleEl.classList.toggle('sec-open');
  titleEl.nextElementSibling.classList.toggle('sec-open');
}}
function expandAll(btn){{
  const page = btn.closest('.page') || document.body;
  const titles = page.querySelectorAll('.section-title');
  const bodies  = page.querySelectorAll('.section-body');
  const allOpen = [...bodies].every(b=>b.classList.contains('sec-open'));
  titles.forEach(t => t.classList.toggle('sec-open', !allOpen));
  bodies.forEach(b => b.classList.toggle('sec-open', !allOpen));
  btn.textContent = allOpen ? 'Expand all ↓' : 'Collapse all ↑';
}}

// ─── STATE ────────────────────────────────────────────────────────────────────
const PHASE_KEY = '{phase_key}';
let done = {{}};
try {{ done = JSON.parse(localStorage.getItem(PHASE_KEY)||'{{}}'); }} catch(e){{}}
function save(){{ try{{localStorage.setItem(PHASE_KEY,JSON.stringify(done));}}catch(e){{}} }}

const LESSONS = {lessons_val};

function markDone(id){{
  done[id] = !done[id];
  save();
  const btn = document.getElementById('done-'+id);
  if(btn){{
    btn.classList.toggle('done', !!done[id]);
    btn.textContent = done[id] ? 'Completed ✓' : 'Mark complete ✓';
  }}
}}

function restoreDoneButtons(){{
  LESSONS.forEach(id=>{{
    const btn = document.getElementById('done-'+id);
    if(btn && done[id]){{
      btn.classList.add('done');
      btn.textContent = 'Completed ✓';
    }}
  }});
}}

// ─── INTERACTIVE COMPONENTS ───────────────────────────────────────────────────
function togQA(qEl){{
  qEl.classList.toggle('open');
  qEl.nextElementSibling.classList.toggle('open');
}}
function togChallenge(head){{
  const body = head.nextElementSibling;
  const arrow = head.querySelector('.challenge-arrow');
  body.classList.toggle('open');
  arrow.classList.toggle('open');
}}
function togAnswer(btn){{
  const answer = btn.nextElementSibling;
  answer.classList.toggle('open');
  btn.textContent = answer.classList.contains('open') ? 'Hide answer ↑' : 'Show answer ↓';
}}
function copyCode(btn){{
  const body = btn.closest('.code-block').querySelector('.code-body');
  const text = body.innerText || body.textContent;
  navigator.clipboard.writeText(text).then(()=>{{
    btn.textContent='copied!';
    btn.classList.add('copied');
    setTimeout(()=>{{ btn.textContent='copy'; btn.classList.remove('copied'); }}, 1800);
  }}).catch(()=>{{
    btn.textContent='select + copy';
    setTimeout(()=>{{ btn.textContent='copy'; }}, 2000);
  }});
}}

restoreDoneButtons();
</script>"""

        content = content[:script_start] + clean_js + content[script_end:]

    # 9. Remove the bottom inline script (updateHomeCards / restoreDoneButtons call)
    for marker in ['<script>\nupdateHomeCards', '<script>\nrestoreDoneButtons']:
        idx = content.rfind(marker)
        if idx != -1:
            end = content.find('</script>', idx) + len('</script>')
            content = content[:idx] + content[end:]
            break

    return content


def main():
    if not LESSONS_DIR.exists():
        print(f"ERROR: '{LESSONS_DIR}' not found.")
        print("Make sure you're running this from the docs/ directory.")
        return

    print(f"Refactoring DB lessons in: {LESSONS_DIR}\n")

    missing = []
    processed = []

    for filename in FILES:
        path = LESSONS_DIR / filename
        if not path.exists():
            print(f"  ⚠  NOT FOUND: {path}")
            missing.append(filename)
            continue

        # Backup
        bak_path = path.with_suffix(path.suffix + '.bak')
        shutil.copy2(path, bak_path)

        # Read, refactor, write
        original = path.read_text(encoding='utf-8')
        refactored = refactor(original)
        removed = len(original) - len(refactored)
        path.write_text(refactored, encoding='utf-8')

        print(f"  ✓  {filename}  (removed {removed:,} chars)")
        processed.append(filename)

    print(f"\n{'─' * 60}")
    print(f"Done: {len(processed)} files refactored, {len(missing)} missing.")
    if missing:
        print(f"Missing: {', '.join(missing)}")
    print(f"\nBackups saved as .bak alongside each file.")
    print("Once verified in the browser, delete backups with:")
    print(f'  del "{LESSONS_DIR}\\*.bak"')


if __name__ == '__main__':
    main()