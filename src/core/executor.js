// Capability dispatcher.
//
// Responsibilities:
//   1. Look up the type adapter for capability.adapterType.
//   2. If capability.providerAdapter is set, look up that provider and
//      give it the chance to wrap execution.
//   3. Run policy evaluation. Errors short-circuit; warnings ride along
//      on result.meta so callers can surface them.
//
// Provider adapters receive an execution context with the resolved
// type adapter under ctx.types.get(name). The provider is free to:
//   - delegate (typeAdapter.execute(resolved)) and post-process,
//   - mutate resolved.args before delegating,
//   - or skip the type adapter entirely if it has its own transport.
// The contract is just: return { ok, data | error, meta }.

import { AxError } from "./errors.js";
import { evaluatePolicies } from "./policy.js";

export async function executeResolvedCapability(resolved, { adapters, runtime = null } = {}) {
    if (!adapters) {
        throw new AxError("executor requires an adapter registry", 1);
    }

    const adapterType = resolved.capability.adapterType;
    // Mounted capabilities expose the toolspace through `capability.mount`.
    // Toolspace-private adapters take precedence when present.
    const toolspace = resolved.capability.mount?.toolspace ?? null;
    const lookupOpts = toolspace ? { toolspace } : undefined;

    const typeAdapter = adapters.get(adapterType, lookupOpts);
    if (!typeAdapter) {
        throw new AxError(
            `no adapter loaded for type '${adapterType}' (expected adapters/${adapterType}/${toolspace ? ` or toolspaces/${toolspace}/adapters/${adapterType}/` : ""})`,
            2
        );
    }

    const providerName = resolved.capability.providerAdapter;
    let provider = null;
    if (providerName) {
        provider = adapters.getProvider(providerName, lookupOpts);
        if (!provider) {
            throw new AxError(
                `capability '${resolved.capability.id}' declares providerAdapter '${providerName}' but no provider adapter is loaded for it`,
                2
            );
        }
        if (provider.manifest.composes !== adapterType) {
            throw new AxError(
                `provider '${providerName}' composes '${provider.manifest.composes}' but capability '${resolved.capability.id}' uses adapterType '${adapterType}'`,
                2
            );
        }
    }

    const policy = evaluatePolicies(resolved.capability, runtime);
    if (!policy.ok) {
        return {
            ok: false,
            error: { message: policy.errors.join("; ") },
            meta: {
                capabilityId: resolved.capability.id,
                adapterType,
                providerAdapter: providerName ?? null,
                policyErrors: policy.errors
            }
        };
    }

    const ctx = {
        types: adapters,
        typeAdapter,
        runtime
    };

    const exec = provider ?? typeAdapter;
    const result = await exec.execute(resolved, ctx);

    if (result?.meta) {
        if (providerName) result.meta.providerAdapter = providerName;
        if (policy.warnings.length > 0) result.meta.policyWarnings = policy.warnings;
    }
    return result;
}
