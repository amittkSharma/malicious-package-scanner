import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchPackageMetadata,
  parsePerson,
  repositoryUrl,
  resolveContact,
} from "../dist/package-metadata.js";

test("parsePerson: structured object form", () => {
  assert.deepEqual(
    parsePerson({ name: "Jane Doe", email: "jane@example.com" }),
    {
      name: "Jane Doe",
      email: "jane@example.com",
    },
  );
});

test("parsePerson: legacy 'Name <email> (url)' string form", () => {
  assert.deepEqual(
    parsePerson("Jane Doe <jane@example.com> (https://example.com)"),
    { name: "Jane Doe", email: "jane@example.com" },
  );
});

test("parsePerson: bare name string, no email or url", () => {
  assert.deepEqual(parsePerson("Jane Doe"), { name: "Jane Doe" });
});

test("parsePerson: undefined input", () => {
  assert.deepEqual(parsePerson(undefined), {});
});

test("repositoryUrl: strips git+ prefix and .git suffix", () => {
  assert.equal(
    repositoryUrl({ url: "git+https://github.com/foo/bar.git" }),
    "https://github.com/foo/bar",
  );
});

test("repositoryUrl: upgrades git:// scheme to https://", () => {
  assert.equal(
    repositoryUrl("git://github.com/foo/bar.git"),
    "https://github.com/foo/bar",
  );
});

test("repositoryUrl: undefined input", () => {
  assert.equal(repositoryUrl(undefined), undefined);
});

test("resolveContact: prefers author email over bugs/maintainers", () => {
  assert.equal(
    resolveContact(
      { bugs: { email: "bugs@example.com" } },
      "author@example.com",
    ),
    "author@example.com",
  );
});

test("resolveContact: falls back to bugs email, then bugs url, then maintainer email", () => {
  assert.equal(
    resolveContact({ bugs: { email: "bugs@example.com" } }, undefined),
    "bugs@example.com",
  );
  assert.equal(
    resolveContact({ bugs: "https://github.com/foo/bar/issues" }, undefined),
    "https://github.com/foo/bar/issues",
  );
  assert.equal(
    resolveContact(
      { maintainers: [{ name: "M", email: "m@example.com" }] },
      undefined,
    ),
    "m@example.com",
  );
  assert.equal(resolveContact({}, undefined), undefined);
});

test("fetchPackageMetadata: parses a real-shaped npm registry response", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      author: { name: "Evil Corp", email: "evil@example.com" },
      repository: { url: "git+https://github.com/evil/evil-lib.git" },
    }),
  });

  const metadata = await fetchPackageMetadata("evil-lib", "1.0.0");
  assert.deepEqual(metadata, {
    author: "Evil Corp",
    repositoryUrl: "https://github.com/evil/evil-lib",
    contact: "evil@example.com",
  });
});

test("fetchPackageMetadata: a 404 response resolves to undefined, not a throw", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => ({ ok: false });

  assert.equal(
    await fetchPackageMetadata("nonexistent-package", "1.0.0"),
    undefined,
  );
});

test("fetchPackageMetadata: a network failure resolves to undefined, not a throw", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => {
    throw new Error("network down");
  };

  assert.equal(await fetchPackageMetadata("some-package", "1.0.0"), undefined);
});

test("fetchPackageMetadata: scoped package name is percent-encoded, not a literal slash", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({}) };
  };

  await fetchPackageMetadata("@scope/evil-lib", "1.0.0");
  assert.equal(
    requestedUrl,
    "https://registry.npmjs.org/@scope%2Fevil-lib/1.0.0",
  );
});
