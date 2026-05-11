/* Hindsight v2 — data layer + render. Mirrors mock/v2.html shell. */
const CONVEX_HTTP = 'https://colorless-porcupine-926.convex.site';
const REFRESH_INTERVAL_MS = 60000;

const state = {
  data: null,
  loading: true,
  error: null,
  lastFetchedAt: null,
  route: location.hash.slice(1) || 'overview',
  collapsedSections: JSON.parse(localStorage.getItem('hs.collapsed') || '{}'),
};

const NAV = [
  { key: 'memory', label: 'Memory', items: [
    { key: 'overview',  label: 'Overview',  icon: 'home' },
    { key: 'sessions',  label: 'Sessions',  icon: 'play',   countFrom: 'sessions' },
    { key: 'notes',     label: 'Notes',     icon: 'note',   countFrom: 'notes' },
    { key: 'graph',     label: 'Graph',     icon: 'graph',  countFrom: 'noteFiles' },
    { key: 'matrix',    label: 'Matrix',    icon: 'grid' },
    { key: 'replay',    label: 'Replay',    icon: 'rewind' },
    { key: 'agents',    label: 'Agents',    icon: 'agents' },
  ]},
  { key: 'drift', label: 'Drift', items: [
    { key: 'guardian',    label: 'Guardian',    icon: 'shield', countFrom: 'findings:open' },
    { key: 'resolutions', label: 'Resolutions', icon: 'check',  countFrom: 'devinRuns:open' },
    { key: 'gc',          label: 'GC',          icon: 'broom' },
  ]},
  { key: 'sources', label: 'Sources', items: [
    { key: 'libraries',  label: 'Libraries',  icon: 'book',  countFrom: 'libraries' },
    { key: 'hyperspell', label: 'Hyperspell', icon: 'cloud', countFrom: 'notes:imported' },
    { key: 'activity',   label: 'Activity',   icon: 'pulse' },
  ]},
];

