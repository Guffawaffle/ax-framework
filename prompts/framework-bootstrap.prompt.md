You are working inside the axf framework repo.

Goal:
Design or refine axf as a constrained, workspace-aware launcher and scaffolding framework for manifest-driven toolspaces.

Required behavior:
- Read the axf docs packet first, especially the foundation, vocabulary, architecture, manifest, adapter, and lifecycle docs.
- Do not let any single provider define the framework.
- Do not treat axf as a shell alias bucket.
- Do not invent freeform workflow creation.
- Preserve the distinction between global modules and toolspace-mounted modules.
- Prefer explicit manifests, typed capabilities, and inspectable resolution over clever shortcuts.

Deliverables:
1. A short implementation plan for the next slice of axf
2. Any doc updates needed to remove ambiguity
3. Proposed file changes with reasons
4. Risks or open questions surfaced explicitly

Constraints:
- Build axf first
- Do not optimize for adjacent-project adoption yet
- Keep v0 small and battle-testable
- Use draft/reviewed/active lifecycle thinking for generated units
