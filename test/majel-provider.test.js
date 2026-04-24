import test from "node:test";
import assert from "node:assert/strict";
import { execute as majelExecute } from "../adapters/majel/index.js";

// Unit-test the provider adapter directly with synthetic upstream
// results, so we don't depend on Majel being installed for CI.

function synthTypeAdapter(upstream) {
    return { execute: async () => upstream };
}

const resolved = {
    capability: { id: "global.majel.status" }
};

test("unwraps a successful Majel envelope into axf result", async () => {
    const ctx = {
        typeAdapter: synthTypeAdapter({
            ok: true,
            data: {
                command: "ax:status",
                success: true,
                timestamp: "2026-04-23T00:00:00.000Z",
                durationMs: 17,
                data: { branch: "main", postgres: false }
            },
            meta: { capabilityId: "global.majel.status", adapterType: "cli" }
        })
    };
    const result = await majelExecute(resolved, ctx);
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, { branch: "main", postgres: false });
    assert.equal(result.meta.majel.command, "ax:status");
    assert.equal(result.meta.majel.durationMs, 17);
});

test("maps envelope success=false to axf failure with stitched message", async () => {
    const ctx = {
        typeAdapter: synthTypeAdapter({
            ok: true,
            data: {
                command: "ax:test",
                success: false,
                durationMs: 47,
                data: {},
                errors: ["PostgreSQL not running — tests require it"],
                hints: ["Run: npm run pg:start"]
            },
            meta: { capabilityId: "global.majel.test", adapterType: "cli" }
        })
    };
    const result = await majelExecute(resolved, ctx);
    assert.equal(result.ok, false);
    assert.match(result.error.message, /PostgreSQL not running/);
    assert.deepEqual(result.meta.hints, ["Run: npm run pg:start"]);
    assert.deepEqual(result.meta.majelErrors, ["PostgreSQL not running — tests require it"]);
});

test("passes through transport-level failures unchanged", async () => {
    const upstream = {
        ok: false,
        error: { message: "spawn failed" },
        meta: { capabilityId: "global.majel.status", adapterType: "cli" }
    };
    const ctx = { typeAdapter: synthTypeAdapter(upstream) };
    const result = await majelExecute(resolved, ctx);
    assert.equal(result.ok, false);
    assert.equal(result.error.message, "spawn failed");
});

test("flags non-Majel-shaped output as a structured error", async () => {
    const ctx = {
        typeAdapter: synthTypeAdapter({
            ok: true,
            data: { not: "an envelope" },
            meta: { capabilityId: "global.majel.status", adapterType: "cli" }
        })
    };
    const result = await majelExecute(resolved, ctx);
    assert.equal(result.ok, false);
    assert.match(result.error.message, /did not return a recognizable Majel envelope/);
    assert.deepEqual(result.meta.rawData, { not: "an envelope" });
});
