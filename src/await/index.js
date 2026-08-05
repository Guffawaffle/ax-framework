import { AxError } from "../core/errors.js";
import {
  assertAwaitableDescriptor,
  assertAwaitDeadline,
  AWAIT_RESULT_SCHEMA_VERSION,
} from "../core/awaitable.js";
import { observeGithubRequiredChecks } from "./providers/github-required-checks.js";
import { observeGithubPullRequestReview } from "./providers/github-pull-request-review.js";
import { observeTimerFixture } from "./providers/timer-fixture.js";

const DEFAULT_POLL_MS = 5_000;
const MIN_POLL_MS = 25;
const MAX_POLL_MS = 30_000;
const DEFAULT_OBSERVATION_TIMEOUT_MS = 15_000;
const MIN_OBSERVATION_TIMEOUT_MS = 25;
const MAX_OBSERVATION_EVIDENCE_BYTES = 32 * 1024;
const OBSERVATION_FIELDS = new Set([
  "outcome",
  "retryAfterMs",
  "evidence",
]);

export async function runAwaitExternal(args, resolved, ctx = {}) {
  const descriptor = assertAwaitableDescriptor(resolveDescriptor(args));
  const deadlineMs = assertAwaitDeadline(args.deadlineMs);
  const runtime = ctx.runtime ?? {};
  const signal = ctx.signal ?? null;
  const now = runtime.awaitNow ?? Date.now;
  const wait = runtime.awaitWait ?? waitForDelay;
  const maxObservationMs = clampObservationTimeoutMs(
    runtime.awaitObservationTimeoutMs ?? DEFAULT_OBSERVATION_TIMEOUT_MS,
  );
  const backend = resolveBackend(descriptor.kind, runtime.env ?? process.env);
  const startedAt = now();
  let observationCount = 0;
  let lastEvidence = null;

  while (true) {
    if (signal?.aborted) {
      return terminalResult("cancelled", lastEvidence);
    }

    const elapsedMs = Math.max(0, now() - startedAt);
    if (elapsedMs >= deadlineMs) {
      return terminalResult("deadline", lastEvidence);
    }

    observationCount += 1;
    const remainingBeforeObservationMs = Math.max(
      1,
      deadlineMs - (now() - startedAt),
    );
    const observationTimeoutMs = Math.min(
      remainingBeforeObservationMs,
      maxObservationMs,
    );
    const observationTimeoutSignal = AbortSignal.timeout(
      Math.ceil(observationTimeoutMs),
    );
    const observationSignal = signal
      ? AbortSignal.any([signal, observationTimeoutSignal])
      : observationTimeoutSignal;
    const observationStartedAt = now();
    let observation;
    try {
      observation = await backend(descriptor, {
        env: runtime.env ?? process.env,
        fetch: runtime.awaitFetch ?? globalThis.fetch,
        signal: observationSignal,
        observationCount,
      });
    } catch (error) {
      if (signal?.aborted) {
        return terminalResult("cancelled", lastEvidence);
      }
      if (observationTimeoutSignal.aborted) {
        if (remainingBeforeObservationMs <= maxObservationMs) {
          return terminalResult("deadline", lastEvidence);
        }
        return observationError(
          `Await provider observation exceeded ${Math.ceil(observationTimeoutMs)} ms`,
        );
      }
      return observationError(error?.message ?? String(error));
    }
    if (signal?.aborted) {
      return terminalResult("cancelled", lastEvidence);
    }
    const observationElapsedMs = Math.max(0, now() - observationStartedAt);
    if (
      observationTimeoutSignal.aborted ||
      observationElapsedMs >= observationTimeoutMs
    ) {
      if (remainingBeforeObservationMs <= maxObservationMs) {
        return terminalResult("deadline", lastEvidence);
      }
      return observationError(
        `Await provider observation exceeded ${Math.ceil(observationTimeoutMs)} ms`,
      );
    }

    try {
      validateAwaitObservation(observation, descriptor.kind);
    } catch (error) {
      return observationError(error?.message ?? String(error));
    }
    lastEvidence = observation.evidence ?? null;
    if (observation.outcome !== "pending") {
      return terminalResult(observation.outcome, lastEvidence);
    }

    const remainingMs = Math.max(0, deadlineMs - (now() - startedAt));
    const delayMs = Math.min(
      remainingMs,
      clampPollMs(observation.retryAfterMs ?? DEFAULT_POLL_MS),
    );
    try {
      await wait(delayMs, signal);
    } catch (error) {
      if (signal?.aborted) {
        return terminalResult("cancelled", lastEvidence);
      }
      return observationError(error?.message ?? String(error));
    }
  }

  function resultData(outcome, evidence) {
    return {
      schemaVersion: AWAIT_RESULT_SCHEMA_VERSION,
      provider: descriptor.kind,
      outcome,
      terminal: outcome !== "pending",
      durability: "process-bound",
      authorityModel: "host-provided",
      underlyingCancellation: false,
      effectiveDeadlineMs: deadlineMs,
      observationCount,
      evidence,
    };
  }

  function terminalResult(outcome, evidence) {
    return {
      ok: true,
      data: resultData(outcome, evidence),
      meta: buildMeta(resolved, descriptor.kind),
    };
  }

  function observationError(message) {
    return {
      ok: false,
      data: resultData("observation-error", lastEvidence),
      error: {
        message: boundMessage(message),
      },
      meta: buildMeta(resolved, descriptor.kind),
    };
  }
}

