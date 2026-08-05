const MAX_REQUIRED_CHECKS = 32;
const MAX_PAGES = 10;
const SUCCESSFUL_CHECK_CONCLUSIONS = new Set([
  "success",
  "neutral",
  "skipped",
]);
const SUCCESSFUL_STATUS_STATES = new Set(["success"]);
const CHECK_RUN_STATUSES = new Set([
  "queued",
  "in_progress",
  "requested",
  "waiting",
  "pending",
  "completed",
]);
const COMMIT_STATUS_STATES = new Set([
  "error",
  "failure",
  "pending",
  "success",
]);
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SUBJECT_FIELDS = new Set([
  "repository",
  "headSha",
  "pullRequestNumber",
]);
const CONDITION_FIELDS = new Set(["type", "requiredChecks"]);
const SELECTOR_FIELDS = new Set(["source", "name", "appSlug"]);

export async function observeGithubRequiredChecks(descriptor, context) {
  const request = validateDescriptor(descriptor);
  const token = context.env?.GH_TOKEN ?? context.env?.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GitHub Await requires host-provided GH_TOKEN or GITHUB_TOKEN authority",
    );
  }
  if (typeof context.fetch !== "function") {
    throw new Error("GitHub Await requires a Fetch-compatible host runtime");
  }

  const api = createGithubApi({
    fetch: context.fetch,
    token,
    signal: context.signal,
    repository: request.repository,
  });

  const initialDrift = await detectPullHeadDrift(api, request);
  if (initialDrift) return initialDrift;

  const [checkRuns, statuses] = await Promise.all([
    loadCheckRuns(api, request.headSha),
    loadStatuses(api, request.headSha),
  ]);
  const observations = request.requiredChecks.map((selector) =>
    observeSelector(selector, checkRuns, statuses),
  );
  const allTerminal = observations.every((check) => check.terminal);
  const allSuccessful = observations.every((check) => check.successful);
  if (allTerminal) {
    const terminalDrift = await detectPullHeadDrift(api, request);
    if (terminalDrift) return terminalDrift;
  }

  return {
    outcome: !allTerminal
      ? "pending"
      : allSuccessful
        ? "satisfied"
        : "terminal-failed",
    retryAfterMs: 5_000,
    evidence: {
      repository: request.repository,
      headSha: request.headSha,
      pullRequestNumber: request.pullRequestNumber,
      requiredChecks: observations,
    },
  };
}

async function detectPullHeadDrift(api, request) {
  if (request.pullRequestNumber === null) return null;
  const pull = await api.get(`/pulls/${request.pullRequestNumber}`);
  const observedHeadSha = pull?.head?.sha;
  if (
    typeof observedHeadSha !== "string" ||
    !/^[a-f0-9]{40}$/i.test(observedHeadSha)
  ) {
    throw new Error("GitHub returned a malformed pull request head identity");
  }
  const normalizedObservedHeadSha = observedHeadSha.toLowerCase();
  if (normalizedObservedHeadSha === request.headSha) return null;
  return {
    outcome: "subject-drift",
    evidence: {
      repository: request.repository,
      pullRequestNumber: request.pullRequestNumber,
      expectedHeadSha: request.headSha,
      observedHeadSha: normalizedObservedHeadSha,
    },
  };
}

