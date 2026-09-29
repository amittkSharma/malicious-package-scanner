/** Same path scripts/postinstall.cjs writes to — kept as a single literal in each file rather
 * than a shared import, since postinstall runs as a standalone CommonJS script outside the
 * compiled dist/ output (it must work before this package has ever been built). Exported so
 * test/postinstall.test.js can assert the two copies haven't drifted apart. */
export declare function cachedBinaryPath(): string;
/** Resolves which osv-scanner binary to invoke. A system install (brew/go/manual) on PATH always
 * wins over this package's own auto-downloaded copy — if the user already manages their own
 * install, defer to it rather than shadowing it. Falls back to the postinstall-fetched cache,
 * then fails with instructions if neither exists. */
export declare function resolveOsvScannerCommand(): string;
