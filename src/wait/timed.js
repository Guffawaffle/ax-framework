import { AxError } from "../core/errors.js";
import { performance } from "node:perf_hooks";
import { MAX_WAIT_MS, MIN_WAIT_MS } from "../core/awaitable.js";

export const TIMED_WAIT_RESULT_SCHEMA_VERSION = "axf/timed-wait-result/v1";

export async function runTimedWait(args, resolved, ctx = {}) {
  const durationMs = assertDurationMs(args.durationMs);
  const signal = ctx.signal ?? null;
  const runtime = ctx.runtime ?? {};
  const now = runtime.waitNow ?? (() => performance.now());
  const wait = runtime.waitDelay ?? waitForDelay;
  const startedAt = now();
  let elapsedFloorMs = 0;

  if (signal?.aborted) {
    return result("cancelled");
  }

  try {
    await wait(durationMs, signal);
    elapsedFloorMs = durationMs;
  } catch (error) {
    if (!signal?.aborted) throw error;
    return result("cancelled");
  }
  if (signal?.aborted) {
    return result("cancelled");
  }
  return result("elapsed");

  function result(outcome) {
    return {
      ok: true,
      data: {
        schemaVersion: TIMED_WAIT_RESULT_SCHEMA_VERSION,
        outcome,
        terminal: true,
        durability: "process-bound",
        requestedDurationMs: durationMs,
        elapsedMs: Math.max(elapsedFloorMs, 0, now() - startedAt),
      },
      meta: {
        capabilityId: resolved.capability.id,
        sourceCapabilityId: resolved.capability.sourceCapabilityId ?? null,
        adapterType: "internal",
      },
    };
  }
}

function assertDurationMs(value) {
  if (
    !Number.isInteger(value) ||
    value < MIN_WAIT_MS ||
    value > MAX_WAIT_MS
  ) {
    throw new AxError(
      `durationMs must be an integer between ${MIN_WAIT_MS} and ${MAX_WAIT_MS}`,
      2,
    );
  }
  return value;
}

function waitForDelay(durationMs, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(finish, durationMs);
    signal?.addEventListener("abort", abort, { once: true });

    function finish() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }

    function abort() {
      clearTimeout(timeout);
      reject(abortError());
    }
  });
}

function abortError() {
  const error = new Error("Timed wait cancelled");
  error.name = "AbortError";
  return error;
}
