import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNpmLockfileGraph } from "../dist/parse-npm-lockfile.js";

// Deliberately shaped to defeat a naive "count node_modules segments" depth heuristic:
// root -> a -> b -> c@1.0.0 (npm hoists this transitive c all the way to top-level
// node_modules/c, so its *physical* depth is 1, but its *logical* depth is 3).
// root -> a -> c@2.0.0 also exists, nested under a, at logical depth 2 — proving version
// conflicts of the same package name are tracked as distinct graph entries.
const LOCKFILE_V3 = JSON.stringify({
  packages: {
    "": {
      name: "root",
      version: "1.0.0",
      dependencies: { a: "^1.0.0" },
      devDependencies: { d: "^1.0.0" },
    },
    "node_modules/a": {
      version: "1.0.0",
      dependencies: { b: "^1.0.0", c: "^2.0.0" },
    },
    "node_modules/a/node_modules/c": { version: "2.0.0", license: "MIT" },
    "node_modules/b": { version: "1.0.0", dependencies: { c: "^1.0.0" } },
    "node_modules/c": { version: "1.0.0", license: "ISC" },
    "node_modules/d": { version: "1.0.0" },
  },
});

test("direct dependency: depth undefined, single-element path", () => {
  const graph = parseNpmLockfileGraph(LOCKFILE_V3).get(".");
  assert.deepEqual(graph.get("a@1.0.0"), {
    dependencyType: "direct",
    depth: undefined,
    path: ["a"],
    license: undefined,
  });
});

test("devDependency counts as direct too", () => {
  const graph = parseNpmLockfileGraph(LOCKFILE_V3).get(".");
  assert.equal(graph.get("d@1.0.0").dependencyType, "direct");
});

test("transitive dep nested directly under its requirer: depth 2", () => {
  const graph = parseNpmLockfileGraph(LOCKFILE_V3).get(".");
  assert.deepEqual(graph.get("c@2.0.0"), {
    dependencyType: "transitive",
    depth: 2,
    path: ["a", "c"],
    license: "MIT",
  });
});

test("transitive dep hoisted to top-level node_modules still reports its logical depth (3), not its physical depth (1)", () => {
  const graph = parseNpmLockfileGraph(LOCKFILE_V3).get(".");
  assert.deepEqual(graph.get("c@1.0.0"), {
    dependencyType: "transitive",
    depth: 3,
    path: ["a", "b", "c"],
    license: "ISC",
  });
});

test("b resolved as transitive at depth 2", () => {
  const graph = parseNpmLockfileGraph(LOCKFILE_V3).get(".");
  assert.deepEqual(graph.get("b@1.0.0").path, ["a", "b"]);
  assert.equal(graph.get("b@1.0.0").depth, 2);
});
