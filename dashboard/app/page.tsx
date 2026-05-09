"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function fmtTs(ts?: string) {
    if (!ts) return "—";
    try {
        return new Date(ts).toLocaleTimeString();
    } catch {
        return ts;
    }
}

export default function Page() {
    const notes = useQuery(api.notes.listActive, { limit: 50 }) ?? [];
    const injections = useQuery(api.injections.recent, { limit: 30 }) ?? [];
    const injectionStats = useQuery(api.injections.recentStats, { sinceMinutes: 15 });
    const gcActions = useQuery(api.gc.recent, { limit: 30 }) ?? [];
    const gcStats = useQuery(api.gc.recentStats, { sinceMinutes: 15 });
    const sessions = useQuery(api.sessions.recent, { limit: 10 }) ?? [];

    return (
        <main className="page">
            <header>
                <h1>NM · Note Graph</h1>
                <div className="metrics">
                    <Metric label="active notes" value={notes.length} />
                    <Metric
                        label="injections (15m)"
                        value={injectionStats?.total ?? "…"}
                        sub={
                            injectionStats
                                ? `${injectionStats.accepted} accepted / ${injectionStats.rejected} filtered`
                                : undefined
                        }
                    />
                    <Metric
                        label="gc actions (15m)"
                        value={gcStats?.total ?? "…"}
                        sub={
                            gcStats
                                ? Object.entries(gcStats.byAction)
                                      .map(([k, v]) => `${v} ${k}`)
                                      .join(" · ")
                                : undefined
                        }
                    />
                    <Metric label="sessions seen" value={sessions.length} />
                </div>
            </header>

            <div className="grid">
                <section className="col">
                    <h2>Active notes</h2>
                    <ul className="cards">
                        {notes.map((n) => (
                            <li key={n._id} className="card note">
                                <div className="row">
                                    <span className="tag">imp {Number(n.importance).toFixed(2)}</span>
                                    <span className="muted">×{n.injectCount ?? 0} inj</span>
                                </div>
                                <p className="symptom">{n.symptom}</p>
                                <p className="rc">{n.rootCause}</p>
                                <p className="cor">{n.correction}</p>
                            </li>
                        ))}
                        {notes.length === 0 && <li className="empty">No notes yet — extract a session.</li>}
                    </ul>
                </section>

                <section className="col">
                    <h2>Live activity</h2>
                    <h3>Injections</h3>
                    <ul className="feed">
                        {injections.map((i) => (
                            <li key={i._id} className={`feed-item ${i.accepted ? "ok" : "rej"}`}>
                                <span className="ts">{fmtTs(i.ts)}</span>
                                <span className="path">{i.path ?? "?"}</span>
                                <span className="muted">{i.toolName}</span>
                                {!i.accepted && <span className="muted">filtered</span>}
                            </li>
                        ))}
                        {injections.length === 0 && <li className="empty">No injections yet.</li>}
                    </ul>
                    <h3>GC actions</h3>
                    <ul className="feed">
                        {gcActions.map((g) => (
                            <li key={g._id} className={`feed-item gc-${g.action}`}>
                                <span className="ts">{fmtTs(g.ts)}</span>
                                <span className="tag">{g.action}</span>
                                <span className="muted">{g.noteId ?? "—"}</span>
                            </li>
                        ))}
                        {gcActions.length === 0 && <li className="empty">No GC runs yet.</li>}
                    </ul>
                    <h3>Sessions</h3>
                    <ul className="feed">
                        {sessions.map((s) => (
                            <li key={s._id} className="feed-item">
                                <span className="ts">{fmtTs(s.lastSeenAt)}</span>
                                <span className="path">{s.sessionId.slice(0, 8)}…</span>
                                <span className="muted">{s.messageCount ?? 0} msg</span>
                            </li>
                        ))}
                    </ul>
                </section>
            </div>
        </main>
    );
}

function Metric({
    label,
    value,
    sub,
}: { label: string; value: number | string; sub?: string }) {
    return (
        <div className="metric">
            <div className="metric-value">{value}</div>
            <div className="metric-label">{label}</div>
            {sub && <div className="metric-sub">{sub}</div>}
        </div>
    );
}
