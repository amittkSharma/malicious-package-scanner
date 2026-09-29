import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { discoverWorkspaceProjects } from "../dist/discover-workspaces.js";

function makeProject(rootDir, relativePath, packageJson) {
  const dir = path.join(rootDir, relativePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(packageJson));
}

test("discoverWorkspaceProjects: single-package repo (no workspaces field) returns just the root", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "discover-workspaces-"));
  makeProject(rootDir, ".", { name: "solo", dependencies: { left: "^1.0.0" } });

  const projects = discoverWorkspaceProjects(rootDir);
  assert.deepEqual(
    projects.map((p) => p.path),
    ["."],
  );
});

test("discoverWorkspaceProjects: expands a single-level glob and keeps exact paths", () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), "discover-workspaces-"));
  makeProject(rootDir, ".", { workspaces: ["packages/*", "tools/cli"] });
  makeProject(rootDir, "packages/foo", {
    dependencies: { "is-odd": "^3.0.1" },
  });
  makeProject(rootDir, "packages/bar", {
    dependencies: { "is-odd": "^3.0.1" },
  });
  makeProject(rootDir, "tools/cli", { dependencies: {} });

  const projects = discoverWorkspaceProjects(rootDir);
  assert.deepEqual(projects.map((p) => p.path).sort(), [
    ".",
    "packages/bar",
    "packages/foo",
    "tools/cli",
  ]);
});
