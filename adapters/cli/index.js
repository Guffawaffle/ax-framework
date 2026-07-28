import { spawnSync } from "node:child_process";
import { resolveCliLaunchPlan } from "../../src/core/cli-launch-plan.js";
import { prepareCommandInvocation } from "../../src/core/command-invocation.js";

const MAX_FAILURE_OUTPUT_CHARS = 8192;
const MAX_ERROR_MESSAGE_CHARS = 1000;

export async function execute(resolved, ctx = {}) {
  const { capability, args } = resolved;
  const launchPlan = resolveCliLaunchPlan(capability, {
    runtime: ctx.runtime ?? null,
  });
  const cliArgs = [
    ...launchPlan.argsPrefix,
    ...argsToCliArgs(args, capability),
  ];
  const invocation = prepareCommandInvocation(launchPlan.command, cliArgs, {
    env: ctx.runtime?.env ?? process.env,
    platform: ctx.runtime?.platform ?? process.platform,
  });
  const meta = buildLaunchMeta(capability, invocation, launchPlan);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: launchPlan.cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    return {
      ok: false,
      error: { message: result.error.message },
      meta,
    };
  }

  if (result.status !== 0) {
    const stdout = result.stdout?.trim() ?? "";
    const stderr = result.stderr?.trim() ?? "";
    const parsed = parseJson(stdout);
    const plainFailureData = parsed.ok
      ? null
      : buildPlainFailureData({ stdout, stderr });
    return {
      ok: false,
      ...(parsed.ok
        ? { data: parsed.value }
        : plainFailureData
          ? { data: plainFailureData }
          : {}),
      error: {
        message: boundedTail(
          stderr || stdout || `process exited with status ${result.status}`,
          MAX_ERROR_MESSAGE_CHARS,
        ).text,
      },
      meta: {
        ...meta,
        status: result.status,
      },
    };
  }

  const stdout = result.stdout?.trim() ?? "";
  return {
    ok: true,
    data: parseJsonMaybe(stdout),
    meta,
  };
}

function buildLaunchMeta(capability, invocation, launchPlan) {
  return {
    capabilityId: capability.id,
    adapterType: "cli",
    command: invocation.command,
    args: invocation.args,
    cwd: launchPlan.cwd,
    launchPlan: {
      command: invocation.command,
      args: invocation.args,
      cwd: launchPlan.cwd,
      cwdSource: launchPlan.cwdSource,
      requestedCommand: invocation.requestedCommand,
      resolvedCommand: invocation.resolvedCommand,
      commandSource: invocation.commandSource,
      launchStrategy: invocation.launchStrategy,
      targetPath: launchPlan.targetPath,
      targetSource: launchPlan.targetSource,
    },
  };
}

function argsToCliArgs(args, capability) {
  const argMap = capability?.argMap ?? null;
  return Object.entries(args)
    .flatMap(([key, value]) => {
      const flag = argMap?.[key] ?? `--${key}`;
      if (value === true) {
        return [flag];
      }
      if (value === false || value === undefined || value === null) {
        return [];
      }
      return [flag, String(value)];
    });
}

function parseJsonMaybe(value) {
  if (!value) {
    return "";
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseJson(value) {
  if (!value) return { ok: false, value: null };
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, value: null };
  }
}

function buildPlainFailureData({ stdout, stderr }) {
  const failureOutput = {};
  if (stdout) failureOutput.stdout = boundedTail(stdout, MAX_FAILURE_OUTPUT_CHARS);
  if (stderr) failureOutput.stderr = boundedTail(stderr, MAX_FAILURE_OUTPUT_CHARS);
  return Object.keys(failureOutput).length > 0 ? { failureOutput } : null;
}

function boundedTail(value, maximum) {
  const codePoints = Array.from(String(value));
  return {
    text: codePoints.slice(-maximum).join(""),
    truncated: codePoints.length > maximum,
  };
}
