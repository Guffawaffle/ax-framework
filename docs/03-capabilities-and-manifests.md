# Capabilities and Manifest Model

## Goal

Every runnable unit in AX should be declared before it is trusted.

The manifest layer is the contract that lets:
- humans inspect a capability
- agents scaffold safely
- AX resolve consistently
- policies enforce lifecycle state and side effects

## Capability identity

Human syntax may be short, but AX should resolve to a fully qualified capability ID.

Examples:

- `global.lex.frame.recall`
- `toolspace.awa.lex.frame.recall`
- `toolspace.stfc.mod.assets.extract`

## Capability manifest fields

Suggested baseline fields:

- `id`
- `summary`
- `provider`
- `adapterType`
- `executionTarget`
- `argsSchema`
- `outputModes`
- `sideEffects`
- `scope`
- `lifecycleState`
- `defaults`
- `policies`
- `owner`
- `examples`

## Example capability manifest

```json
{
  "id": "global.lex.frame.recall",
  "summary": "Recall frames from the global Lex store",
  "provider": "lex",
  "adapterType": "cli",
  "executionTarget": {
    "command": "lex",
    "args": ["frame", "recall", "--json"]
  },
  "argsSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "limit": { "type": "integer", "minimum": 1 }
    }
  },
  "outputModes": ["json", "text"],
  "sideEffects": "none",
  "scope": "global",
  "lifecycleState": "active",
  "defaults": {},
  "policies": [],
  "owner": "module:lex"
}
```

## Mount manifest idea

A toolspace mount should not redefine the provider from scratch unless needed.
It can narrow and wrap a shared provider.

Example:

```json
{
  "toolspace": "awa",
  "moduleMounts": {
    "lex": {
      "source": "global.lex",
      "mode": "proxy",
      "capabilities": [
        "frame.recall",
        "frame.write",
        "receipt.show"
      ],
      "defaults": {
        "namespace": "awa"
      },
      "policies": [
        "require_workspace_binding"
      ]
    }
  }
}
```

## Resolver behavior

The resolver should:

1. parse the CLI path
2. identify the intended scope
3. load manifests for that scope
4. resolve a logical path to a fully qualified capability ID
5. bind the right adapter and execution target
6. inject allowed defaults
7. enforce lifecycle and policy gates

## Why this matters

Without manifests:
- agents guess
- naming drifts
- output contracts drift
- side effects become unclear
- mounts become hand-wavy shell wrappers

With manifests:
- the system becomes inspectable
- scaffold generation becomes reliable
- lifecycle promotion becomes meaningful
