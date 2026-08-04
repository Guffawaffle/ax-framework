import { AxError } from "./errors.js";

export const AWAITABLE_SCHEMA_VERSION = "axf/awaitable/v1";
export const AWAIT_RESULT_SCHEMA_VERSION = "axf/await-result/v1";
export const AWAIT_CONTINUATION_KIND = "await-external";
export const MIN_AWAIT_DEADLINE_MS = 1_000;
export const MAX_AWAIT_DEADLINE_MS = 30 * 60 * 1_000;

const MAX_CONTINUATIONS = 4;
const MAX_CONTINUATION_REASON_LENGTH = 500;
const MAX_DESCRIPTOR_BYTES = 16 * 1024;
const CAPABILITY_ID =
  /^(global|toolspace|workspace)\.[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const DESCRIPTOR_KIND = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;
const COMPLETION_FIELDS = new Set([
  "mode",
  "descriptorSchema",
  "observer",
]);
const DESCRIPTOR_FIELDS = new Set([
  "schemaVersion",
  "kind",
  "subject",
  "condition",
]);
const CONTINUATION_FIELDS = new Set([
  "kind",
  "recommended",
  "reason",
  "capability",
  "args",
]);
const CONTINUATION_ARG_FIELDS = new Set(["descriptor", "deadlineMs"]);
const AUTHORITY_FIELD =
  /(auth|authorization|bearer|credential|password|privatekey|secret|token)/i;

export function validateCompletionContract(completion, label) {
  if (!isRecord(completion)) {
    return [`${label}: completion must be an object`];
  }

  const errors = [];
  if (hasUnknownFields(completion, COMPLETION_FIELDS)) {
    errors.push(`${label}: completion contains unsupported fields`);
  }
  if (completion.mode !== "external-awaitable") {
    errors.push(`${label}: completion.mode must be 'external-awaitable'`);
  }
  if (completion.descriptorSchema !== AWAITABLE_SCHEMA_VERSION) {
    errors.push(
      `${label}: completion.descriptorSchema must be '${AWAITABLE_SCHEMA_VERSION}'`,
    );
  }
  if (
    typeof completion.observer !== "string" ||
    !CAPABILITY_ID.test(completion.observer)
  ) {
    errors.push(
      `${label}: completion.observer must be a fully qualified capability id`,
    );
  }
  return errors;
}

export function assertAwaitableDescriptor(value, label = "descriptor") {
  if (!isRecord(value)) {
    throw new AxError(`${label} must be an object`, 2);
  }
  if (hasUnknownFields(value, DESCRIPTOR_FIELDS)) {
    throw new AxError(`${label} contains unsupported fields`, 2);
  }
  if (value.schemaVersion !== AWAITABLE_SCHEMA_VERSION) {
    throw new AxError(
      `${label}.schemaVersion must be '${AWAITABLE_SCHEMA_VERSION}'`,
      2,
    );
  }
  if (typeof value.kind !== "string" || !DESCRIPTOR_KIND.test(value.kind)) {
    throw new AxError(
      `${label}.kind must be a dotted, lower-kebab provider identity`,
      2,
    );
  }
  if (!isRecord(value.subject)) {
    throw new AxError(`${label}.subject must be an object`, 2);
  }
  if (
    !isRecord(value.condition) ||
    typeof value.condition.type !== "string" ||
    value.condition.type.length === 0
  ) {
    throw new AxError(
      `${label}.condition must be an object with a non-empty type`,
      2,
    );
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new AxError(`${label} must be JSON-serializable`, 2);
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_DESCRIPTOR_BYTES) {
    throw new AxError(
      `${label} exceeds the ${MAX_DESCRIPTOR_BYTES}-byte bound`,
      2,
    );
  }
  if (containsAuthorityField(value.subject) || containsAuthorityField(value.condition)) {
    throw new AxError(
      `${label} must not contain credentials or bearer authority`,
      2,
    );
  }
  return value;
}

export function assertAwaitDeadline(value, label = "deadlineMs") {
  if (
    !Number.isInteger(value) ||
    value < MIN_AWAIT_DEADLINE_MS ||
    value > MAX_AWAIT_DEADLINE_MS
  ) {
    throw new AxError(
      `${label} must be an integer between ${MIN_AWAIT_DEADLINE_MS} and ${MAX_AWAIT_DEADLINE_MS}`,
      2,
    );
  }
  return value;
}

export function validateExecutionContinuations(result, capability) {
  if (!Object.prototype.hasOwnProperty.call(result ?? {}, "continuations")) {
    return result;
  }
  if (result.ok !== true) {
    throw new AxError(
      `capability '${capability.id}' returned continuations with a failed result`,
      1,
    );
  }
  if (!Array.isArray(result.continuations)) {
    throw new AxError(
      `capability '${capability.id}' continuations must be an array`,
      1,
    );
  }
  if (
    result.continuations.length === 0 ||
    result.continuations.length > MAX_CONTINUATIONS
  ) {
    throw new AxError(
      `capability '${capability.id}' continuations must contain 1-${MAX_CONTINUATIONS} entries`,
      1,
    );
  }

  const completion = capability.completion;
  const completionErrors = validateCompletionContract(
    completion,
    `capability '${capability.id}'`,
  );
  if (completionErrors.length > 0) {
    throw new AxError(
      `capability '${capability.id}' returned continuations without a valid completion contract`,
      1,
    );
  }

  for (const [index, continuation] of result.continuations.entries()) {
    assertContinuation(
      continuation,
      completion,
      `capability '${capability.id}' continuation[${index}]`,
    );
  }
  return result;
}

function assertContinuation(value, completion, label) {
  if (!isRecord(value)) {
    throw new AxError(`${label} must be an object`, 1);
  }
  if (hasUnknownFields(value, CONTINUATION_FIELDS)) {
    throw new AxError(`${label} contains unsupported fields`, 1);
  }
  if (value.kind !== AWAIT_CONTINUATION_KIND) {
    throw new AxError(
      `${label}.kind must be '${AWAIT_CONTINUATION_KIND}'`,
      1,
    );
  }
  if (typeof value.recommended !== "boolean") {
    throw new AxError(`${label}.recommended must be a boolean`, 1);
  }
  if (
    typeof value.reason !== "string" ||
    value.reason.length === 0 ||
    value.reason.length > MAX_CONTINUATION_REASON_LENGTH
  ) {
    throw new AxError(
      `${label}.reason must contain 1-${MAX_CONTINUATION_REASON_LENGTH} characters`,
      1,
    );
  }
  if (value.capability !== completion.observer) {
    throw new AxError(
      `${label}.capability must match completion.observer '${completion.observer}'`,
      1,
    );
  }
  if (!isRecord(value.args)) {
    throw new AxError(`${label}.args must be an object`, 1);
  }
  if (hasUnknownFields(value.args, CONTINUATION_ARG_FIELDS)) {
    throw new AxError(`${label}.args contains unsupported fields`, 1);
  }
  const descriptor = assertAwaitableDescriptor(
    value.args.descriptor,
    `${label}.args.descriptor`,
  );
  if (descriptor.schemaVersion !== completion.descriptorSchema) {
    throw new AxError(
      `${label} descriptor schema does not match the capability completion contract`,
      1,
    );
  }
  assertAwaitDeadline(value.args.deadlineMs, `${label}.args.deadlineMs`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasUnknownFields(value, allowed) {
  return Object.keys(value).some((field) => !allowed.has(field));
}

function containsAuthorityField(value) {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!isRecord(current)) continue;
    for (const [field, nested] of Object.entries(current)) {
      if (AUTHORITY_FIELD.test(field)) return true;
      pending.push(nested);
    }
  }
  return false;
}
