import type { RawMaliciousMatch } from "./types.js";
/** osv-scanner reports every advisory type (CVE/GHSA/RUSTSEC/MAL-) undifferentiated in the same
 * `vulnerabilities` array — it does not flag known-malicious packages distinctly. This rule only
 * cares about the MAL- ones; anything else is a regular vulnerability finding, out of scope
 * here. */
export declare function parseOsvOutput(rawJson: string): RawMaliciousMatch[];
