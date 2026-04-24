import { AxError } from "../../src/core/errors.js";
import echoSay from "./handlers/echo.say.js";
import draftTodo from "./handlers/draft.todo.js";

const HANDLERS = {
    "echo.say": echoSay,
    "draft.todo": draftTodo
};

export async function execute(resolved) {
    const handlerName = resolved.capability.executionTarget?.handler;
    if (!handlerName) {
        throw new AxError(
            `internal capability '${resolved.capability.id}' is missing executionTarget.handler`,
            2
        );
    }

    const handler = HANDLERS[handlerName];
    if (!handler) {
        throw new AxError(`unknown internal handler '${handlerName}'`, 2);
    }

    return handler(resolved.args, resolved);
}
