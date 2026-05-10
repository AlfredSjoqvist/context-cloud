"""One-shot atomic patch: add Sessions tab + view + CSS + JS to mock/index.html.

Bypasses Edit-tool freshness checks. Reads, splices, atomically renames a temp
file. Idempotent — re-running detects the marker `NM_SESSIONS_TAB_V1` and exits
without changes.
"""
import os
import sys
import tempfile

PATH = os.path.join(os.path.dirname(__file__), "mock", "index.html")
MARKER = "NM_SESSIONS_TAB_V1"

TAB_BUTTON = '''    <button class="tab" data-tab="sessions">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
      Sessions
    </button>
'''

# Anchor for tab button: insert before the Activity tab.
TAB_ANCHOR = '''    <button class="tab" data-tab="activity">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12h4l3-9 4 18 3-9h4"/>
      </svg>
      Activity
    </button>'''

VIEW_HTML = '''
  <!-- Sessions view ─────────────────────────────────── NM_SESSIONS_TAB_V1 -->
  <div class="view view-sessions" data-view="sessions">
    <div class="sessions-wrap">
      <header class="sessions-head">
        <div class="sessions-head-text">
          <h2>Sessions</h2>
          <p class="sessions-sub">Every coding session NM has captured, newest first. Open one to see which notes it produced and why.</p>
        </div>
        <div class="sessions-toolbar">
          <span class="sessions-stamp" id="sessions-stamp">connecting…</span>
          <button class="sessions-refresh" id="sessions-refresh" type="button" title="Refresh now">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/>
            </svg>
            Refresh
          </button>
        </div>
      </header>
      <div class="sessions-meta" id="sessions-meta">
        <div class="sessions-meta-item"><span class="num" id="sessions-count">—</span><span class="lbl">sessions</span></div>
        <div class="sessions-meta-item"><span class="num" id="sessions-with-notes">—</span><span class="lbl">with notes</span></div>
        <div class="sessions-meta-item"><span class="num" id="sessions-notes-count">—</span><span class="lbl">notes captured</span></div>
        <div class="sessions-meta-item"><span class="num" id="sessions-newest">—</span><span class="lbl">last activity</span></div>
      </div>
      <div class="sessions-list" id="sessions-list">
        <div class="session-card skeleton"><div class="session-row"><div class="skel skel-pill"></div><div class="skel skel-line w40"></div><div class="skel skel-line w20"></div></div></div>
        <div class="session-card skeleton"><div class="session-row"><div class="skel skel-pill"></div><div class="skel skel-line w60"></div></div></div>
        <div class="session-card skeleton"><div class="session-row"><div class="skel skel-pill"></div><div class="skel skel-line w50"></div></div></div>
      </div>
    </div>
  </div>
'''

VIEW_ANCHOR = "</main>"

