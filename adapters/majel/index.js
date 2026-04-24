// Majel provider adapter.
//
// Composes on top of the generic cli type-adapter to:
//   - delegate process spawning + stdout capture
//   - unwrap Majel's AxResult envelope, which always looks like:
//       { command, success, timestamp, durationMs, data, errors?, hints? }
//   - map success=false -> AX result.ok=false with stitched-up error
//     message, while preserving Majel's hints[] on result.meta for the
//     caller to surface
//
// This is the canonical example of "provider adapter as envelope
// translator". The cli type-adapter stays generic; Majel-specific
// knowledge lives here.

export async function execute(resolved, ctx) {
    const upstream = await ctx.typeAdapter.execute(resolved);

    // Pass through transport-level failures (process exit, spawn error)
    // unchanged. Those aren't envelope issues.
    if (!upstream.ok) {
        return upstream;
    }

    const envelope = upstream.data;
    if (!isMajelEnvelope(envelope)) {
        // Output didn't match Majel's contract. Don't pretend we
        // understand it; flag that this command isn't envelope-shaped.
        return {
            ok: false,
            error: {
                message: `majel provider: '${resolved.capability.id}' did not return a recognizable Majel envelope`
            },
            meta: {
                ...(upstream.meta ?? {}),
                rawData: envelope
            }
        };
    }

    const meta = {
        ...(upstream.meta ?? {}),
        majel: {
            command: envelope.command,
            timestamp: envelope.timestamp,
            durationMs: envelope.durationMs
        }
    };
    if (Array.isArray(envelope.hints) && envelope.hints.length > 0) {
        meta.hints = envelope.hints;
    }

    if (envelope.success) {
        return {
            ok: true,
            data: envelope.data ?? null,
            meta
        };
    }

    const errors = Array.isArray(envelope.errors) ? envelope.errors : [];
    return {
        ok: false,
        error: {
            message:
                errors.length > 0
                    ? errors.join("; ")
                    : `majel '${envelope.command}' reported failure with no error details`
        },
        meta: {
            ...meta,
            majelErrors: errors
        }
    };
}

function isMajelEnvelope(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        typeof value.command === "string" &&
        typeof value.success === "boolean"
    );
}
