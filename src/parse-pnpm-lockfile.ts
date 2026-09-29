import { parse as parseYaml } from "yaml";
import {
  buildDependencyGraph,
  splitAtNameSeparator,
} from "./dependency-graph.js";
import type { DependencyGraph } from "./types.js";

type PnpmImporterDep = { specifier: string; version: string };
type PnpmImporter = {
  dependencies?: Record<string, PnpmImporterDep>;
  devDependencies?: Record<string, PnpmImporterDep>;
  optionalDependencies?: Record<string, PnpmImporterDep>;
};
type PnpmSnapshot = {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};
type PnpmLockfile = {
  importers?: Record<string, PnpmImporter>;
  snapshots?: Record<string, PnpmSnapshot>;
};

/** pnpm's snapshot keys are "name@version", optionally followed by one or more
 * "(peerName@peerVersion)" suffixes disambiguating which peer-dependency resolution this
 * install satisfies (e.g. "eslint-plugin-react-hooks@4.6.2(eslint@8.57.1)"). The peer suffix is
 * part of the graph key (two peer-resolved instances are genuinely different installs) but
 * stripped for the reported version, since that's what osv-scanner's plain semver output will
 * match against. */
function splitSnapshotKey(key: string): { name: string; plainVersion: string } {
  const { name, rest } = splitAtNameSeparator(key);
  return { name, plainVersion: rest.split("(")[0] };
}

/** pnpm-lock.yaml already stores fully-resolved dependency edges (importers' dependency values
 * and each snapshot's own "dependencies" map both give exact versions, not ranges), so unlike
 * yarn there's no descriptor lookup needed — a key is just reconstructed as `${name}@${version}`
 * and looked up directly. `importers` is keyed by every workspace project's own relative path
 * (root is "."), so a single-package repo and a pnpm workspace are handled the same way — the
 * loop below just runs once for the former. */
export function parsePnpmLockfileGraph(
  pnpmLockContent: string,
): Map<string, DependencyGraph> {
  const doc = parseYaml(pnpmLockContent) as PnpmLockfile;
  const snapshots = doc.snapshots ?? {};
  const importers = doc.importers ?? {};

  const graphs = new Map<string, DependencyGraph>();
  for (const [projectPath, importer] of Object.entries(importers)) {
    const rootDeps = {
      ...importer.dependencies,
      ...importer.devDependencies,
      ...importer.optionalDependencies,
    };

    const graph = buildDependencyGraph({
      rootDependencies: () =>
        Object.entries(rootDeps).map(([name, dep]) => ({
          name,
          range: dep.version,
        })),
      resolve: (_fromKey, name, range) => {
        const key = `${name}@${range}`;
        return snapshots[key] ? key : undefined;
      },
      getNode: (key) => {
        const snapshot = snapshots[key];
        if (!snapshot) {
          return undefined;
        }
        const { name, plainVersion } = splitSnapshotKey(key);
        const dependencies = Object.entries({
          ...snapshot.dependencies,
          ...snapshot.optionalDependencies,
        }).map(([depName, depVersion]) => ({
          name: depName,
          range: depVersion,
        }));
        return {
          name,
          version: plainVersion,
          license: undefined,
          dependencies,
        };
      },
    });
    graphs.set(projectPath, graph);
  }
  return graphs;
}
