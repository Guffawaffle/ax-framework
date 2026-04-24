// Edge cases for toolspace-private adapters: orphans, malformed,
// shadowing, scaffold integration, fallback semantics.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadAdapters } from "../src/core/adapter-loader.js";
import { createRegistry } from "../src/core/registry.js";
import { inspectRegistry } from "../src/core/doctor.js";
import { resolveCapability } from "../src/core/resolver.js";
import { executeResolvedCapability } from "../src/core/executor.js";
import { evaluatePolicies } from "../src/core/policy.js";
import { main } from "../src/cli/main.js";

async function tmpRoot() {
    const root = await mkdtemp(path.join(os.tmpdir(), "ax-tspriv-edge-"));
    await writeFile(
        path.join(root, "ax.workspace.json"),
        JSON.stringify({ manifestVersion: "ax/v0", name: "fixture" })
    );
    await mkdir(path.join(root, "manifests", "capabilities"), { recursive: true });
    await mkdir(path.join(root, "manifests", "toolspaces"), { recursive: true });
    return root;
}

async function writeGlobalInternal(root) {
    const dir = path.join(root, "adapters", "internal");
    await mkdir(dir, { recursive: true });
    await writeFile(
        path.join(dir, "adapter.manifest.json"),
        JSON.stringify({
            manifestVersion: "ax/v0",
            kind: "type-adapter",
            type: "internal",
            entry: "index.js",
            lifecycleState: "active"
        })
    );
    await writeFile(
        path.join(dir, "index.js"),
        `export async function execute(r) { return { ok: true, data: 'global', meta: {} }; }`
    );
}

test("doctor warns when a toolspace adapter dir has no matching mount", async () => {
    const root = await tmpRoot();
    await writeGlobalInternal(root);
    // Orphan: toolspaces/ghost/adapters/cli/ but no ghost.mount.json.
    const orphan = path.join(root, "toolspaces", "ghost", "adapters", "cli");
    await mkdir(orphan, { recursive: true });
    await writeFile(
        path.join(orphan, "adapter.manifest.json"),
        JSON.stringify({
            manifestVersion: "ax/v0",
            kind: "type-adapter",
            type: "cli",
            entry: "index.js",
            lifecycleState: "active"
        })
    );
    await writeFile(
        path.join(orphan, "index.js"),
        `export async function execute() { return { ok: true, data: null, meta: {} }; }`
    );
    const adapters = await loadAdapters({ rootDir: root });
    const registry = await createRegistry({ rootDir: root });
    const report = inspectRegistry(registry, { adapters });
    const warning = report.issues.find((i) =>
        /no toolspace mount declares 'ghost'/.test(i.message)
    );
    assert.ok(warning, `expected orphan warning, got ${JSON.stringify(report.issues)}`);
});

test("doctor warns when a private adapter shadows a global one of the same name", async () => {
    const root = await tmpRoot();
    await writeGlobalInternal(root);
    // Declare toolspace 'tly' so it's not orphaned.
    await writeFile(
        path.join(root, "manifests", "toolspaces", "tly.mount.json"),
        JSON.stringify({
            manifestVersion: "ax/v0",
            toolspace: "tly",
            lifecycleState: "active",
            moduleMounts: {}
        })
    );
    // Private internal type-adapter shadows the global one.
    const dir = path.join(root, "toolspaces", "tly", "adapters", "internal");
    await mkdir(dir, { recursive: true });
    await writeFile(
        path.join(dir, "adapter.manifest.json"),
        JSON.stringify({
            manifestVersion: "ax/v0",
            kind: "type-adapter",
            type: "internal",
            entry: "index.js",
            lifecycleState: "active"
        })
    );
    await writeFile(
        path.join(dir, "index.js"),
        `export async function execute() { return { ok: true, data: 'private', meta: {} }; }`
    );
    const adapters = await loadAdapters({ rootDir: root });
    const registry = await createRegistry({ rootDir: root });
    const report = inspectRegistry(registry, { adapters });
    const warning = report.issues.find((i) =>
        /private type-adapter 'internal' shadows the global type-adapter 'internal'/.test(i.message)
    );
    assert.ok(warning, `expected shadow warning, got ${JSON.stringify(report.issues)}`);
});

