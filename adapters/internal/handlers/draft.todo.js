export default function draftTodo(_args, resolved) {
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
