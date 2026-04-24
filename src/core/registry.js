import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { AxError } from "./errors.js";
import { parseCapabilityInput } from "./path-model.js";
import { synthesizeMountedCapability } from "./resolver.js";
import {
    validateCapabilityManifest,
    validateToolspaceManifest
} from "./manifest-validator.js";
import { loadFamilies, synthesizeFamilyCapabilities } from "./family-loader.js";

export const SUPPORTED_MANIFEST_VERSIONS = new Set(["axf/v0"]);

export async function createRegistry({ rootDir, strict = true } = {}) {
    const manifestRoot = path.join(rootDir, "manifests");
    const registry = new ManifestRegistry(rootDir, { strict });
    await registry.loadFrom(manifestRoot);
    await registry.loadFamiliesFrom(path.join(manifestRoot, "families"));
    return registry;
}

export class ManifestRegistry {
    constructor(rootDir, { strict = true } = {}) {
        this.rootDir = rootDir;
        this.strict = strict;
        this.capabilities = new Map();
        this.toolspaces = new Map();
        this.families = [];
        this.files = [];
        this.loadIssues = [];
        this.rejected = [];
    }

    async loadFrom(manifestRoot) {
        const files = await listJsonFiles(manifestRoot, { skipDirs: ["families"] });
        this.files = files;

        for (const filePath of files) {
            await this.loadFile(filePath);
        }
    }

    async loadFamiliesFrom(familiesRoot) {
        const { families, issues } = await loadFamilies({
            familiesRoot,
            rootDir: this.rootDir
        });
        this.loadIssues.push(...issues);
        this.families = families;
        const existingIds = new Set(this.capabilities.keys());
        for (const family of families) {
            const synthesized = synthesizeFamilyCapabilities(family, { existingIds });
            for (const cap of synthesized) {
                // Materialized capability already loaded? Skip; that file wins.
                if (this.capabilities.has(cap.id)) continue;
                this.capabilities.set(cap.id, cap);
            }
        }
        // Mark capabilities whose id matches a family entry: they are
        // materialized overrides of an imported command.
        for (const family of families) {
            const scope = family.scope ?? "global";
            const idPrefix = scope === "workspace-local" ? "workspace" : "global";
            for (const cmdKey of Object.keys(family.commands)) {
                const id = `${idPrefix}.${family.family}.${cmdKey}`;
                const declared = this.capabilities.get(id);
                if (declared && declared.origin !== "imported") {
                    declared.origin = "materialized";
                    declared.sourceFamily = declared.sourceFamily ?? {
                        family: family.family,
                        command: cmdKey,
                        manifestPath: family.manifestPath
                    };
                }
            }
        }
    }

    async loadFile(filePath) {
        const relativePath = path.relative(this.rootDir, filePath);
        let manifest;
        try {
            manifest = JSON.parse(await readFile(filePath, "utf8"));
        } catch (error) {
            this.loadIssues.push({
                severity: "error",
                message: `${relativePath} failed to parse: ${error.message}`
            });
            this.rejected.push(relativePath);
            return;
        }

        if (manifest.id) {
            const issues = validateCapabilityManifest(manifest, relativePath);
            if (this.strict && issues.some((i) => i.severity === "error")) {
                this.loadIssues.push(...issues);
                this.rejected.push(relativePath);
                return;
            }
            this.loadIssues.push(...issues);
            this.capabilities.set(manifest.id, { ...manifest, manifestPath: relativePath });
            return;
        }

        if (manifest.toolspace) {
            const issues = validateToolspaceManifest(manifest, relativePath);
            if (this.strict && issues.some((i) => i.severity === "error")) {
                this.loadIssues.push(...issues);
                this.rejected.push(relativePath);
                return;
            }
            this.loadIssues.push(...issues);
            this.toolspaces.set(manifest.toolspace, {
                ...manifest,
                manifestPath: relativePath
            });
            return;
        }

        this.loadIssues.push({
            severity: "error",
            message: `${relativePath} is not a recognized axf manifest (no 'id' or 'toolspace' field)`
        });
        this.rejected.push(relativePath);
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
                    if (!sourceCapability) continue;
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
            const capability =
                this.capabilities.get(parsed.id) ?? this.findMountedById(parsed.id);
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
            if (capability) {
                return {
                    input: parsed,
                    capability,
                    injectedDefaults: capability.defaults ?? {}
                };
            }
            // Fallback to workspace-local: workspace.<module>.<cap>
            const wsId = `workspace.${parsed.module}.${parsed.capabilityPath}`;
            const wsCapability = this.capabilities.get(wsId);
            if (wsCapability) {
                return {
                    input: { ...parsed, scope: "workspace-local" },
                    capability: wsCapability,
                    injectedDefaults: wsCapability.defaults ?? {}
                };
            }
            throw new AxError(
                `unknown capability '${id}' (also tried '${wsId}')`,
                2
            );
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

async function listJsonFiles(dirPath, { skipDirs = [] } = {}) {
    let entries;
    try {
        entries = await readdir(dirPath, { withFileTypes: true });
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }

    const results = [];
    for (const entry of entries) {
        const childPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            if (skipDirs.includes(entry.name)) continue;
            results.push(...(await listJsonFiles(childPath, { skipDirs })));
        } else if (entry.isFile() && entry.name.endsWith(".json")) {
            // Family files use a distinct suffix so listJsonFiles excludes them.
            if (entry.name.endsWith(".family.json")) continue;
            results.push(childPath);
        }
    }
    return results;
}