function resolveDescriptor(args) {
  const hasDescriptor = args.descriptor !== undefined;
  const hasDescriptorJson = args.descriptorJson !== undefined;
  if (hasDescriptor === hasDescriptorJson) {
    throw new AxError(
      "Await requires exactly one of descriptor or descriptorJson",
      2,
    );
  }
  if (hasDescriptor) return args.descriptor;
  try {
    return JSON.parse(args.descriptorJson);
  } catch {
    throw new AxError("descriptorJson must contain valid JSON", 2);
  }
}

function resolveBackend(kind, env) {
  if (kind === "github.pull-request-review") {
    return observeGithubPullRequestReview;
  }
  if (kind === "github.required-checks") {
    return observeGithubRequiredChecks;
  }
  if (kind === "test.timer" && env.AXF_AWAIT_ENABLE_TEST_PROVIDERS === "1") {
    return observeTimerFixture;
  }
  throw new AxError(`unsupported Await provider '${kind}'`, 2);
}

export function validateAwaitObservation(observation, provider) {
  const outcomes = new Set([
    "pending",
    "satisfied",
    "terminal-failed",
    "subject-drift",
  ]);
  if (
    observation === null ||
    typeof observation !== "object" ||
    Array.isArray(observation) ||
    !outcomes.has(observation.outcome)
  ) {
    throw new AxError(
      `Await provider '${provider}' returned an invalid observation`,
      1,
    );
  }
  const unknownFields = Object.keys(observation).filter(
    (field) => !OBSERVATION_FIELDS.has(field),
  );
  if (unknownFields.length > 0) {
    throw new AxError(
      `Await provider '${provider}' returned unsupported observation fields`,
      1,
    );
  }
  if (
    observation.retryAfterMs !== undefined &&
    (!Number.isFinite(observation.retryAfterMs) ||
      observation.retryAfterMs < 0)
  ) {
    throw new AxError(
      `Await provider '${provider}' returned an invalid retryAfterMs`,
      1,
    );
  }
  let serializedEvidence;
  try {
    serializedEvidence = JSON.stringify(observation.evidence ?? null);
  } catch {
    throw new AxError(
      `Await provider '${provider}' returned non-serializable evidence`,
      1,
    );
  }
  if (typeof serializedEvidence !== "string") {
    throw new AxError(
      `Await provider '${provider}' returned non-serializable evidence`,
      1,
    );
  }
  if (
    Buffer.byteLength(serializedEvidence, "utf8") >
    MAX_OBSERVATION_EVIDENCE_BYTES
  ) {
    throw new AxError(
      `Await provider '${provider}' evidence exceeds ${MAX_OBSERVATION_EVIDENCE_BYTES} bytes`,
      1,
    );
  }
}

function clampPollMs(value) {
  if (!Number.isFinite(value)) return DEFAULT_POLL_MS;
  return Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, Math.trunc(value)));
}

function clampObservationTimeoutMs(value) {
  if (!Number.isFinite(value)) return DEFAULT_OBSERVATION_TIMEOUT_MS;
  return Math.max(
    MIN_OBSERVATION_TIMEOUT_MS,
    Math.min(DEFAULT_OBSERVATION_TIMEOUT_MS, Math.trunc(value)),
  );
}

function buildMeta(resolved, provider) {
  return {
    capabilityId: resolved.capability.id,
    sourceCapabilityId: resolved.capability.sourceCapabilityId ?? null,
    adapterType: "internal",
    awaitProvider: provider,
  };
}

function boundMessage(value) {
  return Array.from(String(value)).slice(0, 1_000).join("");
}

function waitForDelay(delayMs, signal) {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(finish, delayMs);
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
  const error = new Error("Await observation cancelled");
  error.name = "AbortError";
  return error;
}
