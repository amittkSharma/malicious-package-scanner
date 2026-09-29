import type { MaliciousFinding, MaliciousPackageOverride, SuppressedFinding } from "./types.js";
/** Splits raw matches into still-active findings and suppressed ones, per the configured
 * overrides. An override with a passed `expiresAt` is treated as if it didn't exist — the
 * finding falls back into the active list rather than staying silently suppressed forever. */
export declare function applyOverrides(findings: readonly MaliciousFinding[], overrides: readonly MaliciousPackageOverride[], now?: Date): {
    active: MaliciousFinding[];
    suppressed: SuppressedFinding[];
};
