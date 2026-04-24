# Launch Plans

A **launch plan** is the framework's resolution of a CLI capability's
`executionTarget` into a concrete `(command, argsPrefix, targetPath)`
tuple. The cli type adapter never re-derives this; both the runtime
executor and `axf inspect` ask the framework for the same plan.

## Shapes accepted in `executionTarget`

### Inline command (legacy)

```json
{ "executionTarget": { "command": "git" } }
```

The command is a literal program name on PATH. No target file.

### Target path with a launcher

```json
{
  "executionTarget": {
    "target": {
      "path": "scripts/run-build.sh",
      "relativeTo": "workspace"
    }
  }
}
```

`relativeTo: "workspace"` joins the path under the resolved workspace
root at runtime. The cli adapter uses the resolved absolute path as the
command argument.

### Env-bound root with a fallback

```json
{
  "executionTarget": {
    "target": {
      "path": "tools/lex.js",
      "fromEnv": "LEX_HOME",
      "fallbackRoot": "vendor/lex",
      "fallbackRelativeTo": "workspace"
    }
  }
}
```

If `LEX_HOME` is set, the path is resolved under it. Otherwise the
fallback root is used (workspace-relative if `fallbackRelativeTo:
"workspace"`).

### Custom launcher

```json
{
  "executionTarget": {
    "target": { "path": "scripts/build.ps1", "relativeTo": "workspace" },
    "launcher": { "command": "pwsh", "args": ["-File"] }
  }
}
```

The cli adapter invokes `pwsh -File <resolved-path>`. Use this for
interpreter-fronted scripts (PowerShell, Python, Node, Ruby).

## Inspection

`axf inspect <id> --json` includes a `launchPlan` field for any cli
capability:

```json
{
  "launchPlan": {
    "command": "pwsh",
    "argsPrefix": ["-File", "/abs/scripts/build.ps1"],
    "targetPath": "/abs/scripts/build.ps1",
    "targetSource": "workspace"
  }
}
```

This is the source of truth — the runtime executor uses the same
resolver via `src/core/cli-launch-plan.js`.

## Validation

The framework rejects malformed shapes at manifest load time:

- `target.path` must be a string when `target` is declared.
- `launcher.command` must be a string when `launcher` is declared.
- A cli capability must declare either `command` or `target.path`.
