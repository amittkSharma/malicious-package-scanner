import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
/** Expands npm/yarn's package.json "workspaces" field into concrete project directories.
 * Supports exact paths ("packages/foo") and single-level globs ("packages/*") — the two forms
 * that cover the overwhelming majority of real-world configs. Nested/negated globs ("**", "!...")
 * are not expanded; add if a real workspace config needs them. */
function expandWorkspaceGlobs(rootDir, patterns) {
    const projectPaths = [];
    for (const pattern of patterns) {
        if (!pattern.endsWith("/*")) {
            if (existsSync(path.join(rootDir, pattern, "package.json"))) {
                projectPaths.push(pattern);
            }
            continue;
        }
        const parent = pattern.slice(0, -2);
        const parentDir = path.join(rootDir, parent);
        if (!existsSync(parentDir)) {
            continue;
        }
        for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
            if (entry.isDirectory() &&
                existsSync(path.join(parentDir, entry.name, "package.json"))) {
                projectPaths.push(`${parent}/${entry.name}`);
            }
        }
    }
    return projectPaths;
}
/** yarn.lock carries no notion of which workspace project owns which direct dependency — that
 * only lives in package.json's "workspaces" field and each project's own package.json. npm and
 * pnpm don't need this: their lockfiles already self-describe every workspace project (see
 * parse-npm-lockfile.ts / parse-pnpm-lockfile.ts). */
export function discoverWorkspaceProjects(rootDir) {
    const rootPackageJsonContent = readFileSync(path.join(rootDir, "package.json"), "utf8");
    const projects = [
        { path: ".", packageJsonContent: rootPackageJsonContent },
    ];
    const pkg = JSON.parse(rootPackageJsonContent);
    const patterns = Array.isArray(pkg.workspaces)
        ? pkg.workspaces
        : (pkg.workspaces?.packages ?? []);
    for (const projectPath of expandWorkspaceGlobs(rootDir, patterns)) {
        projects.push({
            path: projectPath,
            packageJsonContent: readFileSync(path.join(rootDir, projectPath, "package.json"), "utf8"),
        });
    }
    return projects;
}
