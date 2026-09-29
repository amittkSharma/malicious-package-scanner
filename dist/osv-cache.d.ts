/** We pin osv-scanner's cache location ourselves (via OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY)
 * instead of relying on its own default-resolution logic (a Go os.UserCacheDir()/TempDir()
 * fallback chain) — reimplementing that resolution here just to find the same file would be
 * fragile, platform-specific duplication for no benefit. Pinning it means our TTL check always
 * knows exactly where to look. */
export declare function resolveCacheDir(overrideDir?: string): string;
/** osv-scanner has no built-in TTL/freshness concept — it downloads once, on request, and
 * otherwise trusts whatever's cached. Freshness is a policy this tool owns, not something
 * osv-scanner tracks for us. */
export declare function isCacheStale(cacheDir: string, ttlHours: number): boolean;