test("private adapter with malformed manifest surfaces as a load issue", async () => {
    const root = await tmpRoot();
    await writeGlobalInternal(root);
    const dir = path.join(root, "toolspaces", "tly", "adapters", "broken");
    await mkdir(dir, { recursive: true });
    await writeFile(
        path.join(dir, "adapter.manifest.json"),
        JSON.stringify({
            manifestVersion: "ax/v0",
            kind: "type-adapter"
            // missing entry, type, lifecycleState
        })
    );
    const adapters = await loadAdapters({ rootDir: root });
    assert.ok(
        adapters.loadIssues.some((i) =>
            /broken.*missing 'entry'|broken.*missing 'lifecycleState'/.test(i.message)
        ),
        `expected malformed-manifest issue, got ${JSON.stringify(adapters.loadIssues)}`
    );
});

test("`init adapter --toolspace <ts>` scaffolds under toolspaces/<ts>/adapters/", async () => {
    const root = await tmpRoot();
    await main([
        "--workspace", root,
        "init", "adapter",
        "--toolspace", "tly",
        "tdraft"
    ]);
    const manifestPath = path.join(root, "toolspaces", "tly", "adapters", "tdraft", "adapter.manifest.json");
    const raw = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(raw.kind, "type-adapter");
    assert.equal(raw.type, "tdraft");
    assert.equal(raw.lifecycleState, "draft");
});

test("`init adapter --toolspace <ts> --kind provider` scaffolds a provider", async () => {
    const root = await tmpRoot();
    await main([
        "--workspace", root,
        "init", "adapter",
        "--toolspace", "tly",
        "--kind", "provider",
        "wrap",
        "--composes", "cli"
    ]);
    const manifestPath = path.join(root, "toolspaces", "tly", "adapters", "wrap", "adapter.manifest.json");
    const raw = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(raw.kind, "provider");
    assert.equal(raw.name, "wrap");
    assert.equal(raw.composes, "cli");
});

test("workspace-local capability with explicit policy is not double-enforced", async () => {
    // Set already dedupes by string; verify that a capability declaring
    // require_workspace_binding explicitly + scope=workspace-local doesn't
    // produce two error entries when the runtime is unbound.
    const result = evaluatePolicies(
        {
            id: "workspace.repo.thing",
            scope: "workspace-local",
            policies: ["require_workspace_binding"]
        },
        { workspace: { root: "/tmp", viaMarker: false, source: "cwd-fallback" } }
    );
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1, "policy should be reported once, not twice");
});

test("private provider whose `composes` mismatches capability adapterType is rejected at exec", async () => {
    const root = await tmpRoot();
    await writeGlobalInternal(root);
    await writeFile(
        path.join(root, "manifests", "toolspaces", "tly.mount.json"),
        JSON.stringify({
            manifestVersion: "ax/v0",
            toolspace: "tly",
            lifecycleState: "active",
            moduleMounts: { e: { source: "global.e", capabilities: ["go"] } }
        })
    );
    await writeFile(
        path.join(root, "manifests", "capabilities", "global.e.go.json"),
        JSON.stringify({
            manifestVersion: "ax/v0",
            id: "global.e.go",
            summary: "go",
            provider: "x",
            adapterType: "internal",
            providerAdapter: "wrong",
            executionTarget: { handler: "echo.say" },
            argsSchema: { type: "object" },
            outputModes: ["json"],
            sideEffects: "none",
            scope: "global",
            lifecycleState: "active",
            defaults: {},
            policies: [],
            owner: "test"
        })
    );
    const dir = path.join(root, "toolspaces", "tly", "adapters", "wrong");
    await mkdir(dir, { recursive: true });
    await writeFile(
        path.join(dir, "adapter.manifest.json"),
        JSON.stringify({
            manifestVersion: "ax/v0",
            kind: "provider",
            name: "wrong",
            composes: "cli", // capability uses "internal"; this is wrong on purpose
            entry: "index.js",
            lifecycleState: "active"
        })
    );
    await writeFile(
        path.join(dir, "index.js"),
        `export async function execute() { return { ok: true, data: null, meta: {} }; }`
    );
    const adapters = await loadAdapters({ rootDir: root });
    const registry = await createRegistry({ rootDir: root });
    const runtime = { workspace: { root, viaMarker: true, source: "cwd-marker" } };

    // When run through the toolspace mount, the private provider should
    // be picked AND should be rejected for composing the wrong type.
    await assert.rejects(
        () => executeResolvedCapability(
            resolveCapability(registry, ["tly", "e", "go"], { args: {} }),
            { adapters, runtime }
        ),
        /composes 'cli' but .* uses adapterType 'internal'/
    );
});
