// Toolspace-private adapters live under
// `toolspaces/<name>/adapters/<adapter>/` and are visible only to
// capabilities that resolve under the toolspace `<name>`.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadAdapters } from "../src/core/adapter-loader.js";
import { createRegistry } from "../src/core/registry.js";
import { resolveCapability } from "../src/core/resolver.js";
import { executeResolvedCapability } from "../src/core/executor.js";

async function bootstrap() {
    const root = await mkdtemp(path.join(os.tmpdir(), "ax-tspriv-"));
    await writeFile(
        path.join(root, "ax.workspace.json"),
        JSON.stringify({ manifestVersion: "ax/v0", name: "fixture" })
    );
    await mkdir(path.join(root, "manifests", "capabilities"), { recursive: true });
    await mkdir(path.join(root, "manifests", "toolspaces"), { recursive: true });
    return root;
}

async function writeGlobalEcho(root) {
    // Global "internal" type-adapter that returns args.message verbatim.
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
        `export async function execute(resolved) {
            return {
                ok: true,
                data: \`global:\${resolved.args?.message ?? ""}\`,
                meta: { capabilityId: resolved.capability.id, adapterType: "internal" }
            };
        }`
    );

    // Capability that uses adapterType "internal".
    await writeFile(
        path.join(root, "manifests", "capabilities", "global.echo.say.json"),
        JSON.stringify({
            manifestVersion: "ax/v0",
            id: "global.echo.say",
            summary: "echo",
            provider: "internal",
            adapterType: "internal",
            executionTarget: { handler: "echo.say" },
            argsSchema: {
                type: "object",
                properties: { message: { type: "string" } }
            },
            outputModes: ["json"],
            sideEffects: "none",
            scope: "global",
            lifecycleState: "active",
            defaults: {},
            policies: [],
            owner: "test"
        })
    );

    // Toolspace mount.
    await writeFile(
        path.join(root, "manifests", "toolspaces", "tly.mount.json"),
        JSON.stringify({
            manifestVersion: "ax/v0",
            toolspace: "tly",
            lifecycleState: "active",
            moduleMounts: {
                echo: { source: "global.echo", capabilities: ["say"] }
            }
        })
    );
}

async function writeToolspacePrivateInternal(root) {
    // Toolspace-private "internal" type-adapter that decorates output.
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
        `export async function execute(resolved) {
            return {
                ok: true,
                data: \`tly-private:\${resolved.args?.message ?? ""}\`,
                meta: { capabilityId: resolved.capability.id, adapterType: "internal" }
            };
        }`
    );
}

test("toolspace-private adapters load alongside globals", async () => {
    const root = await bootstrap();
    await writeGlobalEcho(root);
    await writeToolspacePrivateInternal(root);
    const adapters = await loadAdapters({ rootDir: root });
    assert.equal(adapters.types.size, 1, "global types preserved");
    assert.equal(adapters.toolspaceTypes.get("tly")?.size, 1);
    assert.equal(adapters.adapterCount, 2);
});

test("global capability uses global adapter; mounted capability uses private", async () => {
    const root = await bootstrap();
    await writeGlobalEcho(root);
    await writeToolspacePrivateInternal(root);
    const adapters = await loadAdapters({ rootDir: root });
    const registry = await createRegistry({ rootDir: root });
    const runtime = { workspace: { root, viaMarker: true, source: "cwd-marker" } };

    const globalRun = await executeResolvedCapability(
        resolveCapability(registry, ["echo", "say"], { args: { message: "x" } }),
        { adapters, runtime }
    );
    assert.equal(globalRun.data, "global:x", "global capability bypasses private adapter");

    const tsRun = await executeResolvedCapability(
        resolveCapability(registry, ["tly", "echo", "say"], { args: { message: "x" } }),
        { adapters, runtime }
    );
    assert.equal(tsRun.data, "tly-private:x", "toolspace mount picks the private adapter");
});

test("toolspace falls back to global adapter when no private one exists", async () => {
    const root = await bootstrap();
    await writeGlobalEcho(root);
    // NO private adapter written.
    const adapters = await loadAdapters({ rootDir: root });
    const registry = await createRegistry({ rootDir: root });
    const runtime = { workspace: { root, viaMarker: true, source: "cwd-marker" } };

    const tsRun = await executeResolvedCapability(
        resolveCapability(registry, ["tly", "echo", "say"], { args: { message: "x" } }),
        { adapters, runtime }
    );
    assert.equal(tsRun.data, "global:x");
});
