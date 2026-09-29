import type { RawMaliciousMatch } from "./types.js";
export type RunOsvScanOptions = {
    rootDir: string;
    cacheTtlHours: number;
    offline: boolean;
};
/** osv-scanner exits 1 when it finds vulnerabilities (that's the whole point — CI should fail),
 * and non-1/0 for actual execution errors. execFileSync throws on any non-zero exit, so both
 * cases arrive as a caught error; only exit 1 is "findings, not a failure." */
export declare function runOsvScan(options: RunOsvScanOptions): RawMaliciousMatch[];
