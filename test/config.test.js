import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadConfig } from "../dist/config.js";

test("loadConfig: missing file returns defaults", () => {
  const config = loadConfig(
    path.join(tmpdir(), "malicious-package-scanner-no-such-config.json"),
  );
  assert.deepEqual(config, {
    packageManagers: ["npm", "yarn", "pnpm"],
    overrides: [],
    cacheTtlHours: 24,
    offline: false,
  });
});

test("loadConfig: malformed JSON throws with the file path included", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "config-test-"));
  const configPath = path.join(dir, "malicious-package-scanner.config.json");
  writeFileSync(configPath, "{ not valid json");

  assert.throws(
    () => loadConfig(configPath),
    new RegExp(
      `Failed to parse config file at ${configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
});
