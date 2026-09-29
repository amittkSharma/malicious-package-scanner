export type WorkspaceProject = {
    path: string;
    packageJsonContent: string;
};
/** yarn.lock carries no notion of which workspace project owns which direct dependency — that
 * only lives in package.json's "workspaces" field and each project's own package.json. npm and
 * pnpm don't need this: their lockfiles already self-describe every workspace project (see
 * parse-npm-lockfile.ts / parse-pnpm-lockfile.ts). */
export declare function discoverWorkspaceProjects(rootDir: string): WorkspaceProject[];
