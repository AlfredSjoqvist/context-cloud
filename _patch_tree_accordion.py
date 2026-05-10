"""Atomic patch: codebase tree cleanup + repo-focus mode.

Five coordinated changes (all marked NM_TREE_ACCORDION_V1):

  1. renderTree drops loose top-level files — only the 5 acme-* repos
     ever appear at depth 0.
  2. Initial state: acme-agent-gateway expanded (alphabetically first);
     all 4 other repos start collapsed.
  3. Accordion: clicking a collapsed repo expands it AND collapses every
     other repo. Clicking the only-expanded repo collapses it (no auto-
     expand of another). Nested folders keep simple toggle.
  4. drawEdges filter — when exactly one repo is expanded, only draw
     edges whose file lives inside that repo. Other repos' edges hide
     entirely (not just merged at the folder row).
  5. renderNotes primary sort — when one repo is expanded, notes whose
     edges include a file in that repo float to the top; secondary sort
     stays the user's chosen mode (importance / recent / injects).

Click handler also calls renderNotes + bindNoteCards + drawEdges so the
right-hand list re-pins the moment focus changes.

Idempotent: skips if NM_TREE_ACCORDION_V1 marker present.
"""
import os
import sys
import tempfile

PATH = os.path.join(os.path.dirname(__file__), "mock", "index.html")
MARKER = "NM_TREE_ACCORDION_V1"

# --- Fix #1: skip files at depth 0 in renderTree ---
OLD_FILES_LOOP = '''  node.files.sort((a, b) => a.path.localeCompare(b.path)).forEach(f => {
    const fname = f.path.split('/').pop();
    html += `<div class="file-row ${f.noteCount > 0 ? 'has-notes' : ''}" data-path="${f.path}" style="padding-left:${24 + depth * 14}px">
      ${fileIcon(f.type)}
      <span class="name">${fname}</span>
      ${f.noteCount > 0 ? `<span class="badge">${f.noteCount}</span>` : ''}
    </div>`;
  });'''

NEW_FILES_LOOP = '''  // NM_TREE_ACCORDION_V1 — never render loose files at depth 0. Only
  // the 5 acme-* repo folders show at the top level; everything else
  // belongs inside one of them.
  if (depth > 0) {
    node.files.sort((a, b) => a.path.localeCompare(b.path)).forEach(f => {
      const fname = f.path.split('/').pop();
      html += `<div class="file-row ${f.noteCount > 0 ? 'has-notes' : ''}" data-path="${f.path}" style="padding-left:${24 + depth * 14}px">
        ${fileIcon(f.type)}
        <span class="name">${fname}</span>
        ${f.noteCount > 0 ? `<span class="badge">${f.noteCount}</span>` : ''}
      </div>`;
    });
  }'''

# --- Fix #2 + #3: initial state + accordion click handler + re-render notes ---
OLD_ACCORDION = '''/* ─── Wire graph interactions ─────────────────── */
// Repos start expanded (no .collapsed class). On click, top-level repo
// folders enforce "only one collapsed at a time" — collapsing one auto-
// expands any other repo that was previously collapsed. Nested folders keep
// the default toggle behavior.
document.querySelectorAll('.folder-row').forEach(row => {
  row.addEventListener('click', () => {
    const folder = row.parentElement;
    const isRepo = folder.classList.contains('repo');
    folder.classList.toggle('collapsed');
    if (isRepo && folder.classList.contains('collapsed')) {
      // single-collapse: clear .collapsed from any other top-level repo
      document.querySelectorAll('.folder.repo.collapsed').forEach(other => {
        if (other !== folder) other.classList.remove('collapsed');
      });
    }
    requestAnimationFrame(drawEdges);
  });
});'''

