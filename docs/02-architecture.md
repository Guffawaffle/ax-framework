# AX Architecture Overview

## Architecture statement

AX should be built as a small platform with clear layers.

The layers are:

1. CLI surface
2. resolver
3. manifest registry
4. adapter execution layer
5. lifecycle and policy gates
6. optional shared modules such as Lex

## High-level shape

```text
AX CLI
  -> parser
  -> resolver
  -> registry
  -> adapter binding
  -> executor
  -> normalized result
```

## Command grammar

Conceptual grammar:

`ax <toolspace?> <module> <capability> [args...]`

Examples:

- `ax lex frame recall`
- `ax awa lex frame recall`
- `ax stfc mod extract assets`

Important: the CLI path is not the execution target.
It is a lookup path.

## Global vs mounted distinction

### `ax lex ...`

This means:
- use the global Lex module exposed through AX
- no toolspace-local mount is assumed
- global defaults and policies apply

### `ax awa lex ...`

This means:
- enter the `awa` toolspace
- use the Lex mount declared there
- apply `awa` scope, defaults, policies, and restrictions

These are not equivalent by definition.

Even if the first implementation proxies one through the other, AX should preserve the distinction internally.

## Resolution order

Preferred conceptual order:

1. workspace-local *(implemented; resolves `workspace.<module>.<cap>` and is reachable via shorthand `axf run <module> <cap>` when no global match exists)*
2. toolspace-local
3. global

This allows toolspaces and workspaces to narrow or override broader behavior in predictable ways.

## Why AX owns the mount model

Mounted modules should be resolved by AX through declared manifests and adapter bindings.

Providers do not need to implement AX-specific hooks unless they want richer native integration.

This keeps AX open without making every provider responsible for AX internals.

## Provider integration stance

AX should support multiple adapter styles:

- `internal`
- `cli`
- `library`
- future: `rpc` or `mcp`

For v0, `internal` and `cli` are enough.

## Recommended top-level repo shape

```text
ax/
  README.md
  docs/
  prompts/
  schemas/
  examples/
  src/
    cli/
    parser/
    resolver/
    registry/
    adapters/
    execution/
    manifests/
    lifecycle/
    policy/
```

## Suggested first implementation targets

Keep the framework small.

Minimum useful commands:

- `ax list`
- `ax inspect <id>`
- `ax run <id>`
- `ax init toolspace`
- `ax init capability`
- `ax doctor`

Do not start by backfilling every historical AX command.
