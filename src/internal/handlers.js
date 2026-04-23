import { AxError } from "../core/errors.js";

const handlers = {
  "echo.say": echoSay,
  "draft.todo": draftTodo
};

export function runInternalHandler(handlerName, args, resolved) {
  const handler = handlers[handlerName];
  if (!handler) {
    throw new AxError(`unknown internal handler '${handlerName}'`, 2);
  }

  return handler(args, resolved);
}

function echoSay(args, resolved) {
  const message = args.message ?? "";
  const prefix = args.prefix ? `${args.prefix}: ` : "";

  return {
    ok: true,
    data: `${prefix}${message}`,
    meta: {
      capabilityId: resolved.capability.id,
      sourceCapabilityId: resolved.capability.sourceCapabilityId ?? null,
      adapterType: "internal"
    }
  };
}

function draftTodo(_args, resolved) {
  return {
    ok: false,
    error: {
      message: `draft capability '${resolved.capability.id}' has no implementation`
    },
    meta: {
      capabilityId: resolved.capability.id,
      adapterType: "internal"
    }
  };
}
