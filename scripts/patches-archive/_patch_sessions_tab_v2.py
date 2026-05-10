"""V2 atomic patch for mock/index.html.

Migrates from V1 (Sessions tab between Sources and Activity, separate Injections
tab, mock-data Agents tab) to V2:

  1. Removes the V1 Sessions tab button (was between Sources and Activity).
  2. Replaces the Injections tab button with the V2 Sessions tab button
     (Sessions now lives where Injections used to).
  3. Removes the V1 Sessions JS block (will be replaced by V2).
  4. Appends V2 CSS for injections-inside-session-card.
  5. Inserts V2 JS that:
       - fetches /dashboard/everything (one round trip for both Sessions + Agents)
       - renders injections per session (compute from injections.sessionId === ...)
       - hydrates ORG_USERS / AGENTS / ALL_NOTES / INJECTIONS from Convex on
         tab activation, then re-renders Agents view

Idempotent: skips if NM_SESSIONS_TAB_V2 marker present.
"""
import os
import re
import sys
import tempfile

PATH = os.path.join(os.path.dirname(__file__), "mock", "index.html")
V2_MARKER = "NM_SESSIONS_TAB_V2"


# Anchor for the V1 Sessions tab button (will be removed).
V1_SESSIONS_BTN = '''    <button class="tab" data-tab="sessions">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
      Sessions
    </button>
'''

# Anchor for the existing Injections tab button — it gets REPLACED by V2 Sessions.
INJ_BTN = '''    <button class="tab" data-tab="injections">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h11"/><path d="m12 5 7 7-7 7"/>
      </svg>
      Injections
    </button>
'''

# What replaces the Injections button: a Sessions tab button in the same slot.
V2_SESSIONS_BTN = '''    <button class="tab" data-tab="sessions">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
      Sessions
    </button>
'''


CSS_ADDITIONS = '''
  /* ── Sessions view · injections + V2 ──── NM_SESSIONS_TAB_V2 ── */
  .session-section {
    margin-top: 14px; padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .session-section:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
  .session-section-head {
    display: flex; align-items: center; gap: 8px;
    margin: 0 0 8px; color: var(--text-3);
    text-transform: uppercase; letter-spacing: 0.6px; font-size: 10.5px; font-weight: 600;
  }
  .session-section-head .count {
    font-family: 'JetBrains Mono', monospace; color: var(--text-2);
    background: var(--surface-2); padding: 1px 6px; border-radius: 4px;
    font-weight: 500; letter-spacing: 0;
  }
  .session-injections-list {
    display: flex; flex-direction: column;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    overflow: hidden;
  }
  .session-injection-row {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    gap: 12px; align-items: center;
    padding: 7px 12px;
    font-size: 11.5px;
    border-top: 1px solid var(--border);
    font-family: 'JetBrains Mono', monospace;
  }
  .session-injection-row:first-child { border-top: 0; }
  .session-injection-row:hover { background: var(--surface-2); }
  .session-inj-ts { color: var(--text-3); font-size: 10.5px; }
  .session-inj-tool {
    font-size: 10px; padding: 2px 6px; border-radius: 4px;
    background: rgba(124,158,255,.10); color: var(--file);
    text-transform: uppercase; letter-spacing: 0.4px; font-weight: 600;
  }
  .session-inj-path { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .session-inj-note {
    color: var(--note); font-size: 10.5px;
    padding: 2px 6px; border-radius: 4px;
    background: rgba(255,184,107,.10);
  }
  .session-inj-decision {
    font-size: 10.5px; padding: 2px 7px; border-radius: 4px;
    font-weight: 600; letter-spacing: 0.3px;
  }
  .session-inj-decision.ok {
    background: rgba(110,231,183,.14); color: var(--green);
  }
  .session-inj-decision.rej {
    background: rgba(255,122,138,.14); color: var(--red);
  }
  .session-inj-empty {
    padding: 12px; text-align: center; color: var(--text-3);
    font-size: 11.5px; border: 1px dashed var(--border); border-radius: 8px;
  }
'''


