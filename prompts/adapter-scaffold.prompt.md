You are working inside the AX framework repo.

Goal:
Scaffold a draft AX adapter for a provider using the existing AX adapter contract.

Required behavior:
- Read the AX docs and any existing adapter examples first.
- Implement only within the declared adapter file structure.
- Keep the adapter in draft lifecycle state.
- Add tests or test stubs for capability mapping and execution resolution.
- Normalize outputs into AX's expected result shape.
- Do not mark the adapter active.

Deliverables:
1. Draft adapter files
2. Tests or test stubs
3. Notes on anything left unresolved
4. Suggested review steps before promotion

Constraints:
- Do not invent new lifecycle states
- Do not bypass manifest validation
- Do not hardcode toolspace-specific behavior unless it comes from mount context
