import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { AxError } from "./errors.js";
import { parseCapabilityInput } from "./path-model.js";
import { synthesizeMountedCapability } from "./resolver.js";

export async function createRegistry({ rootDir }) {
  const manifestRoot = path.join(rootDir, "manifests");
  const registry = new ManifestRegistry(rootDir);
  await registry.loadFrom(manifestRoot);
  return registry;
}

export class ManifestRegistry {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.capabilities = new Map();
    this.toolspaces = new Map();
    this.files = [];
    this.loadIssues = [];
  }

  async loadFrom(manifestRoot) {
    const files = await listJsonFiles(manifestRoot);
    this.files = files;

    for (const filePath of files) {
      await this.loadFile(filePath);
    }
  }

  async loadFile(filePath) {
    try {
      const raw = await readFile(filePath, "utf8");
      const manifest = JSON.parse(raw);
      const relativePath = path.relative(this.rootDir, filePath);

      if (manifest.id) {
        this.capabilities.set(manifest.id, { ...manifest, manifestPath: relativePath });
        return;
      }

      if (manifest.toolspace) {
        this.toolspaces.set(manifest.toolspace, {
          ...manifest,
          manifestPath: relativePath
        });
        return;
      }

      this.loadIssues.push({
        severity: "warning",
        message: `${relativePath} is not a recognized AX manifest`
      });
    } catch (error) {
      this.loadIssues.push({
        severity: "error",
        message: `${path.relative(this.rootDir, filePath)} failed to load: ${error.message}`
      });
    }
  }

  hasToolspace(name) {
    return this.toolspaces.has(name);
  }

  getToolspace(name) {
    return this.toolspaces.get(name);
  }

  getCapability(id) {
    return this.capabilities.get(id);
  }

  listCapabilities({ includeDrafts = false } = {}) {
    const declared = [...this.capabilities.values()];
    const mounted = this.listMountedCapabilities();
    return [...declared, ...mounted]
      .filter((capability) => includeDrafts || capability.lifecycleState === "active")
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  listMountedCapabilities() {
    const mounted = [];

    for (const toolspace of this.toolspaces.values()) {
      for (const [moduleName, mount] of Object.entries(toolspace.moduleMounts ?? {})) {
        for (const capabilityPath of mount.capabilities ?? []) {
          const sourceId = `${mount.source}.${capabilityPath}`;
          const sourceCapability = this.capabilities.get(sourceId);
          if (!sourceCapability) {
            continue;
          }

          mounted.push(
            synthesizeMountedCapability({
              toolspace,
              moduleName,
              mount,
              capabilityPath,
              sourceCapability
            })
          );
        }
      }
    }

    return mounted;
  }

  resolveInspectable(inputTokens) {
    const parsed = parseCapabilityInput(this, inputTokens);

    if (parsed.kind === "id") {
      const capability = this.capabilities.get(parsed.id) ?? this.findMountedById(parsed.id);
      if (!capability) {
        throw new AxError(`unknown capability '${parsed.id}'`, 2);
      }

      return {
        input: parsed,
        capability,
        injectedDefaults: capability.defaults ?? {}
      };
    }

    if (parsed.scope === "global") {
      const id = `global.${parsed.module}.${parsed.capabilityPath}`;
      const capability = this.capabilities.get(id);
      if (!capability) {
        throw new AxError(`unknown capability '${id}'`, 2);
      }

      return {
        input: parsed,
        capability,
        injectedDefaults: capability.defaults ?? {}
      };
    }

    const toolspace = this.toolspaces.get(parsed.toolspace);
    const mount = toolspace?.moduleMounts?.[parsed.module];
    if (!toolspace || !mount) {
      throw new AxError(`unknown mount '${parsed.toolspace}.${parsed.module}'`, 2);
    }

    const sourceId = `${mount.source}.${parsed.capabilityPath}`;
    const sourceCapability = this.capabilities.get(sourceId);
    if (!sourceCapability) {
      throw new AxError(`mount source capability '${sourceId}' is not declared`, 2);
    }

    const capability = synthesizeMountedCapability({
      toolspace,
      moduleName: parsed.module,
      mount,
      capabilityPath: parsed.capabilityPath,
      sourceCapability
    });

    return {
      input: parsed,
      capability,
      injectedDefaults: mount.defaults ?? {}
    };
  }

  findMountedById(id) {
    return this.listMountedCapabilities().find((capability) => capability.id === id);
  }
}

async function listJsonFiles(dirPath) {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const results = [];
  for (const entry of entries) {
    const childPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listJsonFiles(childPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(childPath);
    }
  }

  return results;
}
