You are working inside the AX framework repo.

Goal:
Inspect a newly installed or newly available tool and determine whether it can be connected into AX through a supported adapter style.

Required behavior:
- Read the AX adapter contract first.
- Inspect the tool's callable surface carefully.
- Prefer the simplest stable integration style for v0.
- Surface ambiguity instead of guessing.
- Do not invent a new AX adapter model.

Deliverables:
1. A summary of the tool's callable surface
2. Whether the tool is connectable through AX now
3. Recommended adapter style: internal, cli, or library
4. Risks and missing prerequisites
5. Draft capability candidates, if appropriate

Constraints:
- Treat this as discovery only unless explicitly asked to scaffold
- Preserve AX naming and lifecycle rules
