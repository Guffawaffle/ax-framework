import test from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "../src/core/registry.js";
import { resolveCapability } from "../src/core/resolver.js";
import { executeResolvedCapability } from "../src/core/executor.js";

const rootDir = new URL("..", import.meta.url).pathname;

test("resolves a global capability path to an explicit global id", async () => {
  const registry = await createRegistry({ rootDir });
  const resolved = resolveCapability(registry, ["echo", "say"], {
    args: { message: "hello" }
  });

  assert.equal(resolved.capability.id, "global.echo.say");
  assert.equal(resolved.capability.scope, "global");
  assert.deepEqual(resolved.args, { message: "hello" });
});

test("resolves a mounted capability without flattening it into the global id", async () => {
  const registry = await createRegistry({ rootDir });
  const resolved = resolveCapability(registry, ["toy", "echo", "say"], {
    args: { message: "hello" }
  });

  assert.equal(resolved.capability.id, "toolspace.toy.echo.say");
  assert.equal(resolved.capability.sourceCapabilityId, "global.echo.say");
  assert.equal(resolved.capability.scope, "toolspace-local");
  assert.deepEqual(resolved.args, { prefix: "toy", message: "hello" });
});

test("executes an internal global capability", async () => {
  const registry = await createRegistry({ rootDir });
  const resolved = resolveCapability(registry, ["echo", "say"], {
    args: { message: "hello" }
  });

  const result = await executeResolvedCapability(resolved);

  assert.equal(result.ok, true);
  assert.equal(result.data, "hello");
  assert.equal(result.meta.capabilityId, "global.echo.say");
});

test("executes a mounted capability with injected defaults", async () => {
  const registry = await createRegistry({ rootDir });
  const resolved = resolveCapability(registry, ["toy", "echo", "say"], {
    args: { message: "hello" }
  });

  const result = await executeResolvedCapability(resolved);

  assert.equal(result.ok, true);
  assert.equal(result.data, "toy: hello");
  assert.equal(result.meta.capabilityId, "toolspace.toy.echo.say");
  assert.equal(result.meta.sourceCapabilityId, "global.echo.say");
});
