import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRegistry } from "../core/registry.js";
import { resolveCapability } from "../core/resolver.js";
import { executeResolvedCapability } from "../core/executor.js";
import { inspectRegistry } from "../core/doctor.js";
import { parseOptionTokens, splitCommandTokens } from "./options.js";
import { AxError } from "../core/errors.js";

const COMMANDS = new Set(["list", "inspect", "run", "init", "doctor", "help"]);

export async function main(argv, env = {}) {
  const cwd = env.cwd ?? process.cwd();
  const [command = "help", ...rest] = argv;

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (!COMMANDS.has(command)) {
    throw new AxError(`unknown command '${command}'. Run 'ax help'.`, 2);
  }

  const registry = await createRegistry({ rootDir: cwd });

  if (command === "list") {
    await listCommand(registry, rest);
    return;
  }

  if (command === "inspect") {
    await inspectCommand(registry, rest);
    return;
  }

  if (command === "run") {
    await runCommand(registry, rest);
    return;
  }

  if (command === "init") {
    await initCommand(cwd, rest);
    return;
  }

  if (command === "doctor") {
    await doctorCommand(registry, rest);
  }
}

async function listCommand(registry, tokens) {
  const parsed = parseOptionTokens(tokens);
  const includeDrafts = Boolean(parsed.options.all ?? parsed.options["include-drafts"]);
  const capabilities = registry.listCapabilities({ includeDrafts });

  if (parsed.options.json) {
    printJson({ capabilities });
    return;
  }

  for (const capability of capabilities) {
    const source = capability.sourceCapabilityId
      ? ` -> ${capability.sourceCapabilityId}`
      : "";
    console.log(`${capability.id} [${capability.lifecycleState}]${source}`);
  }
}

async function inspectCommand(registry, tokens) {
  const { pathTokens, options } = splitCommandTokens(tokens);
  if (pathTokens.length === 0) {
    throw new AxError("inspect requires a capability id or CLI path", 2);
  }

  const resolved = registry.resolveInspectable(pathTokens);

  if (options.json) {
    printJson(resolved);
    return;
  }

  console.log(`${resolved.capability.id}`);
  console.log(`summary: ${resolved.capability.summary}`);
  console.log(`scope: ${resolved.capability.scope}`);
  console.log(`lifecycle: ${resolved.capability.lifecycleState}`);
  console.log(`adapter: ${resolved.capability.adapterType}`);
  if (resolved.capability.sourceCapabilityId) {
    console.log(`source: ${resolved.capability.sourceCapabilityId}`);
  }
  if (Object.keys(resolved.injectedDefaults).length > 0) {
    console.log(`defaults: ${JSON.stringify(resolved.injectedDefaults)}`);
  }
}

async function runCommand(registry, tokens) {
  const { pathTokens, options } = splitCommandTokens(tokens);
  if (pathTokens.length === 0) {
    throw new AxError("run requires a capability id or CLI path", 2);
  }

  const resolved = resolveCapability(registry, pathTokens, {
    args: options,
    allowDraft: Boolean(options["allow-draft"])
  });
  const result = await executeResolvedCapability(resolved);

  if (options.json) {
    printJson(result);
    return;
  }

  if (result.ok) {
    if (typeof result.data === "string") {
      console.log(result.data);
    } else {
      console.log(JSON.stringify(result.data, null, 2));
    }
    return;
  }

  throw new AxError(result.error?.message ?? "capability execution failed", 1);
}

async function initCommand(rootDir, tokens) {
  const [kind, nameOrId] = tokens;
  if (!kind || !nameOrId) {
    throw new AxError("init requires 'toolspace <name>' or 'capability <id>'", 2);
  }

  if (kind === "toolspace") {
    await initToolspace(rootDir, nameOrId);
    return;
  }

  if (kind === "capability") {
    await initCapability(rootDir, nameOrId);
    return;
  }

  throw new AxError(`unknown init kind '${kind}'`, 2);
}

async function initToolspace(rootDir, name) {
  assertSafeName(name, "toolspace");
  const filePath = path.join(rootDir, "manifests", "toolspaces", `${name}.mount.json`);
  const manifest = {
    toolspace: name,
    lifecycleState: "draft",
    moduleMounts: {}
  };
  await writeJsonFile(filePath, manifest);
  console.log(`created draft toolspace mount: ${path.relative(rootDir, filePath)}`);
}

async function initCapability(rootDir, id) {
  assertCapabilityId(id);
  const fileName = `${id}.json`;
  const filePath = path.join(rootDir, "manifests", "capabilities", fileName);
  const manifest = {
    id,
    summary: "Draft AX capability",
    provider: "draft",
    adapterType: "internal",
    executionTarget: {
      handler: "draft.todo"
    },
    argsSchema: {
      type: "object",
      properties: {}
    },
    outputModes: ["json"],
    sideEffects: "unknown",
    scope: id.startsWith("global.") ? "global" : "toolspace-local",
    lifecycleState: "draft",
    defaults: {},
    policies: [],
    owner: "draft"
  };
  await writeJsonFile(filePath, manifest);
  console.log(`created draft capability: ${path.relative(rootDir, filePath)}`);
}

async function doctorCommand(registry, tokens) {
  const parsed = parseOptionTokens(tokens);
  const report = inspectRegistry(registry);

  if (parsed.options.json) {
    printJson(report);
    return;
  }

  console.log(`capabilities: ${report.capabilityCount}`);
  console.log(`toolspaces: ${report.toolspaceCount}`);

  if (report.issues.length === 0) {
    console.log("issues: none");
    return;
  }

  console.log("issues:");
  for (const issue of report.issues) {
    console.log(`- ${issue.severity}: ${issue.message}`);
  }
}

function printHelp() {
  console.log(`AX framework prototype

Usage:
  ax list [--all] [--json]
  ax inspect <id-or-path> [--json]
  ax run <id-or-path> [--key value] [--json]
  ax init toolspace <name>
  ax init capability <fully-qualified-id>
  ax doctor [--json]

Examples:
  ax list
  ax inspect echo say
  ax inspect toy echo say
  ax run echo say --message hello
  ax run toy echo say --message hello
`);
}

function assertSafeName(name, label) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new AxError(`${label} name must match /^[a-z][a-z0-9-]*$/`, 2);
  }
}

function assertCapabilityId(id) {
  if (!/^(global|toolspace)\.[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(id)) {
    throw new AxError("capability id must be fully qualified, e.g. global.echo.say", 2);
  }
}

async function writeJsonFile(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { flag: "wx" });
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}
