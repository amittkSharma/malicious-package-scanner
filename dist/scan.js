import { readFileSync } from "node:fs";
import path from "node:path";
import { applyOverrides } from "./apply-overrides.js";
import { discoverWorkspaceProjects } from "./discover-workspaces.js";
import { fetchPackageMetadata } from "./package-metadata.js";
import { parseNpmLockfileGraph } from "./parse-npm-lockfile.js";
import { parsePnpmLockfileGraph } from "./parse-pnpm-lockfile.js";
import { parseYarnLockfileGraph } from "./parse-yarn-lockfile.js";
import { runOsvScan } from "./run-osv-scan.js";
const LOCKFILE_PACKAGE_MANAGERS = {
    "package-lock.json": "npm",
    "yarn.lock": "yarn",
    "pnpm-lock.yaml": "pnpm",
};
export function detectPackageManager(lockfilePath) {
    return LOCKFILE_PACKAGE_MANAGERS[path.basename(lockfilePath)];
}
/** Keyed by workspace project path relative to the lockfile's own directory ("." for the root
 * project). A single-package repo always comes back as a one-entry map — a monorepo is simply
 * whatever has more than one, so nothing upstream needs to detect "is this a monorepo" as a
 * separate step. */
function loadGraph(lockfilePath, packageManager) {
    const content = readFileSync(lockfilePath, "utf8");
    if (packageManager === "npm") {
        return parseNpmLockfileGraph(content);
    }
    if (packageManager === "pnpm") {
        return parsePnpmLockfileGraph(content);
    }
    const projects = discoverWorkspaceProjects(path.dirname(lockfilePath));
    return parseYarnLockfileGraph(content, projects);
}
function readPackageJsonField(dir, field) {
    try {
        const parsed = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
        return parsed[field];
    }
    catch {
        return undefined;
    }
}
/** Prefers the root package.json's own "name" field (works for both a single package and a
 * monorepo's root manifest); falls back to the directory name if there's no package.json or it
 * has no "name" field, rather than failing the whole scan over a cosmetic detail. */
function resolveRepositoryName(rootDir) {
    return readPackageJsonField(rootDir, "name") ?? path.basename(rootDir);
}
/** One version lookup per workspace actually referenced by a finding/suppression, plus the root
 * ("."), so both a monorepo's per-project sections and a single-package repo's own header can
 * show "what version of this did we scan" without a separate workspace-discovery pass. Omits an
 * entry rather than guessing when a project has no version field. */
function resolveProjectVersions(rootDir, workspaces) {
    const versions = {};
    for (const workspace of new Set([".", ...workspaces])) {
        const dir = workspace === "." ? rootDir : path.join(rootDir, workspace);
        const version = readPackageJsonField(dir, "version");
        if (version) {
            versions[workspace] = version;
        }
    }
    return versions;
}
/** One metadata lookup per distinct dependency@version referenced by any finding or suppression
 * (a package shared across workspace projects is only fetched once), attached to every finding
 * that shares that key. Skipped entirely in offline mode — this is a network call to the public
 * npm registry, separate from the OSV database refresh, and --offline means no network calls,
 * full stop. */
async function enrichWithPackageMetadata(active, suppressed) {
    const findingsByKey = new Map();
    for (const finding of [...active, ...suppressed.map((s) => s.finding)]) {
        const key = `${finding.dependency}@${finding.version}`;
        const group = findingsByKey.get(key);
        if (group) {
            group.push(finding);
        }
        else {
            findingsByKey.set(key, [finding]);
        }
    }
    await Promise.all([...findingsByKey.values()].map(async (group) => {
        const metadata = await fetchPackageMetadata(group[0].dependency, group[0].version);
        if (metadata) {
            for (const finding of group) {
                finding.packageMetadata = metadata;
            }
        }
    }));
}
/** One osv-scanner pass over the whole rootDir, then per-lockfile graph enrichment
 * (direct/transitive/depth/path/license), then override filtering. Graphs are built once per
 * lockfile and reused across all matches found in it. */
export async function runScan(options) {
    const matches = runOsvScan({
        rootDir: options.rootDir,
        cacheTtlHours: options.config.cacheTtlHours,
        offline: options.config.offline,
    });
    const graphCache = new Map();
    const findings = [];
    for (const match of matches) {
        const packageManager = detectPackageManager(match.lockfilePath);
        if (!packageManager ||
            !options.config.packageManagers.includes(packageManager)) {
            continue;
        }
        let projectGraphs = graphCache.get(match.lockfilePath);
        if (!projectGraphs) {
            projectGraphs = loadGraph(match.lockfilePath, packageManager);
            graphCache.set(match.lockfilePath, projectGraphs);
        }
        findings.push(...toFindings(match, packageManager, options.rootDir, projectGraphs));
    }
    const { active, suppressed } = applyOverrides(findings, options.config.overrides);
    if (!options.config.offline) {
        await enrichWithPackageMetadata(active, suppressed);
    }
    const referencedWorkspaces = [
        ...active.map((f) => f.workspace),
        ...suppressed.map((s) => s.finding.workspace),
    ];
    return {
        generatedAt: new Date().toISOString(),
        repository: resolveRepositoryName(options.rootDir),
        projectVersions: resolveProjectVersions(options.rootDir, referencedWorkspaces),
        findings: active,
        suppressed,
    };
}
/** A malicious dependency can be used by several workspace projects at once — each is an
 * independently actionable finding (project A's team needs to know just as much as project B's),
 * so one match fans out into one MaliciousFinding per project whose graph actually uses it. If no
 * project's graph resolved the edge (e.g. an optional/peer-only edge our resolver doesn't walk),
 * it's still reported once, just without depth/path/license, rather than silently dropped. */
export function toFindings(match, packageManager, rootDir, projectGraphs) {
    const lockfileWorkspace = path.relative(rootDir, path.dirname(match.lockfilePath)) || ".";
    const key = `${match.dependency}@${match.version}`;
    const hits = [];
    for (const [projectPath, graph] of projectGraphs) {
        const entry = graph.get(key);
        if (entry) {
            hits.push(buildFinding(match, packageManager, joinWorkspace(lockfileWorkspace, projectPath), entry));
        }
    }
    if (hits.length > 0) {
        return hits;
    }
    return [buildFinding(match, packageManager, lockfileWorkspace, undefined)];
}
function joinWorkspace(lockfileWorkspace, projectPath) {
    if (projectPath === ".") {
        return lockfileWorkspace;
    }
    return lockfileWorkspace === "."
        ? projectPath
        : path.join(lockfileWorkspace, projectPath);
}
function buildFinding(match, packageManager, workspace, graphEntry) {
    return {
        advisoryId: match.advisoryId,
        reason: match.reason,
        advisoryUrl: match.advisoryUrl,
        dependency: match.dependency,
        version: match.version,
        dependencyType: graphEntry?.dependencyType ?? "transitive",
        depth: graphEntry?.depth,
        path: graphEntry?.path,
        license: graphEntry?.license,
        packageManager,
        workspace,
    };
}
