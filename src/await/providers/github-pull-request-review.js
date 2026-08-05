const MAX_PAGES = 10;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const SUBJECT_FIELDS = new Set([
  "repository",
  "headSha",
  "pullRequestNumber",
]);
const CONDITION_FIELDS = new Set(["type", "reviewer"]);
const REVIEWER_FIELDS = new Set(["login", "type"]);
const REVIEWER_TYPES = new Set(["Bot", "User"]);
const SATISFIED_REVIEW_STATES = new Set([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
]);
const REVIEW_STATES = new Set([
  ...SATISFIED_REVIEW_STATES,
  "DISMISSED",
  "PENDING",
]);

export async function observeGithubPullRequestReview(descriptor, context) {
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

  const reviews = await loadReviews(api, request.pullRequestNumber);
  const matchingReviews = reviews
    .filter(
      (review) =>
        review.commitId === request.headSha &&
        review.reviewer.login.toLowerCase() ===
          request.reviewer.login.toLowerCase() &&
        review.reviewer.type === request.reviewer.type,
    )
    .sort((left, right) => right.id - left.id);
  const review = matchingReviews[0] ?? null;
  const terminal = review !== null && review.state !== "PENDING";
  if (terminal) {
    const terminalDrift = await detectPullHeadDrift(api, request);
    if (terminalDrift) return terminalDrift;
  }

  return {
    outcome: !terminal
      ? "pending"
      : SATISFIED_REVIEW_STATES.has(review.state)
        ? "satisfied"
        : "terminal-failed",
    retryAfterMs: 5_000,
    evidence: {
      repository: request.repository,
      pullRequestNumber: request.pullRequestNumber,
      headSha: request.headSha,
      reviewer: request.reviewer,
      review:
        review === null
          ? null
          : {
              id: review.id,
              state: review.state,
              commitId: review.commitId,
              submittedAt: review.submittedAt,
            },
    },
  };
}

async function detectPullHeadDrift(api, request) {
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
    "github.pull-request-review subject",
  );
  assertNoUnknownFields(
    descriptor.condition,
    CONDITION_FIELDS,
    "github.pull-request-review condition",
  );
  if (descriptor.condition.type !== "review-submitted") {
    throw new Error(
      "github.pull-request-review requires condition.type='review-submitted'",
    );
  }

  const repository = descriptor.subject.repository;
  if (
    typeof repository !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
  ) {
    throw new Error(
      "github.pull-request-review subject.repository must be an owner/name identity",
    );
  }
  const headSha = descriptor.subject.headSha;
  if (typeof headSha !== "string" || !/^[a-f0-9]{40}$/i.test(headSha)) {
    throw new Error(
      "github.pull-request-review subject.headSha must be an exact 40-character commit SHA",
    );
  }
  const pullRequestNumber = descriptor.subject.pullRequestNumber;
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber < 1) {
    throw new Error(
      "github.pull-request-review subject.pullRequestNumber must be a positive integer",
    );
  }

  const reviewer = descriptor.condition.reviewer;
  if (reviewer === null || typeof reviewer !== "object" || Array.isArray(reviewer)) {
    throw new Error("github.pull-request-review reviewer must be an object");
  }
  assertNoUnknownFields(
    reviewer,
    REVIEWER_FIELDS,
    "github.pull-request-review reviewer",
  );
  if (
    typeof reviewer.login !== "string" ||
    reviewer.login.length === 0 ||
    reviewer.login.length > 100
  ) {
    throw new Error(
      "github.pull-request-review reviewer.login must contain 1-100 characters",
    );
  }
  if (!REVIEWER_TYPES.has(reviewer.type)) {
    throw new Error(
      "github.pull-request-review reviewer.type must be 'Bot' or 'User'",
    );
  }

  return {
    repository,
    headSha: headSha.toLowerCase(),
    pullRequestNumber,
    reviewer: { login: reviewer.login, type: reviewer.type },
  };
}

async function loadReviews(api, pullRequestNumber) {
  const reviews = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await api.get(
      `/pulls/${pullRequestNumber}/reviews?per_page=100&page=${page}`,
    );
    if (!Array.isArray(payload)) {
      throw new Error("GitHub returned a malformed pull request reviews response");
    }
    reviews.push(...payload.map(summarizeReview));
    if (payload.length < 100) return reviews;
  }
  throw new Error(
    `GitHub returned more than ${MAX_PAGES * 100} pull request reviews`,
  );
}

function summarizeReview(review) {
  if (
    review === null ||
    typeof review !== "object" ||
    Array.isArray(review) ||
    !Number.isSafeInteger(review.id) ||
    review.id < 1 ||
    !REVIEW_STATES.has(review.state) ||
    typeof review.commit_id !== "string" ||
    !/^[a-f0-9]{40}$/i.test(review.commit_id) ||
    review.user === null ||
    typeof review.user !== "object" ||
    Array.isArray(review.user) ||
    typeof review.user.login !== "string" ||
    review.user.login.length === 0 ||
    !REVIEWER_TYPES.has(review.user.type) ||
    (review.submitted_at !== null && typeof review.submitted_at !== "string")
  ) {
    throw new Error("GitHub returned a malformed pull request review entry");
  }
  return {
    id: review.id,
    state: review.state,
    commitId: review.commit_id.toLowerCase(),
    reviewer: { login: review.user.login, type: review.user.type },
    submittedAt: review.submitted_at,
  };
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

function assertNoUnknownFields(value, allowed, label) {
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknown.length > 0) {
    throw new Error(`${label} contains unsupported fields: ${unknown.join(", ")}`);
  }
}

function bound(value, maximum) {
  return Array.from(String(value)).slice(0, maximum).join("");
}
