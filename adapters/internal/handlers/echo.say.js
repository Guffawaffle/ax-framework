export default function echoSay(args, resolved) {
  const message = args.message ?? "";
  const prefix = args.prefix ? `${args.prefix}: ` : "";
  const result = {
    ok: true,
    data: `${prefix}${message}`,
    meta: {
      capabilityId: resolved.capability.id,
      sourceCapabilityId: resolved.capability.sourceCapabilityId ?? null,
      adapterType: "internal",
    },
  };

  if (args.await) {
    result.continuations = [
      {
        kind: "await-external",
        recommended: true,
        reason: "Echo completed; observe the declared external condition.",
        capability: "global.await.external",
        args: args.await,
      },
    ];
  }

  return result;
}
