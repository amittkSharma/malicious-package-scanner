import type { PackageMetadata } from "./types.js";
type NpmPerson = string | {
    name?: string;
    email?: string;
    url?: string;
} | undefined;
type NpmRepository = string | {
    url?: string;
} | undefined;
type NpmBugs = string | {
    url?: string;
    email?: string;
} | undefined;
type NpmVersionManifest = {
    author?: NpmPerson;
    repository?: NpmRepository;
    bugs?: NpmBugs;
    maintainers?: {
        name?: string;
        email?: string;
    }[];
};
/** npm's "author" field is either a structured object or a legacy freeform string like
 * "Jane Doe <jane@example.com> (https://example.com)" — real-world packages use either form
 * interchangeably, so both need parsing into the same shape. */
export declare function parsePerson(person: NpmPerson): {
    name?: string;
    email?: string;
};
/** Strips the "git+" prefix and ".git" suffix npm's own tooling adds to repository URLs, and
 * upgrades a bare "git://" scheme to "https://" — none of that is useful to a human deciding
 * whether to go look at the repo. */
export declare function repositoryUrl(repository: NpmRepository): string | undefined;
/** Prefers the author's own email, then the issue tracker's contact point, then the first
 * maintainer with one on file — whichever gives someone an actual way to reach out about the
 * package, in order of how directly it identifies the publisher. */
export declare function resolveContact(manifest: NpmVersionManifest, authorEmail: string | undefined): string | undefined;
/** Best-effort enrichment from the public npm registry — the publisher info a malicious
 * package's own manifest declares (name/email/repo), for whoever has to decide whether to
 * report it upstream. Never throws: a 404, a private-registry-only package, or a network
 * failure just means these fields stay empty — this must never fail the scan itself. */
export declare function fetchPackageMetadata(name: string, version: string): Promise<PackageMetadata | undefined>;
export {};
