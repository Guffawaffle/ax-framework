import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("prepare skips hooks in npm's transient git-dependency checkout", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts", "install-git-hooks.mjs")],
    {
      cwd: repoRoot,
      env: { ...process.env, INIT_CWD: path.dirname(repoRoot) },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Skipping git hooks outside the active AXF checkout/);
});

test("prepare is safe before the hook dev dependency is available", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "axf-prepare-"));
  try {
    const scriptsDir = path.join(root, "scripts");
    await mkdir(path.join(root, ".git"));
    await mkdir(scriptsDir);
    const scriptPath = path.join(scriptsDir, "install-git-hooks.mjs");
    await copyFile(
      path.join(repoRoot, "scripts", "install-git-hooks.mjs"),
      scriptPath,
    );

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      env: { ...process.env, INIT_CWD: root },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /simple-git-hooks is unavailable/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
