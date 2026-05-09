# docs-ingest

External documentation → line-citable `.md` constraints in `<demo-target>/.context-map/library/<lib>/`, consumed by the Guardian Agent via Nia.

## What problem this solves

The Guardian Agent (see `agent/`) scans demo-target source files, looks up
constraints from `.md` leaves under `.context-map/`, and produces findings that
must cite a specific line in a specific `.md` file. Without this layer, those
constraint leaves are hand-authored — Guardian is only as smart as what was
typed in. With this layer, Guardian's constraints are derived from real external
documentation (Stripe webhook security guide, Express security best practices,
lodash GitHub Security Advisories, OpenAPI specs), so a finding cites a real
upstream source instead of a planted stub.

The whole pipeline writes **per-line** rules so Guardian's
`niaClient.verifyConstraintCite(mdFile, line, text)` accepts each rule
verbatim.

## 30-second demo

The demo assumes [`NewCoder3294/demo-target`](https://github.com/NewCoder3294/demo-target)
is cloned as a sibling of `context-cloud/`.

```bash
cd context-cloud/docs-ingest
npm install
npm run demo
```

Output: `<demo-target>/.context-map/library/lodash/security-advisories.md` —
seven rules extracted from a real lodash GHSA fixture, scoped to
`src/lib/db.ts` (the only demo-target file that imports lodash).

For all three input formats end-to-end:

```bash
npm run seed                                       # registers stripe (md), lodash (md), express (html), payments (openapi)
npm run ingest -- <source-id> --emit              # full pipeline
npm run ingest -- <source-id> --dump-chunks       # inspect chunker output
npm run ingest -- <source-id> --dump-rules --emit # see extracted rules + emit
npm run ingest -- <source-id> --emit --use-llm    # force LLM extraction (needs OPENAI_API_KEY)
npm run ingest -- <source-id> --emit --no-llm     # force regex extraction
```

## Pipeline

```
DocSource (md_dir | html_url | openapi_spec)
    │
    ├─ ingest/   fetch  ─▶  parse  ─▶  chunk        (heading-aware)
    │                                     │
    ├─ link/     package.json deps + grep src/ for imports of <lib>
    │                                     │
    ├─ extract/  one-line MUST/MUST NOT rules  (LLM with regex fallback)
    │                                     │
    └─ emit/     <ctxmap>/library/<lib>/<topic>.md
                 - frontmatter: scope, library, applies_to, source, rules
                 - body: numbered list, one rule per line, citation-ready
```

### Inputs verified end-to-end

| Format | Source kind | Example fixture | Chunks | Rules | Linked files |
|---|---|---|---|---|---|
| Markdown | `markdown_dir` | `fixtures/lodash/security-advisories.md` (lodash GHSA) | 4 | 7 | `src/lib/db.ts` |
| HTML | `html_url` (`file://` or HTTP) | `fixtures/express/security-best-practices.html` | 6 | 13 | 6 demo-target files |
| OpenAPI | `openapi_spec` (YAML/JSON) | `fixtures/openapi/payments.yaml` | 3 | 22 | 6 demo-target files |

## Integration contract with Guardian

Guardian (per [`agent/tools/niaClient.ts`](../agent/tools/niaClient.ts) and the
`findings.constraintCite` shape in [`convex/schema.ts`](../convex/schema.ts))
expects each finding to carry `{ mdFile, line, text }` where `text` is byte-equal
to the line at `mdFile:line`.

Each leaf this pipeline emits has a numbered body where every line stands alone
as a complete imperative:

```
1. Files importing lodash MUST upgrade `lodash` to `4.17.21` or later.
2. Files importing lodash MUST NOT call `_.template(userInput)` directly when ...
```

Guardian's analyzer (Plan 2) can pick a line and call
`verifyConstraintCite("library/lodash/security-advisories.md", 1, "1. Files importing lodash MUST upgrade `lodash` to `4.17.21` or later.")`
and it will pass.

`applies_to` in the frontmatter scopes the leaf to specific source files
(determined by import-grep over `<demo-target>/src/`), so Guardian doesn't have
to consider the lodash advisory when scanning a file that doesn't import lodash.

## File layout

```
docs-ingest/
  fixtures/
    stripe/      webhook-security.md      # md, chunker proof
    lodash/      security-advisories.md   # md, demo target
    express/     security-best-practices.html  # html
    openapi/     payments.yaml            # openapi
  src/
    types.ts                              # zod-validated DocSource, RawDoc, DocChunk, ExtractedRule, OutputLeaf
    config.ts                             # env-driven config
    sources/registry.ts                   # JSON-file-backed source CRUD
    ingest/
      fetch.ts                            # markdown_dir / html_url / openapi_spec
      parse-md.ts                         # remark heading-tree
      parse-html.ts                       # cheerio heading-tree
      parse-openapi.ts                    # swagger-parser → synthetic per-endpoint sections
      chunk.ts                            # heading-aware, splits >1500 char sections
      index.ts                            # orchestrator
    link/
      package-imports.ts                  # parse demo-target package.json
      import-grep.ts                      # find files importing a library
    extract/
      modality.ts                         # MUST/MUST NOT/SHOULD/NEVER detector
      rule-extractor.ts                   # LLM (gpt-5) with regex fallback
    emit/
      paths.ts                            # leaf path layout
      write-leaves.ts                     # frontmatter + numbered body, line-citable
    cli/ingest.ts                         # the only entry point besides the demo script
  scripts/
    seed-sources.ts                       # registers all 4 fixtures
    demo.ts                               # one-command end-to-end (npm run demo)
```

## Environment

| Var | Purpose | Default |
|---|---|---|
| `DOCS_INGEST_HOME` | Pipeline root (where `sources.json` lives) | cwd |
| `DOCS_INGEST_CONTEXT_MAP` | Where leaves are written | `<sibling demo-target>/.context-map` if found, else `<home>/.context-map` |
| `DOCS_INGEST_CODEBASE_ROOT` | Codebase the linker greps for imports | sibling demo-target if found, else home |
| `OPENAI_API_KEY` | If set, LLM extractor activates by default | unset → regex extractor |
| `OPENAI_MODEL` | LLM model id | `gpt-5` |

## Tests

```bash
npm test
```

76 vitest tests across 9 files, hermetic (tmpdirs, OpenAI mocked, no network).
Covers the parsers, chunker, modality detector, rule extractor (regex + mocked
LLM), import grep (including `node_modules` skip), package-imports, leaf path
helpers, frontmatter rendering, and the byte-identical line-citation
invariant the Guardian relies on.

## What's deliberately not built

- **Incremental re-ingest** — full re-run is fine for the hackathon scope.
- **PDF input** — OpenAPI covers the structured-format requirement; no demo path needs PDF.
- **Per-doc-section leaves** — current emitter writes one leaf per source
  (one input doc → one output leaf). For very large docs this would split
  into multiple leaves, but no fixture hits the limit.
- **A long-running daemon / file watcher** — the Guardian itself is the always-on
  agent in the system; this layer is invoked offline before a Guardian cycle.

## Branch

Branched off `nicolas/plan-1-foundation`. Final consolidated branch: `hari`.
