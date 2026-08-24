import test from "node:test";
import assert from "node:assert/strict";
import {
  runTimedWait,
  TIMED_WAIT_RESULT_SCHEMA_VERSION,
} from "../src/wait/timed.js";

test("timed wait elapses once with bounded process-bound evidence", async () => {
  let currentMs = 10_000;
  let delayCalls = 0;
  const result = await runTimedWait(
    { durationMs: 900_000 },
    resolvedTimedWaitCapability(),
    {
      runtime: {
        waitNow: () => currentMs,
        waitDelay: async (durationMs) => {
          delayCalls += 1;
          currentMs += durationMs;
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.schemaVersion, TIMED_WAIT_RESULT_SCHEMA_VERSION);
  assert.equal(result.data.outcome, "elapsed");
  assert.equal(result.data.terminal, true);
  assert.equal(result.data.durability, "process-bound");
  assert.equal(result.data.requestedDurationMs, 900_000);
  assert.equal(result.data.elapsedMs, 900_000);
  assert.equal(delayCalls, 1);
});

test("timed wait cancellation stops only the process-bound timer", async () => {
  const controller = new AbortController();
  let currentMs = 0;
  const result = await runTimedWait(
    { durationMs: 30_000 },
    resolvedTimedWaitCapability(),
    {
      signal: controller.signal,
      runtime: {
        waitNow: () => currentMs,
        waitDelay: async (_durationMs, signal) => {
          currentMs = 250;
          controller.abort();
          if (signal.aborted) throw signal.reason;
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.outcome, "cancelled");
  assert.equal(result.data.elapsedMs, 250);
});

test("timed wait reports its duration when an injected clock rolls backward", async () => {
  let currentMs = 10_000;
  const result = await runTimedWait(
    { durationMs: 1_000 },
    resolvedTimedWaitCapability(),
    {
      runtime: {
        waitNow: () => currentMs,
        waitDelay: async (durationMs) => {
          currentMs -= durationMs;
        },
      },
    },
  );

  assert.equal(result.data.outcome, "elapsed");
  assert.equal(result.data.elapsedMs, 1_000);
});

test("timed wait enforces the shared 30-minute bound", async () => {
  for (const durationMs of [999, 1_800_001, 1.5, null]) {
    await assert.rejects(
      () => runTimedWait({ durationMs }, resolvedTimedWaitCapability()),
      /durationMs must be an integer between 1000 and 1800000/,
    );
  }
});

function resolvedTimedWaitCapability() {
  return {
    capability: {
      id: "global.wait.timed",
      sourceCapabilityId: null,
    },
  };
}
