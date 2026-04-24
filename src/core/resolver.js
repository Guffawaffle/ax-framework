import { parseCapabilityInput } from "./path-model.js";
import { AxError } from "./errors.js";
import { assertValid } from "./schema-validator.js";

export function resolveCapability(registry, inputTokens, context = {}) {
    const inspected = registry.resolveInspectable(inputTokens);
    const capability = inspected.capability;
    const allowDraft = Boolean(context.allowDraft);

    if (capability.lifecycleState !== "active" && !allowDraft) {
        throw new AxError(
            `capability '${capability.id}' is ${capability.lifecycleState}; pass --any-lifecycle to run explicitly`,
            2
        );
    }

    // Merge defaults <- caller args (caller wins).
    const merged = {
        ...(capability.defaults ?? {}),
        ...(context.args ?? {})
    };

    // Schema-driven validation + coercion. Framework flags are stripped
    // before validation so users can pass --json / --allow-draft freely.
    const cleaned = stripFrameworkFlags(merged);
    const validated = capability.argsSchema
        ? assertValid(capability.argsSchema, cleaned, `capability '${capability.id}' args`)
        : cleaned;

    return {
        input: parseCapabilityInput(registry, inputTokens),
        capability,
        args: validated,
        injectedDefaults: inspected.injectedDefaults
    };
}

const FRAMEWORK_FLAGS = new Set(["json", "allow-draft", "any-lifecycle"]);

function stripFrameworkFlags(args) {
    const out = {};
    for (const [key, value] of Object.entries(args)) {
        if (FRAMEWORK_FLAGS.has(key)) continue;
        out[key] = value;
    }
    return out;
}

export function synthesizeMountedCapability({
    toolspace,
    moduleName,
    mount,
    capabilityPath,
    sourceCapability
}) {
    return {
        ...sourceCapability,
        id: `toolspace.${toolspace.toolspace}.${moduleName}.${capabilityPath}`,
        scope: "toolspace-local",
        lifecycleState:
            mount.lifecycleState ??
            toolspace.lifecycleState ??
            sourceCapability.lifecycleState,
        defaults: {
            ...(sourceCapability.defaults ?? {}),
            ...(mount.defaults ?? {})
        },
        policies: [
            ...(sourceCapability.policies ?? []),
            ...(mount.policies ?? [])
        ],
        sourceCapabilityId: sourceCapability.id,
        mount: {
            toolspace: toolspace.toolspace,
            module: moduleName,
            source: mount.source,
            mode: mount.mode ?? "proxy"
        },
        manifestPath: toolspace.manifestPath
    };
}
