# Adapter discovery prompt

You are working inside the axf framework repo. Your job is **discovery
only**: figure out whether a tool can be wired into axf, and through
which adapter shape. Do not scaffold yet.

## Required reading

1. [`docs/04-adapter-contract.md`](../docs/04-adapter-contract.md) — the
   two adapter kinds (type-adapter, provider) and the result envelope.
2. [`docs/08-adapter-folder-shape.md`](../docs/08-adapter-folder-shape.md)
   — the two-file contract (`adapter.manifest.json`, `index.js`).
3. The two existing examples:
   - generic CLI without an envelope:
     [`adapters/cli/index.js`](../adapters/cli/index.js)
   - provider adapter as envelope translator:
     [`adapters/majel/index.js`](../adapters/majel/index.js)

## Inspect the tool

Before recommending anything, answer for the target tool:

- What is the call surface? (CLI subcommands, library exports, RPC?)
- Does it have a stable JSON output mode? Does it always emit JSON, or
  only with a flag?
- Does it have an envelope wrapping the payload (e.g. `success`,
  `errors`, `hints`)? If yes: what fields are stable?
- How does it report failure? Process exit code, envelope flag, both?
- Does it require infra (a database, a server, env vars) just to invoke
  read-only commands?
- Does it have side-effecting commands you should *not* expose first?

## Decision

Pick exactly one:

| Recommendation | When |
|---|---|
| Generic `cli` type-adapter only | CLI exists, JSON-out is direct (no envelope), exit code is honest |
| Generic `cli` + a new provider adapter | CLI exists but wraps payload in an envelope, or has hints/errors arrays worth surfacing |
| New `library` type-adapter (future) | Tool is a library, no stable CLI; only after axf adds a `library` type adapter |
| Not yet connectable | Surface is unstable, undocumented, or has no machine-readable output mode |

## Deliverables

1. One-paragraph summary of the tool's callable surface.
2. The decision above, with a one-line justification.
3. 1–3 read-only capability candidates worth wiring first (must be safe
   to call without infra, or with the smallest possible infra).
4. Risks: anything that could make the integration churn (output format
   instability, version drift, infra coupling).
5. Open questions worth asking the human before scaffolding.

## Constraints

- Do not propose a new adapter `kind`. There are two: `type-adapter`
  and `provider`. Compose them; do not invent.
- Treat this as discovery only. The scaffolding step is a separate
  prompt.
- Prefer the simplest path that survives. A provider adapter is only
  worth it when the generic `cli` adapter would force every caller to
  unwrap an envelope.
