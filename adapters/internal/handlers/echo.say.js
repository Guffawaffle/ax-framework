export default function echoSay(args, resolved) {
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
