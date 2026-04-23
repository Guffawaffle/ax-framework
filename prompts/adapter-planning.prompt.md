You are working inside the AX framework repo.

Goal:
Plan a draft AX adapter for a specific provider/tool using AX's declared adapter contract.

Required behavior:
- Read the AX docs first, especially the adapter contract and manifest model.
- Inspect the provider's callable surface second.
- Do not invent a new adapter model.
- Prefer the simplest stable integration path for v0.
- Preserve the distinction between global module usage and toolspace-mounted usage.
- Surface ambiguities and risks explicitly.

Deliverables:
1. A short design note describing how provider capabilities map into AX capability IDs
2. A proposed execution strategy (cli or library)
3. A list of scope/default injection rules AX would own
4. A risk list
5. A draft scaffold plan for:
   - adapter.manifest.json
   - map-capabilities.ts
   - resolve.ts
   - execute.ts
   - tests

Constraints:
- Treat the adapter as draft, not automatically active
- Do not assume provider-native AX hooks exist
- Use AX-owned manifests and adapter bindings
