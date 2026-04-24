// Tiny JSON Schema subset for AX v0 argsSchema validation and coercion.
// Supported: type (string/number/integer/boolean/object/array),
// required, properties, enum, minimum, maximum, minLength,
// additionalProperties (defaults to true).
//
// Goal: be small, predictable, and replaceable. Swap in Ajv later by
// changing only this file's exported surface.

import { AxError } from "./errors.js";

export function validateAndCoerce(schema, value, { coerce = true } = {}) {
    const errors = [];
    const out = walk(schema, value, "", { coerce, errors });
    return { valid: errors.length === 0, errors, value: out };
}

export function assertValid(schema, value, label, opts) {
    const { valid, errors, value: coerced } = validateAndCoerce(schema, value, opts);
    if (!valid) {
        const message = errors
            .map((e) => `${e.path || "<root>"}: ${e.message}`)
            .join("; ");
        throw new AxError(`${label}: ${message}`, 2);
    }
    return coerced;
}

function walk(schema, value, path, ctx) {
    if (schema == null || typeof schema !== "object") return value;

    if (schema.type === "object" || (schema.properties && !schema.type)) {
        return walkObject(schema, value, path, ctx);
    }
    if (schema.type === "array") {
        return walkArray(schema, value, path, ctx);
    }
    return walkScalar(schema, value, path, ctx);
}

function walkObject(schema, value, path, ctx) {
    if (value == null) value = {};
    if (typeof value !== "object" || Array.isArray(value)) {
        ctx.errors.push({ path, message: "expected object" });
        return value;
    }

    const out = { ...value };
    const properties = schema.properties ?? {};
    const additionalProperties = schema.additionalProperties !== false;

    for (const [key, subSchema] of Object.entries(properties)) {
        if (key in out) {
            out[key] = walk(subSchema, out[key], joinPath(path, key), ctx);
        }
    }

    for (const required of schema.required ?? []) {
        if (!(required in out)) {
            ctx.errors.push({
                path: joinPath(path, required),
                message: "required property missing"
            });
        }
    }

    if (!additionalProperties) {
        for (const key of Object.keys(out)) {
            if (!(key in properties)) {
                ctx.errors.push({
                    path: joinPath(path, key),
                    message: "additional property not allowed"
                });
            }
        }
    }

    return out;
}

function walkArray(schema, value, path, ctx) {
    if (!Array.isArray(value)) {
        ctx.errors.push({ path, message: "expected array" });
        return value;
    }
    if (!schema.items) return value;
    return value.map((v, i) => walk(schema.items, v, `${path}[${i}]`, ctx));
}

function walkScalar(schema, value, path, ctx) {
    let v = value;

    if (ctx.coerce) v = coerceScalar(schema.type, v);

    if (schema.type && !typeMatches(schema.type, v)) {
        ctx.errors.push({
            path,
            message: `expected ${schema.type}, got ${typeOf(v)}`
        });
        return v;
    }

    if (schema.enum && !schema.enum.includes(v)) {
        ctx.errors.push({
            path,
            message: `value must be one of ${JSON.stringify(schema.enum)}`
        });
    }

    if (typeof v === "number") {
        if (typeof schema.minimum === "number" && v < schema.minimum) {
            ctx.errors.push({ path, message: `must be >= ${schema.minimum}` });
        }
        if (typeof schema.maximum === "number" && v > schema.maximum) {
            ctx.errors.push({ path, message: `must be <= ${schema.maximum}` });
        }
        if (schema.type === "integer" && !Number.isInteger(v)) {
            ctx.errors.push({ path, message: "must be an integer" });
        }
    }

    if (typeof v === "string") {
        if (typeof schema.minLength === "number" && v.length < schema.minLength) {
            ctx.errors.push({ path, message: `must be at least ${schema.minLength} chars` });
        }
    }

    return v;
}

function coerceScalar(type, value) {
    if (value == null) return value;
    if (type === "number" || type === "integer") {
        if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
            return Number(value);
        }
    }
    if (type === "boolean") {
        if (value === "true") return true;
        if (value === "false") return false;
    }
    if (type === "string") {
        if (typeof value === "number" || typeof value === "boolean") {
            return String(value);
        }
    }
    return value;
}

function typeMatches(type, value) {
    if (type === "string") return typeof value === "string";
    if (type === "boolean") return typeof value === "boolean";
    if (type === "number" || type === "integer") return typeof value === "number";
    if (type === "object") return typeof value === "object" && !Array.isArray(value) && value != null;
    if (type === "array") return Array.isArray(value);
    return true;
}

function typeOf(value) {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
}

function joinPath(parent, key) {
    return parent ? `${parent}.${key}` : key;
}
