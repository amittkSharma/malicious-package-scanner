import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { cachedBinaryPath as tsCachedBinaryPath } from "../dist/osv-binary.js";
import { cachedBinaryPath, parseChecksum } from "../scripts/postinstall.cjs";

const SHA256SUMS_FIXTURE = `\
d5c2b6e8f1a3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9  osv-scanner_darwin_amd64
1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b  osv-scanner_linux_amd64
`;

test("parseChecksum finds the hash for a matching asset name", () => {
  assert.equal(
    parseChecksum(SHA256SUMS_FIXTURE, "osv-scanner_linux_amd64"),
    "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
  );
});

test("parseChecksum returns undefined for an asset not in the sums file", () => {
  assert.equal(
    parseChecksum(SHA256SUMS_FIXTURE, "osv-scanner_windows_amd64.exe"),
    undefined,
  );
});

test("cachedBinaryPath is under the user's cache dir and uses .exe only on win32", () => {
  const p = cachedBinaryPath();
  assert.ok(
    p.includes(path.join(".cache", "malicious-package-scanner", "bin")),
  );
  assert.equal(p.endsWith(".exe"), process.platform === "win32");
});

test("postinstall.cjs's cachedBinaryPath matches src/osv-binary.ts's copy (no drift)", () => {
  assert.equal(cachedBinaryPath(), tsCachedBinaryPath());
});
