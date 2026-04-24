# axf v0 → alpha bootstrap plan

## Objective

Build the smallest version of axf that proves the framework shape, then
prove it against two real providers. Optimize for clarity,
inspectability, and safety — not completeness.

## Goals

axf should prove:

- workspace binding (CWD-independent execution)
- manifest-based capability resolution
- module mounts (toolspaces)
- adapter execution through both type adapters and provider adapters
- lifecycle gating for generated units
- scaffoldability for future growth — not just by us

## What is *not* in alpha

- AWA / work tooling migration
- legacy command backfill as the main success metric
- plugin ecosystems beyond the adapter contract
- mandatory MCP
- mandatory provider-native axf hooks
- automatic promotion of agent-generated capabilities

## Slice history

### Slices 1–6: prototype runtime

- Slice 1 — parser + path model (`src/core/path-model.js`)
- Slice 2 — manifest registry (`src/core/registry.js`)
- Slice 3 — resolver with default injection (`src/core/resolver.js`)
- Slice 4 — executor (initial; later split out)
- Slice 5 — lifecycle gates (`active` default; `--any-lifecycle` opt-in,
  `--allow-draft` retained as deprecated alias)
- Slice 6 — `axf init {toolspace,capability}` scaffolding

### Slice 7: adapter spine + strict gates

- Execution dispatched through `adapters/<type>/` folders.
- `internal` and `cli` ship as built-in type adapters.
- `axf init adapter <type>` scaffolds a draft type-adapter.
- `manifestVersion: "axf/v0"` required; strict registry refuses bad
  manifests at load time.
- `argsSchema` validation + coercion at resolve time; CLI parsing no
  longer auto-coerces numerics.
- Policy hook present; declared-but-unenforced policies surface as
  doctor warnings.
- Lex shipped as the first non-toy provider via the generic `cli`
  adapter (no privileged path).

### Slice 8: provider adapters (open contract) + Majel as proof

- New `kind: "provider"` adapter folder shape under `adapters/<name>/`.
  Provider adapters declare `composes: <type-adapter>` and wrap a type
  adapter to normalize provider-specific quirks (envelopes, hints,
  envelope-level errors).
- Existing two adapter manifests migrated from `kind: "adapter"` to
  `kind: "type-adapter"`. Single source of truth in
  `docs/04-adapter-contract.md` and `docs/08-adapter-folder-shape.md`.
- Capability manifests gain optional `providerAdapter: "<name>"`. Without
  it, the generic type adapter handles execution. With it, the provider
  composes over the type adapter through the executor.
- `axf init adapter --kind provider <name> [--composes <type>]` scaffolds
  a draft provider adapter.
- Workspace-root resolution (`src/core/workspace.js`): explicit
  `--workspace`, `AXF_WORKSPACE`, marker-file walk from cwd, marker walk
  from script location, then cwd. Lets `axf` work from any directory.
- `axf` symlinked at `/usr/local/bin/axf` as the alpha PATH binary;
  collision with the unrelated Majel `ax` tool deliberately avoided
  until axf can host it as a first-class toolspace.
- Majel provider adapter at `adapters/majel/` unwraps the Majel
  `{command, success, durationMs, data, errors[], hints[]}` envelope.
- Capabilities `global.majel.status` and `global.majel.diff` shipped
  active; `ops` toolspace mounts both Lex and Majel.
- Canonical adapter prompts (`prompts/adapter-{discovery,planning,scaffold,review}.prompt.md`)
  rewritten to reference the actual file contract and the Majel example.

## Definition of success for alpha (met)

1. A global capability resolves and executes from any CWD via PATH-installed `axf`.
2. A mounted capability resolves differently under a toolspace with injected defaults.
3. A draft adapter and capability scaffold are created from declared templates.
4. Two real providers (Lex, Majel) wired in through the public contract,
   one through the generic CLI path and one through a provider adapter.
5. An agent can extend axf by following the canonical prompts without
   reading framework source.

## Known follow-ons (post-alpha)

All four below shipped with the post-alpha follow-on pass; the Ajv item
remains deferred on purpose.

- **Deferred.** Replace the in-house schema subset with Ajv. Adding a
  runtime dep changes axf's zero-dep stance (a foundational property),
  so the swap waits until validation strain is real, not theoretical.
  Single-file swap behind `assertValid` remains the plan when the time
  comes.
- **Done.** `kind: "adapter"` legacy spelling is accepted by the loader
  with a deprecation warning and silently rewritten to `type-adapter`
  in memory. Slated for removal in v0.1.
- **Done.** `--allow-draft` now emits a one-line stderr deprecation
  warning on use; canonical name is `--any-lifecycle`. Removal in v0.1.
- **Done.** Two new policy bodies beyond `require_workspace_binding`:
  `require_active_lifecycle` (binding refusal of non-active capabilities
  at execution time, independent of the framework `--any-lifecycle`
  flag) and `forbid_network` (refuses capabilities whose declared
  `sideEffects` include network egress).
- **Done.** `axf demote <id> --to <state>` ships as the symmetric
  inverse of `promote`, enforcing direction so an agent that means to
  walk a capability back can do so without holding a regression-shaped
  promote in its head. Both commands share the edit + revalidate path.
