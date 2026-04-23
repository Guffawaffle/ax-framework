import { parseCapabilityInput } from "./path-model.js";
import { AxError } from "./errors.js";

export function resolveCapability(registry, inputTokens, context = {}) {
  const inspected = registry.resolveInspectable(inputTokens);
  const capability = inspected.capability;
  const allowDraft = Boolean(context.allowDraft);

  if (capability.lifecycleState !== "active" && !allowDraft) {
    throw new AxError(
      `capability '${capability.id}' is ${capability.lifecycleState}; pass --allow-draft to run explicitly`,
      2
    );
  }

  return {
    input: parseCapabilityInput(registry, inputTokens),
    capability,
    args: {
      ...(capability.defaults ?? {}),
      ...(context.args ?? {})
    },
    injectedDefaults: inspected.injectedDefaults
  };
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
    lifecycleState: mount.lifecycleState ?? toolspace.lifecycleState ?? sourceCapability.lifecycleState,
    defaults: {
      ...(sourceCapability.defaults ?? {}),
      ...(mount.defaults ?? {})
    },
    policies: [...(sourceCapability.policies ?? []), ...(mount.policies ?? [])],
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
