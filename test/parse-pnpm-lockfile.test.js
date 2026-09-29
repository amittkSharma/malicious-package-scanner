import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePnpmLockfileGraph } from "../dist/parse-pnpm-lockfile.js";

// Captured shape from a real `pnpm install --ignore-scripts --lockfile-only` run against
// { dependencies: { minimatch: "^3.1.2" } }.
const PNPM_LOCK = `
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .:
    dependencies:
      minimatch:
        specifier: ^3.1.2
        version: 3.1.5

packages:

  balanced-match@1.0.2:
    resolution: {integrity: sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==}

  brace-expansion@1.1.21:
    resolution: {integrity: sha512-9zeA+KLZNNzglF2TPKRQEDyx6Yby7daAkuy8MiPzpXPsYDWi/DRM8jmwUDxokQjYqBpv5DgPiwD4h4ZZSy1Ujw==}

  concat-map@0.0.1:
    resolution: {integrity: sha512-/Srv4dswyQNBfohGpz9o6Yb3Gz3SrUDqBH5rTuhGR7ahtlbYKnVxw2bCFMRljaA7EXHaXZ8wsHdodFvbkhKmqg==}

  minimatch@3.1.5:
    resolution: {integrity: sha512-VgjWUsnnT6n+NUk6eZq77zeFdpW2LWDzP6zFGrCbHXiYNul5Dzqk2HHQ5uFH2DNW5Xbp8+jVzaeNt94ssEEl4w==}

snapshots:

  balanced-match@1.0.2: {}

  brace-expansion@1.1.21:
    dependencies:
      balanced-match: 1.0.2
      concat-map: 0.0.1

  concat-map@0.0.1: {}

  minimatch@3.1.5:
    dependencies:
      brace-expansion: 1.1.21
`;

test('direct dependency resolved from importers["."], version already exact (no range to resolve)', () => {
  const graph = parsePnpmLockfileGraph(PNPM_LOCK).get(".");
  assert.deepEqual(graph.get("minimatch@3.1.5"), {
    dependencyType: "direct",
    depth: undefined,
    path: ["minimatch"],
    license: undefined,
  });
});

test("transitive chain depth/path walked through snapshots", () => {
  const graph = parsePnpmLockfileGraph(PNPM_LOCK).get(".");
  assert.deepEqual(graph.get("brace-expansion@1.1.21").path, [
    "minimatch",
    "brace-expansion",
  ]);
  assert.deepEqual(graph.get("balanced-match@1.0.2"), {
    dependencyType: "transitive",
    depth: 3,
    path: ["minimatch", "brace-expansion", "balanced-match"],
    license: undefined,
  });
});

// Structurally mirrors a real captured run (eslint + eslint-plugin-react-hooks@^4.6.2) —
// renamed here to a minimal self-contained fixture. Confirms peer-suffixed snapshot keys
// ("name@version(peer@peerVersion)") are handled: kept in the graph key so distinct
// peer-resolutions don't collide, stripped for the reported version.
const PEER_SUFFIX_LOCK = `
lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      plugin-with-peer:
        specifier: ^1.0.0
        version: 1.0.0(host-lib@2.0.0)

snapshots:
  plugin-with-peer@1.0.0(host-lib@2.0.0):
    dependencies:
      host-lib: 2.0.0

  host-lib@2.0.0: {}
`;

test("peer-suffixed snapshot key: full suffix kept as graph key, version reported without it", () => {
  const graph = parsePnpmLockfileGraph(PEER_SUFFIX_LOCK).get(".");
  assert.equal(graph.get("plugin-with-peer@1.0.0").dependencyType, "direct");
  assert.deepEqual(graph.get("host-lib@2.0.0"), {
    dependencyType: "transitive",
    depth: 2,
    path: ["plugin-with-peer", "host-lib"],
    license: undefined,
  });
});
