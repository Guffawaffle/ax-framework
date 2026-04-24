# Adapter scaffold prompt

You are working inside the axf framework repo. A plan exists. Your job
is to lay down the draft files and confirm they load.

## Required reading

1. [`docs/08-adapter-folder-shape.md`](../docs/08-adapter-folder-shape.md)
   — file layout and required fields.
2. An existing provider adapter under [`adapters/`](../adapters/) — use
   it as a size and shape reference.

## Scaffold commands

Use the framework's own scaffolders. Do not hand-author the manifest
unless the scaffolder is missing a field you need (raise that as a
contract gap).

```bash
# Type adapter (rare; usually only when adding a new execution channel)
axf init adapter <type>

# Provider adapter (the common case)
axf init adapter --kind provider <name> --composes cli

# Toolspace-private variants (private to a single toolspace mount)
axf init adapter --toolspace <ts> <type>
axf init adapter --toolspace <ts> --kind provider <name> --composes cli

# Capability per planned id
axf init capability global.<provider>.<verb>
```

Use the `--toolspace <ts>` form only when the wrapper is intentionally
local to one toolspace (e.g., extra normalization on top of a global
adapter). It will shadow same-named global adapters when that toolspace
is in play; `axf doctor` flags both shadowing and orphaned dirs.

The scaffolder writes drafts under `adapters/<...>/` and
`manifests/capabilities/`. Edit the drafts to match the plan.

## Implementation rules

### Provider adapter `index.js`

Mirror the existing provider-adapter structure in this repo:

1. Delegate to `ctx.typeAdapter.execute(resolved)`.
2. Pass through transport-level failures (`!upstream.ok`) unchanged.
3. Recognize the provider's envelope; if recognition fails, return a
   structured error rather than guessing.
4. Map envelope success → `{ ok: true, data: <unwrapped>, meta }`.
5. Map envelope failure → `{ ok: false, error: { message }, meta }`.
6. Surface non-fatal info on `meta` (hints, durations, command names),
   never on `data`.

### Capability manifests

- `manifestVersion: "axf/v0"`
- `id` matches plan exactly
- `adapterType` matches the type adapter the provider composes
- `providerAdapter: "<name>"` only if a provider adapter exists
- `executionTarget.command` is an absolute path or a binary on PATH
  axf can resolve in any environment
- `argsSchema` with `additionalProperties: false` when the surface is
  closed
- `lifecycleState: "draft"` for the first commit
- `sideEffects` set honestly (`read`, `write`, `network`, `none`)

### Tests

Add at least:

- Provider unwrap unit test against synthetic envelope inputs.
- Loader test confirming the new adapter is discovered.
- Optional live smoke test guarded behind an env var if it requires
  the real provider binary.

## Verification before reporting done

```bash
axf doctor                                  # no errors; warnings ok
axf list --all                              # new capabilities show as draft
axf inspect <provider> <verb>               # schema/defaults look right
axf run <provider> <verb> --any-lifecycle     # round-trips end-to-end
npm test                                   # full suite green
```

## Deliverables

1. Draft files in place under `adapters/<name>/` and
   `manifests/capabilities/`.
2. Tests added.
3. `axf doctor` and `npm test` both green.
4. A short note listing anything left unresolved (open questions, infra
   not yet exercised, capabilities deliberately deferred).

## Constraints

- Do not promote anything past `draft` in the scaffold step.
- Do not modify the provider's repo. axf is the integration layer.
- Do not invent new manifest fields or new adapter kinds. If the
  contract feels insufficient, write a contract gap note instead of
  silently extending.