const ICON = {
  home:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7L8 2.5 13.5 7v6.5h-3v-4h-5v4h-3z"/></svg>',
  play:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.5"/><path d="M6.8 6l3 2-3 2z" fill="currentColor"/></svg>',
  note:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/></svg>',
  graph:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="3.5" cy="8" r="1.6"/><circle cx="12.5" cy="3.5" r="1.4"/><circle cx="12.5" cy="12.5" r="1.4"/><path d="M5.1 8l5.9-4.2M5.1 8l5.9 4.2"/></svg>',
  grid:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/></svg>',
  rewind: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 4l-4 4 4 4M14 4l-4 4 4 4M3 4v8"/></svg>',
  agents: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="6" r="2.2"/><circle cx="11" cy="7.5" r="1.8"/><path d="M2 13c.7-2 2-3 3.5-3s2.8 1 3.5 3M8.5 13c.4-1.4 1.3-2.2 2.5-2.2s2.1.8 2.5 2.2"/></svg>',
  shield: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l5 2v4.5c0 3-2.2 4.7-5 5.5-2.8-.8-5-2.5-5-5.5V4z"/><path d="M5.5 8l1.8 1.8 3.2-3.2"/></svg>',
  check:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13.5 4"/></svg>',
  broom:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3l3 3-6.5 6.5L4 13l.5-2.5z"/><path d="M3 13.5h4M4.5 11l3.5-3.5"/></svg>',
  book:   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v10h4.5c.8 0 1.5.5 1.5 1.5V4.5C9 3.7 8.3 3 7.5 3z"/><path d="M13 3v10h-4.5c-.8 0-1.5.5-1.5 1.5V4.5c0-.8.7-1.5 1.5-1.5z"/></svg>',
  cloud:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5h7a2.5 2.5 0 0 0 .3-5 3.5 3.5 0 0 0-6.6-1A2.7 2.7 0 0 0 4 11.5z"/></svg>',
  pulse:  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h3l1.5-4 3 8 1.5-4H14"/></svg>',
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function setHTML(el, html) {
  if (!el) return;
  el.innerHTML = html;
}

function countFor(spec, data) {
  if (!spec || !data) return null;
  const [src, filter] = spec.split(':');
  const list = data[src] || [];
  if (!filter) return list.length;
  if (src === 'findings' && filter === 'open')
    return list.filter(f => ['detected','devin_running','pr_open','verifying'].includes(f.status)).length;
  if (src === 'devinRuns' && filter === 'open')
    return list.filter(r => !r.prMergedAt && !r.outcome).length;
  if (src === 'notes' && filter === 'imported')
    return list.filter(n => /imported|seeded|hyperspell/i.test(n.createdBy || '')).length;
  return list.length;
}

function ms(input) {
  if (input == null) return 0;
  if (typeof input === 'number') return input;
  const t = new Date(input).getTime();
  return isNaN(t) ? 0 : t;
}
function relTime(input) {
  const t = ms(input);
  if (!t) return '—';
  const dt = (Date.now() - t) / 1000;
  if (dt < 5) return 'just now';
  if (dt < 60) return Math.max(1, Math.round(dt)) + 's ago';
  if (dt < 3600) return Math.round(dt / 60) + 'm ago';
  if (dt < 86400) return Math.round(dt / 3600) + 'h ago';
  if (dt < 86400*30) return Math.round(dt / 86400) + 'd ago';
  return new Date(t).toLocaleDateString();
}
function relShort(input) {
  const t = ms(input);
  if (!t) return '—';
  const dt = (Date.now() - t) / 1000;
  if (dt < 60) return Math.max(1, Math.round(dt)) + 's';
  if (dt < 3600) return Math.round(dt / 60) + 'm';
  if (dt < 86400) return Math.round(dt / 3600) + 'h';
  if (dt < 86400*30) return Math.round(dt / 86400) + 'd';
  return Math.round(dt / (86400*30)) + 'mo';
}
function clock(input) {
  const t = ms(input);
  if (!t) return '—';
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function startOfDayLocal() {
  const d = new Date(); d.setHours(0,0,0,0); return d.getTime();
}
function gcCountdown(lastTs) {
  const last = ms(lastTs);
  if (!last) return null;
  const nextAt = last + 15*60000;
  const remain = Math.max(0, nextAt - Date.now());
  const m = Math.floor(remain / 60000);
  const s = Math.floor((remain % 60000) / 1000);
  return { remain, m, s, nextAt };
}
function vendorShort(v) {
  if (!v) return 'agent';
  const s = String(v);
  if (/claude/i.test(s)) return 'Claude';
  if (/cursor/i.test(s)) return 'Cursor';
  if (/codex/i.test(s))  return 'Codex';
  return s.length > 14 ? s.slice(0,12) + '…' : s;
}
function recencyOf(list, tsField) {
  if (!list || !list.length) return '—';
  const t = list.reduce((acc, n) => {
    const v = tsField ? n[tsField] : (n.createdAt || n.ts || n._creationTime);
    const t2 = ms(v);
    return t2 > acc ? t2 : acc;
  }, 0);
  return relTime(t);
}

function renderNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const route = state.route;
  const html = NAV.map(section => {
    const collapsed = state.collapsedSections[section.key];
    const items = section.items.map(item => {
      const count = countFor(item.countFrom, state.data);
      const showCount = count != null;
      const active = item.key === route;
      return '<button class="nav-item ' + (active ? 'active' : '') + '" data-route="' + item.key + '" type="button">'
        + (ICON[item.icon] || '')
        + '<span class="label">' + esc(item.label) + '</span>'
        + (showCount ? '<span class="count">' + count + '</span>' : '')
        + '</button>';
    }).join('');
    return '<div class="nav-section ' + (collapsed ? 'collapsed' : '') + '" data-section="' + section.key + '">'
      + '<button class="nav-section-head" type="button">'
      + '<svg class="chev" viewBox="0 0 9 9" fill="currentColor"><path d="M2 3.5l2.5 2.5L7 3.5"/></svg>'
      + esc(section.label)
      + '</button>'
      + '<div class="nav-section-items"><div>' + items + '</div></div>'
      + '</div>';
  }).join('');
  setHTML(nav, html);
  nav.querySelectorAll('.nav-section-head').forEach(h => {
    h.addEventListener('click', () => {
      const sectionEl = h.closest('.nav-section');
      const key = sectionEl.dataset.section;
      sectionEl.classList.toggle('collapsed');
      state.collapsedSections[key] = sectionEl.classList.contains('collapsed');
      localStorage.setItem('hs.collapsed', JSON.stringify(state.collapsedSections));
    });
  });
  nav.querySelectorAll('.nav-item').forEach(b => {
    b.addEventListener('click', () => {
      const r = b.dataset.route;
      if (r === state.route) return;
      location.hash = r;
    });
  });
}

function renderHeader() {
  const title = document.getElementById('page-title');
  const sub = document.getElementById('page-sub');
  const refreshBtn = document.getElementById('btn-refresh');
  const route = state.route;
  if (route === 'overview') {
    title.textContent = 'Overview';
    if (state.loading && !state.data) {
      setHTML(sub, '<span class="sk w-lg"></span>');
    } else if (state.error && !state.data) {
      setHTML(sub, '<span class="offline-flag">offline · last refreshed ' + (state.lastFetchedAt ? relTime(state.lastFetchedAt) : 'never') + '</span>');
    } else {
      const d = state.data || {};
      const sessionCount = (d.sessions || []).length;
      const openFindings = (d.findings || []).filter(f => ['detected','devin_running','pr_open','verifying'].includes(f.status)).length;
      const todayIngest = (d.docsIngestRuns || []).filter(r => ms(r.lastIngestedAt) >= startOfDayLocal()).length;
      setHTML(sub, '<span class="mono">acme-eng</span> · ' + sessionCount + ' sessions captured · ' + openFindings + ' open findings · ' + todayIngest + ' ingestion runs today');
    }
  } else {
    const section = NAV.flatMap(s => s.items).find(i => i.key === route);
    title.textContent = section ? section.label : 'Hindsight';
    sub.textContent = 'Coming up next.';
  }
  refreshBtn.disabled = state.loading;
  refreshBtn.style.opacity = state.loading ? 0.6 : 1;
}

function renderOverview() {
  const c = document.getElementById('content');
  if (!c) return;
  if (state.loading && !state.data) { setHTML(c, overviewSkeleton()); return; }
  if (state.error && !state.data) {
    setHTML(c,
      '<div class="panel"><div class="panel-head"><span class="panel-title">Can\'t reach Convex</span></div>'
      + '<div class="empty-row">The dashboard couldn\'t fetch <code class="mono">' + esc(CONVEX_HTTP) + '/dashboard/everything</code>. The Refresh button retries on demand.</div></div>');
    return;
  }
  const d = state.data || {};
  const todayCut = startOfDayLocal();
  const notesToday = (d.notes || [])
    .filter(n => ms(n.createdAt) >= todayCut)
    .sort((a,b) => ms(b.createdAt) - ms(a.createdAt))
    .slice(0, 10);
  const noteFilesByNoteId = {};
  (d.noteFiles || []).forEach(e => {
    (noteFilesByNoteId[e.noteId] = noteFilesByNoteId[e.noteId] || []).push(e);
  });
  const sessionById = Object.fromEntries((d.sessions || []).map(s => [s.sessionId, s]));
  const openFindings = (d.findings || [])
    .filter(f => ['detected','verifying'].includes(f.status))
    .slice(0, 10);
  const gcActions = (d.gcActions || []).slice().sort((a,b) => ms(b.ts) - ms(a.ts));
  const lastSweep = gcActions[0];
  const last24h = gcActions.filter(g => ms(g.ts) > Date.now() - 86400000);
  const retained = last24h.filter(g => !['prune','invalidate'].includes(g.action)).length;
  const pruned = last24h.filter(g => ['prune','invalidate'].includes(g.action)).length;
  const merged = last24h.filter(g => g.action === 'merge').length;
  const countdown = lastSweep ? gcCountdown(lastSweep.ts) : null;
  const ingestRuns = (d.docsIngestRuns || []).slice().sort((a,b) => ms(b.lastIngestedAt) - ms(a.lastIngestedAt)).slice(0, 5);

  let html = '<div class="overview-grid">';
  // notes
  html += '<div class="panel span-2">'
    + '<div class="panel-head"><span class="panel-title">Today\'s notes</span><span class="panel-meta">' + notesToday.length + ' ' + (notesToday.length === 1 ? 'note' : 'notes') + ' since midnight</span></div>'
    + '<div class="table-head notes-grid"><div>Time</div><div>Vendor</div><div>File</div><div>Symptom</div></div>';
  if (notesToday.length === 0) {
    html += '<div class="empty-row">No new notes today. The last note came in ' + recencyOf(d.notes) + '.</div>';
  } else {
    html += notesToday.map(n => {
      const sess = sessionById[n.createdFromSession] || {};
      const files = noteFilesByNoteId[n.noteId] || [];
      const file = files[0] ? files[0].path : '—';
      return '<div class="table-row notes-grid">'
        + '<div class="t-rel">' + clock(n.createdAt) + '</div>'
        + '<div><span class="vendor-pill">' + esc(vendorShort(sess.agentVendor)) + '</span></div>'
        + '<div><span class="file-chip truncate" title="' + esc(file) + '">' + esc(file) + '</span></div>'
        + '<div class="truncate" title="' + esc(n.symptom || '') + '">' + esc(n.symptom || '—') + '</div>'
        + '</div>';
    }).join('');
  }
  html += '</div>';
  // findings
  html += '<div class="panel">'
    + '<div class="panel-head"><span class="panel-title">Findings needing attention</span><span class="panel-meta">' + openFindings.length + ' open</span></div>'
    + '<div class="table-head findings-grid"><div>Severity</div><div>File</div><div>Status</div><div>Cycle</div><div>Age</div></div>';
  if (openFindings.length === 0) {
    html += '<div class="empty-row">No open findings. Last cycle ran ' + recencyOf(d.findings, '_creationTime') + '.</div>';
  } else {
    html += openFindings.map(f => {
      return '<div class="table-row findings-grid">'
        + '<div><span class="sev-tag">' + esc(f.severity || 'medium') + '</span></div>'
        + '<div><span class="file-chip truncate" title="' + esc(f.path || '') + '">' + esc(f.path || '—') + '</span></div>'
        + '<div class="dim">' + esc(f.status) + '</div>'
        + '<div class="mono dim">#' + (f.cycleDetected != null ? f.cycleDetected : '—') + '</div>'
        + '<div class="t-rel">' + relShort(f._creationTime) + '</div>'
        + '</div>';
    }).join('');
  }
  html += '</div>';
  // gc
  html += '<div class="panel">'
    + '<div class="panel-head"><span class="panel-title">GC schedule</span><span class="panel-meta">decay → merge → prune</span></div>'
    + '<div class="gc-summary"><div>';
  if (countdown && countdown.remain > 0) {
    html += '<div class="countdown">' + String(countdown.m).padStart(2,'0') + ':' + String(countdown.s).padStart(2,'0') + '<span class="unit">until next sweep</span></div>';
    html += '<div class="meta-line">Last sweep <span class="b">' + relTime(lastSweep.ts) + '</span></div>';
  } else if (countdown) {
    html += '<div class="countdown">due now<span class="unit">sweep overdue</span></div>';
    html += '<div class="meta-line">Last sweep <span class="b">' + relTime(lastSweep.ts) + '</span> · the cron has not fired since.</div>';
  } else {
    html += '<div class="countdown">—<span class="unit">until next sweep</span></div>';
    html += '<div class="meta-line">No sweeps recorded yet.</div>';
  }
  html += '</div>'
    + '<div class="stats">'
    + '<div><div class="stat-num">' + retained + '</div><div class="stat-lbl">Retained 24h</div></div>'
    + '<div><div class="stat-num">' + merged + '</div><div class="stat-lbl">Merged 24h</div></div>'
    + '<div><div class="stat-num">' + pruned + '</div><div class="stat-lbl">Pruned 24h</div></div>'
    + '</div>'
    + '<div><button class="btn btn-primary" type="button">'
    + '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l8 5-8 5z"/></svg>'
    + 'Run sweep now</button></div>'
    + '</div></div>';
  // ingestion
  html += '<div class="panel span-2">'
    + '<div class="panel-head"><span class="panel-title">Ingestion runs</span><span class="panel-meta">last 5</span></div>'
    + '<div class="table-head ingest-grid"><div>Library</div><div>Topic</div><div>Leaves</div><div>Age</div></div>';
  if (ingestRuns.length === 0) {
    html += '<div class="empty-row">No ingestion runs yet.</div>';
  } else {
    html += ingestRuns.map(r => {
      return '<div class="table-row ingest-grid">'
        + '<div><span class="file-chip truncate" title="' + esc(r.lib || '') + '">' + esc(r.lib || '—') + '</span></div>'
        + '<div class="truncate" title="' + esc(r.topic || '') + '">' + esc(r.topic || '—') + '</div>'
        + '<div class="mono">' + (r.ruleCount != null ? r.ruleCount : (r.leaves != null ? r.leaves : '—')) + '</div>'
        + '<div class="t-rel">' + relShort(r.lastIngestedAt) + '</div>'
        + '</div>';
    }).join('');
  }
  html += '</div></div>';
  setHTML(c, html);
}

function overviewSkeleton() {
  let h = '<div class="overview-grid">';
  h += '<div class="panel span-2"><div class="panel-head"><span class="panel-title">Today\'s notes</span><span class="panel-meta"><span class="sk w-sm"></span></span></div>';
  for (let i = 0; i < 5; i++) h += '<div class="table-row notes-grid"><div><span class="sk w-sm"></span></div><div><span class="sk w-sm"></span></div><div><span class="sk w-md"></span></div><div><span class="sk w-lg"></span></div></div>';
  h += '</div>';
  h += '<div class="panel"><div class="panel-head"><span class="panel-title">Findings needing attention</span><span class="panel-meta"><span class="sk w-sm"></span></span></div>';
  for (let i = 0; i < 4; i++) h += '<div class="table-row findings-grid"><div><span class="sk w-sm"></span></div><div><span class="sk w-md"></span></div><div><span class="sk w-sm"></span></div><div><span class="sk w-sm"></span></div><div><span class="sk w-sm"></span></div></div>';
  h += '</div>';
  h += '<div class="panel"><div class="panel-head"><span class="panel-title">GC schedule</span></div><div class="gc-summary"><div><span class="sk" style="height:28px;width:140px"></span></div><div class="stats"><div><span class="sk w-sm" style="height:17px"></span></div><div><span class="sk w-sm" style="height:17px"></span></div><div><span class="sk w-sm" style="height:17px"></span></div></div></div></div>';
  h += '<div class="panel span-2"><div class="panel-head"><span class="panel-title">Ingestion runs</span></div>';
  for (let i = 0; i < 3; i++) h += '<div class="table-row ingest-grid"><div><span class="sk w-md"></span></div><div><span class="sk w-lg"></span></div><div><span class="sk w-sm"></span></div><div><span class="sk w-sm"></span></div></div>';
  h += '</div></div>';
  return h;
}

function renderPlaceholder(route) {
  const c = document.getElementById('content');
  if (!c) return;
  const section = NAV.flatMap(s => s.items).find(i => i.key === route);
  const label = section ? section.label : 'Coming up next';
  const html = '<div class="panel"><div class="placeholder-view"><h2>' + esc(label) + '</h2>'
    + '<p>This view is being rebuilt next. The data is captured and live in Convex right now; the surface for it lands in the next slice. Return to <button class="btn btn-ghost" type="button" data-route="overview" style="padding:0;margin:0;font-size:13.5px;text-decoration:underline">Overview</button> for what\'s ready today.</p>'
    + '</div></div>';
  setHTML(c, html);
  const back = c.querySelector('[data-route="overview"]');
  if (back) back.addEventListener('click', () => { location.hash = 'overview'; });
}

function render() {
  renderNav();
  renderHeader();
  if (state.route === 'overview') renderOverview();
  else renderPlaceholder(state.route);
}

async function fetchEverything() {
  state.loading = true;
  render();
  try {
    const resp = await fetch(CONVEX_HTTP + '/dashboard/everything', { cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    state.data = await resp.json();
    state.error = null;
    state.lastFetchedAt = Date.now();
  } catch (e) {
    state.error = e;
    console.warn('[hindsight v2] fetch failed:', e);
  } finally {
    state.loading = false;
    render();
  }
}

window.addEventListener('hashchange', () => {
  state.route = location.hash.slice(1) || 'overview';
  render();
});

document.getElementById('btn-refresh').addEventListener('click', () => fetchEverything());

setInterval(() => {
  if (state.route !== 'overview' || !state.data) return;
  renderOverview();
}, 1000);

setInterval(() => fetchEverything(), REFRESH_INTERVAL_MS);

render();
fetchEverything();
