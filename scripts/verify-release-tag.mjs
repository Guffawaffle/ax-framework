import { spawnSync } from "node:child_process";

const [tagName, expectedTarget] = process.argv.slice(2);
if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(tagName ?? "")) {
  throw new Error("release tag name must be an exact vMAJOR.MINOR.PATCH identity");
}
if (!/^[a-f0-9]{40}$/i.test(expectedTarget ?? "")) {
  throw new Error("expected release target must be an exact commit SHA");
}

const result = spawnSync(
  "git",
  ["cat-file", "tag", "refs/tags/" + tagName],
  { encoding: "utf8" },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(result.stderr.trim() || "cannot read annotated release tag");
}

const headers = new Map();
for (const line of result.stdout.split(/\r?\n/)) {
  if (line === "") break;
  const separator = line.indexOf(" ");
  if (separator < 1) {
    throw new Error("release tag object contains a malformed header");
  }
  const name = line.slice(0, separator);
  const value = line.slice(separator + 1);
  if (headers.has(name)) {
    throw new Error("release tag object repeats the " + name + " header");
  }
  headers.set(name, value);
}

if (headers.get("object")?.toLowerCase() !== expectedTarget.toLowerCase()) {
  throw new Error("release tag object does not name the expected commit");
}
if (headers.get("type") !== "commit") {
  throw new Error("release tag object target type must be commit");
}
if (headers.get("tag") !== tagName) {
  throw new Error(
    "release tag object embeds " +
      JSON.stringify(headers.get("tag")) +
      ", expected " +
      JSON.stringify(tagName),
  );
}
