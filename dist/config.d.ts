import type { ScannerConfig } from "./types.js";
/** Opt-in config: a missing file just means defaults (all three package managers, no overrides,
 * 24h cache TTL, online). Callers can rely on every field always being populated, whether or not
 * a config file exists. */
export declare function loadConfig(configPath: string): Required<ScannerConfig>;
