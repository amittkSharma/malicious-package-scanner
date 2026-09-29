import type { MaliciousFinding, ScanReport } from "./types.js";

/** Groups by workspace, root project (".") first, others alphabetical. Returns a single group
 * when there's only one workspace — a plain single-package repo's report renders exactly as
 * before, since "is this a monorepo" falls straight out of how many distinct workspaces the
 * findings actually touched rather than needing a separate detection step. */
function groupByWorkspace<T>(
  items: readonly T[],
  workspaceOf: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const workspace = workspaceOf(item);
    const group = groups.get(workspace);
    if (group) {
      group.push(item);
    } else {
      groups.set(workspace, [item]);
    }
  }
  return new Map(
    [...groups.entries()].sort(([a], [b]) =>
      a === "." ? -1 : b === "." ? 1 : a.localeCompare(b),
    ),
  );
}

/** "packages/foo@1.2.3", or just "packages/foo" when that project has no readable version —
 * same "name@version" shape used for the top-level repository label so both read consistently. */
function withVersion(label: string, version: string | undefined): string {
  return version ? `${label}@${version}` : label;
}

function repositoryLabel(report: ScanReport): string {
  return withVersion(report.repository, report.projectVersions["."]);
}

function projectLabel(workspace: string, report: ScanReport): string {
  return withVersion(workspace, report.projectVersions[workspace]);
}

function formatDependencyType(finding: MaliciousFinding): string {
  return finding.dependencyType === "direct"
    ? "direct"
    : `transitive (depth ${finding.depth})`;
}

function formatPath(finding: MaliciousFinding): string {
  return finding.path && finding.path.length > 0
    ? finding.path.join(" → ")
    : "—";
}

/** Best-effort publisher info (see PackageMetadata) — "unknown" rather than blank when a lookup
 * never happened (offline) or came back empty, so it reads the same as every other "we don't
 * have this" cell in the report instead of looking like a rendering bug. */
function formatAuthor(finding: MaliciousFinding): string {
  return finding.packageMetadata?.author ?? "unknown";
}

function formatContact(finding: MaliciousFinding): string {
  return finding.packageMetadata?.contact ?? "unknown";
}

/** Markdown table cells break if a value contains "|" or a newline (both technically legal in
 * an advisory summary or override reason) — escape/flatten those rather than corrupting the
 * table layout. */
function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** JSON is the source of truth other tooling (CI gates, dashboards) consumes — render the
 * report as-is, no reshaping. */
export function renderJson(report: ScanReport): string {
  return JSON.stringify(report, null, 2);
}

function findingsTableLines(findings: MaliciousFinding[]): string[] {
  if (findings.length === 0) {
    return ["No known-malicious packages found.", ""];
  }
  const lines = [
    "| Dependency | Version | Type | Path | License | Package Manager | Workspace | Advisory | Reason | Author | Package Repository | Contact |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const finding of findings) {
    lines.push(
      `| ${finding.dependency} | ${finding.version} | ${formatDependencyType(finding)} | ${formatPath(finding)} | ${finding.license ?? "unknown"} | ${finding.packageManager} | ${finding.workspace} | [${finding.advisoryId}](${finding.advisoryUrl}) | ${escapeMarkdownCell(finding.reason)} | ${escapeMarkdownCell(formatAuthor(finding))} | ${finding.packageMetadata?.repositoryUrl ?? "unknown"} | ${escapeMarkdownCell(formatContact(finding))} |`,
    );
  }
  lines.push("");
  return lines;
}

function suppressedTableLines(suppressed: ScanReport["suppressed"]): string[] {
  if (suppressed.length === 0) {
    return ["No suppressed findings.", ""];
  }
  const lines = [
    "| Dependency | Version | Override Reason | Expires | Author | Package Repository | Contact |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const { finding, override } of suppressed) {
    lines.push(
      `| ${finding.dependency} | ${finding.version} | ${escapeMarkdownCell(override.reason)} | ${override.expiresAt ?? "never"} | ${escapeMarkdownCell(formatAuthor(finding))} | ${finding.packageMetadata?.repositoryUrl ?? "unknown"} | ${escapeMarkdownCell(formatContact(finding))} |`,
    );
  }
  lines.push("");
  return lines;
}

