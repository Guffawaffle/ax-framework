// AX adapter loader.
//
// Two adapter kinds are recognized in v0:
//
//   - type-adapter   one per adapterType (e.g. "internal", "cli").
//                    Owns the generic dispatch for that execution channel.
//                    Stored in the `types` map, keyed by the manifest's
//                    `type` field.
//
//   - provider       optional, capability-specific wrapper that composes
//                    on top of a type adapter. Used to normalize a
//                    provider's quirks (Majel's {success, errors, hints}
//                    envelope, for example) without leaking them into
//                    the generic CLI adapter. Stored in the `providers`
//                    map, keyed by the manifest's `name` field.
//
// Capabilities pick their type via `adapterType`. They optionally pick
// a provider via `providerAdapter`. When a provider is set, the
// executor calls the provider's execute() with a context object that
// exposes the type adapter; the provider can pre-process args, delegate
// to the type adapter, post-process the result, or all three.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AxError } from "./errors.js";

const SUPPORTED_MANIFEST_VERSIONS = new Set(["ax/v0"]);
const KNOWN_KINDS = new Set(["type-adapter", "provider"]);

// Two visibility scopes for adapters:
//
//   - workspace-global  loaded from `adapters/<name>/` at the workspace
//                       root. Visible to every capability.
//
//   - toolspace-private loaded from `toolspaces/<name>/adapters/<adapter>/`.
//                       Visible only to capabilities that resolve under
//                       toolspace `<name>`. Resolution prefers a private
//                       adapter over a global one when names collide.
//
// Toolspace-private adapters let one toolspace customize provider
// behavior (e.g. wrap Lex with extra normalization) without polluting
// the global adapter set.

export async function loadAdapters({ rootDir }) {
    const adaptersRoot = path.join(rootDir, "adapters");
    const registry = new AdapterRegistry(rootDir);
    await registry.loadFrom(adaptersRoot);
    await registry.loadToolspacePrivateFrom(path.join(rootDir, "toolspaces"));
    return registry;
}

export class AdapterRegistry {
    constructor(rootDir) {
        this.rootDir = rootDir;
        this.types = new Map();      // adapterType -> { manifest, execute }
        this.providers = new Map();  // providerName -> { manifest, execute }
        // Toolspace-private namespaces. Keyed by toolspace name.
        this.toolspaceTypes = new Map();      // ts -> Map<type, record>
        this.toolspaceProviders = new Map();  // ts -> Map<name, record>
        this.loadIssues = [];
    }

    async loadFrom(adaptersRoot) {
        let entries;
        try {
            entries = await readdir(adaptersRoot, { withFileTypes: true });
        } catch (error) {
            if (error.code === "ENOENT") {
                this.loadIssues.push({
                    severity: "error",
                    message: `adapters root '${path.relative(this.rootDir, adaptersRoot)}' is missing`
                });
                return;
            }
            throw error;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            await this.loadAdapter(path.join(adaptersRoot, entry.name));
        }
    }

    // Scan toolspaces/<name>/adapters/<adapter>/ for each toolspace dir.
    // Missing root is normal (toolspace-private adapters are optional).
    async loadToolspacePrivateFrom(toolspacesRoot) {
        let toolspaceDirs;
        try {
            toolspaceDirs = await readdir(toolspacesRoot, { withFileTypes: true });
        } catch (error) {
            if (error.code === "ENOENT") return;
            throw error;
        }
        for (const ts of toolspaceDirs) {
            if (!ts.isDirectory()) continue;
            const tsAdaptersRoot = path.join(toolspacesRoot, ts.name, "adapters");
            let adapterDirs;
            try {
                adapterDirs = await readdir(tsAdaptersRoot, { withFileTypes: true });
            } catch (error) {
                if (error.code === "ENOENT") continue;
                throw error;
            }
            for (const entry of adapterDirs) {
                if (!entry.isDirectory()) continue;
                await this.loadAdapter(path.join(tsAdaptersRoot, entry.name), {
                    toolspace: ts.name
                });
            }
        }
    }

