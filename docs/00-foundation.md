# axf Foundational Design Note

## Status

Draft foundation

## Purpose

This is a foundation note, not an ADR.

It does not record one isolated architecture decision. It establishes the starting thesis, boundaries, sequencing, and design guardrails for axf as a framework product.

## Thesis

axf is a constrained, workspace-aware launcher and scaffolding framework for manifest-driven toolspaces, designed so agents and humans can safely create, inspect, and evolve project workflows.

We do not ship a single fixed workflow.
We ship a framework for declaring, generating, and evolving workflows safely.

## Core problem

The old `ax` pattern has been useful, but it is being asked to do too many jobs at once:

- shortcut launcher
- global command bucket
- repo-specific wrapper
- workflow glue
- AI affordance layer
- future platform concept

That leads to ambiguity around:

- what system is being invoked
- who owns a command
- what scope applies
- what output is expected
- whether a generated extension is trusted

## Strategic direction

axf should evolve from a nickname command into a framework host.

That means:

1. axf owns launch, routing, manifests, scaffolding, and lifecycle gates.
2. Toolspaces own domain-specific capabilities.
3. Modules can be mounted globally or inside toolspaces.
4. Capabilities are typed, inspectable, and fully qualified internally.
5. Agents extend axf only through declared contracts.

## Roles and boundaries

### axf

axf is the:

- launcher
- runtime host
- resolver
- manifest loader
- scaffolding system
- capability router
- lifecycle gate

### Lex

Lex remains a bounded subsystem.

Lex is the:

- memory substrate
- frame system
- policy/context layer
- receipts/history layer
- optional shared module family that axf may consume

Lex should not be broadened accidentally into the universal axf runtime just because it is strategically important.

### lex-mcp

`lex-mcp` remains the MCP adapter for Lex capabilities.

It does not define axf architecture.
It does not need to enter the picture during axf v0.

## Non-goals

axf v0 is not:

- a bag of shell aliases
- a dumping ground for every script
- "agents can build whatever they want"
- a forced migration path for AWA
- a reason to flatten all commands into one namespace
- a replacement for Lex

## Key rule

Build axf first.
Then build real toolspaces on top of axf once the framework is stable.

Not the other way around.

## Why AWA is intentionally deferred

AWA/work adoption should wait until axf has been battle-tested in lower-risk spaces.

That means:

- no work-first design pressure
- no immediate migration expectations
- no forcing enterprise-ish workflow needs onto the first version

This is important. If axf gets shaped first by sensitive work tooling, the framework will likely overfit too early.

## North star statement

axf provides a constrained, mountable framework where toolspaces can declare, generate, and evolve workflows safely, including scoped access to shared modules like Lex.
