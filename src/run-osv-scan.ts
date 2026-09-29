import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolveOsvScannerCommand } from "./osv-binary.js";
import { isCacheStale, resolveCacheDir } from "./osv-cache.js";
import { parseOsvOutput } from "./parse-osv-output.js";
import type { RawMaliciousMatch } from "./types.js";

export type RunOsvScanOptions = {
  rootDir: string;
  cacheTtlHours: number;
  offline: boolean;
};

/** osv-scanner exits 1 when it finds vulnerabilities (that's the whole point — CI should fail),
 * and non-1/0 for actual execution errors. execFileSync throws on any non-zero exit, so both
 * cases arrive as a caught error; only exit 1 is "findings, not a failure." */
export function runOsvScan(options: RunOsvScanOptions): RawMaliciousMatch[] {
  if (!existsSync(options.rootDir)) {
    throw new Error(`Directory not found: ${options.rootDir}`);
  }
  const command = resolveOsvScannerCommand();

  const cacheDir = resolveCacheDir();
  const stale = isCacheStale(cacheDir, options.cacheTtlHours);
  const args = [
    "scan",
    "source",
    "-r",
    options.rootDir,
    "--data-source",
    "native",
    "--format",
    "json",
    "--offline-vulnerabilities",
  ];
  if (stale && !options.offline) {
    args.push("--download-offline-databases");
  }

  const stdout = runAllowingFindingsExit(
    command,
    args,
    cacheDir,
    options.rootDir,
  );
  return parseOsvOutput(stdout);
}

function runAllowingFindingsExit(
  command: string,
  args: string[],
  cacheDir: string,
  rootDir: string,
): string {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      // execFileSync's default 1MB maxBuffer is easily exceeded by real monorepo scans (a
      // few thousand packages already produces several MB of JSON) — 200MB comfortably covers
      // even very large dependency trees without risking unbounded memory growth.
      maxBuffer: 200 * 1024 * 1024,
      env: { ...process.env, OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: cacheDir },
    });
  } catch (error) {
    const execError = error as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    if (execError.status === 1 && execError.stdout) {
      return execError.stdout;
    }
    if (execError.stderr?.includes("No package sources found")) {
      throw new Error(
        `No supported lockfile (package-lock.json, yarn.lock, or pnpm-lock.yaml) found under ${rootDir}. Run this from your project or monorepo root.`,
      );
    }
    throw new Error(
      `osv-scanner failed (exit ${execError.status ?? "unknown"}): ${execError.stderr ?? String(error)}`,
    );
  }
}
