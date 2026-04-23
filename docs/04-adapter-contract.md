# AX Adapter Contract

## Goal

An AX adapter bridges a provider into AX's capability model.

The provider may be:
- an internal AX implementation
- a CLI tool
- a library
- later: an RPC or MCP surface

The adapter is owned by AX's integration model.
It should not be assumed that the provider must implement AX-specific hooks.

## Rule

Adapters should be built against a declared AX contract, not invented ad hoc.

That means an agent may help plan or scaffold an adapter, but the adapter shape itself must be defined by AX first.

## Minimal adapter responsibilities

An adapter must be able to answer:

1. What capabilities from this provider are exposed to AX?
2. How does a logical AX capability map to the provider's callable surface?
3. How is execution performed?
4. How are args translated?
5. How are outputs normalized?
6. What defaults or policies can AX inject safely?

## Suggested adapter file shape

```text
adapters/
  lex/
    adapter.manifest.json
    map-capabilities.ts
    resolve.ts
    execute.ts
    test/
```

## File responsibilities

### `adapter.manifest.json`

Declares:
- provider name
- adapter type
- supported scopes
- supported execution modes
- lifecycle state
- whether the adapter is draft/reviewed/active

### `map-capabilities.ts`

Maps provider surface into AX capability IDs.

This should answer:
- which provider commands/functions exist
- which are stable enough to expose
- how they are named in AX

### `resolve.ts`

Turns a fully qualified AX capability plus context into a concrete execution plan.

Examples of resolution output:
- CLI command + args
- library function + normalized params

### `execute.ts`

Runs the resolved plan and returns normalized output in AX's result shape.

### `test/`

Tests at least:
- capability mapping
- resolution behavior
- output normalization
- scope/default injection

## Adapter integration types

### CLI adapter

AX executes an existing CLI, often with JSON mode.

Best when:
- a stable CLI already exists
- output is predictable
- dependency coupling should stay low

### Library adapter

AX imports a package/module and calls code directly.

Best when:
- a stable library surface exists
- richer integration is needed
- tighter coupling is acceptable

## Example: Lex via CLI adapter

Possible resolution:

- AX ID: `global.lex.frame.recall`
- execution target: `lex frame recall --json`

Mounted version:

- AX ID: `toolspace.awa.lex.frame.recall`
- execution target: same CLI
- injected defaults: namespace `awa`, workspace path, policy checks

Important: `toolspace.awa.lex.frame.recall` does not require Lex to know what AWA is.
AX can mediate scope and defaults.

## Agent-assisted adapter work

Adapter planning and scaffolding is a good target for an agent, but only after AX defines:

- adapter file contract
- capability naming rules
- lifecycle rules
- test expectations
- execution result shape

Otherwise the agent is inventing architecture instead of implementing against it.

## Canonical sentence

Mounted modules are resolved by AX through declared manifests and adapter bindings; providers do not need to implement AX-specific hooks unless they want a richer native integration.
