import type { RawMaliciousMatch } from "./types.js";

const MALICIOUS_ID_PREFIX = "MAL-";

/** osv-scanner's `scan source --format json` shape (fields we actually read — the real output
 * carries much more per vulnerability, e.g. full `affected` ranges/evidence, that this rule has
 * no use for). Verified against a real `osv-scanner` v2.6.0 run, not guessed from docs. */
type OsvScanOutput = {
  results?: {
    source?: { path?: string };
    packages?: {
      package?: { name?: string; version?: string };
      vulnerabilities?: {
        id?: string;
        summary?: string;
      }[];
    }[];
  }[];
};

/** osv-scanner reports every advisory type (CVE/GHSA/RUSTSEC/MAL-) undifferentiated in the same
 * `vulnerabilities` array — it does not flag known-malicious packages distinctly. This rule only
 * cares about the MAL- ones; anything else is a regular vulnerability finding, out of scope
 * here. */
export function parseOsvOutput(rawJson: string): RawMaliciousMatch[] {
  const parsed = JSON.parse(rawJson) as OsvScanOutput;
  const matches: RawMaliciousMatch[] = [];

  for (const result of parsed.results ?? []) {
    const lockfilePath = result.source?.path ?? "";
    for (const pkg of result.packages ?? []) {
      const dependency = pkg.package?.name;
      const version = pkg.package?.version;
      if (!dependency || !version) {
        continue;
      }
      for (const vuln of pkg.vulnerabilities ?? []) {
        if (!vuln.id?.startsWith(MALICIOUS_ID_PREFIX)) {
          continue;
        }
        matches.push({
          advisoryId: vuln.id,
          reason:
            vuln.summary ?? "Known-malicious package (no summary provided)",
          advisoryUrl: `https://osv.dev/vulnerability/${vuln.id}`,
          dependency,
          version,
          lockfilePath,
        });
      }
    }
  }

  return matches;
}
