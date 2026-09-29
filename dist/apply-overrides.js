/** Splits raw matches into still-active findings and suppressed ones, per the configured
 * overrides. An override with a passed `expiresAt` is treated as if it didn't exist — the
 * finding falls back into the active list rather than staying silently suppressed forever. */
export function applyOverrides(findings, overrides, now = new Date()) {
    const active = [];
    const suppressed = [];
    for (const finding of findings) {
        const override = matchingActiveOverride(finding, overrides, now);
        if (override) {
            suppressed.push({ finding, override });
        }
        else {
            active.push(finding);
        }
    }
    return { active, suppressed };
}
function matchingActiveOverride(finding, overrides, now) {
    return overrides.find((override) => {
        if (override.name !== finding.dependency) {
            return false;
        }
        if (override.version !== undefined &&
            override.version !== finding.version) {
            return false;
        }
        if (override.expiresAt !== undefined &&
            new Date(override.expiresAt) <= now) {
            return false;
        }
        return true;
    });
}
