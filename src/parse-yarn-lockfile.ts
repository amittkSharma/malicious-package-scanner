import {
  buildDependencyGraph,
  type DependencySpec,
  splitAtNameSeparator,
} from "./dependency-graph.js";
import type { WorkspaceProject } from "./discover-workspaces.js";
import type { DependencyGraph } from "./types.js";

type YarnEntry = {
  name: string;
  version: string;
  dependencies: DependencySpec[];
};

function unquote(token: string): string {
  return token.startsWith('"') && token.endsWith('"')
    ? token.slice(1, -1)
    : token;
}

function parseDependencyLine(line: string): DependencySpec {
  const trimmed = line.trim();
  if (trimmed.startsWith('"')) {
    const nameEnd = trimmed.indexOf('"', 1);
    return {
      name: trimmed.slice(1, nameEnd),
      range: unquote(trimmed.slice(nameEnd + 1).trim()),
    };
  }
  const spaceIdx = trimmed.indexOf(" ");
  return {
    name: trimmed.slice(0, spaceIdx),
    range: unquote(trimmed.slice(spaceIdx + 1).trim()),
  };
}

/** yarn.lock (classic v1) is a flat map of "name@range" descriptor -> resolved version + its own
 * declared dependencies (also as name@range pairs). Unlike npm there's no node_modules layout to
 * read depth from — resolution is just "look up this exact descriptor" — and no license field
 * ever appears in this format, so license stays undefined for yarn-sourced findings. */
function parseYarnLock(content: string): Map<string, YarnEntry> {
  const entries = new Map<string, YarnEntry>();
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === "" || line.startsWith("#") || line.startsWith(" ")) {
      i++;
      continue;
    }

    const header = line.endsWith(":") ? line.slice(0, -1) : line;
    const descriptors = header.split(", ").map(unquote);
    i++;

    const entry: YarnEntry = {
      name: splitAtNameSeparator(descriptors[0]).name,
      version: "",
      dependencies: [],
    };
    while (i < lines.length && lines[i].startsWith("  ")) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("version ")) {
        entry.version = unquote(trimmed.slice("version ".length));
        i++;
      } else if (
        trimmed === "dependencies:" ||
        trimmed === "optionalDependencies:"
      ) {
        i++;
        while (i < lines.length && lines[i].startsWith("    ")) {
          entry.dependencies.push(parseDependencyLine(lines[i]));
          i++;
        }
      } else {
        i++;
      }
    }

    for (const descriptor of descriptors) {
      entries.set(descriptor, entry);
    }
  }

  return entries;
}

/** yarn.lock is one flat descriptor map shared by every workspace project — there's no
 * per-project resolution rule to vary, only which package.json's own dependencies to start the
 * walk from. `projects` is every workspace project's own package.json content (root included,
 * as "."), discovered separately since yarn.lock itself carries no workspace information. */
export function parseYarnLockfileGraph(
  yarnLockContent: string,
  projects: WorkspaceProject[],
): Map<string, DependencyGraph> {
  const entries = parseYarnLock(yarnLockContent);

  const graphs = new Map<string, DependencyGraph>();
  for (const project of projects) {
    const pkg = JSON.parse(project.packageJsonContent) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const rootDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies,
    };

    const graph = buildDependencyGraph({
      rootDependencies: () =>
        Object.entries(rootDeps).map(([name, range]) => ({ name, range })),
      resolve: (_fromKey, name, range) => {
        const descriptor = `${name}@${range}`;
        return entries.has(descriptor) ? descriptor : undefined;
      },
      getNode: (key) => {
        const entry = entries.get(key);
        if (!entry) {
          return undefined;
        }
        return {
          name: entry.name,
          version: entry.version,
          license: undefined,
          dependencies: entry.dependencies,
        };
      },
    });
    graphs.set(project.path, graph);
  }
  return graphs;
}
