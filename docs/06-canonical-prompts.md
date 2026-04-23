# Canonical Prompts Strategy

## Thesis

AX should ship canonical prompts as an onboarding and execution layer for agents.

Prompts are not the architecture.
They are the standardized operating guidance layered on top of the AX contract.

## Why canonical prompts are useful

They help standardize:

- discovery order
- inspection behavior
- deliverables
- non-goals
- risk reporting
- scaffold generation
- review expectations

## What prompts should not do

Prompts should not invent:

- adapter structure
- capability naming rules
- lifecycle policy
- execution semantics
- mount semantics

Those belong to AX itself.

## Prompt classes to ship

### Framework bootstrap prompt

Used when an agent is helping stand up AX or extend core framework pieces.

### Adapter discovery prompt

Used to inspect a tool and determine whether it is connectable to AX.

### Adapter planning prompt

Used to propose capability mappings, execution strategy, risks, and scaffold shape.

### Adapter scaffold prompt

Used to generate the draft adapter files and tests against AX's declared contract.

### Adapter review prompt

Used to evaluate whether a draft adapter is ready for promotion.

## UX goal

The end user/dev experience should become low-friction, but still constrained.

Desired path:

1. tool is installed or otherwise exposed
2. user invokes AX scaffolding/init flow
3. canonical prompt guides the agent
4. agent produces a draft adapter plan + scaffold
5. human reviews and promotes

## Important rule

Do not mistake "we have a good prompt" for "we have a good framework".

AX succeeds only if different agents using the same docs and prompts converge on roughly the same adapter shape.

That requires the framework contract to be tight.

## Recommended starter prompt set

See the `prompts/` directory in this pack.
