import type { DependencyGraph } from "./types.js";
/** pnpm-lock.yaml already stores fully-resolved dependency edges (importers' dependency values
 * and each snapshot's own "dependencies" map both give exact versions, not ranges), so unlike
 * yarn there's no descriptor lookup needed — a key is just reconstructed as `${name}@${version}`
 * and looked up directly. `importers` is keyed by every workspace project's own relative path
 * (root is "."), so a single-package repo and a pnpm workspace are handled the same way — the
 * loop below just runs once for the former. */
export declare function parsePnpmLockfileGraph(pnpmLockContent: string): Map<string, DependencyGraph>;