function validateDescriptor(descriptor) {
  assertNoUnknownFields(
    descriptor.subject,
    SUBJECT_FIELDS,
    "github.required-checks subject",
  );
  assertNoUnknownFields(
    descriptor.condition,
    CONDITION_FIELDS,
    "github.required-checks condition",
  );
  if (descriptor.condition.type !== "all-required-checks-terminal") {
    throw new Error(
      "github.required-checks requires condition.type='all-required-checks-terminal'",
    );
  }

  const repository = descriptor.subject.repository;
  if (
    typeof repository !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
  ) {
    throw new Error(
      "github.required-checks subject.repository must be an owner/name identity",
    );
  }
  const headSha = descriptor.subject.headSha;
  if (typeof headSha !== "string" || !/^[a-f0-9]{40}$/i.test(headSha)) {
    throw new Error(
      "github.required-checks subject.headSha must be an exact 40-character commit SHA",
    );
  }

  const pullRequestNumber = descriptor.subject.pullRequestNumber ?? null;
  if (
    pullRequestNumber !== null &&
    (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1)
  ) {
    throw new Error(
      "github.required-checks subject.pullRequestNumber must be a positive integer",
    );
  }

  const requiredChecks = descriptor.condition.requiredChecks;
  if (
    !Array.isArray(requiredChecks) ||
    requiredChecks.length === 0 ||
    requiredChecks.length > MAX_REQUIRED_CHECKS
  ) {
    throw new Error(
      `github.required-checks requires 1-${MAX_REQUIRED_CHECKS} explicit check selectors`,
    );
  }

  const normalized = requiredChecks.map(normalizeSelector);
  const identities = normalized.map(
    (selector) =>
      `${selector.source}:${selector.name}:${selector.appSlug ?? "*"}`,
  );
  if (new Set(identities).size !== identities.length) {
    throw new Error(
      "github.required-checks requiredChecks must not contain duplicate selectors",
    );
  }

  return {
    repository,
    headSha: headSha.toLowerCase(),
    pullRequestNumber,
    requiredChecks: normalized,
  };
}

function normalizeSelector(selector) {
  if (selector === null || typeof selector !== "object" || Array.isArray(selector)) {
    throw new Error("each required check selector must be an object");
  }
  if (selector.source !== "check-run" && selector.source !== "status") {
    throw new Error(
      "required check selector source must be 'check-run' or 'status'",
    );
  }
  if (
    typeof selector.name !== "string" ||
    selector.name.length === 0 ||
    selector.name.length > 200
  ) {
    throw new Error("required check selector name must contain 1-200 characters");
  }
  assertNoUnknownFields(selector, SELECTOR_FIELDS, "required check selector");
  if (
    selector.appSlug !== undefined &&
    (selector.source !== "check-run" ||
      typeof selector.appSlug !== "string" ||
      selector.appSlug.length === 0 ||
      selector.appSlug.length > 100)
  ) {
    throw new Error(
      "required check selector appSlug is valid only for check-run selectors",
    );
  }
  return {
    source: selector.source,
    name: selector.name,
    appSlug: selector.appSlug ?? null,
  };
}

function observeSelector(selector, checkRuns, statuses) {
  if (selector.source === "status") {
    const status = statuses.find((candidate) => candidate.context === selector.name);
    const state = status?.state ?? "missing";
    const terminal = state !== "missing" && state !== "pending";
    return {
      source: selector.source,
      name: selector.name,
      appSlug: null,
      state,
      terminal,
      successful: terminal && SUCCESSFUL_STATUS_STATES.has(state),
    };
  }

  const matches = checkRuns.filter(
    (candidate) =>
      candidate.name === selector.name &&
      (selector.appSlug === null || candidate.app?.slug === selector.appSlug),
  );
  if (selector.appSlug === null) {
    const appSlugs = new Set(matches.map((candidate) => candidate.app?.slug ?? null));
    if (appSlugs.size > 1) {
      throw new Error(
        `check-run '${selector.name}' is ambiguous; declare appSlug explicitly`,
      );
    }
  }
  const checkRun = matches[0];
  const state = checkRun?.status ?? "missing";
  const conclusion = checkRun?.conclusion ?? null;
  const terminal = state === "completed";
  return {
    source: selector.source,
    name: selector.name,
    appSlug: selector.appSlug ?? checkRun?.app?.slug ?? null,
    state,
    conclusion,
    terminal,
    successful:
      terminal && SUCCESSFUL_CHECK_CONCLUSIONS.has(conclusion ?? ""),
  };
}

