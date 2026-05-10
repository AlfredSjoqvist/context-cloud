"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
    ArrowRight,
    Brain,
    Code2,
    GitBranch,
    Layers,
    Network,
    Shield,
    Sparkles,
    Workflow,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    COUNTS,
    CYCLE_TIMINGS_MS,
    CYCLE_PHASES as PHASES_DATA,
    SNAPSHOT_TAKEN,
    SNAPSHOT_CONVEX,
    SNAPSHOT_DEMO,
    HURDLE_THRESHOLD,
    GC_KNOBS,
} from "@/lib/landing-data";

const TOTAL_TIMING = CYCLE_TIMINGS_MS.reduce((a, b) => a + b, 0);

// ───────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────
export default function Landing() {
    return (
        <div className="relative min-h-screen bg-bg text-ink antialiased overflow-x-hidden">
            <NoiseLayer />
            <Nav />
            <Hero />
            <ProblemBand />
            <Pillars />
            <NoteGraphSection />
            <CycleSection />
            <ArchitectureBand />
            <DashboardShowcase />
            <FinalCTA />
            <Footer />
        </div>
    );
}

// ───────────────────────────────────────────────────────────
// Nav
// ───────────────────────────────────────────────────────────
function Nav() {
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);
    return (
        <nav
            className={cn(
                "fixed inset-x-0 top-0 z-50 transition-all duration-300",
                scrolled
                    ? "border-b border-border bg-bg/70 backdrop-blur-xl"
                    : "border-b border-transparent",
            )}
        >
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                <Link href="/" className="flex items-center gap-2 group">
                    <span className="relative inline-flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-green opacity-75 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green" />
                    </span>
                    <span className="font-semibold tracking-tight">
                        Context Cloud
                    </span>
                </Link>
                <div className="hidden items-center gap-8 text-sm text-ink-2 md:flex">
                    <Link href="#pillars" className="hover:text-ink transition-colors">
                        Product
                    </Link>
                    <Link href="#cycle" className="hover:text-ink transition-colors">
                        Cycle
                    </Link>
                    <Link href="#graph" className="hover:text-ink transition-colors">
                        Graph
                    </Link>
                    <Link href="#dashboard" className="hover:text-ink transition-colors">
                        Live demo
                    </Link>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="https://github.com/AlfredSjoqvist/context-cloud"
                        target="_blank"
                        className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-ink-2 hover:text-ink hover:border-border-strong transition-colors"
                    >
                        <GithubIcon className="h-4 w-4" />
                        Repo
                    </Link>
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-1.5 text-sm font-medium text-bg hover:bg-ink/90 transition-colors"
                    >
                        Open dashboard
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>
        </nav>
    );
}

// ───────────────────────────────────────────────────────────
// Hero
// ───────────────────────────────────────────────────────────
function Hero() {
    return (
        <section className="relative isolate overflow-hidden pt-32 pb-32">
            <GridBackground />
            <SpotlightGlow />
            <div className="mx-auto max-w-6xl px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    className="flex justify-center"
                >
                    <Pill>
                        <Sparkles className="h-3.5 w-3.5 text-accent" />
                        <span>Top 3 · Nozomio Hackathon · May 2026</span>
                    </Pill>
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, filter: "blur(12px)", y: 20 }}
                    animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                    transition={{ duration: 1.1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-8 text-balance text-center text-5xl font-medium tracking-[-0.03em] text-ink md:text-7xl lg:text-[88px] lg:leading-[0.98]"
                >
                    The{" "}
                    <span className="relative inline-block">
                        <span className="bg-gradient-to-br from-accent via-accent to-yellow bg-clip-text text-transparent">
                            always-on
                        </span>
                    </span>{" "}
                    memory
                    <br />
                    for AI coding agents.
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="mx-auto mt-8 max-w-2xl text-balance text-center text-lg text-ink-2 md:text-xl"
                >
                    A typed note graph and a code Guardian sharing one Convex backend.
                    Cursor reads what Claude Code learned. Drift becomes a filed GitHub
                    issue before the next PR opens. Sixty-second cycles, on a
                    Tensorlake schedule, written to a live dashboard.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.55 }}
                    className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
                >
                    <Link
                        href="/dashboard"
                        className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-ink px-6 py-3 text-base font-medium text-bg transition-transform hover:scale-[1.02]"
                    >
                        <span className="relative z-10">See the live dashboard</span>
                        <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                    <Link
                        href="https://github.com/AlfredSjoqvist/context-cloud"
                        target="_blank"
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-6 py-3 text-base font-medium text-ink-2 backdrop-blur-sm hover:text-ink hover:border-border-strong transition-colors"
                    >
                        <GithubIcon className="h-4 w-4" />
                        View on GitHub
                    </Link>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.8 }}
                    className="mt-16 flex flex-col items-center gap-4 text-xs uppercase tracking-[0.2em] text-ink-3"
                >
                    <span className="font-mono">Wired into the agents you use</span>
                    <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-ink-2">
                        <AgentBadge>Claude Code</AgentBadge>
                        <AgentBadge>Cursor</AgentBadge>
                        <AgentBadge>Codex</AgentBadge>
                        <AgentBadge>OpenAI Agents SDK</AgentBadge>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}

function AgentBadge({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-sm text-ink-2 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan/80" />
            {children}
        </span>
    );
}

