# axf Vocabulary and Terms Contract

This document freezes the baseline vocabulary for axf v0 planning.

If a later design doc uses different language for these ideas, prefer the terms here unless there is a deliberate replacement.

## Workspace

A concrete repo, directory, or execution context in which axf is running.

A workspace may declare:

- which toolspace is active
- which modules are mounted
- which policies apply
- what local defaults exist

## Toolspace

A domain-specific capability pack hosted by axf.

Examples that may exist later:

- `lex`
- `stfc`
- `mod`
- `awa`

A toolspace owns:

- capability IDs under its namespace
- local policies
- local defaults
- optional mounted modules
- scaffolding rules specific to that space

## Module

A reusable subsystem that exposes capabilities and can be mounted globally or into a toolspace.

Lex is the clearest early example.

A module is not the same thing as a toolspace:
- a toolspace is a domain pack
- a module is a reusable subsystem

## Mount

A declared attachment of a module into a toolspace or workspace.

Use "mount" instead of vague wording like "stacking", "mixing", or "nesting".

Mounting should be:

- intentional
- inspectable
- constrained
- policy-aware

## Capability

A specific runnable operation with:

- a stable identity
- declared args
- known output modes
- known side effects
- known execution target

Examples:

- `global.lex.frame.recall`
- `toolspace.awa.lex.frame.recall`
- `toolspace.stfc.mod.assets.extract`

## Scope

The level at which a capability is resolved.

Baseline scopes:

- `global` *(implemented)*
- `toolspace-local` *(implemented)*
- `workspace-local` *(implemented; capabilities prefixed `workspace.<module>.<cap>`. Implicitly require the `require_workspace_binding` policy at runtime.)*

## Manifest

A machine-readable contract that declares a capability, mount, or toolspace configuration.

## Provider

A concrete external or internal system that axf can execute through an adapter.

Examples:
- an internal axf implementation
- a CLI on PATH
- a library module
- a future RPC/MCP service

## Adapter

The bridge layer that lets axf resolve and execute capabilities against a provider.

Important: adapters are owned by axf's integration model, not by default by the provider.

A provider does not need to implement an axf-specific hook just to be usable.
axf should be able to bridge providers through supported adapter types.

## Lifecycle state

The trust/promotion state of an extension or generated unit.

Baseline states:

- `draft`
- `reviewed`
- `active`

## Resolution

The process axf uses to turn a human CLI path into a fully qualified capability ID and then into a concrete execution target.

## Internal rule

Human CLI syntax may be friendly or short.
Internal capability IDs must stay explicit.
