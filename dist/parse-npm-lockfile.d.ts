import type { DependencyGraph } from "./types.js";
export declare function parseNpmLockfileGraph(lockfileJson: string): Map<string, DependencyGraph>;
