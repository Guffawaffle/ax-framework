import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function parseAuthorizedFingerprints(value) {
  const fingerprints = value
    .split(/[,;\s]+/u)
    .filter(Boolean)
    .map((fingerprint) => fingerprint.toUpperCase());
  if (
    fingerprints.length === 0 ||
    fingerprints.some((fingerprint) => !/^[0-9A-F]{40}$/u.test(fingerprint))
  ) {
    throw new Error("authorized signer lists require exact 40-hex fingerprints");
  }
  return new Set(fingerprints);
}

export function parseValidSignatures(output) {
  return [...output.matchAll(/^\[GNUPG:\] VALIDSIG ([0-9A-F]{40})(?:\s|$)/gimu)]
    .map((match) => match[1].toUpperCase());
}

export function requireAuthorizedSignature({
  kind,
  output,
  status,
  authorizedFingerprints,
}) {
  const signatures = parseValidSignatures(output);
  if (status !== 0 || signatures.length !== 1) {
    throw new Error(
      `${kind} must have exactly one valid signature (git status ${status}, found ${signatures.length})`,
    );
  }
  const [fingerprint] = signatures;
  if (!authorizedFingerprints.has(fingerprint)) {
    throw new Error(`${kind} signer fingerprint is not authorized`);
  }
  return fingerprint;
}

export function formatGitHubSignerOutputs(tagSigner, commitSigner) {
  if (!/^[0-9A-F]{40}$/u.test(tagSigner) || !/^[0-9A-F]{40}$/u.test(commitSigner)) {
    throw new Error("GitHub signer outputs require exact uppercase 40-hex fingerprints");
  }
  return `tag_signer=${tagSigner}\ncommit_signer=${commitSigner}\n`;
}

export function writeGitHubSignerOutputs(outputPath, tagSigner, commitSigner) {
  appendFileSync(outputPath, formatGitHubSignerOutputs(tagSigner, commitSigner));
}

function verifyGitObject(args, kind, authorizedFingerprints) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  return requireAuthorizedSignature({
    kind,
    output,
    status: result.status,
    authorizedFingerprints,
  });
}

function main() {
  const [tag, target, tagFingerprints, commitFingerprints] = process.argv.slice(2);
  if (!tag || !target || !tagFingerprints || !commitFingerprints) {
    throw new Error(
      "usage: verify-release-signatures.mjs <tag> <target> <tag-fingerprints> <commit-fingerprints>",
    );
  }
  const tagSigner = verifyGitObject(
    ["verify-tag", "--raw", tag],
    "Release tag",
    parseAuthorizedFingerprints(tagFingerprints),
  );
  const commitSigner = verifyGitObject(
    ["verify-commit", "--raw", target],
    "Release target commit",
    parseAuthorizedFingerprints(commitFingerprints),
  );
  process.stdout.write(
    `Authorized release identities: tag ${tagSigner}; commit ${commitSigner}\n`,
  );
  if (process.env.GITHUB_OUTPUT) {
    writeGitHubSignerOutputs(
      process.env.GITHUB_OUTPUT,
      tagSigner,
      commitSigner,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
