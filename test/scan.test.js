import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPackageManager, toFindings } from "../dist/scan.js";

test("detectPackageManager maps known lockfile filenames", () => {
  assert.equal(detectPackageManager("/repo/package-lock.json"), "npm");
  assert.equal(detectPackageManager("/repo/packages/api/yarn.lock"), "yarn");
  assert.equal(detectPackageManager("/repo/pnpm-lock.yaml"), "pnpm");
  assert.equal(detectPackageManager("/repo/composer.lock"), undefined);
});

const MATCH = {
  advisoryId: "MAL-2026-6486",
  reason: "Malicious code",
  advisoryUrl: "https://osv.dev/vulnerability/MAL-2026-6486",
  dependency: "unsafe-malicious-package",
  version: "1.0.2",
  lockfilePath: "/repo/packages/api/package-lock.json",
};

test("toFindings: graph hit fills in dependencyType/depth/path/license and derives workspace", () => {
  const projectGraphs = new Map([
    [
      ".",
      new Map([
        [
          "unsafe-malicious-package@1.0.2",
          {
            dependencyType: "transitive",
            depth: 2,
            path: ["a", "unsafe-malicious-package"],
            license: "MIT",
          },
        ],
      ]),
    ],
  ]);
  const findings = toFindings(MATCH, "npm", "/repo", projectGraphs);
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding.dependencyType, "transitive");
  assert.equal(finding.depth, 2);
  assert.deepEqual(finding.path, ["a", "unsafe-malicious-package"]);
  assert.equal(finding.license, "MIT");
  assert.equal(finding.workspace, "packages/api");
  assert.equal(finding.packageManager, "npm");
});

test('toFindings: lockfile at rootDir itself reports workspace as "."', () => {
  const findings = toFindings(
    { ...MATCH, lockfilePath: "/repo/package-lock.json" },
    "npm",
    "/repo",
    new Map(),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].workspace, ".");
});

test('toFindings: graph miss falls back to transitive with no depth/path/license, not a false "direct"', () => {
  const findings = toFindings(MATCH, "npm", "/repo", new Map());
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding.dependencyType, "transitive");
  assert.equal(finding.depth, undefined);
  assert.equal(finding.path, undefined);
  assert.equal(finding.license, undefined);
});

test("toFindings: dependency shared by two workspace projects fans out into one finding per project", () => {
  const sharedEntry = {
    dependencyType: "direct",
    depth: undefined,
    path: ["unsafe-malicious-package"],
    license: undefined,
  };
  const projectGraphs = new Map([
    [
      "packages/foo",
      new Map([["unsafe-malicious-package@1.0.2", sharedEntry]]),
    ],
    [
      "packages/bar",
      new Map([["unsafe-malicious-package@1.0.2", sharedEntry]]),
    ],
  ]);
  const findings = toFindings(
    { ...MATCH, lockfilePath: "/repo/package-lock.json" },
    "npm",
    "/repo",
    projectGraphs,
  );
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((f) => f.workspace).sort(), [
    "packages/bar",
    "packages/foo",
  ]);
});