async function loadCheckRuns(api, headSha) {
  const first = await api.get(
    `/commits/${headSha}/check-runs?filter=latest&per_page=100&page=1`,
  );
  assertCheckRunsPayload(first);
  const runs = first.check_runs.map(summarizeCheckRun);
  const totalCount = first.total_count;
  if (
    !Number.isInteger(totalCount) ||
    totalCount < 0 ||
    totalCount < runs.length
  ) {
    throw new Error("GitHub returned a malformed check-runs total count");
  }
  const pages = Math.min(MAX_PAGES, Math.ceil(totalCount / 100));
  if (totalCount > MAX_PAGES * 100) {
    throw new Error(
      `GitHub returned more than ${MAX_PAGES * 100} check runs for the exact head`,
    );
  }
  for (let page = 2; page <= pages; page += 1) {
    const payload = await api.get(
      `/commits/${headSha}/check-runs?filter=latest&per_page=100&page=${page}`,
    );
    assertCheckRunsPayload(payload);
    runs.push(...payload.check_runs.map(summarizeCheckRun));
  }
  return runs;
}

async function loadStatuses(api, headSha) {
  const statuses = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await api.get(
      `/commits/${headSha}/statuses?per_page=100&page=${page}`,
    );
    if (!Array.isArray(payload)) {
      throw new Error("GitHub returned a malformed commit status response");
    }
    statuses.push(...payload.map(summarizeStatus));
    if (payload.length < 100) return statuses;
  }
  throw new Error(
    `GitHub returned more than ${MAX_PAGES * 100} statuses for the exact head`,
  );
}

function createGithubApi({ fetch, token, signal, repository }) {
  const [owner, name] = repository.split("/");
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;

  return {
    async get(path) {
      const response = await fetch(`${base}${path}`, {
        method: "GET",
        signal,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "user-agent": "smartergpt-axf-await",
          "x-github-api-version": "2022-11-28",
        },
      });
      const declaredLength = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        throw new Error(
          `GitHub observation response exceeds ${MAX_RESPONSE_BYTES} bytes`,
        );
      }
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
        throw new Error(
          `GitHub observation response exceeds ${MAX_RESPONSE_BYTES} bytes`,
        );
      }
      if (!response.ok) {
        throw new Error(
          `GitHub observation failed with HTTP ${response.status}: ${bound(text, 500)}`,
        );
      }
      try {
        return text === "" ? null : JSON.parse(text);
      } catch {
        throw new Error("GitHub returned a malformed JSON observation response");
      }
    },
  };
}

function summarizeCheckRun(checkRun) {
  if (
    checkRun === null ||
    typeof checkRun !== "object" ||
    Array.isArray(checkRun) ||
    typeof checkRun.name !== "string" ||
    checkRun.name.length === 0 ||
    !CHECK_RUN_STATUSES.has(checkRun.status) ||
    (checkRun.conclusion !== null &&
      typeof checkRun.conclusion !== "string") ||
    (checkRun.app !== null &&
      (typeof checkRun.app !== "object" || Array.isArray(checkRun.app))) ||
    (checkRun.app?.slug !== null &&
      checkRun.app?.slug !== undefined &&
      typeof checkRun.app.slug !== "string")
  ) {
    throw new Error("GitHub returned a malformed check-run entry");
  }
  return {
    name: checkRun.name,
    status: checkRun.status,
    conclusion: checkRun.conclusion,
    app: { slug: checkRun.app?.slug ?? null },
  };
}

function summarizeStatus(status) {
  if (
    status === null ||
    typeof status !== "object" ||
    Array.isArray(status) ||
    typeof status.context !== "string" ||
    status.context.length === 0 ||
    !COMMIT_STATUS_STATES.has(status.state)
  ) {
    throw new Error("GitHub returned a malformed commit status entry");
  }
  return {
    context: status.context,
    state: status.state,
  };
}

function assertCheckRunsPayload(payload) {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !Array.isArray(payload.check_runs) ||
    !Object.prototype.hasOwnProperty.call(payload, "total_count")
  ) {
    throw new Error("GitHub returned a malformed check-runs response");
  }
}

function assertNoUnknownFields(value, allowed, label) {
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unknown.join(", ")}`);
  }
}

function bound(value, maximum) {
  return Array.from(String(value)).slice(0, maximum).join("");
}
