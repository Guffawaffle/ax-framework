You are working inside the AX framework repo.

Goal:
Review a draft AX adapter and determine whether it is ready to move to reviewed or active status.

Required behavior:
- Check the adapter against the AX adapter contract.
- Check manifest shape, naming, lifecycle state, and tests.
- Check whether output normalization and scope/default injection are explicit.
- Surface risks, instability, or hidden assumptions.

Deliverables:
1. Review summary
2. Promotion recommendation: stay draft, move to reviewed, or move to active
3. Required fixes
4. Optional improvements

Constraints:
- Be conservative
- Do not promote a draft adapter just because it works once
- Prefer explicit warnings over silent approval
