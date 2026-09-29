import type { WorkspaceProject } from "./discover-workspaces.js";
import type { DependencyGraph } from "./types.js";
/** yarn.lock is one flat descriptor map shared by every workspace project — there's no
 * per-project resolution rule to vary, only which package.json's own dependencies to start the
 * walk from. `projects` is every workspace project's own package.json content (root included,
 * as "."), discovered separately since yarn.lock itself carries no workspace information. */
export declare function parseYarnLockfileGraph(yarnLockContent: string, projects: WorkspaceProject[]): Map<string, DependencyGraph>;
