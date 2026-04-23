import { spawnSync } from "node:child_process";
import { AxError } from "./errors.js";
import { runInternalHandler } from "../internal/handlers.js";

export async function executeResolvedCapability(resolved) {
  const { capability, args } = resolved;

  if (capability.adapterType === "internal") {
    return runInternalHandler(capability.executionTarget.handler, args, resolved);
  }

  if (capability.adapterType === "cli") {
    return runCliCapability(capability, args);
  }

  throw new AxError(`unsupported adapter type '${capability.adapterType}'`, 2);
}

function runCliCapability(capability, args) {
  const command = capability.executionTarget?.command;
  const baseArgs = capability.executionTarget?.args ?? [];
  if (!command) {
    throw new AxError(`capability '${capability.id}' is missing executionTarget.command`, 2);
  }

  const cliArgs = [...baseArgs, ...argsToCliArgs(args)];
  const result = spawnSync(command, cliArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error) {
    return {
      ok: false,
      error: {
        message: result.error.message
      },
      meta: {
        capabilityId: capability.id,
        adapterType: "cli"
      }
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: {
        message: result.stderr.trim() || `process exited with status ${result.status}`
      },
      meta: {
        capabilityId: capability.id,
        adapterType: "cli",
        status: result.status
      }
    };
  }

  const stdout = result.stdout.trim();
  return {
    ok: true,
    data: parseJsonMaybe(stdout),
    meta: {
      capabilityId: capability.id,
      adapterType: "cli",
      command,
      args: cliArgs
    }
  };
}

function argsToCliArgs(args) {
  return Object.entries(args)
    .filter(([key]) => !["json", "allow-draft"].includes(key))
    .flatMap(([key, value]) => {
      if (value === true) {
        return [`--${key}`];
      }
      if (value === false || value === undefined || value === null) {
        return [];
      }
      return [`--${key}`, String(value)];
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
