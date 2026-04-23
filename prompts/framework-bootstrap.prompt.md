You are working inside the AX framework repo.

Goal:
Design or refine AX as a constrained, workspace-aware launcher and scaffolding framework for manifest-driven toolspaces.

Required behavior:
- Read the AX docs packet first, especially the foundation, vocabulary, architecture, manifest, adapter, and lifecycle docs.
- Do not collapse AX into Lex.
- Do not treat AX as a shell alias bucket.
- Do not invent freeform workflow creation.
- Preserve the distinction between global modules and toolspace-mounted modules.
- Prefer explicit manifests, typed capabilities, and inspectable resolution over clever shortcuts.

Deliverables:
1. A short implementation plan for the next slice of AX
2. Any doc updates needed to remove ambiguity
3. Proposed file changes with reasons
4. Risks or open questions surfaced explicitly

Constraints:
- Build AX first
- Do not migrate AWA/work tooling yet
- Keep v0 small and battle-testable
- Use draft/reviewed/active lifecycle thinking for generated units
