# Awaitable completions

AXF capabilities may finish their immediate work while an exact, externally owned operation is
still progressing. The awaitable-completion contract lets the producing capability describe that
remaining observation as a typed continuation instead of forcing each agent to reconstruct a poll
loop.

The boundary is:

```text
AXF capability returns an inspectable continuation
        ↓
global.await.external observes an exact external subject
        ↓
provider returns bounded terminal evidence
```

Await observes. It does not launch, retry, approve, merge, deploy, judge, or cancel the underlying
operation.

## Producing capability contract

A capability that may return an external continuation declares that fact statically:

```json
{
  "completion": {
    "mode": "external-awaitable",
    "descriptorSchema": "axf/awaitable/v1",
    "observer": "global.await.external"
  }
}
```

The manifest contains no invocation identity, workflow ID, commit SHA, URL, deadline, or
credential. Those are runtime facts. `inspect` and compact discovery preserve the declaration so a
caller can understand the result shape before execution.

After successful immediate work, the capability may return a bounded top-level continuation:

```json
{
  "ok": true,
  "data": {
    "pushAccepted": true,
    "headSha": "0123456789abcdef0123456789abcdef01234567"
  },
  "continuations": [
    {
      "kind": "await-external",
      "recommended": true,
      "reason": "Required checks are externally owned and may outlive this invocation.",
      "capability": "global.await.external",
      "args": {
        "descriptor": {
          "schemaVersion": "axf/awaitable/v1",
          "kind": "github.required-checks",
          "subject": {
            "repository": "owner/repository",
            "headSha": "0123456789abcdef0123456789abcdef01234567",
            "pullRequestNumber": 42
          },
          "condition": {
            "type": "all-required-checks-terminal",
            "requiredChecks": [
              {
                "source": "check-run",
                "name": "Windows",
                "appSlug": "github-actions"
              },
              {
                "source": "check-run",
                "name": "macOS",
                "appSlug": "github-actions"
              }
            ]
          }
        },
        "deadlineMs": 1800000
      }
    }
  ]
}
```

A continuation is a suggested invocation, not bearer authority. AXF validates it against the
producer's manifest, but the later `run` resolves the observer again and re-applies lifecycle,
policy, provider identity, arguments, and current host authority. Descriptors containing credential
or token fields are rejected.

The built-in `global.echo.say` capability accepts an optional `await` argument only as a harmless
producer-plumbing fixture. It returns that validated argument as an `await-external` continuation
without creating external work. Real integrations should return continuations from the capability
that actually initiated or identified the externally owned operation.

## Await invocation

Await remains a capability behind AXF's one MCP tool:

```json
{
  "operation": "run",
  "target": { "id": "global.await.external" },
  "args": {
    "descriptor": {
      "schemaVersion": "axf/awaitable/v1",
      "kind": "github.required-checks",
      "subject": {
        "repository": "owner/repository",
        "headSha": "0123456789abcdef0123456789abcdef01234567"
      },
      "condition": {
        "type": "all-required-checks-terminal",
        "requiredChecks": [
          { "source": "check-run", "name": "Windows" },
          { "source": "check-run", "name": "macOS" }
        ]
      }
    },
    "deadlineMs": 1800000
  }
}
```

CLI callers supply the same descriptor as JSON because ordinary CLI flags cannot represent a
nested object:

```sh
axf run global.await.external --axf-json -- \
  --descriptorJson '{"schemaVersion":"axf/awaitable/v1","kind":"github.required-checks","subject":{"repository":"owner/repository","headSha":"0123456789abcdef0123456789abcdef01234567"},"condition":{"type":"all-required-checks-terminal","requiredChecks":[{"source":"check-run","name":"Windows"}]}}' \
  --deadlineMs 1800000
```

Exactly one of `descriptor` or `descriptorJson` is accepted. Deadlines are finite and bounded from
1 second through 30 minutes.

## GitHub required-checks provider

The first bundled provider is `github.required-checks`. It requires:

- an `owner/name` repository identity;
- one exact 40-character commit SHA, never a branch or `latest`;
- an optional pull request number when head-drift detection is desired;
- 1-32 explicit check-run or commit-status selectors; and
- host-provided `GH_TOKEN` or `GITHUB_TOKEN` authority.

For private repositories, that authority must be able to read checks and commit statuses. When
`pullRequestNumber` is present, it must also be able to read that pull request (or repository
contents) for exact-head drift detection.

Check-run selectors may include `appSlug`. If the same check name is reported by more than one app,
the provider fails closed until the selector identifies the app explicitly. The provider queries
GitHub with in-process asynchronous requests. Each observation pass is bounded to 15 seconds or the
remaining semantic deadline, whichever is shorter. It does not launch `gh run watch`, `sleep`, or
another long-lived child process.

The result uses `axf/await-result/v1` and one closed outcome:

| Outcome | Meaning |
|---|---|
| `satisfied` | Every declared check is terminal and satisfies GitHub's required-check success states. |
| `terminal-failed` | Every declared check is terminal, but at least one failed. |
| `deadline` | The finite semantic deadline elapsed before terminal evidence. |
| `cancelled` | The caller cancelled observation. The GitHub operation was not cancelled. |
| `subject-drift` | A declared pull request no longer points at the exact expected head SHA. |
| `observation-error` | Provider authentication, transport, schema, or bounded-response validation failed. |

Missing and in-progress checks are pending, not successful. Evidence contains only the exact
subject and requested normalized check states; provider response bodies and credentials are not
returned.

Bundled and future providers implement one short observation, not their own poll loop. They must
honor the supplied `AbortSignal`, return only the closed provider-observation fields, and keep
normalized evidence within 32 KiB. AXF owns polling, the semantic deadline, and projection into the
versioned result contract.

## Process-bound lifecycle

The initial implementation is intentionally honest:

```json
{
  "durability": "process-bound",
  "authorityModel": "host-provided",
  "underlyingCancellation": false
}
```

The MCP server dispatches requests concurrently enough that a live Await does not block `ping` or
other tool calls. MCP `notifications/cancelled` aborts the in-process observation through an
`AbortSignal`. No child process survives cancellation because Await does not launch one.

This version does not survive MCP-host restart, issue durable watch IDs, persist observations,
project MCP Tasks, or resume a LexRunner Attempt. Those are later lifecycle integrations. LexRunner
may eventually record and reconcile a durable watch while retaining ownership of its Runs,
Attempts, leases, receipts, verification, and acceptance.

The `test.timer` provider exists only behind `AXF_AWAIT_ENABLE_TEST_PROVIDERS=1` for deterministic
transport and cancellation tests. It is not a supported external provider or product workflow.
