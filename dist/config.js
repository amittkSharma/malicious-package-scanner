import { existsSync, readFileSync } from "node:fs";
const DEFAULT_CACHE_TTL_HOURS = 24;
/** Opt-in config: a missing file just means defaults (all three package managers, no overrides,
 * 24h cache TTL, online). Callers can rely on every field always being populated, whether or not
 * a config file exists. */
export function loadConfig(configPath) {
    const parsed = existsSync(configPath)
        ? parseConfigFile(configPath)
        : {};
    return {
        packageManagers: parsed.packageManagers ?? ["npm", "yarn", "pnpm"],
        overrides: parsed.overrides ?? [],
        cacheTtlHours: parsed.cacheTtlHours ?? DEFAULT_CACHE_TTL_HOURS,
        offline: parsed.offline ?? false,
    };
}
function parseConfigFile(configPath) {
    try {
        return JSON.parse(readFileSync(configPath, "utf8"));
    }
    catch (error) {
        throw new Error(`Failed to parse config file at ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
