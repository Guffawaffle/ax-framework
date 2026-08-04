import test from "node:test";
import assert from "node:assert/strict";
import { observeGithubRequiredChecks } from "../src/await/providers/github-required-checks.js";
import {
  runAwaitExternal,
  validateAwaitObservation,
} from "../src/await/index.js";
import {
  AWAITABLE_SCHEMA_VERSION,
  validateExecutionContinuations,
} from "../src/core/awaitable.js";
import { validateCapabilityManifest } from "../src/core/manifest-validator.js";
import { synthesizeFamilyCapabilities } from "../src/core/family-loader.js";

const headSha = "0123456789abcdef0123456789abcdef01234567";

test("completion manifests declare one exact observer contract", () => {
  const manifest = capabilityManifest({
    completion: {
      mode: "external-awaitable",
      descriptorSchema: AWAITABLE_SCHEMA_VERSION,
      observer: "global.await.external",
    },
  });

  assert.deepEqual(validateCapabilityManifest(manifest, "fixture"), []);
  const invalid = validateCapabilityManifest(
    {
      ...manifest,
      completion: {
        mode: "scheduler",
        descriptorSchema: "axf/awaitable/v0",
        observer: "await",
      },
    },
    "fixture",
  );
  assert.equal(invalid.filter((issue) => issue.severity === "error").length, 3);
});

test("typed continuations remain suggested invocations bound to the manifest observer", () => {
  const capability = capabilityManifest({
    completion: {
      mode: "external-awaitable",
      descriptorSchema: AWAITABLE_SCHEMA_VERSION,
      observer: "global.await.external",
    },
  });
  const continuation = {
    kind: "await-external",
    recommended: true,
    reason: "Required checks are externally owned.",
    capability: "global.await.external",
    args: {
      descriptor: githubDescriptor(),
      deadlineMs: 30_000,
    },
  };
  const result = { ok: true, data: { pushAccepted: true }, continuations: [continuation] };

  assert.equal(validateExecutionContinuations(result, capability), result);
  assert.throws(
    () =>
      validateExecutionContinuations(
        {
          ...result,
          continuations: [{ ...continuation, capability: "global.other.await" }],
        },
        capability,
      ),
    /must match completion\.observer/,
  );
  assert.throws(
    () =>
      validateExecutionContinuations(result, {
        ...capability,
        completion: undefined,
      }),
    /without a valid completion contract/,
  );
});

test("family commands preserve completion metadata when synthesized", () => {
  const [capability] = synthesizeFamilyCapabilities(
    {
      manifestVersion: "axf/v0",
      family: "demo",
      scope: "global",
      provider: "demo",
      adapterType: "internal",
      lifecycleState: "active",
      owner: "test",
      commands: {
        push: {
          summary: "Push an exact candidate",
          executionTarget: { handler: "echo.say" },
          sideEffects: "write",
          completion: {
            mode: "external-awaitable",
            descriptorSchema: AWAITABLE_SCHEMA_VERSION,
            observer: "global.await.external",
          },
        },
      },
    },
    { existingIds: new Set() },
  );

  assert.equal(capability.completion.observer, "global.await.external");
  assert.deepEqual(validateCapabilityManifest(capability, "family fixture"), []);
});

