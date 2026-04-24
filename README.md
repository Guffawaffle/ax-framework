# axf

A manifest-driven capability router and scaffolding framework. axf
provides a small command surface, explicit manifests, adapter-based
execution, lifecycle gates, and schema-validated args for workspace
toolspaces.

> Status: **alpha**. The core loop is in place: discover, inspect,
> execute, scaffold, and promote capabilities through one contract.
> Manifest version `axf/v0` is the current alpha contract.

## Install (alpha)

The framework lives at `/srv/axf/` (the GitHub repo is
[`Guffawaffle/ax-framework`](https://github.com/Guffawaffle/ax-framework)).
Expose the CLI on PATH with:

```sh
sudo ln -sfn /srv/axf/bin/axf.js /usr/local/bin/axf
```

`axf` finds its workspace by walking up from the current directory for
an `axf.workspace.json` marker, then by walking up from the binary's own
location. From any directory:

```sh
axf doctor
axf list
axf inspect echo say
axf run echo say --message hello
axf run toy echo say --message hello
axf init capability global.acme.status
```

`AXF_WORKSPACE=<path>` or `--workspace <path>` overrides discovery.

## What's wired up

### Built-in adapters

- **`internal`** — runs handlers in-process (`adapters/internal/`)
- **`cli`** — generic subprocess dispatcher with stdout JSON parsing
  (`adapters/cli/`)
- **`majel`** (provider) — the current provider-adapter example layered
  on top of `cli` (`adapters/majel/`)

### Built-in capabilities

| Capability | Provider | Lifecycle | Notes |
|---|---|---|---|
| `global.echo.say` | internal | active | smallest in-process capability example |
| `global.lex.recall` | cli | active | sample CLI-backed read capability |
| `global.majel.status` | cli + majel | active | sample provider-adapter status capability |
| `global.majel.diff` | cli + majel | active | sample provider-adapter diff capability |

### Toolspaces

- **`toy`** — smallest mount example; re-mounts `echo.say` with a local default
- **`ops`** — multi-capability mount example for grouped launch surfaces

## How to add a new provider

The contract is open. Every new provider goes through the same
scaffolders and lifecycle gates:

```sh
# 1. Scaffold a draft provider adapter (only if the provider has an
#    envelope or quirks the generic cli adapter shouldn't carry):
axf init adapter --kind provider acme --composes cli

# 2. Scaffold each capability:
axf init capability global.acme.status

# 3. Edit the drafts, then:
axf doctor
axf run acme status --any-lifecycle
```

The four canonical prompts under [`prompts/`](prompts/) walk an agent
through discovery → planning → scaffolding → review against the actual
file contract. The provider-adapter example under
[`adapters/majel/`](adapters/majel/) is intentionally small and useful
as a shape reference.

## Layout

```
axf.workspace.json               # workspace marker
bin/axf.js                      # CLI entry (symlinked as /usr/local/bin/axf)
src/cli/                        # CLI parsing + main dispatch
src/core/                       # registry, resolver, executor, adapters, doctor, policy
adapters/<type>/                # type adapters (internal, cli, ...)
adapters/<provider>/            # provider adapters (majel, ...)
manifests/capabilities/         # capability manifests
manifests/toolspaces/           # toolspace mount manifests
prompts/                        # canonical prompts for agent-authored adapters
docs/                           # architecture, contract, lifecycle, prompts
test/                           # node:test, zero-dep
```

## Reading order

1. [`docs/00-foundation.md`](docs/00-foundation.md) — why axf exists
2. [`docs/01-vocabulary.md`](docs/01-vocabulary.md)
3. [`docs/02-architecture.md`](docs/02-architecture.md)
4. [`docs/03-capabilities-and-manifests.md`](docs/03-capabilities-and-manifests.md)
5. [`docs/04-adapter-contract.md`](docs/04-adapter-contract.md) — the
   two-kind adapter model (type + provider)
6. [`docs/05-lifecycle-and-promotion.md`](docs/05-lifecycle-and-promotion.md)
7. [`docs/06-canonical-prompts.md`](docs/06-canonical-prompts.md)
8. [`docs/07-v0-bootstrap-plan.md`](docs/07-v0-bootstrap-plan.md) —
  alpha implementation milestones
9. [`docs/08-adapter-folder-shape.md`](docs/08-adapter-folder-shape.md)
   — the concrete file contract

## Tests

```sh
npm test
```

Zero dependencies. Uses Node's built-in `node:test`.

## What is intentionally **not** here

- a broad command-alias layer
- privileged integration paths
- a plugin marketplace
- mandatory remote execution or MCP support
- agent-generated capabilities that auto-promote