NEW_ACCORDION = '''/* ─── Wire graph interactions ─────────────────── */
// NM_TREE_ACCORDION_V1
//   Initial state: collapse every repo except the alphabetically-first
//   one (acme-agent-gateway). That keeps exactly one repo "active" at
//   load — drawEdges and renderNotes both filter / re-pin off whichever
//   repo is the sole expanded one.
//   Click semantics:
//     * collapsed repo  → expand it, collapse every other repo
//                          (accordion: at most one expanded at a time)
//     * expanded repo   → just collapse it (none expanded)
//     * nested folder   → simple toggle
(function () {
  const repos = Array.from(document.querySelectorAll('.folder.repo'));
  // Sort by data-repo so "first" is deterministic regardless of DOM order.
  repos.sort((a, b) => (a.dataset.repo || '').localeCompare(b.dataset.repo || ''));
  repos.forEach((f, i) => {
    if (i === 0) f.classList.remove('collapsed');
    else f.classList.add('collapsed');
  });
})();
function _nmActiveRepo() {
  const expanded = document.querySelectorAll('.folder.repo:not(.collapsed)');
  if (expanded.length !== 1) return null;
  return expanded[0].dataset.repo || null;
}
window._nmActiveRepo = _nmActiveRepo;
document.querySelectorAll('.folder-row').forEach(row => {
  row.addEventListener('click', () => {
    const folder = row.parentElement;
    const isRepo = folder.classList.contains('repo');
    const wasCollapsed = folder.classList.contains('collapsed');
    folder.classList.toggle('collapsed');
    if (isRepo && wasCollapsed) {
      document.querySelectorAll('.folder.repo').forEach(other => {
        if (other !== folder) other.classList.add('collapsed');
      });
    }
    requestAnimationFrame(() => {
      drawEdges();
      if (typeof renderNotes === 'function') {
        renderNotes();
        if (typeof bindNoteCards === 'function') bindNoteCards();
      }
    });
  });
});'''

# --- Fix #4: drawEdges — skip notes whose edges don't touch the active repo ---
OLD_DRAW_LOOP = '''  NOTES.forEach(n => {
    const noteEl = noteEls[n.id];
    if (!noteEl) return;'''

NEW_DRAW_LOOP = '''  // NM_TREE_ACCORDION_V1 — when exactly one repo is expanded, restrict
  // edges to notes that touch a file inside that repo. Other repos'
  // edges disappear entirely while focus is held.
  const _activeRepo = (typeof window._nmActiveRepo === 'function') ? window._nmActiveRepo() : null;
  const _activePrefix = _activeRepo ? (_activeRepo + '/') : null;
  NOTES.forEach(n => {
    const noteEl = noteEls[n.id];
    if (!noteEl) return;
    if (_activePrefix && !(n.edges || []).some(e => (e.path || '').startsWith(_activePrefix))) return;'''

# --- Fix #5: renderNotes — primary sort by active-repo membership ---
OLD_NOTES_SORT = '''function renderNotes() {
  const sorted = [...NOTES].sort((a, b) => {
    if (currentSort === 'importance') return b.importance - a.importance;'''

NEW_NOTES_SORT = '''function renderNotes() {
  // NM_TREE_ACCORDION_V1 — when a repo is the sole expanded one, notes
  // whose edges touch a file inside that repo float to the top; the
  // user's chosen sort (importance / recent / injects) stays the
  // secondary key.
  const _activeRepo = (typeof window._nmActiveRepo === 'function') ? window._nmActiveRepo() : null;
  const _activePrefix = _activeRepo ? (_activeRepo + '/') : null;
  const _inActive = n => _activePrefix && (n.edges || []).some(e => (e.path || '').startsWith(_activePrefix));
  const sorted = [...NOTES].sort((a, b) => {
    if (_activePrefix) {
      const ai = _inActive(a) ? 0 : 1;
      const bi = _inActive(b) ? 0 : 1;
      if (ai !== bi) return ai - bi;
    }
    if (currentSort === 'importance') return b.importance - a.importance;'''


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()
    if MARKER in src:
        print("already patched (marker present); no changes")
        return 0

    for label, old in [
        ("renderTree depth-0 files loop", OLD_FILES_LOOP),
        ("accordion click handler", OLD_ACCORDION),
        ("drawEdges NOTES.forEach", OLD_DRAW_LOOP),
        ("renderNotes sort prelude", OLD_NOTES_SORT),
    ]:
        if old not in src:
            print(f"ERROR: anchor not found: {label}", file=sys.stderr); return 2

    src = src.replace(OLD_FILES_LOOP, NEW_FILES_LOOP, 1)
    print("[1/4] removed loose top-level files from renderTree")
    src = src.replace(OLD_ACCORDION, NEW_ACCORDION, 1)
    print("[2/4] initial-state + accordion + post-toggle re-render wired")
    src = src.replace(OLD_DRAW_LOOP, NEW_DRAW_LOOP, 1)
    print("[3/4] drawEdges filtered to active repo")
    src = src.replace(OLD_NOTES_SORT, NEW_NOTES_SORT, 1)
    print("[4/4] renderNotes pins active-repo notes to top")

    fd, tmp = tempfile.mkstemp(prefix=".idx-", suffix=".html", dir=os.path.dirname(PATH))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as out:
            out.write(src)
        os.replace(tmp, PATH)
    except Exception:
        try: os.unlink(tmp)
        except Exception: pass
        raise
    print(f"patched {PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
