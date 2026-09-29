#!/usr/bin/env node
"use strict";

/** Best-effort osv-scanner auto-install. Runs as a plain CommonJS script (not compiled TS) so it
 * works before this package has ever been built, and never throws past main() — a postinstall
 * script that exits non-zero breaks `npm install` for every consumer, so any failure here (no
 * network, unsupported platform, checksum mismatch) just warns and defers to the runtime
 * fail-fast check in src/osv-binary.ts, which gives manual-install instructions. */

const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

// Bump when picking up a newer osv-scanner release. Re-verify against a real release if the
// asset names or SHA256SUMS format below ever look wrong for a new version.
const OSV_SCANNER_VERSION = "v2.6.0";
const RELEASE_BASE = `https://github.com/google/osv-scanner/releases/download/${OSV_SCANNER_VERSION}`;

// Verified against the real v2.6.0 release asset list — one raw binary per platform, no
// archive/extraction step needed.
const ASSET_NAMES = {
  "darwin-x64": "osv-scanner_darwin_amd64",
  "darwin-arm64": "osv-scanner_darwin_arm64",
  "linux-x64": "osv-scanner_linux_amd64",
  "linux-arm64": "osv-scanner_linux_arm64",
  "win32-x64": "osv-scanner_windows_amd64.exe",
  "win32-arm64": "osv-scanner_windows_arm64.exe",
};

function log(message) {
  console.warn(`[malicious-package-scanner] ${message}`);
}

// Must match cachedBinaryPath() in src/osv-binary.ts exactly.
function cachedBinaryPath() {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return path.join(
    os.homedir(),
    ".cache",
    "malicious-package-scanner",
    "bin",
    `osv-scanner${suffix}`,
  );
}

function isOnPath() {
  try {
    execFileSync("osv-scanner", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function fetchBuffer(url, redirectsLeft) {
  if (redirectsLeft === undefined) {
    redirectsLeft = 5;
  }
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        { headers: { "User-Agent": "malicious-package-scanner-postinstall" } },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            res.resume();
            resolve(fetchBuffer(res.headers.location, redirectsLeft - 1));
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`GET ${url} failed: HTTP ${res.statusCode}`));
            return;
          }
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        },
      )
      .on("error", reject);
  });
}

// osv-scanner_SHA256SUMS is standard `sha256sum` output: "<64-hex-char hash>  <filename>" per line.
function parseChecksum(sha256sumsText, assetName) {
  for (const line of sha256sumsText.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts[1] === assetName) {
      return parts[0];
    }
  }
  return undefined;
}

async function main() {
  if (process.env.MALICIOUS_PACKAGE_SCANNER_SKIP_DOWNLOAD) {
    log(
      "MALICIOUS_PACKAGE_SCANNER_SKIP_DOWNLOAD set, skipping osv-scanner auto-install.",
    );
    return;
  }
  if (isOnPath()) {
    return; // A system install (brew/go/manual) always wins — nothing to do.
  }

  const target = cachedBinaryPath();
  if (fs.existsSync(target)) {
    return; // Already fetched by a previous install.
  }

  const assetKey = `${process.platform}-${process.arch}`;
  const assetName = ASSET_NAMES[assetKey];
  if (!assetName) {
    log(
      `No prebuilt osv-scanner for platform "${assetKey}" — install it manually: https://github.com/google/osv-scanner/releases`,
    );
    return;
  }

  log(`Fetching osv-scanner ${OSV_SCANNER_VERSION} (${assetName})...`);
  const [checksums, binary] = await Promise.all([
    fetchBuffer(`${RELEASE_BASE}/osv-scanner_SHA256SUMS`).then((buf) =>
      buf.toString("utf8"),
    ),
    fetchBuffer(`${RELEASE_BASE}/${assetName}`),
  ]);

  const expectedHash = parseChecksum(checksums, assetName);
  if (!expectedHash) {
    log(
      `No checksum entry found for ${assetName} — refusing to install an unverified binary.`,
    );
    return;
  }

  const actualHash = crypto.createHash("sha256").update(binary).digest("hex");
  if (actualHash !== expectedHash) {
    log(
      `Checksum mismatch for ${assetName} (expected ${expectedHash}, got ${actualHash}) — refusing to install.`,
    );
    return;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, binary, { mode: 0o755 });
  log(`osv-scanner ${OSV_SCANNER_VERSION} installed to ${target}`);
}

if (require.main === module) {
  main().catch((error) => {
    log(
      `Couldn't auto-install osv-scanner (${error.message}). It will be required at scan time if not already installed — install manually if this keeps failing: https://github.com/google/osv-scanner/releases`,
    );
  });
}

module.exports = { parseChecksum, cachedBinaryPath };
