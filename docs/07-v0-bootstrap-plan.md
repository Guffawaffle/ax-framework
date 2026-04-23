# AX v0 Bootstrap Plan

## Objective

Build the smallest version of AX that proves the framework shape.

Do not optimize for completeness.
Optimize for clarity, inspectability, and safety.

## v0 goals

AX v0 should prove:

- workspace binding
- manifest-based capability resolution
- module mounts
- adapter execution through at least one provider style
- lifecycle gating for generated units
- scaffoldability for future growth

## What not to do in v0

Do not:

- backfill every legacy AX command
- build AWA support first
- over-design plugin ecosystems
- make MCP a blocker
- make provider-native hooks mandatory
- let agent-generated code become active automatically

## Suggested v0 command surface

- `ax list`
- `ax inspect <id-or-path>`
- `ax run <id-or-path>`
- `ax init toolspace`
- `ax init capability`
- `ax doctor`

Optional if it comes naturally:
- `ax init adapter`
- `ax inspect draft`

## Suggested v0 implementation slices

### Slice 1: parser + path model

Support:
- global path parsing
- toolspace-prefixed path parsing
- normalized internal path representation

Initial prototype status: implemented in `src/core/path-model.js`.

### Slice 2: manifest registry

Support:
- capability manifests
- toolspace manifests
- mount manifests

Initial prototype status: implemented in `src/core/registry.js` with manifests under `manifests/`.

### Slice 3: resolver

Support:
- scope-aware lookup
- fully qualified capability ID resolution
- default injection

Initial prototype status: implemented in `src/core/resolver.js`; mounted capabilities are synthesized with explicit `toolspace.<name>...` IDs.

### Slice 4: executor

Support:
- internal execution
- CLI adapter execution
- normalized result model

Initial prototype status: implemented in `src/core/executor.js`; the `echo` provider proves internal execution and CLI execution has a minimal bridge.

### Slice 5: lifecycle gates

Support:
- draft/reviewed/active states
- hiding or flagging drafts

Initial prototype status: active capabilities are listed and executable by default; drafts require explicit inspection or `--allow-draft` execution.

### Slice 6: scaffolding

Support:
- toolspace scaffold
- capability scaffold
- adapter scaffold stub if practical

Initial prototype status: `ax init toolspace <name>` and `ax init capability <id>` create draft manifests only.

## Low-risk proving grounds

Use:
- toy toolspace
- sample provider
- maybe bounded Lex integration once the core works

Do not start with:
- production work tooling
- enterprise-ish policy pressure
- legacy command parity as the main success metric

## Definition of success for v0

AX v0 is successful if it can show:

1. a global capability resolved and executed
2. a mounted capability resolved differently under a toolspace
3. a draft adapter scaffold created from a declared template
4. enough structure that an agent can extend AX without inventing architecture
