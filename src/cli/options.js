import { AxError } from "../core/errors.js";

export function splitCommandTokens(tokens) {
  const pathTokens = [];
  const optionTokens = [];
  let sawOption = false;

  for (const token of tokens) {
    if (!sawOption && token.startsWith("--")) {
      sawOption = true;
    }

    if (sawOption) {
      optionTokens.push(token);
    } else {
      pathTokens.push(token);
    }
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
      options[key] = coerceOptionValue(value);
      continue;
    }

    const next = tokens[index + 1];
    if (!next || next.startsWith("--")) {
      options[normalized] = true;
      continue;
    }

    options[normalized] = coerceOptionValue(next);
    index += 1;
  }

  return { options, positionals };
}

function coerceOptionValue(value) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^-?\d+$/.test(value)) {
    return Number(value);
  }

  return value;
}
