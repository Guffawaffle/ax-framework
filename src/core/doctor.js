const REQUIRED_CAPABILITY_FIELDS = [
  "id",
  "summary",
  "provider",
  "adapterType",
  "executionTarget",
  "argsSchema",
  "outputModes",
  "sideEffects",
  "scope",
  "lifecycleState",
  "defaults",
  "policies",
  "owner"
];

const LIFECYCLE_STATES = new Set(["draft", "reviewed", "active"]);
const ADAPTER_TYPES = new Set(["internal", "cli", "library", "rpc", "mcp"]);

export function inspectRegistry(registry) {
  const issues = [...registry.loadIssues];

  for (const capability of registry.capabilities.values()) {
    issues.push(...validateCapability(capability));
  }

  for (const toolspace of registry.toolspaces.values()) {
    issues.push(...validateToolspace(registry, toolspace));
  }

  return {
    capabilityCount: registry.capabilities.size,
    toolspaceCount: registry.toolspaces.size,
    manifestCount: registry.files.length,
    issues
  };
}

function validateCapability(capability) {
  const issues = [];

  for (const field of REQUIRED_CAPABILITY_FIELDS) {
    if (!(field in capability)) {
      issues.push({
        severity: "error",
        message: `${capability.id ?? capability.manifestPath} is missing '${field}'`
      });
    }
  }

  if (capability.lifecycleState && !LIFECYCLE_STATES.has(capability.lifecycleState)) {
    issues.push({
      severity: "error",
      message: `${capability.id} has invalid lifecycleState '${capability.lifecycleState}'`
    });
  }

  if (capability.adapterType && !ADAPTER_TYPES.has(capability.adapterType)) {
    issues.push({
      severity: "error",
      message: `${capability.id} has invalid adapterType '${capability.adapterType}'`
    });
  }

  if (capability.id && !/^(global|toolspace)\.[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(capability.id)) {
    issues.push({
      severity: "error",
      message: `${capability.id} is not a fully qualified AX capability id`
    });
  }

  return issues;
}

function validateToolspace(registry, toolspace) {
  const issues = [];

  if (!toolspace.moduleMounts || typeof toolspace.moduleMounts !== "object") {
    issues.push({
      severity: "error",
      message: `${toolspace.toolspace} toolspace has no moduleMounts object`
    });
    return issues;
  }

  for (const [moduleName, mount] of Object.entries(toolspace.moduleMounts)) {
    for (const capabilityPath of mount.capabilities ?? []) {
      const sourceId = `${mount.source}.${capabilityPath}`;
      if (!registry.getCapability(sourceId)) {
        issues.push({
          severity: "error",
          message: `${toolspace.toolspace}.${moduleName}.${capabilityPath} points at missing ${sourceId}`
        });
      }
    }
  }

  return issues;
}
