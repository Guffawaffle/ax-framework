# AX Lifecycle and Promotion Model

## Problem

If agents can scaffold new capabilities, adapters, or mounts, AX needs a trust model.

Without one, generated workflow units become trusted too early and the framework becomes noisy and unsafe.

## Baseline lifecycle states

### `draft`

A generated or newly added unit that is not yet trusted for normal execution.

Characteristics:
- may be incomplete
- may have test stubs only
- may be hidden from default listings
- should be inspectable

### `reviewed`

A human or policy-reviewed unit that appears structurally sound but may still be limited in exposure.

Characteristics:
- naming and manifest shape checked
- tests exist
- side effects declared
- policy fit reviewed

### `active`

A trusted unit available in the normal AX surface.

Characteristics:
- discoverable by default
- routable by standard resolution
- usable by agents as stable surface

## Promotion checks

Suggested checks before promotion from `draft` to `reviewed`:

- manifest validates
- capability ID follows naming rules
- adapter contract files exist
- tests exist
- side effects declared
- execution mode declared

Suggested checks before promotion from `reviewed` to `active`:

- tests pass
- output normalization is stable
- scope behavior is verified
- policy/default injection is verified
- documentation/examples exist

## Why this matters

This is the difference between:

- "agents can build whatever"
- "agents can safely contribute within a declared trust model"

AX needs the second one.

## Developer experience rule

Generated units should be easy to inspect and promote deliberately.

The lifecycle should feel like:
- propose
- inspect
- review
- promote

not:
- prompt
- trust
- regret

## Suggested commands later

Examples of possible future commands:

- `ax inspect draft`
- `ax promote <id> --to reviewed`
- `ax promote <id> --to active`
- `ax review <id>`

These are not required for v0, but the model should assume something like them.
