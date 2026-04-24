// Tests for the post-alpha follow-ons:
//   - `axf demote <id> --to <state>`
//   - `--allow-draft` deprecation warning to stderr
//   - `kind: "adapter"` legacy spelling accepted with warning
//   - new policies: require_active_lifecycle, forbid_network

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { evaluatePolicies, listKnownPolicies } from "../src/core/policy.js";
import { loadAdapters } from "../src/core/adapter-loader.js";
import { main } from "../src/cli/main.js";

async function tmpRoot() {
    const root = await mkdtemp(path.join(os.tmpdir(), "ax-followons-"));
    await writeFile(
        path.join(root, "axf.workspace.json"),
        JSON.stringify({ manifestVersion: "axf/v0", name: "fixture" })
    );
    await mkdir(path.join(root, "manifests", "capabilities"), { recursive: true });
    await mkdir(path.join(root, "manifests", "toolspaces"), { recursive: true });
    return root;
}

async function writeCapability(root, id, overrides = {}) {
    const file = path.join(root, "manifests", "capabilities", `${id}.json`);
    const manifest = {
        manifestVersion: "axf/v0",
        id,
        summary: "test",
        provider: "x",
        adapterType: "internal",
        executionTarget: { handler: "echo.say" },
        argsSchema: { type: "object", additionalProperties: true },
        outputModes: ["json"],
        sideEffects: "none",
        scope: "global",
        lifecycleState: "active",
        defaults: {},
        policies: [],
        owner: "test",
        ...overrides
    };
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
    return file;
}

function captureStderr(fn) {
    const original = process.stderr.write.bind(process.stderr);
    let buf = "";
    process.stderr.write = (chunk) => {
        buf += String(chunk);
        return true;
    };
    return Promise.resolve(fn()).finally(() => {
        process.stderr.write = original;
    }).then(() => buf);
}

function captureStdout(fn) {
    const original = process.stdout.write.bind(process.stdout);
    let buf = "";
    process.stdout.write = (chunk) => {
        buf += String(chunk);
        return true;
    };
    return Promise.resolve(fn()).finally(() => {
        process.stdout.write = original;
    }).then(() => buf);
}

test("policy registry exposes the new policies", () => {
    const known = listKnownPolicies();
    assert.ok(known.includes("require_active_lifecycle"));
    assert.ok(known.includes("forbid_network"));
});

test("require_active_lifecycle blocks a draft capability", () => {
    const result = evaluatePolicies(
        {
            id: "global.x.y",
            scope: "global",
            policies: ["require_active_lifecycle"],
            lifecycleState: "draft"
        },
        { workspace: { root: "/tmp", viaMarker: true, source: "explicit" } }
    );
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /require_active_lifecycle.*'draft'.*must be 'active'/);
});

test("require_active_lifecycle passes when capability is active", () => {
    const result = evaluatePolicies(
        {
            id: "global.x.y",
            scope: "global",
            policies: ["require_active_lifecycle"],
            lifecycleState: "active"
        },
        { workspace: { root: "/tmp", viaMarker: true, source: "explicit" } }
    );
    assert.equal(result.ok, true);
});

test("forbid_network rejects a capability with sideEffects 'network'", () => {
    const result = evaluatePolicies(
        {
            id: "global.x.y",
            scope: "global",
            policies: ["forbid_network"],
            lifecycleState: "active",
            sideEffects: "network"
        }
    );
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /forbid_network.*network egress/);
});

test("forbid_network also handles array-shaped sideEffects", () => {
    const result = evaluatePolicies(
        {
            id: "global.x.y",
            scope: "global",
            policies: ["forbid_network"],
            lifecycleState: "active",
            sideEffects: ["read", "network"]
        }
    );
    assert.equal(result.ok, false);
});

test("forbid_network passes for read-only/none capabilities", () => {
    const result = evaluatePolicies(
        {
            id: "global.x.y",
            scope: "global",
            policies: ["forbid_network"],
            lifecycleState: "active",
            sideEffects: "none"
        }
    );
    assert.equal(result.ok, true);
});

test("`kind: \"adapter\"` is accepted as legacy with a deprecation warning", async () => {
    const root = await tmpRoot();
    const dir = path.join(root, "adapters", "legacy");
    await mkdir(dir, { recursive: true });
    await writeFile(
        path.join(dir, "adapter.manifest.json"),
        JSON.stringify({
            manifestVersion: "axf/v0",
            kind: "adapter", // legacy spelling
            type: "legacy",
            entry: "index.js",
            lifecycleState: "active"
        })
    );
    await writeFile(
        path.join(dir, "index.js"),
        `export async function execute() { return { ok: true, data: null, meta: {} }; }`
    );
    const adapters = await loadAdapters({ rootDir: root });
    assert.ok(adapters.types.has("legacy"), "legacy adapter should still load");
    const warn = adapters.loadIssues.find(
        (i) => i.severity === "warning" && /kind 'adapter' is deprecated/.test(i.message)
    );
    assert.ok(warn, `expected deprecation warning, got ${JSON.stringify(adapters.loadIssues)}`);
});

test("`--allow-draft` emits a deprecation warning to stderr", async () => {
    const root = await tmpRoot();
    await writeCapability(root, "global.x.y", { lifecycleState: "draft" });
    const stderr = await captureStderr(async () => {
        await captureStdout(() =>
            main(["--workspace", root, "list", "--allow-draft"])
        );
    });
    assert.match(stderr, /--allow-draft is deprecated/);
});

test("`--any-lifecycle` does NOT emit the deprecation warning", async () => {
    const root = await tmpRoot();
    await writeCapability(root, "global.x.y", { lifecycleState: "draft" });
    const stderr = await captureStderr(async () => {
        await captureStdout(() =>
            main(["--workspace", root, "list", "--any-lifecycle"])
        );
    });
    assert.doesNotMatch(stderr, /deprecated/);
});

test("`axf demote <id> --to draft` rewrites an active capability", async () => {
    const root = await tmpRoot();
    const file = await writeCapability(root, "global.x.y", { lifecycleState: "active" });
    await captureStdout(() =>
        main(["--workspace", root, "demote", "global.x.y", "--to", "draft"])
    );
    const after = JSON.parse(await readFile(file, "utf8"));
    assert.equal(after.lifecycleState, "draft");
});

test("`axf demote` refuses to walk forward in the lifecycle", async () => {
    const root = await tmpRoot();
    await writeCapability(root, "global.x.y", { lifecycleState: "draft" });
    await assert.rejects(
        () => main(["--workspace", root, "demote", "global.x.y", "--to", "active"]),
        /demote refused.*not earlier/
    );
});

test("`axf demote` refuses unknown capability", async () => {
    const root = await tmpRoot();
    await assert.rejects(
        () => main(["--workspace", root, "demote", "global.nope.nope", "--to", "draft"]),
        /unknown capability/
    );
});

test("`axf demote --json` emits structured output", async () => {
    const root = await tmpRoot();
    await writeCapability(root, "global.x.y", { lifecycleState: "reviewed" });
    const out = await captureStdout(() =>
        main(["--workspace", root, "demote", "global.x.y", "--to", "draft", "--json"])
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.id, "global.x.y");
    assert.equal(parsed.lifecycleState, "draft");
    assert.equal(parsed.previousLifecycleState, "reviewed");
});