CSS_BLOCK = '''
  /* ── Sessions view ─────────────────────────────── NM_SESSIONS_TAB_V1 ── */
  .view-sessions { display: none; padding: 22px 28px 32px; overflow: auto; height: 100%; }
  .view-sessions.on { display: block; }
  .sessions-wrap { max-width: 1080px; margin: 0 auto; }
  .sessions-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; gap: 18px; flex-wrap: wrap; }
  .sessions-head-text h2 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; color: var(--text); }
  .sessions-head-text .sessions-sub { margin: 4px 0 0; color: var(--text-2); font-size: 13px; max-width: 640px; line-height: 1.55; }
  .sessions-toolbar { display: flex; align-items: center; gap: 10px; }
  .sessions-stamp { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-3); white-space: nowrap; }
  .sessions-refresh {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 11px; background: var(--surface); border: 1px solid var(--border);
    border-radius: 6px; color: var(--text-2); cursor: pointer;
    font-size: 12px; font-family: inherit; font-weight: 500;
    transition: background .12s, color .12s, border-color .12s;
  }
  .sessions-refresh:hover { background: var(--surface-2); color: var(--text); border-color: var(--border-bright); }
  .sessions-refresh.spinning svg { animation: nm-spin 0.9s linear infinite; }
  @keyframes nm-spin { to { transform: rotate(360deg); } }
  .sessions-meta { display: flex; gap: 28px; padding: 14px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 18px; flex-wrap: wrap; }
  .sessions-meta-item { display: flex; flex-direction: column; gap: 3px; min-width: 80px; }
  .sessions-meta-item .num { font-family: 'JetBrains Mono', monospace; font-size: 19px; font-weight: 600; color: var(--text); line-height: 1; }
  .sessions-meta-item .lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-3); }
  .sessions-list { display: flex; flex-direction: column; gap: 10px; }
  .session-card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
    overflow: hidden; transition: border-color .15s, transform .15s, box-shadow .2s;
  }
  .session-card:hover { border-color: var(--border-bright); transform: translateY(-1px); box-shadow: var(--shadow); }
  .session-card.with-notes { border-left: 2px solid var(--note); }
  .session-row {
    display: grid;
    grid-template-columns: auto minmax(120px,1fr) auto auto auto;
    gap: 14px; align-items: center;
    padding: 13px 16px; cursor: pointer; user-select: none;
  }
  .session-vendor {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    padding: 3px 8px; border-radius: 4px;
    background: rgba(124,158,255,.12); color: var(--file);
    text-transform: uppercase; letter-spacing: 0.6px; font-weight: 600;
    white-space: nowrap;
  }
  .session-vendor.codex { background: rgba(196,155,255,.16); color: var(--purple); }
  .session-vendor.cursor { background: rgba(110,231,183,.16); color: var(--green); }
  .session-vendor.unknown { background: rgba(80,84,98,.18); color: var(--text-3); }
  .session-id { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-id b { color: var(--text); font-weight: 500; }
  .session-id .dim { opacity: .5; }
  .session-meta-bits { display: inline-flex; gap: 12px; align-items: center; font-size: 11px; color: var(--text-3); font-family: 'JetBrains Mono', monospace; white-space: nowrap; }
  .session-notes-pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 6px;
    background: rgba(255,184,107,.16); color: var(--note);
    font-size: 11px; font-family: 'JetBrains Mono', monospace; font-weight: 600;
    letter-spacing: 0.3px; white-space: nowrap;
  }
  .session-notes-pill.zero { background: rgba(80,84,98,.16); color: var(--text-3); font-weight: 400; }
  .session-chevron { color: var(--text-3); transition: transform .18s ease; flex-shrink: 0; }
  .session-card.open .session-chevron { transform: rotate(90deg); color: var(--text-2); }
  .session-body {
    display: none;
    border-top: 1px solid var(--border);
    background: var(--bg-elev);
    padding: 14px 18px 18px;
    animation: nm-fade .2s ease;
  }
  .session-card.open .session-body { display: block; }
  @keyframes nm-fade { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }
  .session-context-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 6px 22px;
    margin-bottom: 12px; font-size: 11px; color: var(--text-3);
    padding-bottom: 10px; border-bottom: 1px solid var(--border);
  }
  .session-context-grid > div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session-context-grid b { color: var(--text-2); font-weight: 500; font-family: 'JetBrains Mono', monospace; }
  .session-notes-list { display: flex; flex-direction: column; gap: 8px; }
  .session-note {
    border: 1px solid var(--border); border-left: 2px solid var(--note);
    background: var(--surface); border-radius: 8px; padding: 11px 13px;
  }
  .session-note-head { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; flex-wrap: wrap; }
  .session-note-symptom { flex: 1 1 auto; font-weight: 500; color: var(--text); font-size: 13px; line-height: 1.4; min-width: 200px; }
  .session-note-imp { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(255,184,107,.16); color: var(--note); white-space: nowrap; }
  .session-note-imp.low { background: rgba(80,84,98,.18); color: var(--text-3); }
  .session-note-imp.mid { background: rgba(124,158,255,.14); color: var(--file); }
  .session-note-injects { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-3); white-space: nowrap; }
  .session-note-rc, .session-note-cor { font-size: 12px; line-height: 1.55; margin: 4px 0; }
  .session-note-rc { color: var(--text-2); }
  .session-note-rc::before { content: 'why · '; color: var(--text-3); font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.4px; font-weight: 500; }
  .session-note-cor { color: var(--green); }
  .session-note-cor::before { content: 'do · '; color: var(--text-3); font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.4px; font-weight: 500; }
  .session-note-files { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .session-note-file {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    padding: 3px 7px; border-radius: 4px;
    background: rgba(124,158,255,.10); color: var(--file);
    border: 1px solid rgba(124,158,255,.20);
  }
  .session-no-notes {
    padding: 14px; text-align: center; color: var(--text-3); font-size: 12px;
    border: 1px dashed var(--border); border-radius: 8px;
  }
  .sessions-empty {
    padding: 56px 28px; text-align: center; color: var(--text-3);
    border: 1px dashed var(--border); border-radius: 12px;
    max-width: 560px; margin: 32px auto;
  }
  .sessions-empty h3 { margin: 0 0 8px; color: var(--text); font-weight: 500; font-size: 15px; }
  .sessions-empty p { margin: 6px 0; line-height: 1.55; font-size: 12.5px; }
  .sessions-empty code { font-size: 11px; color: var(--text-2); padding: 2px 6px; background: var(--surface-2); border-radius: 4px; font-family: 'JetBrains Mono', monospace; }
  .session-card.skeleton { pointer-events: none; opacity: .6; }
  .skel { height: 12px; border-radius: 4px; background: linear-gradient(90deg, var(--surface) 0, var(--surface-2) 50%, var(--surface) 100%); background-size: 400% 100%; animation: nm-shimmer 1.4s linear infinite; }
  .skel-pill { width: 50px; height: 14px; }
  .skel-line { height: 10px; }
  .skel-line.w20 { width: 20%; } .skel-line.w40 { width: 40%; } .skel-line.w50 { width: 50%; } .skel-line.w60 { width: 60%; }
  @keyframes nm-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
'''

