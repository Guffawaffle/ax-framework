import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const verifier = path.resolve("scripts/verify-release-tag.mjs");

test("release tag policy rejects an annotated tag object aliased under another ref", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "axf-release-tag-"));
  try {
    git(root, ["init"]);
    await writeFile(path.join(root, "fixture.txt"), "release fixture\n");
    git(root, ["add", "fixture.txt"]);
    git(root, [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=AXF Test",
      "-c",
      "user.email=axf-test@example.invalid",
      "commit",
      "-m",
      "release fixture",
    ]);
    git(root, [
      "-c",
      "tag.gpgSign=false",
      "-c",
      "user.name=AXF Test",
      "-c",
      "user.email=axf-test@example.invalid",
      "tag",
      "-a",
      "v2.0.9",
      "-m",
      "annotated fixture",
    ]);
    const target = git(root, ["rev-parse", "HEAD"]).stdout.trim();
    const tagObject = git(root, [
      "rev-parse",
      "refs/tags/v2.0.9",
    ]).stdout.trim();
    git(root, ["update-ref", "refs/tags/v2.1.0", tagObject]);

    const accepted = spawnSync(
      process.execPath,
      [verifier, "v2.0.9", target],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(accepted.status, 0, accepted.stderr);

    const aliased = spawnSync(
      process.execPath,
      [verifier, "v2.1.0", target],
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(aliased.status, 0);
    assert.match(aliased.stderr, /embeds "v2\.0\.9", expected "v2\.1\.0"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result;
}
