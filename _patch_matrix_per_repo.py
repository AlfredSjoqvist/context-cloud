"""Atomic patch: per-repo Matrix view (fix freeze).

Problem: Matrix renders 100×100 = 10,000 DOM cells at once, freezes the
browser when notes grow. Each cell has hover handlers + tooltip wiring.

Fix (NM_MATRIX_PER_REPO_V1):
  1. Add a repo-picker chip row above the matrix (one chip per acme-* repo
     that has notes). Default selection = first repo with notes.
  2. Compute MX_VIS — global note indices whose edges touch a file in the
     selected repo. Typically ~10–25 of the 100, so the grid drops to
     ~400 cells max — instant render, no freeze.
  3. renderMatrix iterates MX_VIS instead of the full NOTES list, but
     keeps using the global PAIR_SCORES table (already precomputed at
     load — that's a 10k-cell math op, fast enough; the freeze was
     pure DOM cost).
  4. renderMergeCandidates filters to in-scope pairs.

Idempotent: skips if NM_MATRIX_PER_REPO_V1 marker present.
"""
import os
import sys
import tempfile

PATH = os.path.join(os.path.dirname(__file__), "mock", "index.html")
MARKER = "NM_MATRIX_PER_REPO_V1"


# --- HTML: insert the repo-picker row before the matrix canvas ---
OLD_CANVAS = '''      <div class="matrix-canvas">
        <div class="matrix-grid" id="matrix-grid"></div>
      </div>'''

NEW_CANVAS = '''      <!-- NM_MATRIX_PER_REPO_V1 -->
      <div class="matrix-repo-row" id="mx-repo-row">
        <span class="ctrl-lbl">Repo</span>
        <div class="matrix-repo-chips" id="mx-repo-chips"></div>
        <span class="matrix-repo-stat" id="mx-repo-stat"></span>
      </div>
      <div class="matrix-canvas">
        <div class="matrix-grid" id="matrix-grid"></div>
      </div>'''


# --- CSS: chip styles, appended before </style> ---
CSS_BLOCK = '''
  /* ── NM_MATRIX_PER_REPO_V1 — Matrix repo picker ── */
  .matrix-repo-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 0 14px; border-top: 1px solid var(--border);
    margin-top: 12px; flex-wrap: wrap;
  }
  .matrix-repo-row .ctrl-lbl { color: var(--text-3); text-transform: uppercase; letter-spacing: 0.5px; font-size: 10.5px; font-weight: 600; }
  .matrix-repo-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .mx-repo-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 10px; font-size: 11.5px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
    color: var(--text-2); cursor: pointer; user-select: none;
    font-family: 'JetBrains Mono', monospace;
    transition: background .12s, border-color .12s, color .12s;
  }
  .mx-repo-chip:hover { background: var(--surface-2); color: var(--text); border-color: var(--border-bright); }
  .mx-repo-chip.on {
    background: rgba(255,184,107,.12);
    border-color: var(--note);
    color: var(--note);
  }
  .mx-repo-chip .num {
    font-size: 10px; padding: 1px 5px; border-radius: 4px;
    background: var(--surface-2); color: var(--text-3);
  }
  .mx-repo-chip.on .num { background: rgba(255,184,107,.20); color: var(--note); }
  .matrix-repo-stat { color: var(--text-3); font-size: 11px; margin-left: auto; font-family: 'JetBrains Mono', monospace; }
'''


# --- JS: replace renderMatrix + renderMergeCandidates + add helpers ---