test("process-bound Await delegates short observations and owns the finite deadline loop", async () => {
  let currentMs = 0;
  const result = await runAwaitExternal(
    {
      descriptor: {
        schemaVersion: AWAITABLE_SCHEMA_VERSION,
        kind: "test.timer",
        subject: { readyAfterObservations: 3 },
        condition: { type: "observation-count" },
      },
      deadlineMs: 1_000,
    },
    resolvedAwaitCapability(),
    {
      runtime: {
        env: { AXF_AWAIT_ENABLE_TEST_PROVIDERS: "1" },
        awaitNow: () => currentMs,
        awaitWait: async (delayMs) => {
          currentMs += delayMs;
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.outcome, "satisfied");
  assert.equal(result.data.observationCount, 3);
  assert.equal(result.data.durability, "process-bound");
  assert.equal(result.data.underlyingCancellation, false);
});

test("GitHub Await distinguishes satisfied, failed, pending, and exact PR head drift", async () => {
  const satisfied = await observeGithubRequiredChecks(githubDescriptor(), {
    env: { GH_TOKEN: "test-token" },
    fetch: githubFetch({ windows: "success", macos: "neutral" }),
  });
  assert.equal(satisfied.outcome, "satisfied");
  assert.equal(satisfied.evidence.requiredChecks.length, 2);

  const failed = await observeGithubRequiredChecks(githubDescriptor(), {
    env: { GH_TOKEN: "test-token" },
    fetch: githubFetch({ windows: "failure", macos: "success" }),
  });
  assert.equal(failed.outcome, "terminal-failed");

  const pending = await observeGithubRequiredChecks(githubDescriptor(), {
    env: { GH_TOKEN: "test-token" },
    fetch: githubFetch({ windows: null, macos: "success" }),
  });
  assert.equal(pending.outcome, "pending");

  const drift = await observeGithubRequiredChecks(
    githubDescriptor({ pullRequestNumber: 42 }),
    {
      env: { GH_TOKEN: "test-token" },
      fetch: githubFetch({ pullHeadSha: "f".repeat(40) }),
    },
  );
  assert.equal(drift.outcome, "subject-drift");
  assert.equal(drift.evidence.expectedHeadSha, headSha);
  assert.equal(drift.evidence.observedHeadSha, "f".repeat(40));
});

test("GitHub Await uses the newest commit status for an explicit context", async () => {
  const descriptor = githubDescriptor();
  descriptor.condition.requiredChecks = [
    { source: "status", name: "legacy/ci" },
  ];
  const result = await observeGithubRequiredChecks(descriptor, {
    env: { GH_TOKEN: "test-token" },
    fetch: githubFetch({
      statuses: [
        { context: "legacy/ci", state: "success" },
        { context: "legacy/ci", state: "failure" },
      ],
    }),
  });

  assert.equal(result.outcome, "satisfied");
  assert.equal(result.evidence.requiredChecks[0].state, "success");
});

test("GitHub Await rejects implicit targets and missing host authority", async () => {
  await assert.rejects(
    () =>
      observeGithubRequiredChecks(
        {
          ...githubDescriptor(),
          subject: { repository: "owner/repo", headSha: "main" },
        },
        { env: {}, fetch: githubFetch({}) },
      ),
    /exact 40-character commit SHA/,
  );
  await assert.rejects(
    () =>
      observeGithubRequiredChecks(githubDescriptor(), {
        env: {},
        fetch: githubFetch({}),
      }),
    /host-provided GH_TOKEN or GITHUB_TOKEN/,
  );
});

test("Await bounds one provider observation without misreporting cancellation", async () => {
  const result = await runAwaitExternal(
    {
      descriptor: githubDescriptor(),
      deadlineMs: 1_000,
    },
    resolvedAwaitCapability(),
    {
      runtime: {
        env: { GH_TOKEN: "test-token" },
        awaitObservationTimeoutMs: 25,
        awaitFetch: async (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              "abort",
              () => reject(options.signal.reason),
              { once: true },
            );
          }),
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.data.outcome, "observation-error");
  assert.match(result.error.message, /observation exceeded 25 ms/);
});

test("Await does not accept a terminal observation after its semantic deadline", async () => {
  let currentMs = 0;
  const fetch = githubFetch();
  const result = await runAwaitExternal(
    {
      descriptor: githubDescriptor(),
      deadlineMs: 1_000,
    },
    resolvedAwaitCapability(),
    {
      runtime: {
        env: { GH_TOKEN: "test-token" },
        awaitNow: () => currentMs,
        awaitFetch: async (...args) => {
          currentMs = 1_000;
          return fetch(...args);
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.outcome, "deadline");
});

test("Await converts provider schema failures into a bounded observation error", async () => {
  const result = await runAwaitExternal(
    {
      descriptor: githubDescriptor(),
      deadlineMs: 1_000,
    },
    resolvedAwaitCapability(),
    {
      runtime: {
        env: { GH_TOKEN: "test-token" },
        awaitFetch: githubFetch({ malformedCheckRuns: true }),
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.data.outcome, "observation-error");
  assert.match(result.error.message, /malformed check-runs response/);
});

test("Await provider observations reject oversized evidence and extra fields", () => {
  assert.throws(
    () =>
      validateAwaitObservation(
        { outcome: "pending", evidence: { value: "x".repeat(33 * 1024) } },
        "test.provider",
      ),
    /evidence exceeds 32768 bytes/,
  );
  assert.throws(
    () =>
      validateAwaitObservation(
        { outcome: "satisfied", evidence: null, rawResponse: {} },
        "test.provider",
      ),
    /unsupported observation fields/,
  );
});

test("GitHub Await does not mislabel a malformed pull response as subject drift", async () => {
  await assert.rejects(
    () =>
      observeGithubRequiredChecks(
        githubDescriptor({ pullRequestNumber: 42 }),
        {
          env: { GH_TOKEN: "test-token" },
          fetch: githubFetch({ pullHeadSha: null }),
        },
      ),
    /malformed pull request head identity/,
  );
});

test("GitHub Await rechecks PR head drift before returning a terminal result", async () => {
  let pullReads = 0;
  const result = await observeGithubRequiredChecks(
    githubDescriptor({ pullRequestNumber: 42 }),
    {
      env: { GH_TOKEN: "test-token" },
      fetch: githubFetch({
        pullHeadSha: () => {
          pullReads += 1;
          return pullReads === 1 ? headSha : "f".repeat(40);
        },
      }),
    },
  );

  assert.equal(result.outcome, "subject-drift");
  assert.equal(pullReads, 2);
});

function githubDescriptor(subject = {}) {
  return {
    schemaVersion: AWAITABLE_SCHEMA_VERSION,
    kind: "github.required-checks",
    subject: {
      repository: "owner/repository",
      headSha,
      ...subject,
    },
    condition: {
      type: "all-required-checks-terminal",
      requiredChecks: [
        { source: "check-run", name: "Windows" },
        { source: "check-run", name: "macOS" },
      ],
    },
  };
}

function githubFetch({
  windows = "success",
  macos = "success",
  pullHeadSha = headSha,
  malformedCheckRuns = false,
  statuses = [],
} = {}) {
  return async (url) => {
    let body;
    if (url.includes("/pulls/")) {
      body = {
        head: {
          sha:
            typeof pullHeadSha === "function" ? pullHeadSha() : pullHeadSha,
        },
      };
    } else if (url.includes("/check-runs")) {
      const checkRun = (name, conclusion) => ({
        name,
        status: conclusion === null ? "in_progress" : "completed",
        conclusion,
        app: { slug: "github-actions" },
      });
      body = malformedCheckRuns
        ? { total_count: 2 }
        : {
            total_count: 2,
            check_runs: [checkRun("Windows", windows), checkRun("macOS", macos)],
          };
    } else if (url.includes("/statuses")) {
      body = statuses;
    } else {
      throw new Error(`unexpected GitHub URL: ${url}`);
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
    };
  };
}

function capabilityManifest(overrides = {}) {
  return {
    manifestVersion: "axf/v0",
    id: "global.demo.push",
    summary: "Push an exact candidate",
    provider: "demo",
    adapterType: "internal",
    executionTarget: { handler: "echo.say" },
    argsSchema: { type: "object", properties: {} },
    outputModes: ["json"],
    sideEffects: "write",
    scope: "global",
    lifecycleState: "active",
    defaults: {},
    policies: [],
    owner: "test",
    ...overrides,
  };
}

function resolvedAwaitCapability() {
  return {
    capability: {
      id: "global.await.external",
      sourceCapabilityId: null,
    },
  };
}
