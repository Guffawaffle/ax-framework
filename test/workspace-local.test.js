import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRegistry } from "../src/core/registry.js";
import { resolveCapability } from "../src/core/resolver.js";
import { loadAdapters } from "../src/core/adapter-loader.js";
import { executeResolvedCapability } from "../src/core/executor.js";

async function bootstrap() {
    const root = await mkdtemp(path.join(os.tmpdir(), "ax-wsl-"));
    await writeFile(
        path.join(root, "axf.workspace.json"),
        JSON.stringify({ manifestVersion: "axf/v0", name: "fixture" })
    );
    await mkdir(path.join(root, "manifests", "capabilities"), { recursive: true });

    // Inline a tiny "internal" type-adapter that just echoes args.message.
    // This keeps the test self-contained — no copies from the real repo.
    const adapterDir = path.join(root, "adapters", "internal");
    await mkdir(adapterDir, { recursive: true });
    await writeFile(
        path.join(adapterDir, "adapter.manifest.json"),
        JSON.stringify({
            manifestVersion: "axf/v0",
            kind: "type-adapter",
            type: "internal",
            entry: "index.js",
            lifecycleState: "active"
        })
    );
    await writeFile(
        path.join(adapterDir, "index.js"),
        `export async function execute(resolved) {
            return {
                ok: true,
                data: resolved.args?.message ?? null,
                meta: { capabilityId: resolved.capability.id, adapterType: "internal" }
            };
        }`
    );
    return root;
}

async function writeWsCap(root) {
    await writeFile(
        path.join(root, "manifests", "capabilities", "workspace.repo.echo.json"),
        JSON.stringify({
            manifestVersion: "axf/v0",
            id: "workspace.repo.echo",
            summary: "echo a message, workspace-local",
            provider: "internal",
            adapterType: "internal",
            executionTarget: { handler: "echo.say" },
            argsSchema: {
                type: "object",
                properties: { message: { type: "string" } },
                required: ["message"]
            },
            outputModes: ["json"],
            sideEffects: "none",
            scope: "workspace-local",
            lifecycleState: "active",
            defaults: {},
            policies: [],
            owner: "test"
        })
    );
}

test("workspace-local capability loads under the workspace.* prefix", async () => {
    const root = await bootstrap();
    await writeWsCap(root);
    const registry = await createRegistry({ rootDir: root });
    const cap = registry.getCapability("workspace.repo.echo");
    assert.ok(cap, "workspace.repo.echo should be loaded");
    assert.equal(cap.scope, "workspace-local");
});

test("workspace-local capability resolves via shorthand 'repo echo'", async () => {
    const root = await bootstrap();
    await writeWsCap(root);
    const registry = await createRegistry({ rootDir: root });
    const resolved = resolveCapability(registry, ["repo", "echo"], { args: { message: "hi" } });
    assert.equal(resolved.capability.id, "workspace.repo.echo");
});

test("workspace-local capability runs when workspace marker is present", async () => {
    const root = await bootstrap();
    await writeWsCap(root);
    const registry = await createRegistry({ rootDir: root });
    const adapters = await loadAdapters({ rootDir: root });
    const resolved = resolveCapability(registry, ["repo", "echo"], { args: { message: "hi" } });
    const result = await executeResolvedCapability(resolved, {
        adapters,
        runtime: { workspace: { root, viaMarker: true, source: "cwd-marker" } }
    });
    assert.equal(result.ok, true);
    assert.equal(result.data, "hi");
});

test("workspace-local capability refuses to run without workspace binding", async () => {
    const root = await bootstrap();
    await writeWsCap(root);
    const registry = await createRegistry({ rootDir: root });
    const adapters = await loadAdapters({ rootDir: root });
    const resolved = resolveCapability(registry, ["repo", "echo"], { args: { message: "hi" } });
    const result = await executeResolvedCapability(resolved, {
        adapters,
        runtime: { workspace: { root, viaMarker: false, source: "cwd-fallback" } }
    });
    assert.equal(result.ok, false);
    assert.match(result.error.message, /require_workspace_binding/);
});

test("manifest validator rejects workspace-local id without workspace.* prefix", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "ax-bad-"));
    await mkdir(path.join(root, "manifests", "capabilities"), { recursive: true });
    await writeFile(
        path.join(root, "manifests", "capabilities", "bad.json"),
        JSON.stringify({
            manifestVersion: "axf/v0",
            id: "global.repo.thing",
            summary: "wrong scope",
            provider: "x",
            adapterType: "internal",
            executionTarget: { handler: "echo.say" },
            argsSchema: { type: "object" },
            outputModes: ["json"],
            sideEffects: "none",
            scope: "workspace-local",
            lifecycleState: "active",
            defaults: {},
            policies: [],
            owner: "test"
        })
    );
    const registry = await createRegistry({ rootDir: root });
    assert.equal(registry.capabilities.size, 0);
    assert.ok(
        registry.loadIssues.some((i) =>
            /scope=workspace-local but id starts with 'global.'/.test(i.message)
        )
    );
});
