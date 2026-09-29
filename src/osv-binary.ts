import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const BINARY_NAME = "osv-scanner";

const INSTALL_INSTRUCTIONS = `\
osv-scanner was not found on PATH, and this package's own postinstall step wasn't able to fetch
it either (offline install, unsupported platform, or --ignore-scripts). Install one of:
  - Prebuilt binary: https://github.com/google/osv-scanner/releases
  - Go toolchain:     go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest
Then re-run.`;

/** Same path scripts/postinstall.cjs writes to — kept as a single literal in each file rather
 * than a shared import, since postinstall runs as a standalone CommonJS script outside the
 * compiled dist/ output (it must work before this package has ever been built). Exported so
 * test/postinstall.test.js can assert the two copies haven't drifted apart. */
export function cachedBinaryPath(): string {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return path.join(
    homedir(),
    ".cache",
    "malicious-package-scanner",
    "bin",
    `osv-scanner${suffix}`,
  );
}

function isOnPath(): boolean {
  try {
    execFileSync(BINARY_NAME, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Resolves which osv-scanner binary to invoke. A system install (brew/go/manual) on PATH always
 * wins over this package's own auto-downloaded copy — if the user already manages their own
 * install, defer to it rather than shadowing it. Falls back to the postinstall-fetched cache,
 * then fails with instructions if neither exists. */
export function resolveOsvScannerCommand(): string {
  if (isOnPath()) {
    return BINARY_NAME;
  }
  const cached = cachedBinaryPath();
  if (existsSync(cached)) {
    return cached;
  }
  throw new Error(INSTALL_INSTRUCTIONS);
}
