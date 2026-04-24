# Normalization Guidance

A capability returns `{ ok, data | error, meta }`. The `data` shape is
the contract callers see. How you fill `data` depends on what the
provider gives you. This doc walks through both paths.

## JSON-first providers (preferred)

If the provider has a `--json` (or equivalent) flag, use it. The cli
type adapter parses stdout as JSON when possible and surfaces the
parsed object directly as `result.data`. No provider adapter required.

```json
{
  "id": "global.gh.pr-list",
  "adapterType": "cli",
  "executionTarget": { "command": "gh", "args": ["pr", "list", "--json", "number,title,state"] }
}
```

Caller receives:

```json
{ "ok": true, "data": [ { "number": 42, "title": "...", "state": "OPEN" } ] }
```

Stop here. Do not write a provider adapter just to pass JSON through.

## Text-first providers

If the provider only emits human-formatted text (PowerShell tables,
columnar output, ANSI-colored progress, mixed stdout/stderr) you have
two options:

1. **Surface raw text and accept it as the data shape.** This is fine
   for read-only commands a human will read. `data` is a string.

2. **Write a provider adapter that normalizes the text into a
   structured shape.** Required when downstream code or other
   capabilities will consume the result programmatically.

### When a provider adapter is required

- The provider envelope has its own success/error convention
  (e.g. Majel's `{ success, errors, hints }`) and you want axf's
  `{ ok, data, error }` to reflect it semantically.
- Output mixes structured rows with banners or trailing summary lines
  that need to be stripped.
- Exit code does not reliably indicate success (the body must be
  inspected).
- You want to expose a stable `data` shape that survives provider UX
  redesigns.

### When a provider adapter is overkill

- Stdout is already JSON.
- The capability is read-only and the human-readable output is the
  point (e.g. `git status`).
- You only need to drop ANSI codes — do that in the cli adapter or
  invoke the provider with its no-color flag instead.

## PowerShell hazards

PowerShell is a common text-first source. Watch for:

- **Format-Table output is paginated and width-sensitive.** Pipe into
  `Out-String -Stream` or `ConvertTo-Json` before consuming.
- **ANSI escape sequences** appear by default on PowerShell 7+.
  Set `$PSStyle.OutputRendering = 'PlainText'` or invoke pwsh with
  `-NoProfile -NonInteractive`.
- **Mixed stdout / stderr.** PowerShell writes warnings, verbose, and
  progress to separate streams that the cli adapter currently captures
  via `stderr`. Either suppress them at the source
  (`-WarningAction SilentlyContinue`, `$ProgressPreference = 'SilentlyContinue'`)
  or have the provider adapter discard non-data lines.
- **Unicode BOM on stdout** when the host is configured for UTF-8 with
  BOM. Strip it explicitly in the provider adapter:
  `text.replace(/^\uFEFF/, "")`.
- **Trailing CRLF noise** on Windows. Trim per line, not per stdout.

### Concrete text-first example

A provider that emits one record per line as `key=value` pairs:

```text
name=alpha state=ready uptime=PT12H
name=beta state=ready uptime=PT3D
```

A provider adapter at `adapters/<provider>/index.js`:

```js
export async function execute(resolved, ctx) {
  const result = await ctx.typeAdapter.execute(resolved);
  if (!result.ok) return result;
  const lines = String(result.data).split(/\r?\n/).filter(Boolean);
  const rows = lines.map((line) => Object.fromEntries(
    line.split(/\s+/).map((pair) => pair.split("=", 2))
  ));
  return { ...result, data: rows };
}
```

Caller now sees:

```json
{ "ok": true, "data": [ { "name": "alpha", "state": "ready", "uptime": "PT12H" } ] }
```

## Rule of thumb

- JSON-first → no provider adapter
- Text-first, human-only → no provider adapter, accept string `data`
- Text-first, programmatic consumers → provider adapter, document the
  shape in the capability summary
