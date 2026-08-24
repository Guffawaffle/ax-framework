import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  formatGitHubSignerOutputs,
  parseAuthorizedFingerprints,
  parseValidSignatures,
  requireAuthorizedSignature,
  writeGitHubSignerOutputs,
} from "../scripts/verify-release-signatures.mjs";

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

test("release signature policy permits separately authorized tag and commit signers", () => {
  const tagFingerprint = "A".repeat(40);
  const commitFingerprint = "B".repeat(40);
  const tagSigner = requireAuthorizedSignature({
    kind: "Release tag",
    output: `[GNUPG:] VALIDSIG ${tagFingerprint} 2026-08-24 0 4 0 1 8 00 ${tagFingerprint}`,
    status: 0,
    authorizedFingerprints: parseAuthorizedFingerprints(tagFingerprint),
  });
  const commitSigner = requireAuthorizedSignature({
    kind: "Release target commit",
    output: `[GNUPG:] VALIDSIG ${commitFingerprint} 2026-08-24 0 4 0 1 8 00 ${commitFingerprint}`,
    status: 0,
    authorizedFingerprints: parseAuthorizedFingerprints(commitFingerprint),
  });

  assert.equal(tagSigner, tagFingerprint);
  assert.equal(commitSigner, commitFingerprint);
});

test("release signature policy rejects a signer outside its object-specific allowlist", () => {
  const tagFingerprint = "A".repeat(40);
  const commitFingerprint = "B".repeat(40);
  assert.throws(
    () => requireAuthorizedSignature({
      kind: "Release target commit",
      output: `[GNUPG:] VALIDSIG ${commitFingerprint} 2026-08-24 0 4 0 1 8 00 ${commitFingerprint}`,
      status: 0,
      authorizedFingerprints: parseAuthorizedFingerprints(tagFingerprint),
    }),
    /Release target commit signer fingerprint is not authorized/,
  );
});

test("release signature policy rejects failed or ambiguous git verification", () => {
  const fingerprint = "A".repeat(40);
  const line = `[GNUPG:] VALIDSIG ${fingerprint} 2026-08-24 0 4 0 1 8 00 ${fingerprint}`;
  assert.deepEqual(parseValidSignatures(`${line}\n${line}`), [fingerprint, fingerprint]);
  assert.throws(
    () => requireAuthorizedSignature({
      kind: "Release tag",
      output: line,
      status: 1,
      authorizedFingerprints: parseAuthorizedFingerprints(fingerprint),
    }),
    /git status 1/,
  );
  assert.throws(
    () => requireAuthorizedSignature({
      kind: "Release tag",
      output: `${line}\n${line}`,
      status: 0,
      authorizedFingerprints: parseAuthorizedFingerprints(fingerprint),
    }),
    /found 2/,
  );
});

test("release signature evidence exports exact object-specific signer outputs", () => {
  const tagFingerprint = "A".repeat(40);
  const commitFingerprint = "B".repeat(40);
  assert.equal(
    formatGitHubSignerOutputs(tagFingerprint, commitFingerprint),
    `tag_signer=${tagFingerprint}\ncommit_signer=${commitFingerprint}\n`,
  );
  assert.throws(
    () => formatGitHubSignerOutputs("", commitFingerprint),
    /exact uppercase 40-hex fingerprints/,
  );
  assert.throws(
    () => parseAuthorizedFingerprints("not-a-fingerprint"),
    /exact 40-hex fingerprints/,
  );
});

test("release signature evidence writes both outputs and fails closed before malformed evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "axf-release-output-"));
  const output = path.join(root, "github-output.txt");
  const tagFingerprint = "A".repeat(40);
  const commitFingerprint = "B".repeat(40);
  try {
    writeGitHubSignerOutputs(output, tagFingerprint, commitFingerprint);
    const accepted = await readFile(output, "utf8");
    assert.equal(
      accepted,
      `tag_signer=${tagFingerprint}\ncommit_signer=${commitFingerprint}\n`,
    );
    assert.throws(
      () => writeGitHubSignerOutputs(output, tagFingerprint, ""),
      /exact uppercase 40-hex fingerprints/,
    );
    assert.equal(await readFile(output, "utf8"), accepted);
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
