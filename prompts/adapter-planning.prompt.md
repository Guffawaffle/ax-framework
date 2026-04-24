# Adapter planning prompt

You are working inside the axf framework repo. The discovery step has
already produced a recommendation. Your job is to turn that into a
concrete plan an implementer (you, another agent, or a human) can
execute mechanically.

## Required reading

1. [`docs/04-adapter-contract.md`](../docs/04-adapter-contract.md)
2. [`docs/08-adapter-folder-shape.md`](../docs/08-adapter-folder-shape.md)
3. [`docs/03-capabilities-and-manifests.md`](../docs/03-capabilities-and-manifests.md)
   — capability manifest fields and lifecycle.
4. The existing manifests under [`manifests/capabilities/`](../manifests/capabilities/)
  for shape and naming conventions.

## Plan output

Produce these sections, in order:

### 1. Capability map

| axf capability id | Provider call | sideEffects | Why this one first |
|---|---|---|---|
| `global.<provider>.<verb>` | `<command + args>` | `read` / `write` | ... |

Rules:
- Capability ids are kebab-case, fully qualified (`global.<module>.<verb>`).
- First-pass capabilities must be `read` or `none`. No `write` until
  the read-path proves out.
- One capability per stable provider command. Don't bundle.

### 2. Adapter selection

State which adapter handles each capability:

- `adapterType: "cli"` (or another existing type)
- `providerAdapter: "<name>"` if a provider adapter is needed
- If a new provider adapter is needed, declare:
  - `name`
  - `composes` (must equal each capability's `adapterType`)
  - what it normalizes (envelope shape, error mapping, hints, etc.)

### 3. Manifest shape per capability

For each capability id, list:
- `executionTarget` (command, args)
- `argsSchema` properties with types and constraints
- `defaults` (none unless justified)
- `policies` (declare even if not yet enforced)
- `lifecycleState` (always `draft` for the first commit; promote later)

### 4. Validation strategy

- Which `argsSchema` fields are required vs optional?
- Is `additionalProperties: false` safe for this provider's surface?
- Are there literal flags (booleans) vs valued flags?

### 5. Risks

- Output format instability
- Required infra (DB, server, env vars) — flag *before* scaffolding
- Versions tested
- Anything in the provider's docs that is "not yet stable"

### 6. Test plan

- Capability mapping tests (reads manifest, asserts shape)
- Provider adapter unwrap test (with a synthetic envelope, not a real
  process call)
- One live smoke test if the provider can run without infra

## Constraints

- All scaffolded artifacts must be `lifecycleState: "draft"`. Promotion
  is a separate, deliberate step.
- Do not invent new manifest fields. If something doesn't fit, raise it
  as a contract gap to discuss before coding.
- Prefer the simplest plan that closes the discovery's open questions.