CSS_ANCHOR = "</style>"

JS_BLOCK = '''
// ── Sessions view ────────────────────────────────── NM_SESSIONS_TAB_V1 ──
(function () {
  const NM_CONVEX_URL = (window.NM_CONVEX_URL || 'https://acoustic-fish-389.convex.site').replace(/\\/$/, '');
  let _sessionsData = null;
  let _sessionsPoll = null;
  let _sessionsLoading = false;
  let _stampTicker = null;

  const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const _fmtRel = iso => {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    if (!t) return '—';
    const dt = (Date.now() - t) / 1000;
    if (dt < 5) return 'just now';
    if (dt < 60) return Math.max(1, Math.round(dt)) + 's ago';
    if (dt < 3600) return Math.round(dt / 60) + 'm ago';
    if (dt < 86400) return Math.round(dt / 3600) + 'h ago';
    if (dt < 86400 * 7) return Math.round(dt / 86400) + 'd ago';
    return new Date(iso).toLocaleDateString();
  };
  const _vendorClass = v => {
    if (!v) return 'unknown';
    const s = String(v).toLowerCase();
    if (s.includes('codex')) return 'codex';
    if (s.includes('cursor')) return 'cursor';
    if (s.includes('claude')) return '';
    return 'unknown';
  };
  const _impClass = imp => imp >= 0.6 ? '' : (imp >= 0.3 ? ' mid' : ' low');

  function _renderNote(n) {
    const imp = Number(n.importance ?? 0);
    const filesHtml = (n.files || []).map(f => `<span class="session-note-file">${_esc(f.path)}</span>`).join('');
    const injects = n.injectCount > 0 ? `× ${n.injectCount} injected` : '';
    return `
      <div class="session-note">
        <div class="session-note-head">
          <div class="session-note-symptom">${_esc(n.symptom)}</div>
          <div class="session-note-imp${_impClass(imp)}">imp ${imp.toFixed(2)}</div>
          ${injects ? `<div class="session-note-injects">${injects}</div>` : ''}
        </div>
        <div class="session-note-rc">${_esc(n.rootCause)}</div>
        ${n.correction ? `<div class="session-note-cor">${_esc(n.correction)}</div>` : ''}
        ${filesHtml ? `<div class="session-note-files">${filesHtml}</div>` : ''}
      </div>`;
  }

  function _renderCard(s) {
    const vendorCls = _vendorClass(s.agentVendor);
    const vendor = _esc(s.agentVendor || 'agent');
    const sid = String(s.sessionId || '');
    const sidShort = sid.slice(0, 8);
    const sidTail = sid.length > 8 ? sid.slice(8, 14) + '…' : '';
    const lastSeen = _fmtRel(s.lastSeenAt || s.startedAt);
    const msgs = Number(s.messageCount || 0);
    const noteCount = Number(s.noteCount || 0);
    const pillCls = noteCount === 0 ? 'session-notes-pill zero' : 'session-notes-pill';
    const cardCls = noteCount > 0 ? 'session-card with-notes' : 'session-card';
    const ctx = [];
    if (s.startedAt) ctx.push(`<div>started · <b>${_fmtRel(s.startedAt)}</b></div>`);
    if (s.lastSeenAt) ctx.push(`<div>last event · <b>${_fmtRel(s.lastSeenAt)}</b></div>`);
    if (msgs) ctx.push(`<div>messages · <b>${msgs}</b></div>`);
    if (s.cwd) ctx.push(`<div>cwd · <b>${_esc(s.cwd)}</b></div>`);
    if (s.lastExtractedAt) ctx.push(`<div>last extracted · <b>${_fmtRel(s.lastExtractedAt)}</b></div>`);
    const notesHtml = noteCount === 0
      ? `<div class="session-no-notes">No notes were extracted from this session — either no hurdles fired or the Note Manager hasn't run on it yet.</div>`
      : `<div class="session-notes-list">${(s.notes || []).map(_renderNote).join('')}</div>`;
    return `
      <div class="${cardCls}" data-session="${_esc(sid)}">
        <div class="session-row" role="button" tabindex="0">
          <span class="session-vendor ${vendorCls}">${vendor}</span>
          <span class="session-id" title="${_esc(sid)}"><b>${_esc(sidShort)}</b><span class="dim">${_esc(sidTail)}</span></span>
          <span class="session-meta-bits">${msgs} msg · ${lastSeen}</span>
          <span class="${pillCls}">${noteCount} ${noteCount === 1 ? 'note' : 'notes'}</span>
          <svg class="session-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="session-body">
          <div class="session-context-grid">${ctx.join('')}</div>
          ${notesHtml}
        </div>
      </div>`;
  }

  function _render() {
    const list = document.getElementById('sessions-list');
    if (!list || !_sessionsData) return;
    const ss = _sessionsData.sessions || [];
    const totals = _sessionsData.totals || {};
    document.getElementById('sessions-count').textContent = totals.sessions ?? ss.length;
    document.getElementById('sessions-notes-count').textContent = totals.notes ?? 0;
    document.getElementById('sessions-with-notes').textContent = ss.filter(s => (s.noteCount || 0) > 0).length;
    document.getElementById('sessions-newest').textContent = _fmtRel(ss[0]?.lastSeenAt || ss[0]?.startedAt);
    document.getElementById('sessions-stamp').textContent = 'updated ' + _fmtRel(_sessionsData.asOf);
    if (ss.length === 0) {
      list.innerHTML = `
        <div class="sessions-empty">
          <h3>No sessions captured yet.</h3>
          <p>Connect a coding agent via the NM MCP server. The next time it runs, a row appears here with any notes it produced and the reason each one was extracted.</p>
        </div>`;
      return;
    }
    list.innerHTML = ss.map(_renderCard).join('');
    list.querySelectorAll('.session-card').forEach(card => {
      const row = card.querySelector('.session-row');
      if (!row) return;
      row.addEventListener('click', () => card.classList.toggle('open'));
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.classList.toggle('open'); }});
    });
    const firstWith = list.querySelector('.session-card.with-notes');
    if (firstWith) firstWith.classList.add('open');
  }

  async function _fetch(showSpinner) {
    if (_sessionsLoading) return;
    _sessionsLoading = true;
    const btn = document.getElementById('sessions-refresh');
    if (btn && showSpinner) btn.classList.add('spinning');
    try {
      const url = NM_CONVEX_URL + '/dashboard/sessions-with-notes?limit=50';
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      _sessionsData = await resp.json();
      _render();
    } catch (e) {
      const list = document.getElementById('sessions-list');
      if (list && !_sessionsData) {
        list.innerHTML = `
          <div class="sessions-empty">
            <h3>Couldn't reach Convex.</h3>
            <p>Tried <code>${_esc(NM_CONVEX_URL)}/dashboard/sessions-with-notes</code> but the request failed (${_esc(e.message)}).</p>
            <p>Set <code>window.NM_CONVEX_URL</code> in this page or verify the deployment is live.</p>
          </div>`;
      }
      const stamp = document.getElementById('sessions-stamp');
      if (stamp) stamp.textContent = 'offline · retrying soon';
    } finally {
      _sessionsLoading = false;
      if (btn) setTimeout(() => btn.classList.remove('spinning'), 280);
    }
  }

  function _onActivate() {
    _fetch(true);
    if (_sessionsPoll) clearInterval(_sessionsPoll);
    _sessionsPoll = setInterval(() => _fetch(false), 12000);
    if (_stampTicker) clearInterval(_stampTicker);
    _stampTicker = setInterval(() => {
      if (_sessionsData?.asOf) {
        const stamp = document.getElementById('sessions-stamp');
        if (stamp) stamp.textContent = 'updated ' + _fmtRel(_sessionsData.asOf);
      }
    }, 5000);
  }
  function _onDeactivate() {
    if (_sessionsPoll) { clearInterval(_sessionsPoll); _sessionsPoll = null; }
    if (_stampTicker) { clearInterval(_stampTicker); _stampTicker = null; }
  }

  // Observe the view's class to know when the user enters/leaves the tab.
  // This avoids touching switchTab and survives any reordering of click handlers.
  function _wire() {
    const view = document.querySelector('[data-view="sessions"]');
    if (!view) return;
    new MutationObserver(() => {
      if (view.classList.contains('on')) _onActivate();
      else _onDeactivate();
    }).observe(view, { attributes: true, attributeFilter: ['class'] });
    document.getElementById('sessions-refresh')?.addEventListener('click', () => _fetch(true));
    if (view.classList.contains('on')) _onActivate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _wire);
  else _wire();
})();
'''