OLD_RENDER_MATRIX = '''function renderMatrix() {
  const N = NOTES.length;
  const grid = document.getElementById('matrix-grid');
  let html = '<div class="mx-corner"></div>';
  for (let j = 0; j < N; j++) {
    const impPct = Math.round(NOTES[j].importance * 100);
    html += `<div class="mx-col-label" data-i="${j}" title="${escapeHtml(NOTES[j].symptom)} · imp ${NOTES[j].importance.toFixed(2)}">${NOTES[j].id}<span class="mx-col-axis-bar"><span class="fill" style="height:${impPct}%"></span></span></div>`;
  }
  for (let i = 0; i < N; i++) {
    const impPct = Math.round(NOTES[i].importance * 100);
    html += `<div class="mx-row-label" data-i="${i}" title="${escapeHtml(NOTES[i].symptom)} · imp ${NOTES[i].importance.toFixed(2)}"><span>${NOTES[i].id}</span><span class="mx-axis-bar"><span class="fill" style="width:${impPct}%"></span></span></div>`;
    for (let j = 0; j < N; j++) {
      if (i === j) {
        html += `<div class="mx-cell diagonal"></div>`;
      } else {
        const s = PAIR_SCORES[i][j];
        const score = s[matrixMode];
        const dim = score < matrixThreshold ? 'dim' : '';
        html += `<div class="mx-cell ${dim}" style="background:${colorFor(score)}" data-i="${i}" data-j="${j}" data-score="${score.toFixed(3)}"></div>`;
      }
    }
  }
  grid.innerHTML = html;
  grid.style.gridTemplateColumns = `90px repeat(${N}, 28px)`;
  grid.style.gridTemplateRows    = `82px repeat(${N}, 28px)`;
  bindMatrixCells();
  renderMergeCandidates();
  if (selectedPair) selectPair(selectedPair[0], selectedPair[1], false);
}'''

NEW_RENDER_MATRIX = '''// NM_MATRIX_PER_REPO_V1 — Matrix is scoped to a single repo at a time.
// PAIR_SCORES stays a global N×N table (already precomputed at load —
// fast). What changes is the rendered grid: only notes whose edges
// touch the selected repo are drawn, so the grid is bounded at the
// repo's note count (typically <30) instead of the org-wide ~100.
const _MX_REPOS = ['acme-agent-gateway','acme-connectors','acme-control-plane','acme-memory-graph','acme-runtime-orchestrator'];
let _mxRepo = null;       // selected repo prefix, e.g. 'acme-agent-gateway'
let MX_VIS = [];          // global note indices visible at the moment

function _mxNotesForRepo(repo) {
  if (!repo) return NOTES.map((_, i) => i);
  const prefix = repo + '/';
  return NOTES.map((_, i) => i).filter(i =>
    (NOTES[i].edges || []).some(e => (e.path || '').startsWith(prefix))
  );
}
function _mxRenderRepoChips() {
  const container = document.getElementById('mx-repo-chips');
  if (!container) return;
  // Per-repo note counts so the chips advertise scope size.
  const counts = {};
  _MX_REPOS.forEach(r => { counts[r] = _mxNotesForRepo(r).length; });
  // Default to first repo with > 0 notes.
  if (!_mxRepo) {
    _mxRepo = _MX_REPOS.find(r => counts[r] > 0) || _MX_REPOS[0];
  }
  container.innerHTML = _MX_REPOS.map(r =>
    `<button class="mx-repo-chip ${r === _mxRepo ? 'on' : ''}" data-repo="${r}">${r}<span class="num">${counts[r]}</span></button>`
  ).join('');
  container.querySelectorAll('.mx-repo-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      _mxRepo = chip.dataset.repo;
      selectedPair = null;
      renderMatrix();
    });
  });
}

function renderMatrix() {
  _mxRenderRepoChips();
  MX_VIS = _mxNotesForRepo(_mxRepo);
  const M = MX_VIS.length;
  const grid = document.getElementById('matrix-grid');

  const stat = document.getElementById('mx-repo-stat');
  if (stat) {
    stat.textContent = M === 0
      ? 'no notes for this repo yet'
      : `${M} note${M === 1 ? '' : 's'} · ${(M*(M-1))/2} pair${(M*(M-1))/2 === 1 ? '' : 's'}`;
  }

  if (M === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; padding:48px 24px; text-align:center; color:var(--text-3); font-size:12.5px;">
      No notes touch <span class="mono" style="color:var(--text-2)">${_mxRepo}</span> yet — pick another repo above.
    </div>`;
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gridTemplateRows    = 'auto';
    const mc = document.getElementById('merge-candidates');
    if (mc) mc.innerHTML = `<div class="ms-empty">No pairs in scope.</div>`;
    const mcCount = document.getElementById('mc-count'); if (mcCount) mcCount.textContent = '0';
    return;
  }

  let html = '<div class="mx-corner"></div>';
  for (let cj = 0; cj < M; cj++) {
    const j = MX_VIS[cj];
    const impPct = Math.round(NOTES[j].importance * 100);
    html += `<div class="mx-col-label" data-i="${j}" title="${escapeHtml(NOTES[j].symptom)} · imp ${NOTES[j].importance.toFixed(2)}">${NOTES[j].id}<span class="mx-col-axis-bar"><span class="fill" style="height:${impPct}%"></span></span></div>`;
  }
  for (let ci = 0; ci < M; ci++) {
    const i = MX_VIS[ci];
    const impPct = Math.round(NOTES[i].importance * 100);
    html += `<div class="mx-row-label" data-i="${i}" title="${escapeHtml(NOTES[i].symptom)} · imp ${NOTES[i].importance.toFixed(2)}"><span>${NOTES[i].id}</span><span class="mx-axis-bar"><span class="fill" style="width:${impPct}%"></span></span></div>`;
    for (let cj = 0; cj < M; cj++) {
      const j = MX_VIS[cj];
      if (i === j) {
        html += `<div class="mx-cell diagonal"></div>`;
      } else {
        const s = PAIR_SCORES[i][j];
        const score = s[matrixMode];
        const dim = score < matrixThreshold ? 'dim' : '';
        html += `<div class="mx-cell ${dim}" style="background:${colorFor(score)}" data-i="${i}" data-j="${j}" data-score="${score.toFixed(3)}"></div>`;
      }
    }
  }
  grid.innerHTML = html;
  grid.style.gridTemplateColumns = `90px repeat(${M}, 28px)`;
  grid.style.gridTemplateRows    = `82px repeat(${M}, 28px)`;
  bindMatrixCells();
  renderMergeCandidates();
  if (selectedPair) selectPair(selectedPair[0], selectedPair[1], false);
}'''


