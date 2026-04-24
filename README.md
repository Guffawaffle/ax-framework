# AX

A manifest-driven capability router and scaffolding framework. AX hosts
provider-built tools (CLIs, libraries, RPCs) behind a single command
shape with strict lifecycle gates, schema-validated args, and a small
open adapter contract any agent can extend.

> Status: **alpha**. End-to-end with two real providers (Lex, Majel).
> Manifest version `ax/v0` is stable for the alpha; field renames
> coming in `v0.1` will go through a deprecation window.

## Install (alpha)

The framework lives at `/srv/ax/`. While it shares its name with
the [Majel project's `ax` tool](/srv/majel/), the framework's binary
is exposed on PATH as `axf` to avoid collision:

```sh
sudo ln -sfn /srv/ax/bin/ax.js /usr/local/bin/axf
```

`axf` finds its workspace by walking up from the current directory for
an `ax.workspace.json` marker, then by walking up from the binary's own
location. From any directory:

```sh
axf doctor
axf list
axf run lex recall --list 3
axf run majel status
axf run majel diff
axf inspect ops majel status
```

`AX_WORKSPACE=<path>` or `--workspace <path>` overrides discovery.

## What's wired up

### Built-in adapters

- **`internal`** — runs handlers in-process (`adapters/internal/`)
- **`cli`** — generic subprocess dispatcher with stdout JSON parsing
  (`adapters/cli/`)
- **`majel`** (provider) — composes `cli`, unwraps Majel's
  `{command, success, errors[], hints[]}` envelope into AX's normalized
  result (`adapters/majel/`)

### Built-in capabilities

| Capability | Provider | Lifecycle | Notes |
|---|---|---|---|
| `global.echo.say` | internal | active | toy proof of internal handlers |
| `global.lex.recall` | cli | active | wraps system `lex recall --json` |
| `global.majel.status` | cli + majel | active | wraps `/srv/majel/bin/ax status` |
| `global.majel.diff` | cli + majel | active | wraps `/srv/majel/bin/ax diff` |

### Toolspaces

- **`toy`** — re-mounts `echo.say` with a `prefix` default (proof of mounts)
- **`ops`** — re-mounts `lex.recall`, `majel.status`, `majel.diff` under
  one operational namespace; same capabilities, single launch surface

## How to add a new provider

The contract is open. There is no privileged path for any provider —
Lex, Majel, and any future tool all go through the same scaffolders:

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
file contract. The Majel adapter at [`adapters/majel/`](adapters/majel/)
is a small, complete, copy-and-modify example.

## Layout

```
ax.workspace.json               # workspace marker
bin/ax.js                       # CLI entry (symlinked as /usr/local/bin/axf)
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

1. [`docs/00-foundation.md`](docs/00-foundation.md) — why AX exists
2. [`docs/01-vocabulary.md`](docs/01-vocabulary.md)
3. [`docs/02-architecture.md`](docs/02-architecture.md)
4. [`docs/03-capabilities-and-manifests.md`](docs/03-capabilities-and-manifests.md)
5. [`docs/04-adapter-contract.md`](docs/04-adapter-contract.md) — the
   two-kind adapter model (type + provider)
6. [`docs/05-lifecycle-and-promotion.md`](docs/05-lifecycle-and-promotion.md)
7. [`docs/06-canonical-prompts.md`](docs/06-canonical-prompts.md)
8. [`docs/07-v0-bootstrap-plan.md`](docs/07-v0-bootstrap-plan.md) —
   slice history through alpha
9. [`docs/08-adapter-folder-shape.md`](docs/08-adapter-folder-shape.md)
   — the concrete file contract

## Tests

```sh
npm test
```

Zero dependencies. Uses Node's built-in `node:test`.

## What is intentionally **not** here

- AWA / work tooling migration (the framework comes first; sensitive
  adoption waits until lifecycle and policy bodies have shipped)
- privileged paths for any provider (Lex and Majel are equal citizens)
- a plugin marketplace
- mandatory MCP support
- agent-generated capabilities that auto-promote
