import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOverrides } from "../dist/apply-overrides.js";

const baseFinding = {
  advisoryId: "MAL-2026-0001",
  reason: "Malicious code in postinstall script",
  advisoryUrl: "https://osv.dev/vulnerability/MAL-2026-0001",
  dependency: "evil-lib",
  version: "1.2.3",
  dependencyType: "transitive",
  depth: 4,
  path: ["app", "middle", "evil-lib"],
  packageManager: "npm",
  workspace: "apps/shop",
};

test("no overrides: finding stays active", () => {
  const { active, suppressed } = applyOverrides([baseFinding], []);
  assert.equal(active.length, 1);
  assert.equal(suppressed.length, 0);
});

test("blanket override (no version pinned) suppresses any version", () => {
  const override = {
    name: "evil-lib",
    reason: "accepted risk, patched internally",
  };
  const { active, suppressed } = applyOverrides([baseFinding], [override]);
  assert.equal(active.length, 0);
  assert.equal(suppressed.length, 1);
  assert.equal(suppressed[0].override, override);
});

test("version-pinned override only suppresses that exact version", () => {
  const override = {
    name: "evil-lib",
    version: "9.9.9",
    reason: "different version, shouldn't match",
  };
  const { active, suppressed } = applyOverrides([baseFinding], [override]);
  assert.equal(active.length, 1);
  assert.equal(suppressed.length, 0);
});

test("expired override no longer suppresses — finding reappears", () => {
  const override = {
    name: "evil-lib",
    reason: "temporary exception",
    expiresAt: "2020-01-01T00:00:00.000Z",
  };
  const { active, suppressed } = applyOverrides(
    [baseFinding],
    [override],
    new Date("2026-09-26"),
  );
  assert.equal(active.length, 1);
  assert.equal(suppressed.length, 0);
});

test("future-dated expiry still suppresses", () => {
  const override = {
    name: "evil-lib",
    reason: "temporary exception",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  const { active, suppressed } = applyOverrides(
    [baseFinding],
    [override],
    new Date("2026-09-26"),
  );
  assert.equal(active.length, 0);
  assert.equal(suppressed.length, 1);
});
