import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  readFile,
  readdir,
  rm,
  mkdtemp,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tarballArgument = process.argv[2];
if (!tarballArgument) {
  throw new Error("usage: node scripts/smoke-packed-candidate.mjs <tarball>");
}

const tarball = path.resolve(tarballArgument);
const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "axf-packed-smoke-"));
const npmInvocation =
  process.platform === "win32"
    ? {
        command: process.env.ComSpec ?? "cmd.exe",
        prefix: ["/d", "/s", "/c", "npm.cmd"],
      }
    : { command: "npm", prefix: [] };

try {
  run("git", ["init", consumerRoot]);
  const hooksRoot = path.join(consumerRoot, ".git", "hooks");
  const sentinelHook = path.join(hooksRoot, "pre-commit");
  const sentinelContents = "#!/bin/sh\n# packed-smoke sentinel\n";
  await writeFile(sentinelHook, sentinelContents);
  const hooksBefore = (await readdir(hooksRoot)).sort();

  run(npmInvocation.command, [
    ...npmInvocation.prefix,
    "install",
    "--no-audit",
    "--no-fund",
    "--prefix",
    consumerRoot,
    tarball,
  ]);
  assert.deepEqual((await readdir(hooksRoot)).sort(), hooksBefore);
  assert.equal(await readFile(sentinelHook, "utf8"), sentinelContents);

  const packageRoot = path.join(
    consumerRoot,
    "node_modules",
    "@smartergpt",
    "axf",
  );
  const packageJson = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  const sourcePackage = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(packageJson.name, sourcePackage.name);
  assert.equal(packageJson.version, sourcePackage.version);

  const cli = run(
    process.execPath,
    [
      path.join(packageRoot, "bin", "axf.js"),
      "--project-root",
      packageRoot,
      "--execution-root",
      consumerRoot,
      "doctor",
      "--json",
    ],
    { cwd: consumerRoot },
  );
  const doctor = JSON.parse(cli.stdout);
  assert.equal(doctor.projectRoot.root, packageRoot);
  assert.equal(doctor.executionRoot.root, consumerRoot);
  assert.ok(doctor.capabilityCount > 0);

  const requests = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "packed-smoke", version: "1.0.0" },
      },
    },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  ];
  const mcp = run(
    process.execPath,
    [path.join(packageRoot, "bin", "axf-mcp.js")],
    {
      cwd: consumerRoot,
      input: requests.map((request) => JSON.stringify(request)).join("\n") + "\n",
    },
  );
  const responses = mcp.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const initialize = responses.find((response) => response.id === 1);
  const tools = responses.find((response) => response.id === 2);
  assert.equal(initialize?.result?.serverInfo?.name, "axf-mcp");
  assert.equal(tools?.result?.tools?.length, 1);
  assert.equal(tools?.result?.tools?.[0]?.name, "axf");
} finally {
  await rm(consumerRoot, { recursive: true, force: true });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result;
}