# Drop the V1 JS block entirely. The V2 block replaces it.
V1_JS_RE = re.compile(
    r'// ── Sessions view ─+ NM_SESSIONS_TAB_V1 ──\n.*?^\}\)\(\);\n',
    re.DOTALL | re.MULTILINE,
)


V2_JS = r'''
// ── Sessions view + Agents Convex hydration ── NM_SESSIONS_TAB_V2 ──
(function () {
  const NM_CONVEX_URL = (window.NM_CONVEX_URL || 'https://acoustic-fish-389.convex.site').replace(/\/$/, '');
  let _everything = null;
  let _sessionsPoll = null;
  let _agentsPoll = null;
  let _loading = false;
  let _stampTicker = null;

  const _esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const _fmtRel = iso => {
    if (!iso) return '—';
    const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
    if (!t) return '—';
    const dt = (Date.now() - t) / 1000;
    if (dt < 5) return 'just now';
    if (dt < 60) return Math.max(1, Math.round(dt)) + 's ago';
    if (dt < 3600) return Math.round(dt / 60) + 'm ago';
    if (dt < 86400) return Math.round(dt / 3600) + 'h ago';
    if (dt < 86400 * 7) return Math.round(dt / 86400) + 'd ago';
    return new Date(t).toLocaleDateString();
  };
  const _fmtClock = iso => {
    if (!iso) return '';
    const d = new Date(typeof iso === 'number' ? iso : iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

  // ----- session derivation from the bundled Convex snapshot -----

  function _deriveSessions(data) {
    if (!data || !Array.isArray(data.sessions)) return [];
    const noteFilesByNoteId = {};
    (data.noteFiles || []).forEach(e => {
      (noteFilesByNoteId[e.noteId] = noteFilesByNoteId[e.noteId] || []).push(e);
    });
    const notesBySession = {};
    (data.notes || []).forEach(n => {
      if (!n.createdFromSession) return;
      (notesBySession[n.createdFromSession] = notesBySession[n.createdFromSession] || []).push(n);
    });
    const injBySession = {};
    (data.injections || []).forEach(i => {
      if (!i.sessionId) return;
      (injBySession[i.sessionId] = injBySession[i.sessionId] || []).push(i);
    });

    const ss = data.sessions.slice();
    ss.sort((a, b) => {
      const at = a.lastSeenAt || a.startedAt || '';
      const bt = b.lastSeenAt || b.startedAt || '';
      if (at === bt) return (b._creationTime || 0) - (a._creationTime || 0);
      return at < bt ? 1 : -1;
    });

    return ss.map(s => {
      const sNotes = (notesBySession[s.sessionId] || []).slice();
      sNotes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const notes = sNotes.map(n => ({
        noteId: n.noteId,
        symptom: n.symptom,
        rootCause: n.rootCause,
        correction: n.correction,
        importance: n.importance,
        injectCount: n.injectCount,
        files: (noteFilesByNoteId[n.noteId] || [])
          .slice().sort((a, b) => (b.weight || 0) - (a.weight || 0)),
      }));
      const sInj = (injBySession[s.sessionId] || []).slice();
      sInj.sort((a, b) => (a.ts < b.ts ? 1 : -1));
      return {
        sessionId: s.sessionId,
        agentVendor: s.agentVendor,
        cwd: s.cwd,
        startedAt: s.startedAt,
        lastSeenAt: s.lastSeenAt,
        messageCount: s.messageCount || 0,
        lastExtractedAt: s.lastExtractedAt,
        noteCount: notes.length,
        notes,
        injectionCount: sInj.length,
        injections: sInj.slice(0, 30),
      };
    });
  }

  // ----- render -----

  function _renderNote(n) {
    const imp = Number(n.importance || 0);
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

  function _renderInjection(i) {
    const ok = i.accepted !== false;
    const decisionLbl = ok ? 'ok' : 'filtered';
    const decisionCls = ok ? 'ok' : 'rej';
    return `
      <div class="session-injection-row">
        <span class="session-inj-ts">${_esc(_fmtClock(i.ts))}</span>
        <span class="session-inj-tool">${_esc(i.toolName || 'tool')}</span>
        <span class="session-inj-path" title="${_esc(i.path || '')}">${_esc(i.path || '—')}</span>
        ${i.noteId ? `<span class="session-inj-note">${_esc(String(i.noteId).slice(0,12))}</span>` : '<span></span>'}
        <span class="session-inj-decision ${decisionCls}" title="${_esc(i.reason || '')}">${decisionLbl}</span>
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
    const injCount = Number(s.injectionCount || 0);
    const cardCls = (noteCount > 0 || injCount > 0) ? 'session-card with-notes' : 'session-card';
    const ctx = [];
    if (s.startedAt) ctx.push(`<div>started · <b>${_fmtRel(s.startedAt)}</b></div>`);
    if (s.lastSeenAt) ctx.push(`<div>last event · <b>${_fmtRel(s.lastSeenAt)}</b></div>`);
    if (msgs) ctx.push(`<div>messages · <b>${msgs}</b></div>`);
    if (s.cwd) ctx.push(`<div>cwd · <b>${_esc(s.cwd)}</b></div>`);
    if (s.lastExtractedAt) ctx.push(`<div>last extracted · <b>${_fmtRel(s.lastExtractedAt)}</b></div>`);

    const notesSection = noteCount === 0
      ? `<div class="session-no-notes">No notes were extracted from this session — either no hurdles fired or the Note Manager hasn't run on it yet.</div>`
      : `<div class="session-notes-list">${(s.notes || []).map(_renderNote).join('')}</div>`;

    const injSection = injCount === 0
      ? `<div class="session-inj-empty">No injections fired during this session yet.</div>`
      : `<div class="session-injections-list">${(s.injections || []).map(_renderInjection).join('')}</div>`;

    const summary = [
      `${msgs} msg`,
      `${lastSeen}`,
    ].join(' · ');
    const pillBits = [];
    if (noteCount > 0) pillBits.push(`<span class="session-notes-pill">${noteCount} ${noteCount === 1 ? 'note' : 'notes'}</span>`);
    else pillBits.push(`<span class="session-notes-pill zero">0 notes</span>`);
    if (injCount > 0) pillBits.push(`<span class="session-notes-pill" style="background:rgba(124,158,255,.14);color:var(--file)">${injCount} inj</span>`);

    return `
      <div class="${cardCls}" data-session="${_esc(sid)}">
        <div class="session-row" role="button" tabindex="0">
          <span class="session-vendor ${vendorCls}">${vendor}</span>
          <span class="session-id" title="${_esc(sid)}"><b>${_esc(sidShort)}</b><span class="dim">${_esc(sidTail)}</span></span>
          <span class="session-meta-bits">${summary}</span>
          <span style="display:inline-flex;gap:6px">${pillBits.join('')}</span>
          <svg class="session-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
        <div class="session-body">
          <div class="session-context-grid">${ctx.join('')}</div>
          <div class="session-section">
            <div class="session-section-head">notes from this session <span class="count">${noteCount}</span></div>
            ${notesSection}
          </div>
          <div class="session-section">
            <div class="session-section-head">injections during this session <span class="count">${injCount}</span></div>
            ${injSection}
          </div>
        </div>
      </div>`;
  }

  function _renderSessions() {
    const list = document.getElementById('sessions-list');
    if (!list || !_everything) return;
    const ss = _deriveSessions(_everything);
    document.getElementById('sessions-count').textContent = ss.length;
    document.getElementById('sessions-notes-count').textContent = ss.reduce((a, s) => a + (s.noteCount || 0), 0);
    document.getElementById('sessions-with-notes').textContent = ss.filter(s => (s.noteCount || 0) > 0).length;
    const newestEl = document.getElementById('sessions-newest');
    if (newestEl) newestEl.textContent = ss.length ? _fmtRel(ss[0].lastSeenAt || ss[0].startedAt) : '—';
    document.getElementById('sessions-stamp').textContent = 'updated just now';

    if (ss.length === 0) {
      list.innerHTML = `
        <div class="sessions-empty">
          <h3>No sessions captured yet.</h3>
          <p>Connect a coding agent via the NM MCP server. The next time it runs, a row appears here with any notes it produced and any injections that fired.</p>
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

  // ----- Agents tab Convex hydration -----

  function _hydrateAgentsTab(data) {
    if (!data) return;
    if (typeof ORG_USERS === 'undefined' || typeof AGENTS === 'undefined') return;

    if (Array.isArray(data.users) && data.users.length) {
      const mapped = data.users.map(u => ({
        id: u.userId, name: u.name, role: u.role, color: u.color,
        initial: u.initial, handle: u.handle, email: u.email,
      }));
      ORG_USERS.length = 0; mapped.forEach(u => ORG_USERS.push(u));
    }
    if (Array.isArray(data.agents) && data.agents.length) {
      const mapped = data.agents.map(a => ({
        id: a.agentId, user_id: a.userId, vendor: a.vendor, label: a.label,
      }));
      AGENTS.length = 0; mapped.forEach(a => AGENTS.push(a));
    }
    if (typeof ALL_NOTES !== 'undefined' && Array.isArray(data.notes)) {
      const mapped = data.notes.map(n => ({
        id: n.noteId, symptom: n.symptom, root_cause: n.rootCause,
        correction: n.correction, importance: n.importance,
        inject_count: n.injectCount || 0, created_by: n.createdBy,
        created_at: n.createdAt,
      }));
      ALL_NOTES.length = 0; mapped.forEach(n => ALL_NOTES.push(n));
    }
    if (typeof INJECTIONS !== 'undefined' && Array.isArray(data.injections)) {
      const mapped = data.injections.map(i => ({
        ts: typeof i.ts === 'string' ? new Date(i.ts).getTime() : (i.ts || 0),
        agent_id: i.agentId, accepted: i.accepted !== false,
        latency_ms: typeof i.latencyMs === 'number' ? i.latencyMs : 0,
        path: i.path, note_id: i.noteId, session_id: i.sessionId,
      }));
      INJECTIONS.length = 0; mapped.forEach(i => INJECTIONS.push(i));
    }
    // Re-render Agents view if it's been initialized
    try {
      if (typeof renderAgents === 'function' && typeof agInited !== 'undefined' && agInited) {
        renderAgents();
      }
    } catch (e) { /* swallow */ }
  }

  // ----- fetch + lifecycle -----

  async function _fetch(showSpinner) {
    if (_loading) return;
    _loading = true;
    const btn = document.getElementById('sessions-refresh');
    if (btn && showSpinner) btn.classList.add('spinning');
    try {
      const url = NM_CONVEX_URL + '/dashboard/everything';
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      _everything = await resp.json();
      _renderSessions();
      _hydrateAgentsTab(_everything);
    } catch (e) {
      const list = document.getElementById('sessions-list');
      if (list && !_everything) {
        list.innerHTML = `
          <div class="sessions-empty">
            <h3>Couldn't reach Convex.</h3>
            <p>Tried <code>${_esc(NM_CONVEX_URL)}/dashboard/everything</code> but the request failed (${_esc(e.message)}).</p>
            <p>Set <code>window.NM_CONVEX_URL</code> in this page or verify the deployment is live.</p>
          </div>`;
      }
      const stamp = document.getElementById('sessions-stamp');
      if (stamp) stamp.textContent = 'offline · retrying soon';
    } finally {
      _loading = false;
      if (btn) setTimeout(() => btn.classList.remove('spinning'), 280);
    }
  }

  function _onSessionsActivate() {
    _fetch(true);
    if (_sessionsPoll) clearInterval(_sessionsPoll);
    _sessionsPoll = setInterval(() => _fetch(false), 12000);
    if (_stampTicker) clearInterval(_stampTicker);
    _stampTicker = setInterval(() => {
      const stamp = document.getElementById('sessions-stamp');
      if (stamp && _everything) stamp.textContent = 'updated just now';
    }, 5000);
  }
  function _onSessionsDeactivate() {
    if (_sessionsPoll) { clearInterval(_sessionsPoll); _sessionsPoll = null; }
    if (_stampTicker) { clearInterval(_stampTicker); _stampTicker = null; }
  }
  function _onAgentsActivate() {
    if (!_everything) _fetch(true);
    else _hydrateAgentsTab(_everything);
    if (_agentsPoll) clearInterval(_agentsPoll);
    _agentsPoll = setInterval(() => _fetch(false), 18000);
  }
  function _onAgentsDeactivate() {
    if (_agentsPoll) { clearInterval(_agentsPoll); _agentsPoll = null; }
  }

  function _wire() {
    const sessionsView = document.querySelector('[data-view="sessions"]');
    const agentsView = document.querySelector('[data-view="agents"]');
    if (sessionsView) {
      new MutationObserver(() => {
        if (sessionsView.classList.contains('on')) _onSessionsActivate();
        else _onSessionsDeactivate();
      }).observe(sessionsView, { attributes: true, attributeFilter: ['class'] });
      if (sessionsView.classList.contains('on')) _onSessionsActivate();
    }
    if (agentsView) {
      new MutationObserver(() => {
        if (agentsView.classList.contains('on')) _onAgentsActivate();
        else _onAgentsDeactivate();
      }).observe(agentsView, { attributes: true, attributeFilter: ['class'] });
      if (agentsView.classList.contains('on')) _onAgentsActivate();
    }
    document.getElementById('sessions-refresh')?.addEventListener('click', () => _fetch(true));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _wire);
  else _wire();
})();
'''


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        src = f.read()
    if V2_MARKER in src:
        print("already at V2; no changes")
        return 0

    # 1. Remove V1 Sessions tab button (between Sources and Activity).
    if V1_SESSIONS_BTN in src:
        src = src.replace(V1_SESSIONS_BTN, "", 1)
        print("[1/5] removed V1 Sessions tab button")
    else:
        print("[1/5] V1 Sessions tab button not found (ok if already removed)")

    # 2. Replace Injections tab button with V2 Sessions tab button.
    if INJ_BTN in src:
        src = src.replace(INJ_BTN, V2_SESSIONS_BTN, 1)
        print("[2/5] replaced Injections tab button with V2 Sessions tab button")
    else:
        print("[2/5] WARNING: Injections tab button not found", file=sys.stderr)

    # 3. Remove V1 JS block.
    new_src, n = V1_JS_RE.subn("", src, count=1)
    if n:
        src = new_src
        print("[3/5] removed V1 Sessions JS block")
    else:
        print("[3/5] V1 Sessions JS block not found (ok if already replaced)")

    # 4. Append V2 CSS additions before </style>.
    if "</style>" not in src:
        print("ERROR: </style> not found", file=sys.stderr); return 2
    src = src.replace("</style>", CSS_ADDITIONS + "\n</style>", 1)
    print("[4/5] appended V2 CSS additions")

    # 5. Insert V2 JS before the LAST </script>.
    last_script = src.rfind("</script>")
    if last_script < 0:
        print("ERROR: no </script>", file=sys.stderr); return 2
    src = src[:last_script] + V2_JS + "\n" + src[last_script:]
    print("[5/5] inserted V2 JS block")

    # Atomic write
    fd, tmp = tempfile.mkstemp(prefix=".idx-", suffix=".html", dir=os.path.dirname(PATH))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as out:
            out.write(src)
        os.replace(tmp, PATH)
    except Exception:
        try: os.unlink(tmp)
        except Exception: pass
        raise
    print(f"patched: file size now {os.path.getsize(PATH)} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