export function renderMarkdown(report: ScanReport): string {
  const lines: string[] = [];
  lines.push(
    "# Malicious Package Scan Report",
    "",
    `Repository: ${repositoryLabel(report)}`,
    `Generated: ${report.generatedAt}`,
    "",
  );

  if (report.findings.length === 0 && report.suppressed.length === 0) {
    lines.push("## Scan Result", "", "✅ No malicious packages found.", "");
    return lines.join("\n");
  }

  const workspaces = new Set([
    ...report.findings.map((f) => f.workspace),
    ...report.suppressed.map((s) => s.finding.workspace),
  ]);

  lines.push(`## Findings (${report.findings.length})`, "");
  if (workspaces.size > 1) {
    const groups = groupByWorkspace(report.findings, (f) => f.workspace);
    if (groups.size === 0) {
      lines.push("No known-malicious packages found.", "");
    }
    for (const [workspace, findings] of groups) {
      lines.push(`### Project: ${projectLabel(workspace, report)}`, "");
      lines.push(...findingsTableLines(findings));
    }
  } else {
    lines.push(...findingsTableLines(report.findings));
  }

  lines.push(`## Suppressed (${report.suppressed.length})`, "");
  if (workspaces.size > 1) {
    const groups = groupByWorkspace(
      report.suppressed,
      (s) => s.finding.workspace,
    );
    if (groups.size === 0) {
      lines.push("No suppressed findings.", "");
    }
    for (const [workspace, suppressed] of groups) {
      lines.push(`### Project: ${projectLabel(workspace, report)}`, "");
      lines.push(...suppressedTableLines(suppressed));
    }
  } else {
    lines.push(...suppressedTableLines(report.suppressed));
  }

  return lines.join("\n");
}

/** Report contents (package names, advisory summaries) originate from a third-party feed
 * (OSV.dev) and config overrides, not from us — they're untrusted input as far as this HTML
 * output is concerned, so every value gets escaped before embedding. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderFindingsTable(findings: MaliciousFinding[]): string {
  if (findings.length === 0) {
    return "<p>No known-malicious packages found.</p>";
  }
  const rows = findings
    .map(
      (finding) => `
      <tr>
        <td>${escapeHtml(finding.dependency)}</td>
        <td>${escapeHtml(finding.version)}</td>
        <td>${escapeHtml(formatDependencyType(finding))}</td>
        <td>${escapeHtml(formatPath(finding))}</td>
        <td>${escapeHtml(finding.license ?? "unknown")}</td>
        <td>${escapeHtml(finding.packageManager)}</td>
        <td>${escapeHtml(finding.workspace)}</td>
        <td><a href="${escapeHtml(finding.advisoryUrl)}">${escapeHtml(finding.advisoryId)}</a></td>
        <td>${escapeHtml(finding.reason)}</td>
        <td>${escapeHtml(formatAuthor(finding))}</td>
        <td>${renderRepositoryCell(finding)}</td>
        <td>${escapeHtml(formatContact(finding))}</td>
      </tr>`,
    )
    .join("");
  return `
    <table>
      <thead>
        <tr>
          <th>Dependency</th><th>Version</th><th>Type</th><th>Path</th><th>License</th>
          <th>Package Manager</th><th>Workspace</th><th>Advisory</th><th>Reason</th>
          <th>Author</th><th>Package Repository</th><th>Contact</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderRepositoryCell(finding: MaliciousFinding): string {
  const url = finding.packageMetadata?.repositoryUrl;
  return url
    ? `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`
    : "unknown";
}

function renderSuppressedTable(suppressed: ScanReport["suppressed"]): string {
  if (suppressed.length === 0) {
    return "<p>No suppressed findings.</p>";
  }
  const rows = suppressed
    .map(
      ({ finding, override }) => `
      <tr>
        <td>${escapeHtml(finding.dependency)}</td>
        <td>${escapeHtml(finding.version)}</td>
        <td>${escapeHtml(override.reason)}</td>
        <td>${escapeHtml(override.expiresAt ?? "never")}</td>
        <td>${escapeHtml(formatAuthor(finding))}</td>
        <td>${renderRepositoryCell(finding)}</td>
        <td>${escapeHtml(formatContact(finding))}</td>
      </tr>`,
    )
    .join("");
  return `
    <table>
      <thead><tr><th>Dependency</th><th>Version</th><th>Override Reason</th><th>Expires</th><th>Author</th><th>Package Repository</th><th>Contact</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/** Native <details>/<summary> — collapsible per-project sections with zero JS, and open by
 * default so a monorepo report never hides a result behind an extra click; the user only
 * collapses the projects they've already reviewed. */
