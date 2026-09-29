import type { DependencyGraph } from "./types.js";
export type DependencySpec = {
    name: string;
    range: string;
};
/** Splits a lockfile key of the form "name@rest" (a yarn descriptor "name@range", or a pnpm
 * snapshot key "name@version(...)") into its name and everything after the separator. Scoped
 * package names ("@scope/name") contain their own leading "@", so the separator is the *second*
 * "@" for those, not the first. */
export declare function splitAtNameSeparator(key: string): {
    name: string;
    rest: string;
};
/** Package-manager-specific adapter over a parsed lockfile. `resolve` must implement that
 * manager's own module-resolution rule — the BFS in buildDependencyGraph is otherwise identical
 * for npm, yarn, and pnpm. `range` is passed through for managers (yarn, pnpm) whose lockfile has
 * no physical node_modules layout to disambiguate conflicting versions by; npm's adapter ignores
 * it since nearest-node_modules-wins already encodes that. */
export type LockfileAdapter = {
    rootDependencies(): DependencySpec[];
    /** `fromKey` is "" for the root project itself. Returns the adapter's internal key for the
     * resolved install, or undefined if `name` isn't installed (e.g. an unmet optional peer). */
    resolve(fromKey: string, name: string, range: string): string | undefined;
    getNode(key: string): {
        name: string;
        version: string;
        license?: string;
        dependencies: DependencySpec[];
    } | undefined;
};
/** BFS from the root's direct dependencies outward. BFS (not DFS) guarantees the first time we
 * reach a given install location is via its shortest path — so depth/path always reflect the
 * shallowest route, which is the one worth reporting.
 *
 * `visitedKeys` (not visited names) is what prevents infinite loops on circular dependencies:
 * each physical install location is only ever expanded once, regardless of how many times it's
 * required. The output is keyed by name@version instead, since the same package can be
 * installed at multiple versions/locations in one tree and each is a distinct finding. */
export declare function buildDependencyGraph(adapter: LockfileAdapter): DependencyGraph;
