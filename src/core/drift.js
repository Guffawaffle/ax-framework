// Drift detection between provider command families and their axf
// projections. Materialized capabilities snapshot a family entry into
// a hand-editable file; over time the underlying family manifest can
// drift (renamed arg, new flag, changed launch target). This module
// surfaces those gaps so doctor can flag them instead of failing
// silently at run time.
//
// Drift kinds reported:
//
//   missing-source            sourceFamily references a family/command
//                              that no longer exists. The materialized
//                              capability is now an orphan.
//
//   args-added                family declares args the materialized
//                              capability does not (likely a new flag
//                              the user has not opted into yet).
//
//   args-removed              materialized capability declares args
//                              the family no longer has (likely a
//                              renamed or removed provider flag).
//
//   arg-flag-changed          a shared arg's providerFlag now differs
//                              between family-derived map and the
//                              materialized argMap.
//
//   execution-target-changed  the family's executionTarget no longer
//                              matches the materialized capability's
//                              (e.g., the family now uses a different
//                              base command or arg vector).

import { computeArgMap } from "./family-loader.js";

export function detectFamilyDrift(registry) {
    const driftItems = [];
    const familiesByName = new Map(
        (registry.families ?? []).map((f) => [f.family, f])
    );

    for (const capability of registry.capabilities.values()) {
        if (!capability.sourceFamily) continue;
        if (capability.origin === "imported") continue; // imported = always in sync
        const { family: familyName, command: cmdKey } = capability.sourceFamily;
        const family = familiesByName.get(familyName);
        if (!family) {
            driftItems.push({
                capabilityId: capability.id,
                family: familyName,
                command: cmdKey,
                kind: "missing-source",
                message: `family '${familyName}' is not loaded; capability '${capability.id}' is orphaned`
            });
            continue;
        }
        const cmd = family.commands?.[cmdKey];
        if (!cmd) {
            driftItems.push({
                capabilityId: capability.id,
                family: familyName,
                command: cmdKey,
                kind: "missing-source",
                message: `family '${familyName}' no longer declares command '${cmdKey}'`
            });
            continue;
        }
        const familyMap = computeArgMap(cmd.args ?? {}, family);
        const localMap = capability.argMap ?? {};
        const familyArgs = new Set(Object.keys(familyMap));
        const localArgs = new Set(Object.keys(localMap));

        const added = [...familyArgs].filter((k) => !localArgs.has(k));
        if (added.length > 0) {
            driftItems.push({
                capabilityId: capability.id,
                family: familyName,
                command: cmdKey,
                kind: "args-added",
                added,
                message: `family added args not present on materialized capability: ${added.join(", ")}`
            });
        }
        const removed = [...localArgs].filter((k) => !familyArgs.has(k));
        if (removed.length > 0) {
            driftItems.push({
                capabilityId: capability.id,
                family: familyName,
                command: cmdKey,
                kind: "args-removed",
                removed,
                message: `materialized capability declares args the family no longer exposes: ${removed.join(", ")}`
            });
        }
        for (const name of familyArgs) {
            if (!localArgs.has(name)) continue;
            if (familyMap[name] !== localMap[name]) {
                driftItems.push({
                    capabilityId: capability.id,
                    family: familyName,
                    command: cmdKey,
                    kind: "arg-flag-changed",
                    arg: name,
                    familyFlag: familyMap[name],
                    localFlag: localMap[name],
                    message: `arg '${name}' provider flag changed: family says '${familyMap[name]}', capability says '${localMap[name]}'`
                });
            }
        }
        const familyTarget = cmd.executionTarget ?? family.executionTarget;
        if (familyTarget && !executionTargetsEqual(familyTarget, capability.executionTarget)) {
            driftItems.push({
                capabilityId: capability.id,
                family: familyName,
                command: cmdKey,
                kind: "execution-target-changed",
                familyTarget,
                localTarget: capability.executionTarget,
                message: `executionTarget differs from family source for ${familyName}.${cmdKey}`
            });
        }
    }
    return driftItems;
}

function executionTargetsEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}
