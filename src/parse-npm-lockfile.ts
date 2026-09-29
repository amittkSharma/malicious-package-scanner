import { buildDependencyGraph } from "./dependency-graph.js";
import type { DependencyGraph } from "./types.js";

type NpmPackageEntry = {
  name?: string;
  version?: string;
  license?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type NpmLockfileV3 = {
  packages?: Record<string, NpmPackageEntry>;
};

/** npm's own resolution rule: nearest node_modules wins. Given the physical path key of the
 * requiring package, check its own nested node_modules first, then walk up one node_modules
 * level at a time until reaching the project root. This is required because npm hoists
 * dependencies for deduplication — a package's *physical* nesting depth is not the same as its
 * *logical* depth in the dependency graph, which is why we can't just count node_modules
 * segments in the key and have to actually replay this walk. */
function resolveNearest(
  packages: Record<string, NpmPackageEntry>,
  fromKey: string,
  name: string,
): string | undefined {
  let prefix = fromKey;
  for (;;) {
    const candidate =
      prefix === "" ? `node_modules/${name}` : `${prefix}/node_modules/${name}`;
    if (packages[candidate]) {
      return candidate;
    }
    if (prefix === "") {
      return undefined;
    }
    const idx = prefix.lastIndexOf("/node_modules/");
    prefix = idx === -1 ? "" : prefix.slice(0, idx);
  }
}

/** npm workspace projects show up as extra top-level `packages` keys matching their own relative
 * path (e.g. "packages/foo") — distinct from installed deps, which always live under a
 * "node_modules/" key. The root project's own key is the empty string. No glob expansion of
 * package.json's "workspaces" field is needed: the lockfile has already resolved it. */
function listProjectKeys(packages: Record<string, NpmPackageEntry>): string[] {
  return [
    "",
    ...Object.keys(packages).filter(
      (key) => key !== "" && !key.startsWith("node_modules/"),
    ),
  ];
}

export function parseNpmLockfileGraph(
  lockfileJson: string,
): Map<string, DependencyGraph> {
  const data = JSON.parse(lockfileJson) as NpmLockfileV3;
  const packages = data.packages ?? {};

  const graphs = new Map<string, DependencyGraph>();
  for (const projectKey of listProjectKeys(packages)) {
    const project = packages[projectKey] ?? {};
    const rootDeps = {
      ...project.dependencies,
      ...project.devDependencies,
      ...project.optionalDependencies,
    };

    const graph = buildDependencyGraph({
      rootDependencies: () =>
        Object.entries(rootDeps).map(([name, range]) => ({ name, range })),
      // npm's nearest-node_modules-wins physical layout already guarantees the copy found is the
      // one satisfying this specific edge, so the requested range itself is unused here. A root
      // fromKey ("") always means "start from this project", not necessarily the repo root.
      resolve: (fromKey, name) =>
        resolveNearest(packages, fromKey === "" ? projectKey : fromKey, name),
      getNode: (key) => {
        const pkg = packages[key];
        if (!pkg) {
          return undefined;
        }
        const name =
          pkg.name ??
          key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
        const dependencies = Object.entries({
          ...pkg.dependencies,
          ...pkg.optionalDependencies,
        }).map(([depName, range]) => ({ name: depName, range }));
        return {
          name,
          version: pkg.version ?? "",
          license: pkg.license,
          dependencies,
        };
      },
    });
    graphs.set(projectKey === "" ? "." : projectKey, graph);
  }
  return graphs;
}
