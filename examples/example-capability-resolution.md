# Example Resolution Patterns

Three worked examples drawn from the current alpha manifests. All run
from any CWD with the `axf` binary on PATH.

## 1. Built-in internal capability — `echo say`

```
axf run echo say --message hello
```

Parsed path: scope `global`, module `echo`, capability `say`.
Resolved ID: `global.echo.say` (lifecycleState `active`).

Execution plan:
- type adapter: `internal`
- provider adapter: none
- execution target: handler `echo.say`
- args: `{ message: "hello" }`

Result shape:
```js
{
  ok: true,
  data: "hello",
  meta: { capabilityId: "global.echo.say", adapterType: "internal", ... }
}
```

## 2. Mounted capability — `toy echo say`

```
axf run toy echo say --message hello
```

Parsed path: scope `toolspace-local`, toolspace `toy`, module `echo`,
capability `say`.
Resolved ID: `toolspace.toy.echo.say` (lifecycleState `active`).

The `toy` toolspace mount remaps `global.echo` under
`toolspace.toy.echo` and injects its local defaults. The execution
target stays the same, but the resolved ID, defaults, and policy
surface can differ from the global capability.

## 3. Provider-adapter capability — `majel status`

```
axf run majel status
```

Parsed path: scope `global`, module `majel`, capability `status`.
Resolved ID: `global.majel.status` (lifecycleState `active`).

Execution plan:
- type adapter: `cli`
- provider adapter: `majel` (composes `cli`)
- execution target: command + args declared in the capability manifest

Provider adapter unwraps a provider envelope:
```js
// Provider emits:
{ command: "<status>", success: true, durationMs: 78, data: { ... } }

// axf returns:
{
  ok: true,
  data: { ... },
  meta: {
    capabilityId: "global.majel.status",
    adapterType: "cli",
    providerAdapter: "majel",
    majel: { command: "<status>", durationMs: 78, timestamp: "..." }
  }
}
```

When the provider reports `success: false`, the provider adapter maps
that to `{ ok: false, error: { message }, meta }` while preserving any
non-fatal hints on `meta`.
