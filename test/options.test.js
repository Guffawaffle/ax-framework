import test from "node:test";
import assert from "node:assert/strict";
import { parseOptionTokens, splitCommandTokens } from "../src/cli/options.js";

test("parses --key value pairs as strings by default", () => {
    const { options } = parseOptionTokens(["--name", "alice", "--count", "5"]);
    assert.deepEqual(options, { name: "alice", count: "5" });
});

test("does not coerce numeric strings (schema owns coercion)", () => {
    const { options } = parseOptionTokens(["--limit", "42"]);
    assert.equal(options.limit, "42");
});

test("only literal true/false coerce to booleans", () => {
    const { options } = parseOptionTokens([
        "--a",
        "true",
        "--b=false",
        "--c",
        "yes"
    ]);
    assert.equal(options.a, true);
    assert.equal(options.b, false);
    assert.equal(options.c, "yes");
});

test("bare flags become true", () => {
    const { options } = parseOptionTokens(["--verbose", "--name", "x"]);
    assert.equal(options.verbose, true);
    assert.equal(options.name, "x");
});

test("--key=value form works", () => {
    const { options } = parseOptionTokens(["--name=alice", "--count=5"]);
    assert.deepEqual(options, { name: "alice", count: "5" });
});

test("splitCommandTokens splits at first --flag", () => {
    const { pathTokens, options } = splitCommandTokens([
        "echo",
        "say",
        "--message",
        "hi"
    ]);
    assert.deepEqual(pathTokens, ["echo", "say"]);
    assert.deepEqual(options, { message: "hi" });
});

test("empty option name throws", () => {
    assert.throws(() => parseOptionTokens(["--", "x"]), /empty option name/);
});
