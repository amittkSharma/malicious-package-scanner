const MALICIOUS_ID_PREFIX = "MAL-";
/** osv-scanner reports every advisory type (CVE/GHSA/RUSTSEC/MAL-) undifferentiated in the same
 * `vulnerabilities` array — it does not flag known-malicious packages distinctly. This rule only
 * cares about the MAL- ones; anything else is a regular vulnerability finding, out of scope
 * here. */
export function parseOsvOutput(rawJson) {
    const parsed = JSON.parse(rawJson);
    const matches = [];
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
                    reason: vuln.summary ?? "Known-malicious package (no summary provided)",
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
