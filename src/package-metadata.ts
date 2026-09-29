import type { PackageMetadata } from "./types.js";

type NpmPerson =
  | string
  | { name?: string; email?: string; url?: string }
  | undefined;
type NpmRepository = string | { url?: string } | undefined;
type NpmBugs = string | { url?: string; email?: string } | undefined;

type NpmVersionManifest = {
  author?: NpmPerson;
  repository?: NpmRepository;
  bugs?: NpmBugs;
  maintainers?: { name?: string; email?: string }[];
};

const FETCH_TIMEOUT_MS = 5000;

/** npm's "author" field is either a structured object or a legacy freeform string like
 * "Jane Doe <jane@example.com> (https://example.com)" — real-world packages use either form
 * interchangeably, so both need parsing into the same shape. */
export function parsePerson(person: NpmPerson): {
  name?: string;
  email?: string;
} {
  if (!person) {
    return {};
  }
  if (typeof person === "object") {
    return { name: person.name, email: person.email };
  }
  const match = person.match(/^([^<(]+?)\s*(?:<([^>]+)>)?\s*(?:\(([^)]+)\))?$/);
  const name = match?.[1]?.trim() || undefined;
  const email = match?.[2];
  return email ? { name, email } : { name };
}

/** Strips the "git+" prefix and ".git" suffix npm's own tooling adds to repository URLs, and
 * upgrades a bare "git://" scheme to "https://" — none of that is useful to a human deciding
 * whether to go look at the repo. */
export function repositoryUrl(repository: NpmRepository): string | undefined {
  const url = typeof repository === "string" ? repository : repository?.url;
  return url
    ?.replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "");
}

/** Prefers the author's own email, then the issue tracker's contact point, then the first
 * maintainer with one on file — whichever gives someone an actual way to reach out about the
 * package, in order of how directly it identifies the publisher. */
export function resolveContact(
  manifest: NpmVersionManifest,
  authorEmail: string | undefined,
): string | undefined {
  if (authorEmail) {
    return authorEmail;
  }
  const bugsEmail =
    typeof manifest.bugs === "object" ? manifest.bugs.email : undefined;
  if (bugsEmail) {
    return bugsEmail;
  }
  const bugsUrl =
    typeof manifest.bugs === "string" ? manifest.bugs : manifest.bugs?.url;
  if (bugsUrl) {
    return bugsUrl;
  }
  return manifest.maintainers?.find((maintainer) => maintainer.email)?.email;
}

/** Scoped package names ("@scope/name") need their "/" percent-encoded as a single path segment
 * on the npm registry — an unencoded slash would be read as two path segments instead. */
function registryPath(name: string, version: string): string {
  const packageSegment = name.startsWith("@") ? name.replace("/", "%2F") : name;
  return `${packageSegment}/${encodeURIComponent(version)}`;
}

/** Best-effort enrichment from the public npm registry — the publisher info a malicious
 * package's own manifest declares (name/email/repo), for whoever has to decide whether to
 * report it upstream. Never throws: a 404, a private-registry-only package, or a network
 * failure just means these fields stay empty — this must never fail the scan itself. */
export async function fetchPackageMetadata(
  name: string,
  version: string,
): Promise<PackageMetadata | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${registryPath(name, version)}`,
      { signal: controller.signal },
    );
    if (!response.ok) {
      return undefined;
    }
    const manifest = (await response.json()) as NpmVersionManifest;
    const author = parsePerson(manifest.author);
    return {
      author: author.name,
      repositoryUrl: repositoryUrl(manifest.repository),
      contact: resolveContact(manifest, author.email),
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
