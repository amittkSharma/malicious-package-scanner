import assert from "node:assert/strict";
import { test } from "node:test";
import { renderHtml, renderJson, renderMarkdown } from "../dist/reporters.js";

const DIRECT_FINDING = {
  advisoryId: "MAL-2026-6486",
  reason: "Malicious code in unsafe-malicious-package (npm)",
  advisoryUrl: "https://osv.dev/vulnerability/MAL-2026-6486",
  dependency: "unsafe-malicious-package",
  version: "1.0.2",
  license: "MIT",
  dependencyType: "direct",
  packageManager: "npm",
  workspace: ".",
  packageMetadata: {
    author: "Evil Corp",
    repositoryUrl: "https://github.com/evil/unsafe-malicious-package",
    contact: "evil@example.com",
  },
};

const TRANSITIVE_FINDING = {
  advisoryId: "MAL-2026-9999",
  reason: "Contains a | pipe and\na newline",
  advisoryUrl: "https://osv.dev/vulnerability/MAL-2026-9999",
  dependency: "<script>alert(1)</script>",
  version: "2.0.0",
  dependencyType: "transitive",
  depth: 3,
  path: ["a", "b", "<script>alert(1)</script>"],
  packageManager: "yarn",
  workspace: "packages/api",
};

const REPORT = {
  generatedAt: "2026-09-27T00:00:00.000Z",
  repository: "example-repo",
  projectVersions: { ".": "1.0.0", "packages/api": "2.3.0" },
  findings: [DIRECT_FINDING, TRANSITIVE_FINDING],
  suppressed: [
    {
      finding: { ...DIRECT_FINDING, dependency: "accepted-risk-pkg" },
      override: {
        name: "accepted-risk-pkg",
        reason: "Reviewed, low risk",
        expiresAt: "2026-12-31",
      },
    },
  ],
};

const EMPTY_REPORT = {
  generatedAt: "2026-09-27T00:00:00.000Z",
  repository: "example-repo",
  projectVersions: { ".": "0.1.0" },
  findings: [],
  suppressed: [],
};

test("renderJson round-trips the report as-is", () => {
  const parsed = JSON.parse(renderJson(REPORT));
  assert.deepEqual(parsed, REPORT);
});

test("renderJson: packageMetadata is a nested object, not flattened", () => {
  const parsed = JSON.parse(renderJson(REPORT));
  assert.deepEqual(parsed.findings[0].packageMetadata, {
    author: "Evil Corp",
    repositoryUrl: "https://github.com/evil/unsafe-malicious-package",
    contact: "evil@example.com",
  });
});

test("renderMarkdown: findings table shows author, package repository, and contact", () => {
  const md = renderMarkdown(REPORT);
  assert.match(
    md,
    /Evil Corp \| https:\/\/github\.com\/evil\/unsafe-malicious-package \| evil@example\.com/,
  );
});

test("renderMarkdown: a finding with no fetched metadata shows unknown, not blank cells", () => {
  const md = renderMarkdown(REPORT);
  assert.match(md, /\| unknown \| unknown \| unknown \|/);
});

test("renderHtml: findings table shows author and contact, and links the package repository", () => {
  const html = renderHtml(REPORT);
  assert.match(html, /<td>Evil Corp<\/td>/);
  assert.match(html, /<td>evil@example\.com<\/td>/);
  assert.match(
    html,
    /<a href="https:\/\/github\.com\/evil\/unsafe-malicious-package">https:\/\/github\.com\/evil\/unsafe-malicious-package<\/a>/,
  );
});

test("renderHtml: a finding with no fetched metadata shows unknown, not blank cells", () => {
  const html = renderHtml(REPORT);
  assert.match(html, /<td>unknown<\/td>/);
});

test("renderMarkdown: header names the scanned repository and its version", () => {
  const md = renderMarkdown(REPORT);
  assert.match(md, /Repository: example-repo@1\.0\.0/);
});

test("renderHtml: header names the scanned repository and its version", () => {
  const html = renderHtml(REPORT);
  assert.match(html, /Repository: example-repo@1\.0\.0/);
});

test("renderMarkdown: repository with no readable version renders without a version suffix", () => {
  const md = renderMarkdown({ ...REPORT, projectVersions: {} });
  assert.match(md, /Repository: example-repo\n/);
});

