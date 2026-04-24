import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli/main.js";
import { createRegistry } from "../src/core/registry.js";

async function bootstrapWorkspace() {
    const root = await mkdtemp(path.join(os.tmpdir(), "ax-promote-"));
    await writeFile(
        path.join(root, "axf.workspace.json"),
        JSON.stringify({ manifestVersion: "axf/v0", name: "fixture" })
    );
    await mkdir(path.join(root, "manifests", "capabilities"), { recursive: true });
    await mkdir(path.join(root, "adapters"), { recursive: true });
    return root;
}

async function writeCapability(root, manifest) {
    const filePath = path.join(root, "manifests", "capabilities", `${manifest.id}.json`);
    await writeFile(filePath, JSON.stringify(manifest, null, 2) + "\n");
    return filePath;
}

function baseCap(overrides = {}) {
    return {
        manifestVersion: "axf/v0",
        id: "global.demo.thing",
        summary: "demo",
        provider: "demo",
        adapterType: "internal",
        executionTarget: { handler: "echo.say" },
        argsSchema: { type: "object", properties: {} },
        outputModes: ["json"],
        sideEffects: "none",
        scope: "global",
        lifecycleState: "draft",
        defaults: {},
        policies: [],
        owner: "test",
        ...overrides
    };
}

test("promote rewrites lifecycleState in place", async () => {
    const root = await bootstrapWorkspace();
    const filePath = await writeCapability(root, baseCap());

    await main(["--workspace", root, "promote", "global.demo.thing", "--to", "active"]);
    const reread = JSON.parse(await readFile(filePath, "utf8"));
    assert.equal(reread.lifecycleState, "active");
});

test("promote refuses unknown lifecycleState", async () => {
    const root = await bootstrapWorkspace();
    await writeCapability(root, baseCap());
    await assert.rejects(
        () => main(["--workspace", root, "promote", "global.demo.thing", "--to", "wrong"]),
        /unknown lifecycleState 'wrong'/
    );
});

test("promote refuses unknown capability", async () => {
    const root = await bootstrapWorkspace();
    await assert.rejects(
        () => main(["--workspace", root, "promote", "global.no.such", "--to", "active"]),
        /unknown capability 'global.no.such'/
    );
});

test("promote no-ops when target equals current", async () => {
    const root = await bootstrapWorkspace();
    const filePath = await writeCapability(root, baseCap({ lifecycleState: "active" }));
    const before = await readFile(filePath, "utf8");
    await main(["--workspace", root, "promote", "global.demo.thing", "--to", "active"]);
    const after = await readFile(filePath, "utf8");
    assert.equal(before, after);
});

test("promote refuses to write a manifest that would fail validation", async () => {
    const root = await bootstrapWorkspace();
    // Hand-craft a manifest that's already invalid except for lifecycleState being draft.
    const cap = baseCap({ lifecycleState: "draft" });
    delete cap.summary; // forces validator failure
    await writeCapability(root, cap);
    // Registry strict-load will reject this manifest, so promote sees no
    // capability and gives the unknown-capability error rather than writing.
    const registry = await createRegistry({ rootDir: root });
    assert.equal(registry.capabilities.size, 0);
    await assert.rejects(
        () => main(["--workspace", root, "promote", "global.demo.thing", "--to", "active"]),
        /unknown capability/
    );
});
