import { AxError } from "../core/errors.js";

// Tokenization rules:
// - All tokens before the first --flag are path tokens.
// - --flag value     -> options.flag = "value"  (string by default)
// - --flag=value     -> options.flag = "value"  (string by default)
// - --flag           -> options.flag = true     (boolean)
// - "false" literal  -> options.flag = false    (only this one boolean coercion)
//
// We deliberately do NOT auto-coerce numeric strings here. Numeric and
// other typed coercion happens in the resolver, driven by the
// capability's argsSchema. This keeps CLI parsing predictable and
// pushes type knowledge to the place that owns it.

export function splitCommandTokens(tokens) {
    const pathTokens = [];
    const optionTokens = [];
    let sawOption = false;

    for (const token of tokens) {
        if (!sawOption && token.startsWith("--")) sawOption = true;
        if (sawOption) optionTokens.push(token);
        else pathTokens.push(token);
    }

    return {
        pathTokens,
        options: parseOptionTokens(optionTokens).options
    };
}

export function parseOptionTokens(tokens) {
    const options = {};
    const positionals = [];

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];

        if (!token.startsWith("--")) {
            positionals.push(token);
            continue;
        }

        const normalized = token.slice(2);
        if (!normalized) {
            throw new AxError("empty option name", 2);
        }

        const equalsIndex = normalized.indexOf("=");
        if (equalsIndex !== -1) {
            const key = normalized.slice(0, equalsIndex);
            const value = normalized.slice(equalsIndex + 1);
            options[key] = parseLiteral(value);
            continue;
        }

        const next = tokens[index + 1];
        if (next === undefined || next.startsWith("--")) {
            options[normalized] = true;
            continue;
        }

        options[normalized] = parseLiteral(next);
        index += 1;
    }

    return { options, positionals };
}

// Only the literal strings "true" and "false" are coerced to booleans;
// everything else is preserved as a string. Schema-driven coercion in
// the resolver handles numbers, integers, and explicit booleans.
function parseLiteral(value) {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
}