function renderProjectSection(
  label: string,
  count: number,
  noun: "finding" | "suppressed",
  tableHtml: string,
): string {
  return `
    <details class="project" open>
      <summary>${escapeHtml(label)} <span class="count">(${count} ${noun}${count === 1 ? "" : "s"})</span></summary>
      ${tableHtml}
    </details>`;
}

const CLEAN_SCAN_STYLES = `
    .clean-scan { display: flex; align-items: center; gap: 0.7rem; border: 1px solid #b7e4c7; background: #e9f7ef; color: #1e7b3e; border-radius: 6px; padding: 1rem 1.2rem; font-size: 1.05rem; font-weight: 600; }
    .clean-scan .checkmark { display: inline-flex; align-items: center; justify-content: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: #2fa85a; color: #fff; font-size: 1rem; flex-shrink: 0; }`;

function renderCleanScanBanner(): string {
  return `<div class="clean-scan"><span class="checkmark">✓</span><span>No malicious packages found.</span></div>`;
}

export function renderHtml(report: ScanReport): string {
  const isCleanScan =
    report.findings.length === 0 && report.suppressed.length === 0;

  const workspaces = new Set([
    ...report.findings.map((f) => f.workspace),
    ...report.suppressed.map((s) => s.finding.workspace),
  ]);

  const findingsSection =
    workspaces.size > 1
      ? [...groupByWorkspace(report.findings, (f) => f.workspace)]
          .map(([workspace, findings]) =>
            renderProjectSection(
              projectLabel(workspace, report),
              findings.length,
              "finding",
              renderFindingsTable(findings),
            ),
          )
          .join("")
      : renderFindingsTable(report.findings);

  const suppressedSection =
    workspaces.size > 1
      ? [...groupByWorkspace(report.suppressed, (s) => s.finding.workspace)]
          .map(([workspace, suppressed]) =>
            renderProjectSection(
              projectLabel(workspace, report),
              suppressed.length,
              "suppressed",
              renderSuppressedTable(suppressed),
            ),
          )
          .join("")
      : renderSuppressedTable(report.suppressed);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Malicious Package Scan Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.9rem; }
    th { background: #f0f0f0; }
    h1 { margin-bottom: 0.2rem; }
    .meta { color: #555; margin-bottom: 1.5rem; }
    details.project { border: 1px solid #ddd; border-radius: 6px; margin-bottom: 1rem; padding: 0 0.8rem; }
    details.project summary { cursor: pointer; padding: 0.7rem 0; font-weight: 600; font-size: 1.05rem; list-style: none; }
    details.project summary::-webkit-details-marker { display: none; }
    details.project summary::before { content: "▶"; display: inline-block; margin-right: 0.5rem; font-size: 0.75em; transition: transform 0.1s; }
    details.project[open] summary::before { transform: rotate(90deg); }
    details.project summary:hover { color: #0366d6; }
    details.project .count { font-weight: 400; color: #666; }
    details.project table { margin-bottom: 1rem; }${CLEAN_SCAN_STYLES}
  </style>
</head>
<body>
  <h1>Malicious Package Scan Report</h1>
  <p class="meta">Repository: ${escapeHtml(repositoryLabel(report))}<br>Generated: ${escapeHtml(report.generatedAt)}</p>
  ${
    isCleanScan
      ? renderCleanScanBanner()
      : `<h2>Findings (${report.findings.length})</h2>
  ${findingsSection}
  <h2>Suppressed (${report.suppressed.length})</h2>
  ${suppressedSection}`
  }
</body>
</html>
`;
}
