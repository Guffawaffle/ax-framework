import { AxError } from "./errors.js";

export function parseCapabilityInput(registry, inputTokens) {
  if (inputTokens.length === 1 && isFullyQualifiedId(inputTokens[0])) {
    return { kind: "id", id: inputTokens[0] };
  }

  if (inputTokens.length < 2) {
    throw new AxError("capability path must include a module and capability", 2);
  }

  const [first, second, ...rest] = inputTokens;
  if (registry.hasToolspace(first)) {
    if (!second || rest.length === 0) {
      throw new AxError("toolspace path must include module and capability", 2);
    }

    return {
      kind: "path",
      scope: "toolspace-local",
      toolspace: first,
      module: second,
      capabilityPath: rest.join(".")
    };
  }

  return {
    kind: "path",
    scope: "global",
    toolspace: null,
    module: first,
    capabilityPath: [second, ...rest].join(".")
  };
}

export function isFullyQualifiedId(value) {
  return value.startsWith("global.")
    || value.startsWith("toolspace.")
    || value.startsWith("workspace.");
}
