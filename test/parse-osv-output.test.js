import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOsvOutput } from "../dist/parse-osv-output.js";

// Trimmed but structurally real: captured from an actual `osv-scanner scan source --format json`
// run (v2.6.0) against a lockfile referencing the OSV.dev test entry MAL-2026-6486
// ("unsafe-malicious-package"), plus a synthetic CVE entry added to prove non-MAL findings are
// filtered out.
const REAL_SHAPE_OUTPUT = JSON.stringify({
  results: [
    {
      source: { path: "/tmp/osv-fixture/package-lock.json", type: "lockfile" },
      packages: [
        {
          package: {
            name: "unsafe-malicious-package",
            version: "1.0.2",
            ecosystem: "npm",
          },
          vulnerabilities: [
            {
              id: "MAL-2026-6486",
              summary: "Malicious code in unsafe-malicious-package (npm)",
            },
          ],
        },
        {
          package: { name: "some-lib", version: "2.0.0", ecosystem: "npm" },
          vulnerabilities: [
            {
              id: "GHSA-xxxx-yyyy-zzzz",
              summary: "Prototype pollution in some-lib",
            },
          ],
        },
        {
          package: { name: "clean-lib", version: "3.1.4", ecosystem: "npm" },
        },
      ],
    },
  ],
});

test("extracts only MAL- prefixed findings, ignores regular CVE/GHSA entries", () => {
  const matches = parseOsvOutput(REAL_SHAPE_OUTPUT);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].dependency, "unsafe-malicious-package");
  assert.equal(matches[0].version, "1.0.2");
  assert.equal(matches[0].advisoryId, "MAL-2026-6486");
  assert.equal(
    matches[0].advisoryUrl,
    "https://osv.dev/vulnerability/MAL-2026-6486",
  );
  assert.equal(matches[0].lockfilePath, "/tmp/osv-fixture/package-lock.json");
});

test("no results: empty array, no throw", () => {
  assert.deepEqual(parseOsvOutput(JSON.stringify({})), []);
});

test("package with no vulnerabilities array: skipped without error", () => {
  const output = JSON.stringify({
    results: [
      {
        source: { path: "lockfile" },
        packages: [{ package: { name: "clean-lib", version: "1.0.0" } }],
      },
    ],
  });
  assert.deepEqual(parseOsvOutput(output), []);
});
