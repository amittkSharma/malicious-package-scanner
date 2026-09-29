import type { DependencyGraph, MaliciousFinding, PackageManager, RawMaliciousMatch, ScannerConfig, ScanReport } from "./types.js";
export declare function detectPackageManager(lockfilePath: string): PackageManager | undefined;
export type RunScanOptions = {
    rootDir: string;
    config: Required<ScannerConfig>;
};
/** One osv-scanner pass over the whole rootDir, then per-lockfile graph enrichment
 * (direct/transitive/depth/path/license), then override filtering. Graphs are built once per
 * lockfile and reused across all matches found in it. */
export declare function runScan(options: RunScanOptions): Promise<ScanReport>;
/** A malicious dependency can be used by several workspace projects at once — each is an
 * independently actionable finding (project A's team needs to know just as much as project B's),
 * so one match fans out into one MaliciousFinding per project whose graph actually uses it. If no
 * project's graph resolved the edge (e.g. an optional/peer-only edge our resolver doesn't walk),
 * it's still reported once, just without depth/path/license, rather than silently dropped. */
export declare function toFindings(match: RawMaliciousMatch, packageManager: PackageManager, rootDir: string, projectGraphs: Map<string, DependencyGraph>): MaliciousFinding[];
