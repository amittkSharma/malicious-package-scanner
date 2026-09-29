import { statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** All three package managers (npm, yarn, pnpm) resolve packages from the same npm registry, so
 * OSV.dev only maintains one "npm" ecosystem database regardless of which lockfile format a
 * project uses — one cache, one TTL check, shared across all three. */
const OSV_ECOSYSTEM = "npm";

/** We pin osv-scanner's cache location ourselves (via OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY)
 * instead of relying on its own default-resolution logic (a Go os.UserCacheDir()/TempDir()
 * fallback chain) — reimplementing that resolution here just to find the same file would be
 * fragile, platform-specific duplication for no benefit. Pinning it means our TTL check always
 * knows exactly where to look. */
export function resolveCacheDir(overrideDir?: string): string {
  return (
    overrideDir ??
    path.join(homedir(), ".cache", "malicious-package-scanner", "osv-db")
  );
}

/** osv-scanner has no built-in TTL/freshness concept — it downloads once, on request, and
 * otherwise trusts whatever's cached. Freshness is a policy this tool owns, not something
 * osv-scanner tracks for us. */
export function isCacheStale(cacheDir: string, ttlHours: number): boolean {
  // Verified against a real osv-scanner v2.6.0 run — it nests its own internal
  // "osv-scalibr" component name under whatever directory we hand it, so the real path is one
  // level deeper than the directory we pass in.
  const dbFile = path.join(cacheDir, "osv-scalibr", OSV_ECOSYSTEM, "all.zip");
  let mtimeMs: number;
  try {
    mtimeMs = statSync(dbFile).mtimeMs;
  } catch {
    return true;
  }
  return Date.now() - mtimeMs > ttlHours * 60 * 60 * 1000;
}
