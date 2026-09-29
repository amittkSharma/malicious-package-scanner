export type PackageManager = "npm" | "yarn" | "pnpm";
/** One package flagged as matching an OSV.dev MAL- (known-malicious) advisory. Depth/path are
 * unbounded — the whole point of walking transitive dependencies is catching compromises buried
 * deep in the tree, so nothing here truncates by depth. */
export type MaliciousFinding = {
    /** OSV advisory id, e.g. "MAL-2026-6486". */
    advisoryId: string;
    /** OSV advisory summary — the human-readable reason this was flagged. */
    reason: string;
    advisoryUrl: string;
    dependency: string;
    version: string;
    /** From the flagged package's own package.json "license" field, if resolvable. Informational
     * only — this rule does not evaluate license policy, that's a separate concern. */
    license?: string;
    dependencyType: "direct" | "transitive";
    /** Present only when dependencyType is "transitive". Number of hops from a direct dependency. */
    depth?: number;
    /** Full chain of package names from the direct dependency down to this one, inclusive. */
    path?: string[];
    packageManager: PackageManager;
    /** Path (relative to repo root) of the workspace/project this was found in. */
    workspace: string;
    /** Best-effort publisher info pulled from the npm registry, kept as its own nested object
     * (rather than flattened onto the finding) since it's a distinct kind of fact — who published
     * this, not what it did. Undefined whenever the lookup wasn't possible (offline, private
     * registry, 404) rather than a scan failure. */
    packageMetadata?: PackageMetadata;
};
/** Publisher-identifying info for a flagged package, as declared in its own npm registry
 * manifest — useful for whoever needs to report the package upstream. */
export type PackageMetadata = {
    author?: string;
    repositoryUrl?: string;
    contact?: string;
};
/** A finding that matched an advisory but was suppressed by a config override. Kept distinct
 * from MaliciousFinding (rather than a "suppressed: boolean" field on it) so reporters can't
 * accidentally render a suppressed match as an active violation by forgetting to check a flag. */
export type SuppressedFinding = {
    finding: MaliciousFinding;
    override: MaliciousPackageOverride;
};
export type ScanReport = {
    generatedAt: string;
    /** Scanned repo's name — from its root package.json "name" field, or the directory's own
     * name if that's missing. Lets a report be identified on its own, without needing the
     * --root path it was generated from. */
    repository: string;
    /** Each project's own package.json "version", keyed by workspace path ("." for the repo
     * root). Only covers the root plus whatever workspace a finding/suppression actually landed
     * in — not every discoverable workspace project. Omits an entry rather than guessing when a
     * project has no version field. */
    projectVersions: Record<string, string>;
    findings: MaliciousFinding[];
    suppressed: SuppressedFinding[];
};
/** Suppresses a known-malicious match the team has explicitly accepted as risk. `reason` is
 * required so an override can't be added silently — same rationale as this repo's
 * banned-packages `reason` field. `expiresAt` is optional but recommended: without it, an
 * accepted risk is suppressed forever and nobody revisits it. */
export type MaliciousPackageOverride = {
    name: string;
    /** Omit to suppress every version of this package; set to suppress only a specific version. */
    version?: string;
    reason: string;
    /** ISO 8601 date. Once passed, this override stops applying and the finding reappears. */
    expiresAt?: string;
};
/** What the OSV integration produces: a MAL- match with no graph info yet. The lockfile graph
 * walker (npm/yarn/pnpm-specific) fills in dependencyType/depth/path/license afterwards — osv-
 * scanner's own output has no notion of "direct vs transitive" for these ecosystems. */
export type RawMaliciousMatch = {
    advisoryId: string;
    reason: string;
    advisoryUrl: string;
    dependency: string;
    version: string;
    /** Path to the lockfile osv-scanner matched this against, as reported in its own output. */
    lockfilePath: string;
};
/** Everything a lockfile graph walker knows about one resolved package install, keyed by
 * `${name}@${version}` in a DependencyGraph. Mirrors the matching fields on MaliciousFinding —
 * the CLI enrichment step just copies these over once osv-scanner's flat match list is joined
 * against the graph. */
export type DependencyGraphEntry = {
    dependencyType: "direct" | "transitive";
    /** Present only when dependencyType is "transitive". */
    depth?: number;
    /** Full chain of package names from the direct dependency down to this one, inclusive. */
    path: string[];
    license?: string;
};
/** Keyed by `${name}@${version}` — the same package name can appear multiple times in a tree at
 * different versions (dependency conflicts), each with its own depth/path, so name alone can't
 * be the key. */
export type DependencyGraph = Map<string, DependencyGraphEntry>;
export type ScannerConfig = {
    packageManagers?: PackageManager[];
    overrides?: MaliciousPackageOverride[];
    /** Hours before the local OSV database cache is considered stale and refreshed. */
    cacheTtlHours?: number;
    /** Never attempt a network refresh — scan against whatever is already cached (or the bundled
     * fallback snapshot, if the cache has never been populated). */
    offline?: boolean;
};
