import assert from "node:assert/strict";
import { test } from "node:test";
import { runOsvScan } from "../dist/run-osv-scan.js";

test("runOsvScan: nonexistent rootDir fails fast with a clear message, not a raw osv-scanner dump", () => {
  assert.throws(
    () =>
      runOsvScan({
        rootDir: "/tmp/malicious-package-scanner-nonexistent-root",
        cacheTtlHours: 24,
        offline: true,
      }),
    /Directory not found: \/tmp\/malicious-package-scanner-nonexistent-root/,
  );
});
