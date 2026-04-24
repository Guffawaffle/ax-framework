import test from "node:test";
import assert from "node:assert/strict";
import { validateAndCoerce } from "../src/core/schema-validator.js";

test("coerces string-integer to integer", () => {
    const { valid, value } = validateAndCoerce(
        { type: "object", properties: { n: { type: "integer" } } },
        { n: "5" }
    );
    assert.equal(valid, true);
    assert.equal(value.n, 5);
});

test("rejects wrong type", () => {
    const { valid, errors } = validateAndCoerce(
        { type: "object", properties: { n: { type: "integer" } } },
        { n: "abc" }
    );
    assert.equal(valid, false);
    assert.match(errors[0].message, /expected integer/);
});

test("enforces required properties", () => {
    const { valid, errors } = validateAndCoerce(
        { type: "object", required: ["x"], properties: { x: { type: "string" } } },
        {}
    );
    assert.equal(valid, false);
    assert.match(errors[0].message, /required/);
});

test("enforces enum", () => {
    const { valid } = validateAndCoerce(
        { type: "object", properties: { mode: { type: "string", enum: ["a", "b"] } } },
        { mode: "c" }
    );
    assert.equal(valid, false);
});

test("enforces minimum on numbers", () => {
    const { valid } = validateAndCoerce(
        { type: "object", properties: { n: { type: "integer", minimum: 1 } } },
        { n: 0 }
    );
    assert.equal(valid, false);
});

test("rejects additional properties when disallowed", () => {
    const { valid, errors } = validateAndCoerce(
        {
            type: "object",
            additionalProperties: false,
            properties: { x: { type: "string" } }
        },
        { x: "ok", y: "nope" }
    );
    assert.equal(valid, false);
    assert.match(errors[0].message, /additional property/);
});

test("coerces literal boolean strings", () => {
    const { valid, value } = validateAndCoerce(
        { type: "object", properties: { b: { type: "boolean" } } },
        { b: "true" }
    );
    assert.equal(valid, true);
    assert.equal(value.b, true);
});