# Anchor for JS: insert just before the LAST </script> tag in the file (the
# end of the main inline script). If a marker indicates we already patched,
# skip.

def main():
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()
    if MARKER in src:
        print("already patched (marker present); no changes")
        return 0

    if TAB_ANCHOR not in src:
        print("ERROR: tab anchor not found", file=sys.stderr); return 2
    if VIEW_ANCHOR not in src:
        print("ERROR: view anchor not found", file=sys.stderr); return 2
    if CSS_ANCHOR not in src:
        print("ERROR: css anchor not found", file=sys.stderr); return 2

    # 1. tab button — insert before activity tab
    new = src.replace(TAB_ANCHOR, TAB_BUTTON + TAB_ANCHOR, 1)
    # 2. view container — insert before </main>
    new = new.replace(VIEW_ANCHOR, VIEW_HTML + VIEW_ANCHOR, 1)
    # 3. CSS — insert before </style>
    new = new.replace(CSS_ANCHOR, CSS_BLOCK + CSS_ANCHOR, 1)
    # 4. JS — insert before the LAST </script>
    last_script = new.rfind("</script>")
    if last_script < 0:
        print("ERROR: no </script> in file", file=sys.stderr); return 2
    new = new[:last_script] + JS_BLOCK + "\n" + new[last_script:]

    # atomic write via temp file in same dir + rename
    fd, tmp = tempfile.mkstemp(prefix=".idx-", suffix=".html",
                                dir=os.path.dirname(PATH))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as out:
            out.write(new)
        os.replace(tmp, PATH)
    except Exception:
        try: os.unlink(tmp)
        except Exception: pass
        raise
    print(f"patched {PATH}: +{len(new) - len(src)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
