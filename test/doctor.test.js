import test from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "../src/core/registry.js";
import { inspectRegistry } from "../src/core/doctor.js";

const rootDir = new URL("..", import.meta.url).pathname;

test("starter manifests pass registry doctor checks", async () => {
  const registry = await createRegistry({ rootDir });
  const report = inspectRegistry(registry);

  assert.equal(report.capabilityCount, 1);
  assert.equal(report.toolspaceCount, 1);
  assert.deepEqual(report.issues, []);
});