test("renderMarkdown: direct finding has no depth, transitive shows depth and arrow path", () => {
  const md = renderMarkdown(REPORT);
  assert.match(md, /unsafe-malicious-package \| 1\.0\.2 \| direct \|/);
  assert.match(md, /transitive \(depth 3\)/);
  assert.match(md, /a → b → /);
});

test("renderMarkdown: pipe and newline in a cell don't corrupt table structure", () => {
  const md = renderMarkdown(REPORT);
  assert.match(md, /Contains a \\\| pipe and a newline/);
});

test("renderMarkdown: suppressed section lists override reason and expiry", () => {
  const md = renderMarkdown(REPORT);
  assert.match(
    md,
    /accepted-risk-pkg \| 1\.0\.2 \| Reviewed, low risk \| 2026-12-31/,
  );
});

test("renderMarkdown: fully clean scan gets one checkmark line, not separate empty Findings/Suppressed sections", () => {
  const md = renderMarkdown(EMPTY_REPORT);
  assert.match(md, /✅ No malicious packages found\./);
  assert.equal(md.includes("## Findings"), false);
  assert.equal(md.includes("## Suppressed"), false);
});

test("renderHtml escapes untrusted values from advisory/package data", () => {
  const html = renderHtml(REPORT);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("renderHtml: well-formed enough to contain both section headers and tables", () => {
  const html = renderHtml(REPORT);
  assert.match(html, /<h2>Findings \(2\)<\/h2>/);
  assert.match(html, /<h2>Suppressed \(1\)<\/h2>/);
  assert.match(html, /<table>/);
});

test("renderHtml: fully clean scan renders a single green checkmark banner, not two empty sections", () => {
  const html = renderHtml(EMPTY_REPORT);
  assert.match(html, /class="clean-scan"/);
  assert.match(html, /No malicious packages found\./);
  assert.equal(html.includes("<h2>Findings"), false);
  assert.equal(html.includes("<h2>Suppressed"), false);
});

const SINGLE_WORKSPACE_REPORT = {
  generatedAt: "2026-09-27T00:00:00.000Z",
  repository: "example-repo",
  projectVersions: { ".": "1.0.0" },
  findings: [DIRECT_FINDING, { ...TRANSITIVE_FINDING, workspace: "." }],
  suppressed: [],
};

test("renderMarkdown: multiple workspaces get grouped into per-project sections, each labeled with its version", () => {
  const md = renderMarkdown(REPORT);
  assert.match(md, /### Project: \.@1\.0\.0\n/);
  assert.match(md, /### Project: packages\/api@2\.3\.0\n/);
  const rootSection = md.slice(
    md.indexOf("### Project: .@1.0.0"),
    md.indexOf("### Project: packages/api@2.3.0"),
  );
  assert.match(rootSection, /unsafe-malicious-package/);
  assert.equal(rootSection.includes("<script>"), false);
});

test("renderMarkdown: a project with no readable version is labeled without a version suffix", () => {
  const md = renderMarkdown({ ...REPORT, projectVersions: {} });
  assert.match(md, /### Project: \.\n/);
  assert.match(md, /### Project: packages\/api\n/);
});

test("renderMarkdown: a single workspace renders flat, no project headers", () => {
  const md = renderMarkdown(SINGLE_WORKSPACE_REPORT);
  assert.equal(md.includes("### Project:"), false);
});

test("renderHtml: multiple workspaces get grouped into collapsible per-project sections, each labeled with its version", () => {
  const html = renderHtml(REPORT);
  assert.match(html, /<details class="project" open>\s*<summary>\.@1\.0\.0\s/);
  assert.match(
    html,
    /<details class="project" open>\s*<summary>packages\/api@2\.3\.0\s/,
  );
});

test("renderHtml: project sections are open by default so nothing is hidden without a click", () => {
  const html = renderHtml(REPORT);
  const detailsCount = (html.match(/<details class="project" open>/g) ?? [])
    .length;
  assert.ok(detailsCount >= 2);
});

test("renderHtml: a single workspace renders flat, no collapsible project sections", () => {
  const html = renderHtml(SINGLE_WORKSPACE_REPORT);
  assert.equal(html.includes('<details class="project"'), false);
});
