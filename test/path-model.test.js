import test from "node:test";
import assert from "node:assert/strict";
import { parseCapabilityInput } from "../src/core/path-model.js";

test("parses fully qualified capability ids", () => {
  const registry = { hasToolspace: () => false };

  assert.deepEqual(parseCapabilityInput(registry, ["global.echo.say"]), {
    kind: "id",
    id: "global.echo.say"
  });
});

test("parses global module capability paths", () => {
  const registry = { hasToolspace: () => false };

  assert.deepEqual(parseCapabilityInput(registry, ["echo", "say"]), {
    kind: "path",
    scope: "global",
    toolspace: null,
    module: "echo",
    capabilityPath: "say"
  });
});

test("parses toolspace-mounted module capability paths", () => {
  const registry = { hasToolspace: (name) => name === "toy" };

  assert.deepEqual(parseCapabilityInput(registry, ["toy", "echo", "say"]), {
    kind: "path",
    scope: "toolspace-local",
    toolspace: "toy",
    module: "echo",
    capabilityPath: "say"
  });
});
