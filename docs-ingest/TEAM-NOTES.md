# docs-ingest — what I (Hari) built and how it plugs in

For Alfred and Nicolas. Skim this to understand what's on the `hari` branch
and what (if anything) you need to do to use it.

## TL;DR

A new TypeScript pipeline at `docs-ingest/` that ingests **external
documentation** (markdown / HTML / OpenAPI), extracts **MUST/MUST NOT/SHOULD**
rules, and writes them as **line-citable `.md` constraint leaves** into the
demo-target's `.context-map/library/<lib>/` directory.

The point: Nicolas's Guardian currently cites *hand-authored* `.md` constraints
(the ones under `.context-map/leaves/` and `.context-map/src/`). After this
lands, Guardian also has access to constraints derived from **real upstream
docs** — Stripe webhook security, Express security best practices, lodash
GitHub Security Advisories, OpenAPI specs — without any of you writing them.

```
External doc URL/file  ─▶  docs-ingest  ─▶  <demo-target>/.context-map/library/<lib>/<topic>.md
                                                      │
                                                      ▼
                                          Guardian scans + cites via Nia
```

## How it fits with your work

### For Nicolas (Guardian, `agent/`)

**Nothing changes in your code.** The leaves I write live in a new
subdirectory (`.context-map/library/`) so they don't collide with your
hand-authored leaves at `.context-map/leaves/` or `.context-map/src/`.
`scripts/index-demo.ts` will count them with the rest under `.context-map/**`.

Each leaf I emit is built so your `niaClient.verifyConstraintCite(mdFile, line, text)`
contract works verbatim — every numbered line in the body is a complete,
self-contained imperative sentence. Example:

```
1. Files importing lodash MUST upgrade `lodash` to `4.17.21` or later.
2. Files importing lodash MUST NOT call `_.template(userInput)` directly when ...
```

So when your Plan 2 analyzer picks a line and constructs a `constraintCite`,
the verifier accepts it.

