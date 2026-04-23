# AX Starter Docs Pack

This pack is meant to be dropped into a fresh `/srv/ax` workspace as the initial design packet for the new AX framework direction.

AX is being treated here as:

- a launcher
- a runtime host
- a manifest-driven capability router
- a scaffolding framework
- a safe extension surface for agent-authored workflows

This pack intentionally does **not** move AWA/work tooling into AX yet. The framework comes first. Battle-testing comes before sensitive or high-stakes adoption.

## Recommended reading order

1. `docs/00-foundation.md`
2. `docs/01-vocabulary.md`
3. `docs/02-architecture.md`
4. `docs/03-capabilities-and-manifests.md`
5. `docs/04-adapter-contract.md`
6. `docs/05-lifecycle-and-promotion.md`
7. `docs/06-canonical-prompts.md`
8. `docs/07-v0-bootstrap-plan.md`

## What this pack is for

Use this pack to:

- align on vocabulary
- keep AX separate from Lex
- define how mounted modules work
- define how adapters are bridged into AX
- define how agents extend AX safely
- give an implementation agent a bounded starting point

## Immediate operating rule

Build the AX framework first.

Do not start with:
- AWA migration
- work deployment
- huge command backfill
- agent freeform command generation

Start with:
- runtime shape
- resolver shape
- manifest contracts
- adapter contract
- lifecycle gates
- scaffolding
- low-risk example toolspaces

## Suggested next move for an implementation agent

Point the agent at `prompts/adapter-planning.prompt.md` only after the framework docs are understood and the basic AX runtime shape is chosen.

Before that, the most useful prompt is `prompts/framework-bootstrap.prompt.md`.

## Current v0 prototype

This workspace now includes a dependency-free Node.js prototype for the first AX framework slice.

Run it directly:

```sh
node bin/ax.js doctor
node bin/ax.js list --all
node bin/ax.js inspect toy echo say
node bin/ax.js run toy echo say --message hello
```

Or through npm scripts:

```sh
npm run ax -- list
npm test
```

What this proves:

- global capability resolution: `ax run echo say --message hello`
- toolspace-mounted resolution: `ax run toy echo say --message hello`
- explicit mounted IDs: `toolspace.toy.echo.say` remains distinct from `global.echo.say`
- manifest loading from `manifests/`
- active lifecycle gating for normal execution
- draft-only scaffolding through `ax init toolspace <name>` and `ax init capability <id>`

The included `toy` toolspace is only a low-risk proving ground. It is not an AWA/work migration.
