import test from "node:test";
import assert from "node:assert/strict";
import { execute as stfcExecute } from "../adapters/stfc/index.js";

function synthTypeAdapter(upstream) {
  return { execute: async () => upstream };
}

const resolved = {
  capability: { id: "global.stfc.status" },
};

test("unwraps a successful STFC envelope into axf result", async () => {
  const ctx = {
    typeAdapter: synthTypeAdapter({
      ok: true,
      data: {
        command: "status",
        ok: true,
        timestamp: "2026-04-27T00:00:00.000Z",
        durationMs: 12,
        data: { repoRoot: "/tmp/stfc-fixture" },
      },
      meta: { capabilityId: "global.stfc.status", adapterType: "cli" },
    }),
  };
  const result = await stfcExecute(resolved, ctx);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, { repoRoot: "/tmp/stfc-fixture" });
  assert.equal(result.meta.stfc.command, "status");
});

test("maps STFC envelope ok=false to axf failure", async () => {
  const ctx = {
    typeAdapter: synthTypeAdapter({
      ok: true,
      data: {
        command: "build",
        ok: false,
        timestamp: "2026-04-27T00:00:00.000Z",
        durationMs: 2,
        error: {
          message: "Full Linux mod build parity is not implemented yet.",
        },
        hints: ["Use pure-tests instead."],
        data: { unsupported: true },
      },
      meta: { capabilityId: "global.stfc.build", adapterType: "cli" },
    }),
  };
  const result = await stfcExecute(resolved, ctx);
  assert.equal(result.ok, false);
  assert.match(result.error.message, /not implemented/);
  assert.deepEqual(result.meta.hints, ["Use pure-tests instead."]);
  assert.deepEqual(result.meta.data, { unsupported: true });
});

test("preserves a successful cycle source-provenance receipt", async () => {
  const sourceProvenance = {
    schemaVersion: 1,
    sourceStateKind: "dirty-worktree",
    worktreeDirty: true,
    baseCommit: "28cf62e000000000000000000000000000000000",
    baseCommitDescription:
      "HEAD is the base commit; sourceStateId also includes the disclosed working-tree state.",
    sourceStateId: `dirty-sha256:${"a".repeat(64)}`,
    worktreeFingerprint: `sha256:${"a".repeat(64)}`,
    changedPathCount: 1,
    changedPaths: [{ status: " M", path: "mods/src/patches/example.cc" }],
    changedPathsTruncated: false,
    changedPathLimit: 64,
    ignoredPathsIncluded: false,
  };
  const receipt = {
    ok: true,
    command: "cycle",
    baseCommit: sourceProvenance.baseCommit,
    sourceProvenance,
    buildHash: "ARTIFACT-SHA256",
    deployedHash: "ARTIFACT-SHA256",
    hashMatch: true,
  };
  const ctx = {
    typeAdapter: synthTypeAdapter({
      ok: true,
      data: {
        command: "cycle",
        ok: true,
        timestamp: "2026-07-27T00:00:00.000Z",
        durationMs: 42,
        data: receipt,
      },
      meta: {
        capabilityId: "global.stfc-mod-private.cycle",
        adapterType: "cli",
      },
    }),
  };

  const result = await stfcExecute(
    { capability: { id: "global.stfc-mod-private.cycle" } },
    ctx,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, receipt);
  assert.deepEqual(result.data.sourceProvenance, sourceProvenance);
  assert.equal(result.data.sourceProvenance.worktreeDirty, true);
  assert.notEqual(
    result.data.sourceProvenance.sourceStateId,
    `git:${result.data.sourceProvenance.baseCommit}`,
  );
  assert.equal(result.data.buildHash, "ARTIFACT-SHA256");
  assert.equal(result.data.deployedHash, "ARTIFACT-SHA256");
  assert.equal(result.data.hashMatch, true);
});

test("preserves distinct artifact hashes in a failed deploy receipt", async () => {
  const receipt = {
    buildHash: "BUILD-SHA256",
    deployedHash: "DEPLOYED-SHA256",
    hashMatch: false,
  };
  const ctx = {
    typeAdapter: synthTypeAdapter({
      ok: true,
      data: {
        command: "deploy-status",
        ok: false,
        timestamp: "2026-07-27T00:00:00.000Z",
        durationMs: 7,
        error: {
          message: "Built and deployed DLL hashes do not match.",
        },
        data: receipt,
      },
      meta: {
        capabilityId: "global.stfc-mod-private.deploy-status",
        adapterType: "cli",
      },
    }),
  };

  const result = await stfcExecute(
    { capability: { id: "global.stfc-mod-private.deploy-status" } },
    ctx,
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.meta.data, receipt);
  assert.equal(result.meta.data.buildHash, "BUILD-SHA256");
  assert.equal(result.meta.data.deployedHash, "DEPLOYED-SHA256");
  assert.equal(result.meta.data.hashMatch, false);
});

test("flags non-STFC-shaped output as a structured error", async () => {
  const ctx = {
    typeAdapter: synthTypeAdapter({
      ok: true,
      data: { not: "an envelope" },
      meta: { capabilityId: "global.stfc.status", adapterType: "cli" },
    }),
  };
  const result = await stfcExecute(resolved, ctx);
  assert.equal(result.ok, false);
  assert.match(
    result.error.message,
    /did not return a recognizable STFC envelope/,
  );
});