OLD_RENDER_MERGE = '''function renderMergeCandidates() {
  const N = NOTES.length;
  const pairs = [];
  for (let i = 0; i < N; i++) {
    for (let j = i+1; j < N; j++) {
      const s = PAIR_SCORES[i][j];
      pairs.push({ i, j, edge: s.edge, text: s.text, combined: s.combined });
    }
  }'''

NEW_RENDER_MERGE = '''function renderMergeCandidates() {
  // NM_MATRIX_PER_REPO_V1 — only consider pairs within the visible repo.
  const M = MX_VIS.length;
  const pairs = [];
  for (let ci = 0; ci < M; ci++) {
    const i = MX_VIS[ci];
    for (let cj = ci+1; cj < M; cj++) {
      const j = MX_VIS[cj];
      const s = PAIR_SCORES[i][j];
      pairs.push({ i, j, edge: s.edge, text: s.text, combined: s.combined });
    }
  }'''


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()
    if MARKER in src:
        print("already patched (marker present); no changes")
        return 0

    for label, old in [
        ("matrix-canvas anchor", OLD_CANVAS),
        ("renderMatrix function", OLD_RENDER_MATRIX),
        ("renderMergeCandidates head", OLD_RENDER_MERGE),
    ]:
        if old not in src:
            print(f"ERROR: anchor not found: {label}", file=sys.stderr); return 2
    if "</style>" not in src:
        print("ERROR: </style> missing", file=sys.stderr); return 2

    src = src.replace(OLD_CANVAS, NEW_CANVAS, 1)
    print("[1/4] inserted matrix repo-picker row in HTML")
    src = src.replace("</style>", CSS_BLOCK + "\n</style>", 1)
    print("[2/4] appended matrix repo-picker CSS")
    src = src.replace(OLD_RENDER_MATRIX, NEW_RENDER_MATRIX, 1)
    print("[3/4] swapped renderMatrix for per-repo version")
    src = src.replace(OLD_RENDER_MERGE, NEW_RENDER_MERGE, 1)
    print("[4/4] scoped renderMergeCandidates to visible repo")

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
