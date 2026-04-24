// Workspace-root resolution. axf must work from any CWD once axf is on PATH,
// so the framework needs a deterministic way to find the workspace that
// owns the manifests and adapters it should load.
//
// Resolution order (first match wins):
//   1. Explicit option:  --workspace <path>          (CLI flag)
//   2. Environment var:  AXF_WORKSPACE=<path>
//   3. Marker file walk: nearest ancestor of cwd that contains
//                        axf.workspace.json
//   4. Marker file walk: nearest ancestor of the script's own location
//                        that contains axf.workspace.json so
//                        /usr/local/bin/axf
//                        invoked from /tmp still finds /srv/axf)
//   5. Fallback:         cwd
//
// The marker file is a tiny JSON document (see axf.workspace.json at the
// repo root) and exists for exactly this purpose.

import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WORKSPACE_MARKER = "axf.workspace.json";

// Returns { root, source, viaMarker } where:
//   root       - absolute path to workspace root
//   source     - one of "explicit" | "env" | "cwd-marker" | "script-marker" | "cwd-fallback"
//   viaMarker  - true iff the root contains an axf.workspace.json marker
//                (i.e. resolution did NOT fall back to cwd). Policies use
//                this to enforce real workspace binding vs accidental cwd.
export function findWorkspaceRoot(opts = {}) {
    const { cwd, env = {}, explicit } = opts;
    if (explicit) {
        const root = path.resolve(cwd, explicit);
        return { root, source: "explicit", viaMarker: hasMarker(root) };
    }
    const envWorkspace = env.AXF_WORKSPACE;
    if (envWorkspace) {
        const root = path.resolve(envWorkspace);
        return { root, source: "env", viaMarker: hasMarker(root) };
    }
    const fromCwd = walkForMarker(path.resolve(cwd));
    if (fromCwd) return { root: fromCwd, source: "cwd-marker", viaMarker: true };

    // `scriptDir: null` disables the script-relative fallback explicitly
    // (used in tests). Omitting the key uses the default.
    const start = "scriptDir" in opts ? opts.scriptDir : defaultScriptDir();
    if (start) {
        const fromScript = walkForMarker(start);
        if (fromScript) return { root: fromScript, source: "script-marker", viaMarker: true };
    }

    return { root: path.resolve(cwd), source: "cwd-fallback", viaMarker: false };
}

function hasMarker(dir) {
    return existsSync(path.join(dir, WORKSPACE_MARKER));
}

function walkForMarker(startDir) {
    let dir = startDir;
    while (true) {
        if (hasMarker(dir)) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

function defaultScriptDir() {
    try {
        // Resolve the real path of bin/axf.js (de-symlinks
        // /usr/local/bin/axf -> /srv/axf/bin/axf.js) so the marker walk
        // starts at the install location, not the symlink directory.
        const here = fileURLToPath(import.meta.url);
        const real = realpathSync(here);
        return path.dirname(real);
    } catch {
        return null;
    }
}