// ───────────────────────────────────────────────────────────
// Problem
// ───────────────────────────────────────────────────────────
function ProblemBand() {
    const problems = [
        {
            icon: <Brain className="h-5 w-5" />,
            title: "Agents forget every session",
            body: "What Cursor learned at 9am is gone by 9pm. Claude Code starts from zero. Same bugs, same wrong assumptions, every single conversation.",
        },
        {
            icon: <GitBranch className="h-5 w-5" />,
            title: "Codebases drift overnight",
            body: "Constraints written in your docs aren't checked. CSRF gets removed in a refactor, sliding-TTL gets inverted, lodash CVEs ship to prod.",
        },
        {
            icon: <Workflow className="h-5 w-5" />,
            title: "No two agents talk",
            body: "Cursor, Claude Code, Codex — each runs in its own bubble. The thing the senior engineer's agent figured out doesn't help the junior's agent.",
        },
    ];
    return (
        <section className="relative border-y border-border/60 bg-surface/30 py-24">
            <div className="mx-auto max-w-6xl px-6">
                <h2 className="text-center text-sm uppercase tracking-[0.25em] text-ink-3">
                    The problem
                </h2>
                <p className="mx-auto mt-4 max-w-3xl text-balance text-center text-3xl font-medium text-ink md:text-4xl tracking-tight">
                    AI agents are getting smarter. Their{" "}
                    <span className="text-red">memory and oversight</span> aren't.
                </p>
                <div className="mt-16 grid gap-4 md:grid-cols-3">
                    {problems.map((p, i) => (
                        <motion.div
                            key={p.title}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-80px" }}
                            transition={{ duration: 0.6, delay: i * 0.1 }}
                            className="rounded-2xl border border-border bg-surface p-6"
                        >
                            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-ink-2">
                                {p.icon}
                            </div>
                            <h3 className="mt-4 text-lg font-medium text-ink">
                                {p.title}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-ink-3">
                                {p.body}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ───────────────────────────────────────────────────────────
// Pillars (Bento)
// ───────────────────────────────────────────────────────────
function Pillars() {
    return (
        <section id="pillars" className="relative py-32">
            <div className="mx-auto max-w-6xl px-6">
                <SectionEyebrow>The product</SectionEyebrow>
                <SectionHeadline>
                    Three agents.{" "}
                    <span className="text-ink-3">One brain.</span>
                </SectionHeadline>
                <SectionLede>
                    Context Cloud is three always-on agents that share state through a
                    single Convex backend — a memory graph, a code guardian, and a docs
                    pipeline. They run in Tensorlake microVMs, search through Nia, and
                    surface their work in a live dashboard.
                </SectionLede>

                <div className="mt-16 grid gap-4 md:grid-cols-3 md:auto-rows-[minmax(180px,auto)]">
                    {/* NM (memory) — tall left */}
                    <PillarCard className="md:row-span-3 md:col-span-1">
                        <PillarIconBlock color="accent" icon={<Brain />} />
                        <PillarTitle>NM · Note Memory</PillarTitle>
                        <PillarBody>
                            A reactive note graph that survives every conversation.
                            Hurdles your agents hit get extracted as notes — symptom,
                            root cause, correction — and replayed automatically the next
                            time anyone touches the same files.
                        </PillarBody>
                        <div className="mt-6 flex-1">
                            <NoteMockup />
                        </div>
                        <PillarFooter>
                            <Stat label="active notes" value={String(COUNTS.activeNotes)} />
                            <Stat label="injections served" value={String(COUNTS.totalInjections)} />
                        </PillarFooter>
                    </PillarCard>

                    {/* Guardian — small */}
                    <PillarCard>
                        <PillarIconBlock color="file" icon={<Shield />} />
                        <PillarTitle small>Guardian</PillarTitle>
                        <PillarBody small>
                            Scans your repo every 60s. Compares code against your
                            <code className="mx-1 rounded bg-surface-3 px-1.5 py-0.5 text-xs text-file">.context-map/</code>
                            constraints. Files real GitHub issues with code and rule
                            citations.
                        </PillarBody>
                    </PillarCard>

                    {/* Stat — small */}
                    <PillarCard>
                        <PillarIconBlock color="green" icon={<Zap />} />
                        <PillarTitle small>Background-first</PillarTitle>
                        <PillarBody small>
                            Cycles run on a schedule, not on a chat. Findings show up
                            while you sleep. Memory builds while you ship.
                        </PillarBody>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <MiniStat label="cycles" value={String(COUNTS.cyclesRun)} />
                            <MiniStat label="findings" value={String(COUNTS.findingsTotal)} />
                        </div>
                    </PillarCard>

                    {/* Docs Ingest — small */}
                    <PillarCard>
                        <PillarIconBlock color="purple" icon={<Layers />} />
                        <PillarTitle small>Docs Ingest</PillarTitle>
                        <PillarBody small>
                            Reads vendor docs and your own
                            <code className="mx-1 rounded bg-surface-3 px-1.5 py-0.5 text-xs text-purple">.md</code>
                            files. Emits typed leaves your agents query through Nia at
                            inject time.
                        </PillarBody>
                    </PillarCard>

                    {/* Architecture — small */}
                    <PillarCard>
                        <PillarIconBlock color="cyan" icon={<Network />} />
                        <PillarTitle small>One Convex backend</PillarTitle>
                        <PillarBody small>
                            Notes, findings, cycles, and events live in a single
                            reactive store. The dashboard subscribes — no polling, no
                            refresh.
                        </PillarBody>
                    </PillarCard>

                    {/* Wide CTA */}
                    <PillarCard className="md:col-span-2 group hover:border-border-strong transition-colors">
                        <div className="flex h-full flex-col justify-between sm:flex-row sm:items-center sm:gap-8">
                            <div>
                                <PillarTitle small>
                                    Wire your agent in 30 seconds
                                </PillarTitle>
                                <PillarBody small>
                                    PreToolUse hook drops three lines into your agent
                                    config. Memory injections fire on every read,
                                    findings post to your repo automatically.
                                </PillarBody>
                            </div>
                            <Link
                                href="/dashboard"
                                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-medium text-bg transition-transform group-hover:scale-[1.03]"
                            >
                                Open dashboard
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </PillarCard>
                </div>
            </div>
        </section>
    );
}

// ───────────────────────────────────────────────────────────
// Architecture (beam)
// ───────────────────────────────────────────────────────────
function ArchitectureBand() {
    return (
        <section
            id="architecture"
            className="relative border-y border-border/60 bg-surface/30 py-32"
        >
            <div className="mx-auto max-w-6xl px-6">
                <SectionEyebrow>How it flows</SectionEyebrow>
                <SectionHeadline>
                    From your IDE to your repo.{" "}
                    <span className="text-ink-3">In a loop.</span>
                </SectionHeadline>
                <SectionLede>
                    Every agent action triggers a memory injection. Every cycle scans a
                    file, compares it to constraints, and decides whether to file an
                    issue. The dashboard you saw at the top — that's the loop, live.
                </SectionLede>

                <div className="mt-16 flex justify-center">
                    <BeamDiagram />
                </div>
            </div>
        </section>
    );
}

function BeamDiagram() {
    return (
        <div className="relative w-full max-w-4xl">
            <svg
                viewBox="0 0 800 360"
                className="w-full h-auto"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <linearGradient id="beam-grad-1" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#7C9EFF" stopOpacity="0" />
                        <stop offset="50%" stopColor="#7C9EFF" stopOpacity="1" />
                        <stop offset="100%" stopColor="#7C9EFF" stopOpacity="0" />
                        <animate
                            attributeName="x1"
                            from="-50%"
                            to="100%"
                            dur="3s"
                            repeatCount="indefinite"
                        />
                        <animate
                            attributeName="x2"
                            from="0%"
                            to="150%"
                            dur="3s"
                            repeatCount="indefinite"
                        />
                    </linearGradient>
                    <linearGradient id="beam-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#FFB86B" stopOpacity="0" />
                        <stop offset="50%" stopColor="#FFB86B" stopOpacity="1" />
                        <stop offset="100%" stopColor="#FFB86B" stopOpacity="0" />
                        <animate
                            attributeName="x1"
                            from="-50%"
                            to="100%"
                            dur="3.6s"
                            begin="0.6s"
                            repeatCount="indefinite"
                        />
                        <animate
                            attributeName="x2"
                            from="0%"
                            to="150%"
                            dur="3.6s"
                            begin="0.6s"
                            repeatCount="indefinite"
                        />
                    </linearGradient>
                    <linearGradient id="beam-grad-3" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0" />
                        <stop offset="50%" stopColor="#6EE7B7" stopOpacity="1" />
                        <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0" />
                        <animate
                            attributeName="x1"
                            from="-50%"
                            to="100%"
                            dur="4s"
                            begin="1.2s"
                            repeatCount="indefinite"
                        />
                        <animate
                            attributeName="x2"
                            from="0%"
                            to="150%"
                            dur="4s"
                            begin="1.2s"
                            repeatCount="indefinite"
                        />
                    </linearGradient>
                </defs>

                {/* Connection lines (base) */}
                <path
                    d="M 200 90 C 280 90, 320 180, 400 180"
                    stroke="#1F2330"
                    strokeWidth="1.5"
                    fill="none"
                />
                <path
                    d="M 600 90 C 520 90, 480 180, 400 180"
                    stroke="#1F2330"
                    strokeWidth="1.5"
                    fill="none"
                />
                <path
                    d="M 400 180 L 400 270"
                    stroke="#1F2330"
                    strokeWidth="1.5"
                    fill="none"
                />

                {/* Animated beams */}
                <path
                    d="M 200 90 C 280 90, 320 180, 400 180"
                    stroke="url(#beam-grad-1)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                />
                <path
                    d="M 600 90 C 520 90, 480 180, 400 180"
                    stroke="url(#beam-grad-2)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                />
                <path
                    d="M 400 180 L 400 270"
                    stroke="url(#beam-grad-3)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                />

                {/* Nodes */}
                <BeamNode x={200} y={90} label="Cursor" sublabel="agent" color="#7C9EFF" />
                <BeamNode x={600} y={90} label="Claude Code" sublabel="agent" color="#7C9EFF" />
                <BeamNode x={400} y={180} label="Convex" sublabel="state" color="#FFB86B" big />
                <BeamNode x={400} y={270} label="GitHub" sublabel="issues" color="#6EE7B7" />
            </svg>
            <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-border bg-surface p-5 text-sm text-ink-2">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-ink-3">
                    The loop
                </span>
                <p className="mt-2">
                    Agent reads a file → memory injects relevant notes → agent ships
                    code → Guardian scans the diff → finding is filed as a GitHub issue
                    → resolution goes back into memory.
                </p>
            </div>
        </div>
    );
}

function BeamNode({
    x,
    y,
    label,
    sublabel,
    color,
    big,
}: {
    x: number;
    y: number;
    label: string;
    sublabel: string;
    color: string;
    big?: boolean;
}) {
    const r = big ? 38 : 30;
    return (
        <g>
            <circle cx={x} cy={y} r={r + 6} fill="rgba(255,255,255,0.02)" />
            <circle
                cx={x}
                cy={y}
                r={r}
                fill="#11131B"
                stroke={color}
                strokeWidth="1.5"
                opacity="0.95"
            />
            <text
                x={x}
                y={y - 2}
                textAnchor="middle"
                className="fill-ink"
                style={{ fontSize: big ? 13 : 11, fontWeight: 600 }}
            >
                {label}
            </text>
            <text
                x={x}
                y={y + 12}
                textAnchor="middle"
                fill="#5C6478"
                style={{ fontSize: 9, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.1em" }}
            >
                {sublabel.toUpperCase()}
            </text>
        </g>
    );
}

// ───────────────────────────────────────────────────────────
// Dashboard showcase
// ───────────────────────────────────────────────────────────
function DashboardShowcase() {
    const ref = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start end", "end start"],
    });
    const y = useTransform(scrollYProgress, [0, 1], [60, -60]);
    const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.94, 1, 0.96]);

    return (
        <section id="dashboard" ref={ref} className="relative py-32">
            <div className="mx-auto max-w-6xl px-6">
                <SectionEyebrow>Live demo</SectionEyebrow>
                <SectionHeadline>
                    Watch your agents work.{" "}
                    <span className="text-ink-3">Without watching them.</span>
                </SectionHeadline>
                <SectionLede>
                    The Context Cloud dashboard subscribes to Convex over a websocket —
                    no polling, no refresh, no spinners. Cycles, findings, GC actions,
                    notes, injections — the whole loop, live.
                </SectionLede>

                <motion.div
                    style={{ y, scale }}
                    className="relative mt-16 mx-auto max-w-5xl"
                >
                    <div className="absolute -inset-x-12 -top-8 -bottom-12 rounded-[36px] bg-gradient-to-br from-accent/10 via-file/10 to-purple/10 blur-3xl" />
                    <div className="relative rounded-2xl border border-border-strong bg-surface p-2 shadow-2xl">
                        <div className="flex items-center gap-1.5 px-3 py-2">
                            <span className="h-3 w-3 rounded-full bg-red/70" />
                            <span className="h-3 w-3 rounded-full bg-yellow/70" />
                            <span className="h-3 w-3 rounded-full bg-green/70" />
                            <span className="ml-3 font-mono text-xs text-ink-3">
                                context-cloud.app/dashboard
                            </span>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border">
                            <img
                                src="/dashboard-preview.png"
                                alt="Context Cloud live dashboard"
                                className="block w-full"
                                loading="lazy"
                            />
                        </div>
                    </div>
                </motion.div>

                <div className="mt-16 grid gap-3 md:grid-cols-4">
                    <StatCallout label="Cycles run" value={String(COUNTS.cyclesRun)} />
                    <StatCallout label="Active notes" value={String(COUNTS.activeNotes)} />
                    <StatCallout label="Injections served" value={String(COUNTS.totalInjections)} />
                    <StatCallout label="Issues filed" value={String(COUNTS.issuesFiled)} />
                </div>

                <div className="mt-12 flex justify-center">
                    <Link
                        href="/dashboard"
                        className="group inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-base font-medium text-bg transition-transform hover:scale-[1.02]"
                    >
                        Open the live dashboard
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                </div>
            </div>
        </section>
    );
}

// ───────────────────────────────────────────────────────────
// Cycle state machine
// ───────────────────────────────────────────────────────────
function CycleSection() {
    const dominantIdx = CYCLE_TIMINGS_MS.reduce(
        (bestI, v, i, a) => (v > a[bestI] ? i : bestI),
        0,
    );
    const dominant = PHASES_DATA[dominantIdx];
    const dominantPct = Math.round((CYCLE_TIMINGS_MS[dominantIdx] / TOTAL_TIMING) * 100);
    return (
        <section id="cycle" className="relative py-32">
            <div className="mx-auto max-w-6xl px-6">
                <SectionEyebrow>Inside one cycle</SectionEyebrow>
                <SectionHeadline>
                    Seven phases. One loop.{" "}
                    <span className="text-ink-3">Closed by Devin.</span>
                </SectionHeadline>
                <SectionLede>
                    No chat triggers any of this. The state machine fires on a
                    Tensorlake schedule, hits real APIs, and writes everything to
                    Convex in a way the dashboard sees instantly.
                </SectionLede>

                {/* Big SVG flow diagram */}
                <div className="mt-20 rounded-3xl border border-border bg-surface/50 p-6 md:p-10 backdrop-blur-sm">
                    <CycleFlowSVG />
                    {/* Per-phase timing strip — gantt-style proportional bar */}
                    <div className="mt-8">
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                                wall-clock breakdown · {(TOTAL_TIMING / 1000).toFixed(1)}s total
                            </span>
                            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                                {dominant.name} dominates → {dominantPct}%
                            </span>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border bg-bg">
                            <div className="flex h-10 w-full">
                                {PHASES_DATA.map((p, i) => {
                                    const pct = (CYCLE_TIMINGS_MS[i] / TOTAL_TIMING) * 100;
                                    const showLabel = pct >= 6;
                                    const grad = [
                                        "from-cyan/40 to-cyan/10",
                                        "from-file/40 to-file/10",
                                        "from-purple/40 to-purple/10",
                                        "from-accent/50 to-accent/15",
                                        "from-yellow/40 to-yellow/10",
                                        "from-green/40 to-green/10",
                                        "from-red/40 to-red/10",
                                    ][i];
                                    return (
                                        <div
                                            key={p.id}
                                            style={{ width: `${pct}%` }}
                                            title={`${p.name} · ${(CYCLE_TIMINGS_MS[i] / 1000).toFixed(1)}s · ${pct.toFixed(0)}%`}
                                            className={cn(
                                                "relative flex items-center justify-center overflow-hidden border-r border-border last:border-r-0 bg-gradient-to-b",
                                                grad,
                                            )}
                                        >
                                            {showLabel && (
                                                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink whitespace-nowrap">
                                                    {p.name} · {(CYCLE_TIMINGS_MS[i] / 1000).toFixed(1)}s
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Phase detail cards */}
                <div className="mt-6 grid gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {PHASES_DATA.map((phase, i) => (
                        <CyclePhaseCardV2 key={phase.id} phase={phase} index={i} />
                    ))}
                </div>

                {/* Stats */}
                <div className="mt-12 grid gap-3 md:grid-cols-3">
                    <CycleStat
                        label="cycles run"
                        value={String(COUNTS.cyclesRun)}
                        foot={`since ${SNAPSHOT_TAKEN}`}
                    />
                    <CycleStat
                        label="median wall-clock"
                        value={`${(TOTAL_TIMING / 1000).toFixed(1)}s`}
                        foot="WAKE → SLEEP"
                    />
                    <CycleStat
                        label="sharpen iterations"
                        value="0 → 2"
                        foot="hard cap before escalation"
                    />
                </div>
            </div>
        </section>
    );
}

const PHASE_DOT_COLORS = [
    "#66E0FF", // WAKE — cyan
    "#7C9EFF", // PLAN — blue
    "#C49BFF", // SCAN — purple
    "#FFB86B", // ANALYZE — accent
    "#F9E27D", // CRITIQUE — yellow
    "#6EE7B7", // HANDOFF — green
    "#FF7A8A", // RECONCILE — red (closed loop)
];

function CycleFlowSVG() {
    // 7 phases laid out along a wave path. Canvas: 1000 x 320
    const positions = [
        { x:  80, y: 130 },
        { x: 210, y:  95 },
        { x: 340, y: 130 },
        { x: 470, y:  95 },
        { x: 600, y: 130 },
        { x: 730, y:  95 },
        { x: 870, y: 130 },
    ];

    // Build flow path (smooth curve through all 7 nodes)
    const pathD = positions.reduce((acc, p, i, arr) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        const prev = arr[i - 1];
        const cx1 = (prev.x + p.x) / 2;
        return `${acc} C ${cx1} ${prev.y}, ${cx1} ${p.y}, ${p.x} ${p.y}`;
    }, "");

    // Loopback: from last node, down and back to first
    const last = positions[positions.length - 1];
    const first = positions[0];
    const loopbackD = `M ${last.x} ${last.y} C ${last.x + 60} ${last.y + 30}, ${last.x + 80} ${last.y + 110}, ${last.x - 20} ${last.y + 130} L ${first.x + 20} ${first.y + 130} C ${first.x - 80} ${first.y + 130}, ${first.x - 60} ${first.y + 30}, ${first.x} ${first.y}`;

    return (
        <div className="w-full">
            <svg
                viewBox="0 0 1000 320"
                className="w-full h-auto"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <filter id="phase-glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="b" />
                        <feMerge>
                            <feMergeNode in="b" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <linearGradient id="flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#66E0FF" stopOpacity="0.6" />
                        <stop offset="50%" stopColor="#FFB86B" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0.6" />
                    </linearGradient>
                    <path id="flow-path" d={pathD} />
                </defs>

                {/* Loopback arrow (subtle) */}
                <path
                    d={loopbackD}
                    fill="none"
                    stroke="#1F2330"
                    strokeWidth="1.5"
                    strokeDasharray="3 4"
                />
                <text
                    x={500}
                    y={295}
                    textAnchor="middle"
                    fill="#5C6478"
                    style={{
                        fontSize: 11,
                        fontFamily: "JetBrains Mono, monospace",
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                    }}
                >
                    sleep · 60s · WAKE again
                </text>

                {/* Base flow path */}
                <use href="#flow-path" stroke="#1F2330" strokeWidth="3" fill="none" />
                {/* Animated colored flow (rotating gradient) */}
                <use
                    href="#flow-path"
                    stroke="url(#flow-grad)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.85"
                />

                {/* Traveling pulses */}
                {[0, 1, 2].map((i) => (
                    <circle key={i} r="5" fill="#FFB86B" filter="url(#phase-glow)">
                        <animateMotion
                            dur="6s"
                            begin={`${i * 2}s`}
                            repeatCount="indefinite"
                            keyPoints="0;1"
                            keyTimes="0;1"
                        >
                            <mpath href="#flow-path" />
                        </animateMotion>
                    </circle>
                ))}

                {/* Phase nodes */}
                {positions.map((p, i) => {
                    const phase = PHASES_DATA[i];
                    const color = PHASE_DOT_COLORS[i];
                    return (
                        <g key={phase.id}>
                            {/* Outer halo */}
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r="32"
                                fill={color}
                                fillOpacity="0.06"
                            />
                            {/* Ring */}
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r="24"
                                fill="#11131B"
                                stroke={color}
                                strokeWidth="1.5"
                                strokeOpacity="0.55"
                            />
                            {/* Inner solid */}
                            <circle
                                cx={p.x}
                                cy={p.y}
                                r="18"
                                fill="#0A0B0F"
                                stroke={color}
                                strokeWidth="1.5"
                            />
                            {/* Phase number */}
                            <text
                                x={p.x}
                                y={p.y + 4}
                                textAnchor="middle"
                                fill={color}
                                style={{
                                    fontSize: 12,
                                    fontFamily: "JetBrains Mono, monospace",
                                    fontWeight: 600,
                                }}
                            >
                                {String(i + 1).padStart(2, "0")}
                            </text>
                            {/* Label above */}
                            <text
                                x={p.x}
                                y={p.y - 38}
                                textAnchor="middle"
                                fill="#ECEEF4"
                                style={{
                                    fontSize: 13,
                                    fontFamily: "JetBrains Mono, monospace",
                                    fontWeight: 600,
                                    letterSpacing: "0.05em",
                                }}
                            >
                                {phase.name}
                            </text>
                            {/* Sub-label below */}
                            <text
                                x={p.x}
                                y={p.y + 44}
                                textAnchor="middle"
                                fill="#5C6478"
                                style={{
                                    fontSize: 10,
                                    fontFamily: "JetBrains Mono, monospace",
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                }}
                            >
                                {phase.sub}
                            </text>
                            {/* Timing chip */}
                            <text
                                x={p.x}
                                y={p.y + 58}
                                textAnchor="middle"
                                fill="#A0A8BD"
                                style={{
                                    fontSize: 9,
                                    fontFamily: "JetBrains Mono, monospace",
                                }}
                            >
                                {(CYCLE_TIMINGS_MS[i] / 1000).toFixed(1)}s median
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

function CyclePhaseCardV2({
    phase,
    index,
}: {
    phase: (typeof PHASES_DATA)[number];
    index: number;
}) {
    const color = PHASE_DOT_COLORS[index];
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: index * 0.05 }}
            className="group relative flex flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-strong"
        >
            <div className="flex items-center gap-2">
                <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                        background: color,
                        boxShadow: `0 0 0 3px ${color}1a`,
                    }}
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                    Phase {String(index + 1).padStart(2, "0")}
                </span>
                <span className="ml-auto font-mono text-[10px] text-ink-3">
                    {(CYCLE_TIMINGS_MS[index] / 1000).toFixed(1)}s
                </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
                <h3 className="font-mono text-lg font-semibold tracking-tight text-ink">
                    {phase.name}
                </h3>
                <span className="font-mono text-[11px] text-ink-3">{phase.sub}</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-2">{phase.body}</p>
            <div className="mt-4 rounded-md border border-border bg-surface-3 px-3 py-2 font-mono text-[11px] leading-relaxed text-file overflow-x-auto">
                <span className="select-none text-ink-3">→ </span>
                {phase.sample}
            </div>
        </motion.div>
    );
}

function CycleStat({
    label,
    value,
    foot,
}: {
    label: string;
    value: string;
    foot: string;
}) {
    return (
        <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                {label}
            </div>
            <div className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink">
                {value}
            </div>
            <div className="mt-1 font-mono text-[11px] text-ink-3">{foot}</div>
        </div>
    );
}

// ───────────────────────────────────────────────────────────
// Note ↔ File graph (section wrapper + explainer + tree)
// ───────────────────────────────────────────────────────────
function NoteGraphSection() {
    return (
        <section
            id="graph"
            className="relative border-y border-border/60 bg-surface/30 py-32"
        >
            <div className="mx-auto max-w-6xl px-6">
                <SectionEyebrow>The graph that exists</SectionEyebrow>
                <SectionHeadline>
                    A note is a fact{" "}
                    <span className="text-ink-3">attached to file paths.</span>
                </SectionHeadline>
                <SectionLede>
                    Not embeddings. Not a chat log. A typed row in Convex with weighted
                    edges to canonical file paths — so when an agent opens any of
                    those files, the right notes inject deterministically.
                </SectionLede>

                <NoteMappingExplainer />
                <FileTreeWithNotes />
            </div>
        </section>
    );
}

function NoteMappingExplainer() {
    return (
        <div className="mt-20">
            <div className="mb-6 flex items-center justify-between">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-3">
                    How the file → note mapping works
                </h3>
                <span className="hidden font-mono text-[11px] text-ink-3 md:inline">
                    one example, end-to-end
                </span>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
                <ExplainerStep
                    n="01"
                    color="#66E0FF"
                    title="hurdle captured"
                    sub="session message"
                    body="A Cursor session gets stuck on auth. Every tool call + the final fix mirror into Convex via a PostToolUse hook."
                    code={`session.upsert({
  sessionId: s_a8f2,
  agentVendor: "Cursor",
  cwd: "context-cloud/",
})`}
                />
                <ExplainerStep
                    n="02"
                    color="#FF7A8A"
                    title="hurdle scored"
                    sub={`7 signals · threshold ${HURDLE_THRESHOLD} · deterministic`}
                    body="Not an LLM. nm_signals walks the trace and emits weighted signals — action loops, retry loops, user interrupts, reverted edits, correction phrases, prompt re-asks, explicit feedback. Cluster with gap ≤ 12 events; window opens when the cluster sum crosses 3.0."
                    code={`signal: action_bigram_loop  +3.0
signal: reverted_edit       +2.0
signal: correction_phrase   +1.0
score = 6.0  →  hurdle window
  start = first_signal - 10
  end   = resolution within 16 events`}
                />
                <ExplainerStep
                    n="03"
                    color="#C49BFF"
                    title="note extracted"
                    sub="LLM distills the window"
                    body="Only after the deterministic detector fires. The LLM receives the failure→resolution event slice and the candidate file list. It cannot invent file paths and it never decides whether the user was stuck — that's already settled."
                    code={`notes.upsert({
  noteId: n_4f1d,
  symptom: "JWT verified
   without checking expiry",
  importance: 0.88,
})`}
                />
                <ExplainerStep
                    n="04"
                    color="#FFB86B"
                    title="edges added"
                    sub="noteFiles · weighted"
                    body="The extractor names the files it touched. Each becomes a weighted edge — co-occurrence × recency. This is the file→note mapping."
                    code={`noteFiles.upsert({
  noteId: n_4f1d,
  path:   "src/routes/login.ts",
  weight: 0.88,
})`}
                />
                <ExplainerStep
                    n="05"
                    color="#6EE7B7"
                    title="auto-injected"
                    sub="PreToolUse hook · 0 chat needed"
                    body="Next agent (Claude Code, Codex, anyone) opens login.ts. The hook queries the graph and injects matching notes inline. injectCount++."
                    code={`injections.recordInjection({
  path: "src/routes/login.ts",
  noteId: n_4f1d,
  accepted: true,
})`}
                />
            </div>

            <div className="mt-3 grid gap-3 text-[11px] text-ink-3 md:grid-cols-3">
                <RuleChip k="hurdle threshold" v={`signal sum ≥ ${HURDLE_THRESHOLD}`} />
                <RuleChip k="GC decay" v={`half-life ${GC_KNOBS.halfLifeDays} days from last inject`} />
                <RuleChip k="GC prune" v={`importance < ${GC_KNOBS.pruneImportance}`} />
            </div>
        </div>
    );
}

function ExplainerStep({
    n,
    color,
    title,
    sub,
    body,
    code,
}: {
    n: string;
    color: string;
    title: string;
    sub: string;
    body: string;
    code: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="relative flex flex-col rounded-2xl border border-border bg-surface p-5"
        >
            <div className="flex items-center gap-2">
                <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                        background: color,
                        boxShadow: `0 0 0 3px ${color}1a`,
                    }}
                />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                    Step {n}
                </span>
            </div>
            <h4 className="mt-3 font-mono text-base font-semibold tracking-tight text-ink">
                {title}
            </h4>
            <div className="font-mono text-[11px] text-ink-3">{sub}</div>
            <p className="mt-3 text-xs leading-relaxed text-ink-2">{body}</p>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-bg p-3 font-mono text-[10.5px] leading-relaxed text-file">
                {code}
            </pre>
        </motion.div>
    );
}

function RuleChip({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3">
                {k}
            </span>
            <span className="text-ink-2">{v}</span>
        </div>
    );
}

// ───── File tree with notes attached ─────────────────────
type TreeRow =
    | { kind: "folder"; name: string; depth: number; count: number }
    | {
          kind: "file";
          name: string;
          path: string;
          type: "ts" | "tsx" | "json" | "env" | "md";
          depth: number;
          notes: number;
      }
    | {
          kind: "note";
          id: string;
          weight: number;
          importance: number;
          injects: number;
          age: string;
          label: string;
          depth: number;
          sharedWith?: string[];
      };

const TREE_ROWS: TreeRow[] = [
    { kind: "folder", name: "src", depth: 0, count: 9 },
    { kind: "folder", name: "components", depth: 1, count: 1 },
    { kind: "file", name: "Dashboard.tsx", path: "src/components/Dashboard.tsx", type: "tsx", depth: 2, notes: 1 },
    {
        kind: "note", id: "n_ssn5", weight: 0.71, importance: 0.71, injects: 9, age: "8d", depth: 3,
        label: "useQuery without selector — re-renders on every Convex update",
    },
    { kind: "folder", name: "routes", depth: 1, count: 1 },
    { kind: "file", name: "login.ts", path: "src/routes/login.ts", type: "ts", depth: 2, notes: 2 },
    {
        kind: "note", id: "n_a01c", weight: 0.95, importance: 0.91, injects: 28, age: "5d", depth: 3,
        label: "Missing requireCsrfToken on POST /login",
    },
    {
        kind: "note", id: "n_4f1d", weight: 0.88, importance: 0.88, injects: 31, age: "6d", depth: 3,
        label: "JWT verified without checking expiry", sharedWith: ["jwt.ts"],
    },
    { kind: "folder", name: "api", depth: 1, count: 1 },
    { kind: "file", name: "webhooks.ts", path: "src/api/webhooks.ts", type: "ts", depth: 2, notes: 1 },
    {
        kind: "note", id: "n_wbk7", weight: 0.84, importance: 0.82, injects: 19, age: "1d", depth: 3,
        label: "Webhook returns 500 on validation errors instead of 4xx",
    },
    { kind: "folder", name: "lib", depth: 1, count: 3 },
    { kind: "file", name: "client.ts", path: "src/lib/client.ts", type: "ts", depth: 2, notes: 1 },
    {
        kind: "note", id: "n_92ac", weight: 1.0, importance: 0.94, injects: 47, age: "3d", depth: 3,
        label: "Hardcoded internal API host", sharedWith: [".env.example"],
    },
    { kind: "file", name: "jwt.ts", path: "src/lib/jwt.ts", type: "ts", depth: 2, notes: 1 },
    {
        kind: "note", id: "n_4f1d", weight: 0.81, importance: 0.88, injects: 31, age: "6d", depth: 3,
        label: "JWT verified without checking expiry", sharedWith: ["login.ts"],
    },
    { kind: "file", name: "db.ts", path: "src/lib/db.ts", type: "ts", depth: 2, notes: 1 },
    {
        kind: "note", id: "n_ttl3", weight: 0.79, importance: 0.85, injects: 22, age: "2d", depth: 3,
        label: "sliding-TTL inverted in session refresh",
    },
    { kind: "folder", name: "convex", depth: 0, count: 1 },
    { kind: "file", name: "schema.ts", path: "convex/schema.ts", type: "ts", depth: 1, notes: 0 },
    { kind: "file", name: "package.json", path: "package.json", type: "json", depth: 0, notes: 1 },
    {
        kind: "note", id: "n_lod9", weight: 0.97, importance: 0.91, injects: 38, age: "4d", depth: 1,
        label: "lodash CVE 2021-23337 — prototype pollution via zipObjectDeep",
    },
    { kind: "file", name: ".env.example", path: ".env.example", type: "env", depth: 0, notes: 0 },
];

const TYPE_COLORS: Record<string, string> = {
    ts: "#7C9EFF",
    tsx: "#66E0FF",
    json: "#FFB86B",
    env: "#6EE7B7",
    md: "#A0A8BD",
};

function FileTreeWithNotes() {
    const totalFiles = TREE_ROWS.filter((r) => r.kind === "file").length;
    const totalNotes = new Set(
        TREE_ROWS.filter((r) => r.kind === "note").map(
            (r) => (r as { id: string }).id,
        ),
    ).size;
    const totalEdges = TREE_ROWS.filter((r) => r.kind === "note").length;

    return (
        <div className="mt-16 overflow-hidden rounded-3xl border border-border-strong bg-bg shadow-2xl">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface/60 px-5 py-3 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-ink">
                        the codebase
                    </span>
                    <span className="font-mono text-[11px] text-ink-3">
                        · context-cloud
                    </span>
                </div>
                <div className="flex items-center gap-4 font-mono text-[11px] text-ink-3">
                    <span>
                        <span className="text-ink">{totalFiles}</span> files
                    </span>
                    <span className="opacity-50">·</span>
                    <span>
                        <span className="text-accent">{totalNotes}</span> notes
                    </span>
                    <span className="opacity-50">·</span>
                    <span>
                        <span className="text-ink">{totalEdges}</span> file→note edges
                    </span>
                </div>
            </div>

            {/* Tree body */}
            <div className="divide-y divide-border/40">
                {TREE_ROWS.map((row, i) => (
                    <TreeRowRender key={i} row={row} />
                ))}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-3 border-t border-border bg-surface/40 px-5 py-3 font-mono text-[10px] text-ink-3">
                <span className="text-ink-2">noteFiles</span>
                <span className="opacity-60">→</span>
                <span>
                    open any file, the agent gets the notes attached to it (weight ≥
                    0.40) injected into context — no embeddings, no chat history walk.
                </span>
            </div>
        </div>
    );
}

function TreeRowRender({ row }: { row: TreeRow }) {
    if (row.kind === "folder") {
        return (
            <div
                className="flex items-center gap-2 px-5 py-2 hover:bg-surface-2 transition-colors"
                style={{ paddingLeft: `${20 + row.depth * 18}px` }}
            >
                <ChevronGlyph />
                <FolderGlyph />
                <span className="font-mono text-[12.5px] font-medium text-ink-2">
                    {row.name}
                </span>
                <span className="ml-auto font-mono text-[10px] text-ink-3">
                    {row.count} {row.count === 1 ? "file" : "files"}
                </span>
            </div>
        );
    }

    if (row.kind === "file") {
        const color = TYPE_COLORS[row.type] ?? "#5C6478";
        return (
            <div
                className={cn(
                    "group flex items-center gap-2 px-5 py-2 transition-colors",
                    row.notes > 0 ? "bg-accent/[0.025]" : "hover:bg-surface-2",
                )}
                style={{ paddingLeft: `${36 + row.depth * 18}px` }}
            >
                <FileGlyph color={color} />
                <span className="font-mono text-[12.5px] text-ink">{row.name}</span>
                <span className="font-mono text-[10px] text-ink-3">
                    .{row.type}
                </span>
                <span className="ml-auto flex items-center gap-2">
                    {row.notes > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/8 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                            <span className="h-1 w-1 rounded-full bg-accent" />
                            {row.notes} {row.notes === 1 ? "note" : "notes"}
                        </span>
                    ) : (
                        <span className="font-mono text-[10px] text-ink-4">
                            no notes
                        </span>
                    )}
                </span>
            </div>
        );
    }

    // note
    return (
        <div
            className="flex items-stretch gap-3 bg-bg/40 px-5 py-3"
            style={{ paddingLeft: `${56 + (row.depth - 1) * 18}px` }}
        >
            <div className="flex flex-col items-center pt-1">
                <span className="block h-3 w-px bg-border" />
                <span className="block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_0_3px_rgba(255,184,107,0.10)]" />
            </div>
            <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-ink-3">{row.id}</span>
                    <span className="opacity-40 text-ink-3">·</span>
                    {/* importance bar */}
                    <span className="inline-flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-ink-3">imp</span>
                        <span className="relative block h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                            <span
                                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent/80 to-yellow"
                                style={{
                                    width: `${(row.importance - 0.6) * 250}%`,
                                }}
                            />
                        </span>
                        <span className="font-mono text-[10px] font-semibold text-accent">
                            {row.importance.toFixed(2)}
                        </span>
                    </span>
                    <span className="opacity-40 text-ink-3">·</span>
                    {/* weight chip — to THIS file */}
                    <span className="inline-flex items-center gap-1 rounded-md border border-file/25 bg-file/8 px-1.5 py-0.5 font-mono text-[10px] text-file">
                        weight {row.weight.toFixed(2)} →
                    </span>
                    <span className="opacity-40 text-ink-3">·</span>
                    <span className="font-mono text-[10px] text-ink-3">
                        ×{row.injects} inj
                    </span>
                    <span className="opacity-40 text-ink-3">·</span>
                    <span className="font-mono text-[10px] text-ink-3">{row.age}</span>
                    {row.sharedWith && row.sharedWith.length > 0 && (
                        <>
                            <span className="opacity-40 text-ink-3">·</span>
                            <span className="font-mono text-[10px] text-ink-3">
                                also on{" "}
                                {row.sharedWith.map((f, i) => (
                                    <span key={f}>
                                        {i > 0 && ", "}
                                        <span className="text-file">{f}</span>
                                    </span>
                                ))}
                            </span>
                        </>
                    )}
                </div>
                <div className="mt-1.5 text-[13px] leading-snug text-ink">
                    {row.label}
                </div>
            </div>
        </div>
    );
}

function ChevronGlyph() {
    return (
        <svg viewBox="0 0 16 16" className="h-3 w-3 text-ink-3" fill="none">
            <path
                d="M5 6l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function FolderGlyph() {
    return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-file/80" fill="none">
            <path
                d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"
                stroke="currentColor"
                strokeWidth="1.2"
                fill="currentColor"
                fillOpacity="0.15"
            />
        </svg>
    );
}

function FileGlyph({ color }: { color: string }) {
    return (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
            <path
                d="M3 2a1 1 0 0 1 1-1h6l3 3v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2z"
                stroke={color}
                strokeWidth="1.2"
                fill={color}
                fillOpacity="0.15"
            />
            <path d="M10 1v3h3" stroke={color} strokeWidth="1.2" />
        </svg>
    );
}

// ───────────────────────────────────────────────────────────
// Final CTA
// ───────────────────────────────────────────────────────────
function FinalCTA() {
    return (
        <section className="relative py-32">
            <div className="mx-auto max-w-4xl px-6">
                <div className="relative overflow-hidden rounded-3xl border border-border-strong bg-gradient-to-br from-surface via-surface-2 to-surface p-10 md:p-16">
                    <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
                    <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-file/20 blur-3xl" />
                    <div className="relative">
                        <h2 className="text-balance text-4xl font-medium tracking-tight text-ink md:text-5xl">
                            Stop letting your agents{" "}
                            <span className="bg-gradient-to-br from-accent to-yellow bg-clip-text text-transparent">
                                forget.
                            </span>
                        </h2>
                        <p className="mt-4 max-w-xl text-base text-ink-2 md:text-lg">
                            The dashboard is live, the agents are running, the notes are
                            growing. Three minutes of judging time at Nozomio became{" "}
                            {COUNTS.activeNotes} notes, {COUNTS.cyclesRun} cycles, and{" "}
                            {COUNTS.issuesFiled} GitHub issues — and counting.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Link
                                href="/dashboard"
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 text-base font-medium text-bg hover:scale-[1.02] transition-transform"
                            >
                                Open the dashboard
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link
                                href="https://github.com/AlfredSjoqvist/context-cloud"
                                target="_blank"
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg/40 px-6 py-3 text-base font-medium text-ink-2 hover:text-ink hover:border-border-strong transition-colors"
                            >
                                <GithubIcon className="h-4 w-4" />
                                Fork it on GitHub
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function Footer() {
    return (
        <footer className="border-t border-border/60 py-10">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-ink-3 sm:flex-row">
                <span className="font-mono">
                    Context Cloud · Nozomio Hackathon · May 2026
                </span>
                <div className="flex gap-5 font-mono">
                    <Link href="/dashboard" className="hover:text-ink-2 transition-colors">
                        Dashboard
                    </Link>
                    <Link
                        href="https://github.com/AlfredSjoqvist/context-cloud"
                        target="_blank"
                        className="hover:text-ink-2 transition-colors"
                    >
                        GitHub
                    </Link>
                </div>
            </div>
            <div className="mx-auto mt-3 flex max-w-6xl flex-col items-center justify-between gap-2 px-6 sm:flex-row">
                <span className="font-mono text-[10px] text-ink-3">
                    Numbers snapshot: {SNAPSHOT_TAKEN} · convex {SNAPSHOT_CONVEX} · demo {SNAPSHOT_DEMO}
                </span>
            </div>
        </footer>
    );
}

// ───────────────────────────────────────────────────────────
// Building blocks
// ───────────────────────────────────────────────────────────
function NoiseLayer() {
    return (
        <div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-0 opacity-[0.025]"
            style={{
                backgroundImage:
                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
            }}
        />
    );
}

function GridBackground() {
    return (
        <div
            aria-hidden
            className="absolute inset-0 -z-10 h-full w-full"
            style={{
                backgroundImage:
                    "linear-gradient(to right, #1B1F2C 1px, transparent 1px), linear-gradient(to bottom, #1B1F2C 1px, transparent 1px)",
                backgroundSize: "64px 64px",
                maskImage:
                    "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%)",
                WebkitMaskImage:
                    "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%)",
            }}
        />
    );
}

function SpotlightGlow() {
    return (
        <>
            <div
                aria-hidden
                className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[680px] w-[1200px] -translate-x-1/2 rounded-full opacity-50"
                style={{
                    background:
                        "radial-gradient(closest-side, rgba(255,184,107,0.25), rgba(124,158,255,0.10) 40%, transparent 75%)",
                }}
            />
            <div
                aria-hidden
                className="pointer-events-none absolute top-32 right-0 -z-10 h-[420px] w-[420px] rounded-full opacity-40"
                style={{
                    background:
                        "radial-gradient(closest-side, rgba(124,158,255,0.20), transparent 70%)",
                }}
            />
        </>
    );
}

function Pill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs font-medium text-ink-2 backdrop-blur-sm">
            {children}
        </span>
    );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
    return (
        <h2 className="text-center text-xs font-mono uppercase tracking-[0.25em] text-ink-3">
            {children}
        </h2>
    );
}

function SectionHeadline({ children }: { children: React.ReactNode }) {
    return (
        <p className="mx-auto mt-4 max-w-3xl text-balance text-center text-3xl font-medium tracking-tight text-ink md:text-5xl">
            {children}
        </p>
    );
}

function SectionLede({ children }: { children: React.ReactNode }) {
    return (
        <p className="mx-auto mt-5 max-w-2xl text-balance text-center text-base text-ink-2 md:text-lg">
            {children}
        </p>
    );
}

function PillarCard({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className={cn(
                "relative flex flex-col rounded-2xl border border-border bg-surface p-6 overflow-hidden",
                className,
            )}
        >
            {children}
        </motion.div>
    );
}

function PillarIconBlock({
    icon,
    color,
}: {
    icon: React.ReactNode;
    color: "accent" | "file" | "green" | "purple" | "cyan";
}) {
    const map = {
        accent: "text-accent bg-accent/10 border-accent/20",
        file: "text-file bg-file/10 border-file/20",
        green: "text-green bg-green/10 border-green/20",
        purple: "text-purple bg-purple/10 border-purple/20",
        cyan: "text-cyan bg-cyan/10 border-cyan/20",
    };
    return (
        <div
            className={cn(
                "mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border [&>svg]:h-5 [&>svg]:w-5",
                map[color],
            )}
        >
            {icon}
        </div>
    );
}

function PillarTitle({
    children,
    small,
}: {
    children: React.ReactNode;
    small?: boolean;
}) {
    return (
        <h3
            className={cn(
                "font-medium tracking-tight text-ink",
                small ? "text-lg" : "text-2xl",
            )}
        >
            {children}
        </h3>
    );
}

function PillarBody({
    children,
    small,
}: {
    children: React.ReactNode;
    small?: boolean;
}) {
    return (
        <p
            className={cn(
                "mt-2 leading-relaxed text-ink-2",
                small ? "text-sm" : "text-base",
            )}
        >
            {children}
        </p>
    );
}

function PillarFooter({ children }: { children: React.ReactNode }) {
    return (
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
            {children}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="font-mono text-2xl font-semibold text-ink">{value}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-3">
                {label}
            </div>
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
            <div className="font-mono text-base font-semibold text-ink">{value}</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-3">
                {label}
            </div>
        </div>
    );
}

function StatCallout({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="font-mono text-3xl font-semibold text-accent">{value}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                {label}
            </div>
        </div>
    );
}

function GithubIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            aria-hidden
        >
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.04c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.35.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.93 10.93 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.4-5.27 5.68.42.36.78 1.08.78 2.18v3.23c0 .31.21.66.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
        </svg>
    );
}

function NoteMockup() {
    return (
        <div className="rounded-xl border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed">
            <div className="flex items-center gap-2 text-ink-3">
                <span className="rounded bg-accent/10 px-1.5 py-0.5 text-accent text-[10px]">
                    NOTE 0.94
                </span>
                <span>×47 inj</span>
            </div>
            <div className="mt-2 text-ink">Hardcoded API URL in client.ts</div>
            <div className="mt-1 text-ink-3">
                env.INTERNAL_API_BASE leaks staging into prod.
            </div>
            <div className="mt-2 flex items-start gap-1.5 text-accent">
                <span>↳</span>
                <span>Read from process.env.INTERNAL_API_BASE; never inline a URL.</span>
            </div>
        </div>
    );
}