    async loadAdapter(adapterDir, { toolspace = null } = {}) {
        const manifestPath = path.join(adapterDir, "adapter.manifest.json");
        const relativeDir = path.relative(this.rootDir, adapterDir);

        let manifest;
        try {
            manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        } catch (error) {
            this.loadIssues.push({
                severity: "error",
                message: `${relativeDir}: adapter.manifest.json failed to load: ${error.message}`
            });
            return;
        }

        // Legacy spelling: kind: "adapter" was used pre-alpha for what is
        // now "type-adapter". Accept it with a deprecation warning so
        // external repos that pinned the old name still load.
        if (manifest.kind === "adapter") {
            this.loadIssues.push({
                severity: "warning",
                message: `${relativeDir}: adapter manifest kind 'adapter' is deprecated; rename to 'type-adapter' (will be removed in v0.1)`
            });
            manifest.kind = "type-adapter";
        }

        const issues = validateAdapterManifest(manifest, relativeDir);
        if (issues.length > 0) {
            this.loadIssues.push(...issues);
            return;
        }

        const entryPath = path.join(adapterDir, manifest.entry);
        let module;
        try {
            module = await import(pathToFileURL(entryPath).href);
        } catch (error) {
            this.loadIssues.push({
                severity: "error",
                message: `${relativeDir}: adapter entry '${manifest.entry}' failed to import: ${error.message}`
            });
            return;
        }

        if (typeof module.execute !== "function") {
            this.loadIssues.push({
                severity: "error",
                message: `${relativeDir}: adapter entry must export an 'execute' function`
            });
            return;
        }

        const record = {
            manifest,
            manifestPath: path.relative(this.rootDir, manifestPath),
            execute: module.execute,
            toolspace
        };

        if (manifest.kind === "type-adapter") {
            if (toolspace) {
                if (!this.toolspaceTypes.has(toolspace)) this.toolspaceTypes.set(toolspace, new Map());
                this.toolspaceTypes.get(toolspace).set(manifest.type, record);
            } else {
                this.types.set(manifest.type, record);
            }
            return;
        }

        if (manifest.kind === "provider") {
            if (toolspace) {
                if (!this.toolspaceProviders.has(toolspace)) this.toolspaceProviders.set(toolspace, new Map());
                this.toolspaceProviders.get(toolspace).set(manifest.name, record);
            } else {
                this.providers.set(manifest.name, record);
            }
            return;
        }
    }

    // Type adapter lookup. With opts.toolspace, prefers the toolspace's
    // private adapter, falling back to global.
    get(type, opts = {}) {
        if (opts.toolspace) {
            const tsMap = this.toolspaceTypes.get(opts.toolspace);
            if (tsMap?.has(type)) return tsMap.get(type);
        }
        return this.types.get(type);
    }

    getProvider(name, opts = {}) {
        if (opts.toolspace) {
            const tsMap = this.toolspaceProviders.get(opts.toolspace);
            if (tsMap?.has(name)) return tsMap.get(name);
        }
        return this.providers.get(name);
    }

    listTypes() {
        return [...this.types.values()];
    }

    listProviders() {
        return [...this.providers.values()];
    }

    listToolspacePrivate() {
        const out = [];
        for (const [ts, m] of this.toolspaceTypes) for (const r of m.values()) out.push(r);
        for (const [ts, m] of this.toolspaceProviders) for (const r of m.values()) out.push(r);
        return out;
    }

    // Aggregate count for doctor output. Includes both kinds and both
    // visibility scopes; doctor distinguishes if it cares.
    get adapterCount() {
        let toolspacePrivate = 0;
        for (const m of this.toolspaceTypes.values()) toolspacePrivate += m.size;
        for (const m of this.toolspaceProviders.values()) toolspacePrivate += m.size;
        return this.types.size + this.providers.size + toolspacePrivate;
    }

    // Back-compat shim: doctor reads `.adapters.size`.
    get adapters() {
        return { size: this.adapterCount };
    }
}

export function validateAdapterManifest(manifest, label) {
    const issues = [];
    const required = ["manifestVersion", "kind", "entry", "lifecycleState"];

    for (const field of required) {
        if (!(field in manifest)) {
            issues.push({
                severity: "error",
                message: `${label}: adapter manifest missing '${field}'`
            });
        }
    }

    if (manifest.kind && !KNOWN_KINDS.has(manifest.kind)) {
        issues.push({
            severity: "error",
            message: `${label}: adapter manifest kind '${manifest.kind}' must be 'type-adapter' or 'provider'`
        });
    }

    if (manifest.kind === "type-adapter" && !manifest.type) {
        issues.push({
            severity: "error",
            message: `${label}: type-adapter manifest requires 'type'`
        });
    }

    if (manifest.kind === "provider") {
        if (!manifest.name) {
            issues.push({
                severity: "error",
                message: `${label}: provider manifest requires 'name'`
            });
        }
        if (!manifest.composes) {
            issues.push({
                severity: "error",
                message: `${label}: provider manifest requires 'composes' (the type adapter it wraps)`
            });
        }
    }

    if (
        manifest.manifestVersion &&
        !SUPPORTED_MANIFEST_VERSIONS.has(manifest.manifestVersion)
    ) {
        issues.push({
            severity: "error",
            message: `${label}: unsupported manifestVersion '${manifest.manifestVersion}'`
        });
    }

    return issues;
}

export function getAdapterOrThrow(adapterRegistry, adapterType) {
    const adapter = adapterRegistry.get(adapterType);
    if (!adapter) {
        throw new AxError(
            `no adapter loaded for type '${adapterType}' (looked under adapters/${adapterType}/)`,
            2
        );
    }
    return adapter;
}
