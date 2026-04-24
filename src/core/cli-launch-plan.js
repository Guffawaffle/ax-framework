import path from "node:path";
import { AxError } from "./errors.js";

const WORKSPACE_RELATIVE = "workspace";

export function resolveCliLaunchPlan(capability, { runtime = null, env = process.env } = {}) {
    const executionTarget = capability.executionTarget;
    if (!executionTarget || typeof executionTarget !== "object") {
        throw new AxError(
            `cli capability '${capability.id}' is missing a valid executionTarget`,
            2
        );
    }

    const baseArgs = normalizeStringArray(
        executionTarget.args,
        `cli capability '${capability.id}' executionTarget.args`
    );

    if (typeof executionTarget.command === "string" && executionTarget.command) {
        if (executionTarget.target || executionTarget.launcher) {
            throw new AxError(
                `cli capability '${capability.id}' cannot mix executionTarget.command with executionTarget.target or executionTarget.launcher`,
                2
            );
        }

        return {
            command: executionTarget.command,
            argsPrefix: baseArgs,
            targetPath: null,
            targetSource: "command",
            executionTarget
        };
    }

    const target = executionTarget.target;
    if (!target || typeof target !== "object") {
        throw new AxError(
            `cli capability '${capability.id}' requires executionTarget.command or executionTarget.target.path`,
            2
        );
    }

    if (typeof target.path !== "string" || !target.path) {
        throw new AxError(
            `cli capability '${capability.id}' requires executionTarget.target.path`,
            2
        );
    }

    const resolvedTarget = resolveTargetPath(target, capability.id, runtime, env);
    const launcher = executionTarget.launcher;

    if (!launcher) {
        return {
            command: resolvedTarget.path,
            argsPrefix: baseArgs,
            targetPath: resolvedTarget.path,
            targetSource: resolvedTarget.source,
            executionTarget
        };
    }

    if (typeof launcher !== "object") {
        throw new AxError(
            `cli capability '${capability.id}' executionTarget.launcher must be an object`,
            2
        );
    }

    if (typeof launcher.command !== "string" || !launcher.command) {
        throw new AxError(
            `cli capability '${capability.id}' requires executionTarget.launcher.command`,
            2
        );
    }

    const launcherArgs = normalizeStringArray(
        launcher.args,
        `cli capability '${capability.id}' executionTarget.launcher.args`
    );

    return {
        command: launcher.command,
        argsPrefix: [...launcherArgs, resolvedTarget.path, ...baseArgs],
        targetPath: resolvedTarget.path,
        targetSource: resolvedTarget.source,
        executionTarget
    };
}

function resolveTargetPath(target, capabilityId, runtime, env) {
    if (path.isAbsolute(target.path)) {
        return { path: target.path, source: "absolute" };
    }

    const envName = typeof target.fromEnv === "string" ? target.fromEnv : null;
    if (envName && env[envName]) {
        return {
            path: path.resolve(env[envName], target.path),
            source: `env:${envName}`
        };
    }

    if (target.fallbackRoot) {
        const root = resolveRelativeRoot(
            target.fallbackRoot,
            target.fallbackRelativeTo,
            capabilityId,
            runtime,
            envName ? `fallback for ${envName}` : "fallbackRoot"
        );
        return {
            path: path.resolve(root, target.path),
            source: envName ? `fallback:${envName}` : "fallback"
        };
    }

    if (target.relativeTo) {
        const root = resolveRelativeRoot(
            ".",
            target.relativeTo,
            capabilityId,
            runtime,
            "relativeTo"
        );
        return {
            path: path.resolve(root, target.path),
            source: `relative:${target.relativeTo}`
        };
    }

    if (envName) {
        throw new AxError(
            `cli capability '${capabilityId}' could not resolve executionTarget.target.path because ${envName} is unset and no fallbackRoot is declared`,
            2
        );
    }

    throw new AxError(
        `cli capability '${capabilityId}' uses a relative executionTarget.target.path and must declare target.relativeTo or target.fromEnv`,
        2
    );
}

function resolveRelativeRoot(rootPath, relativeTo, capabilityId, runtime, contextLabel) {
    if (relativeTo !== WORKSPACE_RELATIVE) {
        throw new AxError(
            `cli capability '${capabilityId}' has unsupported ${contextLabel} '${relativeTo}'`,
            2
        );
    }

    const workspaceRoot = runtime?.workspace?.root;
    if (!workspaceRoot) {
        throw new AxError(
            `cli capability '${capabilityId}' requires a bound workspace to resolve ${contextLabel}='${relativeTo}'`,
            2
        );
    }

    return path.resolve(workspaceRoot, rootPath);
}

function normalizeStringArray(value, label) {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new AxError(`${label} must be an array of strings`, 2);
    }
    return value;
}