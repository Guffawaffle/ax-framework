#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HEALTH_VALUES = new Set(["ready", "empty", "stale", "invalid", "unavailable"]);
const FRESHNESS_VALUES = new Set(["current", "stale", "missing", "invalid"]);
const SELECTION_REASONS = new Set(["query-match", "active", "current"]);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1];
    options[key] = value && !value.startsWith("--") ? value : true;
    if (options[key] !== true) index += 1;
  }
  return options;
}

function digest(value) {
  return `sha256:${createHash("sha256").update(String(value)).digest("hex")}`;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
}

function prepareCommandInvocation(command, args, { env, platform }) {
  if (platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return {
      command: env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", command, ...args],
    };
  }
  return { command, args };
}

function warning(code, evidence) {
  return { code, digest: digest(evidence) };
}

function baseResult(request) {
  return {
    schemaVersion: "axf/context-provider/v1",
    provider: "lex",
    operation: "knowledge-context",
    health: "unavailable",
    request,
    snapshot: null,
    selection: { candidateCount: 0, selectedCount: 0, ids: [], reasons: [] },
    budget: null,
    warnings: [],
    provenance: { sourceDigest: null },
  };
}

function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateNativeResult(value) {
  if (!value || typeof value !== "object" || value.operation !== "knowledge-context") {
    return false;
  }
  if (
    !value.snapshot ||
    typeof value.snapshot !== "object" ||
    !FRESHNESS_VALUES.has(value.snapshot.freshness)
  ) {
    return false;
  }
  if (
    !value.selection ||
    typeof value.selection !== "object" ||
    !isNonNegativeInteger(value.selection.candidateCount) ||
    !isNonNegativeInteger(value.selection.selectedCount) ||
    value.selection.selectedCount > value.selection.candidateCount ||
    !Array.isArray(value.selection.reasons)
  ) {
    return false;
  }
  if (!Array.isArray(value.records)) {
    return false;
  }
  if (
    !value.budget ||
    typeof value.budget !== "object" ||
    !isNonNegativeInteger(value.budget.maxBytes) ||
    !isNonNegativeInteger(value.budget.usedBytes) ||
    !isNonNegativeInteger(value.budget.omittedRecords) ||
    value.budget.usedBytes > value.budget.maxBytes
  ) {
    return false;
  }
  return true;
}

function classifyHealth(value) {
  const freshness = value.snapshot?.freshness;
  if (freshness === "invalid") return "invalid";
  if (freshness === "stale" || freshness === "missing") return "stale";
  if (value.selection.selectedCount === 0) return "empty";
  return "ready";
}

export function queryLexKnowledgeContext(options = {}, runner = spawnSync) {
  const platform = options.platform || process.platform;
  const env = { ...(options.env || process.env) };
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const executionRoot = path.resolve(options.executionRoot || projectRoot);
  const query = String(options.query || "").slice(0, 1000);
  const branch = String(options.branch || "unknown").slice(0, 240);
  const repositoryKey = options.repositoryKey
    ? String(options.repositoryKey).slice(0, 240)
    : null;
  const limit = boundedInteger(options.limit, 5, 1, 20);
  const maxBytes = boundedInteger(options.maxBytes, 4096, 1024, 16000);
  const request = {
    projectRoot,
    executionRoot,
    query,
    branch,
    repositoryKey,
    limit,
    maxBytes,
  };
  const output = baseResult(request);
  const command =
    options.command ||
    env.AXF_SESSION_LEX_COMMAND ||
    (platform === "win32" ? "lex.cmd" : "lex");
  const args = [
    "--json",
    "knowledge",
    "context",
    query,
    "--project-root",
    projectRoot,
    "--limit",
    String(limit),
    "--max-bytes",
    String(maxBytes),
  ];
  if (repositoryKey) {
    args.push("--repository-key", repositoryKey);
  }
  const invocation = prepareCommandInvocation(command, args, {
    env,
    platform,
  });
  const result = runner(invocation.command, invocation.args, {
    cwd: executionRoot,
    env,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 20_000,
    shell: false,
  });

  if (result.error || result.status !== 0) {
    const evidence = result.error?.message || String(result.stderr || `exit ${result.status}`);
    output.warnings.push(warning(result.error ? "provider-launch-failed" : "provider-failed", evidence));
    return output;
  }

  const raw = String(result.stdout || "").trim();
  output.provenance.sourceDigest = digest(raw);
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    output.health = "invalid";
    output.warnings.push(warning("provider-invalid-json", raw));
    return output;
  }

  if (!validateNativeResult(value)) {
    output.health = "invalid";
    output.warnings.push(warning("provider-invalid-result", raw));
    return output;
  }

  output.health = classifyHealth(value);
  if (!HEALTH_VALUES.has(output.health)) output.health = "invalid";
  output.snapshot = {
    activeSnapshotId:
      typeof value.snapshot?.activeSnapshotId === "string"
        ? value.snapshot.activeSnapshotId.slice(0, 160)
        : null,
    currentSnapshotId:
      typeof value.snapshot?.currentSnapshotId === "string"
        ? value.snapshot.currentSnapshotId.slice(0, 160)
        : null,
    freshness: value.snapshot.freshness,
  };
  const records = Array.isArray(value.records) ? value.records : [];
  output.selection = {
    candidateCount: boundedInteger(value.selection?.candidateCount, 0, 0, 100000),
    selectedCount: boundedInteger(value.selection?.selectedCount, 0, 0, 100000),
    ids: records
      .map((record) => record?.id)
      .filter((id) => typeof id === "string")
      .map((id) => id.slice(0, 160))
      .slice(0, 20),
    reasons: Array.isArray(value.selection?.reasons)
      ? value.selection.reasons.filter((reason) => SELECTION_REASONS.has(reason)).slice(0, 10)
      : [],
  };
  output.budget = {
    maxBytes: boundedInteger(value.budget?.maxBytes, maxBytes, 0, Number.MAX_SAFE_INTEGER),
    usedBytes: boundedInteger(value.budget?.usedBytes, 0, 0, Number.MAX_SAFE_INTEGER),
    omittedRecords: boundedInteger(value.budget?.omittedRecords, 0, 0, 100000),
  };
  output.warnings = Array.isArray(value.warnings)
    ? value.warnings.slice(0, 20).map((item) => warning("provider-warning", item))
    : [];
  if (output.health === "invalid") {
    output.warnings.unshift(warning("provider-invalid-snapshot", raw));
  }
  return output;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const result = queryLexKnowledgeContext({
    query: args.query,
    projectRoot: args["project-root"],
    executionRoot: args["execution-root"],
    branch: args.branch,
    repositoryKey: args["repository-key"],
    limit: args.limit,
    maxBytes: args["max-bytes"],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
