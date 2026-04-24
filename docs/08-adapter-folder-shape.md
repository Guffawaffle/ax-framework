# AX Adapter Folder Shape (alpha)

This is the concrete file contract used by AX. It is intentionally
small. Add complexity only when a real adapter justifies it. See
[`04-adapter-contract.md`](04-adapter-contract.md) for the full model.

## Type adapter

```
adapters/<type>/
  adapter.manifest.json   # required
  index.js                # required; exports async execute(resolved)
  handlers/               # optional (internal adapter only)
  test/                   # optional but expected before promotion
```

### `adapter.manifest.json`

```json
{
  "manifestVersion": "ax/v0",
  "kind": "type-adapter",
  "type": "<adapter-type>",
  "summary": "What this adapter does, in one line.",
  "entry": "index.js",
  "supportedExecutionTargets": ["command"],
  "lifecycleState": "draft",
  "owner": "<owner>"
}
```

Required: `manifestVersion`, `kind`, `type`, `entry`, `lifecycleState`.
`kind` must be `type-adapter`.

### `index.js`

```js
export async function execute(resolved /*, ctx */) {
  // resolved.capability  -> the resolved capability manifest
  // resolved.args        -> validated + coerced args (per argsSchema)
  // resolved.input       -> parsed CLI input
  return {
    ok: true,
    data: ...,
    meta: { capabilityId: resolved.capability.id, adapterType: "<type>" }
  };
}
```

`ctx` is unused for type adapters; provider adapters receive it.

## Provider adapter

```
adapters/<name>/
  adapter.manifest.json   # required
  index.js                # required; exports async execute(resolved, ctx)
  test/                   # optional but expected before promotion
```

### `adapter.manifest.json`

```json
{
  "manifestVersion": "ax/v0",
  "kind": "provider",
  "name": "<provider-name>",
  "composes": "<type-adapter-name>",
  "summary": "What this provider adapter does and why it exists.",
  "entry": "index.js",
  "lifecycleState": "draft",
  "owner": "<owner>"
}
```

Required: `manifestVersion`, `kind`, `name`, `composes`, `entry`,
`lifecycleState`. `composes` must match the `type` of an installed
type-adapter, and must equal the `adapterType` of every capability
that opts into this provider via `providerAdapter`.

### `index.js`

```js
export async function execute(resolved, ctx) {
  // ctx.typeAdapter -> the resolved type adapter (composes target)
  // ctx.types       -> full AdapterRegistry (advanced)

  // Most providers delegate then post-process:
  const upstream = await ctx.typeAdapter.execute(resolved);
  if (!upstream.ok) return upstream;

  // ...inspect/transform upstream.data here...

  return {
    ok: true,
    data: ...,
    meta: { ...upstream.meta, providerSpecific: ... }
  };
}
```

The framework will set `meta.providerAdapter = "<name>"` automatically;
you do not need to.

## Toolspace-private adapters

Both kinds above may also live under a single toolspace instead of the
repo-wide `adapters/` root:

```
toolspaces/<toolspace>/
  adapters/
    <type>/                 # private type-adapter (same manifest schema)
      adapter.manifest.json
      index.js
    <name>/                 # private provider (same manifest schema)
      adapter.manifest.json
      index.js
```

The manifest schema and the `index.js` contract are **identical** to
the global forms above. Differences are purely about visibility:

- visible only to capabilities mounted under `<toolspace>`
- shadows any same-named global adapter when that toolspace is in play
- `workspace-local` capabilities cannot use them (no mount)
- orphaned dirs (no matching toolspace mount) are flagged by `ax doctor`

Scaffold with:

```
ax init adapter --toolspace <ts> <type>
ax init adapter --toolspace <ts> --kind provider <name> [--composes <type>]
```

## Result shape

Both kinds return the same `{ok, data | error, meta}` shape. See
`docs/04`. Failure example:

```js
return {
  ok: false,
  error: { message: "..." },
  meta: { capabilityId, adapterType }
};
```

## Lifecycle

Both kinds carry `lifecycleState`. `ax init adapter <type>` and
`ax init adapter --kind provider <name>` create drafts. Doctor reports
load issues; promote deliberately. There is no automatic promotion.

## Why this is light

The contract is two files (`adapter.manifest.json`, `index.js`) and one
exported function (`execute`). That is enough to:

- declare the adapter and its lifecycle state
- let the loader discover and import it
- run any capability that targets the adapter type or provider
- normalize results into AX's `{ ok, data | error, meta }` shape

Anything beyond that should earn its place in a later slice.
