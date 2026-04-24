import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRegistry } from "../src/core/registry.js";
import { detectFamilyDrift } from "../src/core/drift.js";
import { inspectRegistry } from "../src/core/doctor.js";

async function bootstrap() {
    const root = await mkdtemp(path.join(os.tmpdir(), "axf-drift-"));
    await mkdir(path.join(root, "manifests", "capabilities"), { recursive: true });
    await mkdir(path.join(root, "manifests", "families"), { recursive: true });
    await writeFile(path.join(root, "axf.workspace.json"), "{}\n");
    return root;
}

const FAMILY_V1 = {
    manifestVersion: "axf/v0",
    family: "git",
    scope: "global",
    provider: "git",
    adapterType: "cli",
    executionTarget: { command: "git" },
    providerArgStyle: "double-dash-kebab",
    outputModes: ["text"],
    sideEffects: "read",
    lifecycleState: "active",
    owner: "import",
    commands: {
        log: {
            executionTarget: { command: "git", args: ["log"] },
            args: {
                "max-count": { type: "string" }
            }
        }
    }
};

async function writeMaterializedLog(root, overrides = {}) {
    const manifest = {
        manifestVersion: "axf/v0",
        id: "global.git.log",
        summary: "Show commit log",
        provider: "git",
        adapterType: "cli",
        executionTarget: { command: "git", args: ["log"] },
        argsSchema: { type: "object", properties: { "max-count": { type: "string" } } },
        outputModes: ["text"],
        sideEffects: "read",
        scope: "global",
        lifecycleState: "active",
        defaults: {},
        policies: [],
        owner: "user",
        argMap: { "max-count": "--max-count" },
        sourceFamily: { family: "git", command: "log", manifestPath: "manifests/families/git.family.json" },
        ...overrides
    };
    await writeFile(
        path.join(root, "manifests", "capabilities", "global.git.log.json"),
        JSON.stringify(manifest, null, 2)
    );
}

test("no drift when materialized capability matches family", async () => {
    const root = await bootstrap();
    await writeFile(
        path.join(root, "manifests", "families", "git.family.json"),
        JSON.stringify(FAMILY_V1, null, 2)
    );
    await writeMaterializedLog(root);
    const registry = await createRegistry({ rootDir: root });
    const drift = detectFamilyDrift(registry);
    assert.deepEqual(drift, []);
});

test("detects family added args (args-added)", async () => {
    const root = await bootstrap();
    const v2 = structuredClone(FAMILY_V1);
    v2.commands.log.args.oneline = { type: "boolean" };
    await writeFile(
        path.join(root, "manifests", "families", "git.family.json"),
        JSON.stringify(v2, null, 2)
    );
    await writeMaterializedLog(root);
    const registry = await createRegistry({ rootDir: root });
    const drift = detectFamilyDrift(registry);
    const added = drift.find((d) => d.kind === "args-added");
    assert.ok(added);
    assert.deepEqual(added.added, ["oneline"]);
});

test("detects renamed provider flag (arg-flag-changed)", async () => {
    const root = await bootstrap();
    const v2 = structuredClone(FAMILY_V1);
    v2.commands.log.args["max-count"] = { type: "string", providerFlag: "-n" };
    await writeFile(
        path.join(root, "manifests", "families", "git.family.json"),
        JSON.stringify(v2, null, 2)
    );
    await writeMaterializedLog(root);
    const registry = await createRegistry({ rootDir: root });
    const drift = detectFamilyDrift(registry);
    const renamed = drift.find((d) => d.kind === "arg-flag-changed");
    assert.ok(renamed);
    assert.equal(renamed.familyFlag, "-n");
    assert.equal(renamed.localFlag, "--max-count");
});

test("detects executionTarget drift", async () => {
    const root = await bootstrap();
    const v2 = structuredClone(FAMILY_V1);
    v2.commands.log.executionTarget = { command: "git", args: ["log", "--decorate"] };
    await writeFile(
        path.join(root, "manifests", "families", "git.family.json"),
        JSON.stringify(v2, null, 2)
    );
    await writeMaterializedLog(root);
    const registry = await createRegistry({ rootDir: root });
    const drift = detectFamilyDrift(registry);
    assert.ok(drift.some((d) => d.kind === "execution-target-changed"));
});

test("missing source produces an error-level drift item", async () => {
    const root = await bootstrap();
    // No family file at all.
    await writeMaterializedLog(root);
    const registry = await createRegistry({ rootDir: root });
    const drift = detectFamilyDrift(registry);
    assert.equal(drift.length, 1);
    assert.equal(drift[0].kind, "missing-source");
});

test("doctor surfaces drift in issues + report.drift", async () => {
    const root = await bootstrap();
    const v2 = structuredClone(FAMILY_V1);
    v2.commands.log.args.oneline = { type: "boolean" };
    await writeFile(
        path.join(root, "manifests", "families", "git.family.json"),
        JSON.stringify(v2, null, 2)
    );
    await writeMaterializedLog(root);
    const registry = await createRegistry({ rootDir: root });
    const report = inspectRegistry(registry);
    assert.ok(report.drift.length > 0, "report should expose drift array");
    assert.ok(
        report.issues.some((i) => /^drift:/.test(i.message)),
        "doctor issues should include drift entries"
    );
});
