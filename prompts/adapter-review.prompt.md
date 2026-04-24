# Adapter review prompt

You are reviewing a draft axf adapter and deciding whether it should
move to `reviewed` or `active`. Be conservative; "it ran once" is not
enough.

## Required reading

- [`docs/04-adapter-contract.md`](../docs/04-adapter-contract.md)
- [`docs/05-lifecycle-and-promotion.md`](../docs/05-lifecycle-and-promotion.md)
- The adapter under review (manifest + `index.js` + tests).

## Checklist

### Manifest

- [ ] `manifestVersion` is `axf/v0`
- [ ] `kind` is `type-adapter` or `provider` (not anything else)
- [ ] Type adapters declare `type`; providers declare `name` + `composes`
- [ ] `lifecycleState` matches the actual maturity (still `draft` if
      anything below is unchecked)
- [ ] `summary` reads as something a caller would actually want to see

### Code (`index.js`)

- [ ] Single exported `execute(resolved /*, ctx */)`
- [ ] Always returns `{ ok, data | error, meta }` — no thrown errors as
      a normal result path
- [ ] Failure mode includes `error.message` (not undefined, not empty)
- [ ] `meta.capabilityId` is set; type/provider names included
- [ ] No hardcoded provider state or environment assumptions beyond
      what `executionTarget` declares

### Provider adapter specifics

- [ ] Pass-through for transport-level failures (does not pretend an
      upstream error is success)
- [ ] Envelope recognition is explicit; unknown shapes return a
      structured error, not a parse exception
- [ ] Hints/durations/etc. ride on `meta`, not on `data`

### Capabilities

- [ ] All declared capabilities load (`axf doctor` clean)
- [ ] Capability `adapterType` matches the type adapter; if a
      `providerAdapter` is set, it matches a loaded provider
- [ ] First-pass capabilities are `read` or `none` side effects
- [ ] `argsSchema` matches the provider's actual surface (verified, not
      assumed)

### Tests

- [ ] Loader test covers the new adapter
- [ ] Unit test for any non-trivial transformation (envelope unwrap,
      args mapping)
- [ ] Live smoke test exists, even if guarded by an env var

### Doctor + full suite

- [ ] `axf doctor` reports zero errors (warnings allowed)
- [ ] `npm test` is green

## Decision

| Recommendation | When |
|---|---|
| Stay `draft` | Any required-checklist item unchecked |
| Move to `reviewed` | All required items pass; no live exercise yet, OR live exercise is intermittent (depends on infra not always available) |
| Move to `active` | All required items pass and the adapter has been exercised end-to-end at least once successfully outside the test suite |

Recommendations never auto-promote. State the recommendation; let the
human run the promotion step.

## Output

1. Per-section pass/fail with a one-line note for each fail.
2. Recommended next state.
3. Required fixes (if any) before re-review.
4. Optional improvements (deferable).

## Constraints

- Do not introduce new adapter kinds or manifest fields during review.
- Do not promote past `active`.
- Prefer "stay draft" when in doubt.
