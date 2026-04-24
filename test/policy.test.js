import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicies } from "../src/core/policy.js";

test("require_workspace_binding passes when runtime is workspace-bound", () => {
    const result = evaluatePolicies(
        { id: "global.x.y", policies: ["require_workspace_binding"] },
        { workspace: { root: "/srv/ax", viaMarker: true, source: "cwd-marker" } }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.errors, []);
});

test("require_workspace_binding fails when runtime is cwd fallback", () => {
    const result = evaluatePolicies(
        { id: "global.x.y", policies: ["require_workspace_binding"] },
        { workspace: { root: "/tmp", viaMarker: false, source: "cwd-fallback" } }
    );
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /require_workspace_binding/);
    assert.match(result.errors[0], /cwd-fallback/);
});

test("workspace-local capabilities implicitly require workspace binding", () => {
    const fail = evaluatePolicies(
        { id: "workspace.repo.status", scope: "workspace-local", policies: [] },
        { workspace: { root: "/tmp", viaMarker: false, source: "cwd-fallback" } }
    );
    assert.equal(fail.ok, false);
    assert.match(fail.errors[0], /require_workspace_binding/);

    const ok = evaluatePolicies(
        { id: "workspace.repo.status", scope: "workspace-local", policies: [] },
        { workspace: { root: "/srv/ax", viaMarker: true, source: "cwd-marker" } }
    );
    assert.equal(ok.ok, true);
});

test("unknown policy is reported as an error", () => {
    const result = evaluatePolicies(
        { id: "global.x.y", policies: ["nonexistent"] },
        { workspace: { root: "/srv/ax", viaMarker: true, source: "cwd-marker" } }
    );
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /unknown policy 'nonexistent'/);
});

test("missing runtime context fails the policy gracefully", () => {
    const result = evaluatePolicies(
        { id: "global.x.y", policies: ["require_workspace_binding"] },
        null
    );
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /require_workspace_binding/);
});
