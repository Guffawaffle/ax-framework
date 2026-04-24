// Policy hook surface for AX.
//
// Policies are declared on capabilities and mounts. They evaluate at
// execution time with a runtime context describing the resolved
// workspace and capability scope. Policies that have no implementation
// surface as doctor warnings so the gap stays visible.
//
// Runtime context shape:
//   {
//     workspace: { root: string, viaMarker: boolean, source: string },
//     capability: { id, scope, mount? }   // copied from resolved.capability
//   }

const KNOWN_POLICIES = new Set([
    "require_workspace_binding",
    "require_active_lifecycle",
    "forbid_network"
]);
const IMPLEMENTED_POLICIES = new Set([
    "require_workspace_binding",
    "require_active_lifecycle",
    "forbid_network"
]);

export function listKnownPolicies() {
    return [...KNOWN_POLICIES];
}

export function isImplemented(name) {
    return IMPLEMENTED_POLICIES.has(name);
}

export function isKnown(name) {
    return KNOWN_POLICIES.has(name);
}

const POLICY_HANDLERS = {
    // require_workspace_binding: capability must run with AX bound to a
    // real workspace marker (not the cwd fallback). Toolspace-mounted and
    // workspace-local capabilities also implicitly require this when the
    // policy is declared.
    require_workspace_binding(capability, runtime) {
        if (!runtime?.workspace?.viaMarker) {
            return {
                error: `policy require_workspace_binding: '${capability.id}' refuses to run without a workspace marker (resolved root '${runtime?.workspace?.root ?? "<unknown>"}', source '${runtime?.workspace?.source ?? "<unknown>"}')`
            };
        }
        return null;
    },

    // require_active_lifecycle: refuses to run unless the capability is
    // promoted to `active`. This is independent of the --any-lifecycle
    // flag, which only gates *whether the resolver lets non-active
    // capabilities through* — this policy makes the refusal binding at
    // execution time so a capability cannot be promoted by accident via
    // the framework flag.
    require_active_lifecycle(capability) {
        if (capability.lifecycleState !== "active") {
            return {
                error: `policy require_active_lifecycle: '${capability.id}' is '${capability.lifecycleState}' but must be 'active' to run`
            };
        }
        return null;
    },

    // forbid_network: refuses to run any capability whose declared
    // sideEffects include network egress. Useful for sandboxed mounts
    // that want a hard deny rather than trusting reviewers.
    forbid_network(capability) {
        const se = capability.sideEffects;
        const declares = se === "network"
            || (Array.isArray(se) && se.includes("network"));
        if (declares) {
            return {
                error: `policy forbid_network: '${capability.id}' declares sideEffects '${JSON.stringify(se)}' which includes network egress`
            };
        }
        return null;
    }
};

// Evaluate at execution time. Returns { ok, warnings, errors }.
export function evaluatePolicies(capability, runtime = null) {
    const warnings = [];
    const errors = [];
    const policies = capability.policies ?? [];

    // Workspace-local capabilities implicitly require workspace binding,
    // even if they didn't declare the policy explicitly.
    const effective = new Set(policies);
    if (capability.scope === "workspace-local") {
        effective.add("require_workspace_binding");
    }

    for (const name of effective) {
        if (!isKnown(name)) {
            errors.push(`unknown policy '${name}' on '${capability.id}'`);
            continue;
        }
        const handler = POLICY_HANDLERS[name];
        if (!handler) {
            warnings.push(
                `policy '${name}' is declared on '${capability.id}' but has no runtime implementation yet`
            );
            continue;
        }
        const result = handler(capability, runtime);
        if (result?.error) errors.push(result.error);
        if (result?.warning) warnings.push(result.warning);
    }
    return { ok: errors.length === 0, warnings, errors };
}