The frontmatter has `applies_to: ["src/lib/db.ts"]` (computed by grepping
demo-target's `src/` for `lodash` imports), which you can use later to filter
which leaves the analyzer pulls for which file. Plan 1 doesn't read frontmatter,
so this is forward-looking.

### For Alfred (NM core, `nm_*.py`)

**Nothing direct yet.** My layer doesn't read or write `nm.db`. It slots in
upstream of Nicolas's Guardian, not into NM's transcript-capture loop.

If you want to integrate later: my emitter could optionally write per-leaf
metadata to a Convex table (or, in your case, an SQLite table) so the UI
shows "ingested this Stripe doc just now" beside "captured this Claude
session just now." That's a demo polish item I haven't built; let me know if
you want it.

### For you (Hari) running the demo

```bash
cd context-cloud/docs-ingest
npm install
npm run demo
```

Auto-seeds 4 fixture sources, ingests the lodash GHSA, writes the leaf into
`<sibling demo-target>/.context-map/library/lodash/security-advisories.md`,
and prints the resulting file. Whole thing in ~3 seconds with no API key
(regex extractor); higher quality with `OPENAI_API_KEY` set (gpt-5
extractor activates automatically).

## What's on the `hari` branch (off `nicolas/plan-1-foundation`)

```
docs-ingest/
  README.md                         # technical reference
  TEAM-NOTES.md                     # this file
  package.json, tsconfig, vitest config
  fixtures/
    stripe/      webhook-security.md         # markdown — chunker proof
    lodash/      security-advisories.md      # markdown — DEMO leaf
    express/     security-best-practices.html  # HTML
    openapi/     payments.yaml               # OpenAPI 3.0 + bearer auth
  src/
    types.ts, config.ts, sources/registry.ts
    ingest/    fetch.ts, parse-md.ts, parse-html.ts, parse-openapi.ts, chunk.ts, index.ts
    link/      package-imports.ts, import-grep.ts
    extract/   modality.ts, rule-extractor.ts (LLM + regex fallback)
    emit/      paths.ts, write-leaves.ts
    cli/       ingest.ts
  scripts/     seed-sources.ts, demo.ts
```

11 commits, ~5500 lines added (~1600 production + ~1700 tests + ~500 fixture +
~1700 lockfile). 76 vitest tests, all passing, hermetic.

## Verified end-to-end (with no API key, regex extractor)

| Format | Source | Chunks | Rules | Linker firing | Linked demo-target files |
|---|---|---|---|---|---|
| Markdown | lodash GHSA fixture | 4 | 7 | import-grep | `src/lib/db.ts` |
| HTML | Express security fixture | 6 | 13 | import-grep | 6 files (server + middleware + routes) |
| OpenAPI | Payments YAML fixture | 3 | 22 | import-grep | 6 files |
| Markdown (module) | webapp-routes fixture | 3 | 12 | **path-convention** | `src/routes/{login,payments,sessions}.ts` (via 6 derived globs, no library import) |

Total: **4 leaves, 54 rules**, all line-citable. The webapp-routes leaf
demonstrates `applies_to` grounded in codebase layout alone — the linker
never sees a library import for this source.

## What I deliberately didn't build

- **Incremental re-ingest** — full re-run is fast enough.
- **PDF input** — OpenAPI satisfies the structured-format need.
- **Per-doc-section leaves** — currently one source = one leaf.
- **A long-running daemon** — Guardian is the always-on agent in the system;
  this layer runs offline before a Guardian cycle.
- **Direct `nm.db` writes** — kept the integration boundary narrow at
  `.context-map/`. Easy to add later if useful.

## What's been added on top of the original handoff

- **Live URL ingestion** — `npx tsx src/cli/ingest.ts --from-url
  https://api.github.com/advisories/GHSA-XXXX --emit` synthesises an
  ephemeral source, fetches the GHSA JSON (or any markdown / `text/html`
  URL), runs the full pipeline, and writes a leaf scoped to the affected
  package. No registry edits needed.
- **Source URL preserved in citation** — when known, the upstream public
  URL is now in both the leaf YAML frontmatter (`source_url:`) and the
  `## Source` block (`- URL: <https://...>`), so every cited rule has a
  clickable provenance link.
- **Convex live ingestion stream** — when `CONVEX_URL` is set, every
  `--emit` writes one row to a new `docsIngestRuns` table. The schema
  and `recordRun` mutation live in `convex/docsIngestRuns.ts`. Best-effort:
  if Convex is unset or unreachable, docs-ingest logs and continues so
  the offline demo path is unaffected. To make the rows visible in the
  UI, copy the existing `EventStream.tsx` pattern to subscribe to
  `api.docsIngestRuns.listRecent`.
- **Path-convention linker** — derives globs from the doc's path. e.g.
  a doc at `routes/payments.md` produces `src/routes/payments/**` and
  `src/routes/payments*` candidates. Strips optional `docs/`, `doc/`, or
  `documentation/` prefix. Only fires for identifier-shaped basenames so
  topical names like `security-best-practices.md` correctly skip.
  Demonstrated end-to-end via the new `webapp-routes` fixture (`npm run
  demo` shows it as step 4 with 6 globs covering 3 demo-target routes,
  zero import-grep contribution).
- **Reverse-reference linker** — scans the codebase for `@see foo.md`,
  `// see foo.md`, `// ref foo.md`, `// doc foo.md` patterns (matching
  `.md` and `.mdx`). Source files referencing a doc are added to that
  leaf's `applies_to`. Generic capability — dormant on the current
  fixtures because demo-target has no `@see` markers, but tested with 8
  unit cases. Fires automatically when any codebase ships markers.

`writeLeaf` now merges import-grep + path-convention + reverse-ref
signals, deduplicated. The broad-glob fallback (`src/**/*.{ts,tsx,...}`)
fires only when the union of all three signals is empty.

## What's still optional if we have time before 6pm

1. **bcryptjs + cookie-parser fixtures** — they're in demo-target's
   `package.json`, would expand the linked-files surface from 7 to 9. ~20 min.
2. **UI panel for the ingestion stream** — subscribe to
   `api.docsIngestRuns.listRecent` next to the existing event stream. ~30 min.
3. ~~**Path-convention linking**~~ — DONE (see above).
   pitch beyond import-only matching. ~45 min.

Ping me which (if any) you want.

## Where to look if something breaks

- **Pipeline didn't write a leaf?** Check the last line of the `ingest`
  command output. The `[emit]` line shows the absolute path written;
  `[link] importers=0` means the linker found nothing to scope to (still
  emits, with a broad fallback glob).
- **Guardian's verifier rejected a citation?** That means a numbered line
  in the leaf doesn't match Guardian's `text` byte-for-byte. The emitter
  guarantees this; if it breaks, the regression test
  `src/emit/write-leaves.test.ts` catches it.
- **TypeScript red?** `npx tsc -p . --noEmit` from `docs-ingest/`. Strict
  mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- **Demo target not found?** The pipeline auto-detects a sibling
  `demo-target/`. If you put the demo target elsewhere, set
  `DOCS_INGEST_CONTEXT_MAP=/path/to/.context-map` and
  `DOCS_INGEST_CODEBASE_ROOT=/path/to/repo`.

## Branch + PR

- Branch: [`hari`](https://github.com/AlfredSjoqvist/context-cloud/tree/hari) (off `nicolas/plan-1-foundation`)
- Open PR template: https://github.com/AlfredSjoqvist/context-cloud/pull/new/hari
- 11 commits, all green: `tsc=0`, `npm test` 76/76 passing, `npm run demo`
  end-to-end clean.

Ping me on Discord if anything's broken or you want me to wire this into
your part of the system.
