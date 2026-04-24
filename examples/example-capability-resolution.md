# Example Capability Resolution

Three worked examples that ship in alpha. All run from any CWD with the
`axf` binary on PATH.

## 1. Generic CLI provider — `lex recall`

```
axf run lex recall --list 3
```

Parsed path: scope `global`, module `lex`, capability `recall`.
Resolved ID: `global.lex.recall` (lifecycleState `active`).

Execution plan:
- type adapter: `cli`
- provider adapter: none — Lex emits raw JSON, no envelope to unwrap
- command: `lex`
- args: `recall --json --list 3` (`--list` coerced from `"3"` → integer `3`
  by `argsSchema`)

Result shape:
```js
{
  ok: true,
  data: { frames: [ ... ] },         // Lex's stdout, JSON-parsed
  meta: { capabilityId: "global.lex.recall", adapterType: "cli", ... }
}
```

## 2. Provider adapter — `majel status`

```
axf run majel status
```

Parsed path: scope `global`, module `majel`, capability `status`.
Resolved ID: `global.majel.status` (lifecycleState `active`).

Execution plan:
- type adapter: `cli`
- provider adapter: `majel` (composes `cli`)
- command: `/srv/majel/bin/ax`
- args: `status`

Provider adapter unwraps Majel's envelope:
```js
// Majel emits:
{ command: "ax:status", success: true, durationMs: 78, data: { ... } }

// axf returns:
{
  ok: true,
  data: { ... },                                   // Majel's `data`, unwrapped
  meta: {
    capabilityId: "global.majel.status",
    adapterType: "cli",
    providerAdapter: "majel",
    majel: { command: "ax:status", durationMs: 78, timestamp: "..." }
  }
}
```

When Majel reports `success: false` (e.g. `ax test` without Postgres),
the provider maps that to `{ ok: false, error: { message }, meta }`
with `meta.hints` carrying Majel's hints array.

## 3. Mounted capability — `ops majel status`

```
axf run ops majel status
```

Parsed path: scope `toolspace-local`, toolspace `ops`, module `majel`,
capability `status`.
Resolved ID: `toolspace.ops.majel.status` (lifecycleState `active`).

The `ops` toolspace mount remaps `global.majel` under
`toolspace.ops.majel`. Execution is identical to example 2 — same
provider adapter, same envelope unwrap — but the resolved ID is
distinct so policy and defaults can attach per-toolspace later.

## Illustrative future variant

```
axf run awa lex frame recall --query recent
```

Parsed path: toolspace `awa`, module `lex`, capability `frame.recall`.
Resolved ID: `toolspace.awa.lex.frame.recall`.

Not implemented: the `awa` toolspace mount itself isn't declared in the
shipped manifests. The shape is supported — `workspace-local` scope is
implemented, and toolspace mounts can declare a
`require_workspace_binding` policy that is enforced at execute time. To
activate this exact path, declare the `awa` toolspace and add a
`workspace.lex.frame.recall` capability or a mount with appropriate
defaults.
