# malicious-package-scanner

Checks your project's dependencies against the [OSV.dev](https://osv.dev) database of **known-malicious packages** — the ones that were published to npm/yarn/pnpm registries specifically to steal credentials, mine crypto, or otherwise compromise whoever installs them.

It doesn't just look at your `package.json`. It walks your full dependency tree, including the packages your packages depend on, so a malicious package hiding three levels deep gets caught too.

## Why you'd want this

Supply-chain attacks on open-source packages are common now. A dependency you trust can pull in something malicious without you ever seeing it in your own `package.json`. This tool is a quick, repeatable way to check — before a release, in CI, or whenever you're not sure.

## Getting started

No separate install step needed for the scanner engine — it comes with everything required to talk to OSV.dev out of the box.

Run it from the root of any project that has an npm, yarn, or pnpm lockfile:

```bash
npx malicious-package-scanner
```

That's it. It scans, prints a report, and tells you if anything was found.

If you'd rather install it once and keep using it:

```bash
npm install --save-dev malicious-package-scanner
```

## Everyday use

Scan the current project and print a plain report to your terminal:

```bash
malicious-package-scanner
```

Scan a different folder:

```bash
malicious-package-scanner --root ./path/to/project
```

Save the report to a file instead of printing it:

```bash
malicious-package-scanner --output ./scan-report
```

Choose the report format — pick whichever is easiest to read for your situation:

```bash
malicious-package-scanner --format html --output ./scan-report
```

Available formats:

- **json** — for feeding into other tools or scripts (the default)
- **markdown** — readable in GitHub, GitLab, or any Markdown viewer
- **html** — a shareable report you can open in a browser

Want all three at once?

```bash
malicious-package-scanner --format all --output ./scan-report
```

This produces `scan-report.json`, `scan-report.md`, and `scan-report.html` in one go.

## Reading the report

Every issue found tells you:

- **which package** is affected, and **which version**
- **why** it was flagged (a short, human-readable reason)
- whether it's a **direct** dependency (something you added yourself) or **transitive** (something pulled in by another package) — and if transitive, **how deep** in the tree it sits
- the package's **license**, for context
- a link to the full advisory, if you want the details
- the publisher's **author name**, **repository**, and **contact info**, when the package is still on the public npm registry — useful if you need to report it upstream

If nothing is found, the report says so plainly (a green checkmark, not two empty tables) — no news is good news. A finding looks like this in the markdown report:

| Dependency | Version | Type | Path | License | Package Manager | Workspace | Advisory | Reason | Author | Package Repository | Contact |
|---|---|---|---|---|---|---|---|---|---|---|---|
| evil-lib | 1.2.3 | transitive (depth 2) | some-package → evil-lib | MIT | npm | . | [MAL-2026-1234](https://osv.dev/vulnerability/MAL-2026-1234) | Malicious code that exfiltrates environment variables | Evil Corp | https://github.com/evil/evil-lib | evil@example.com |

Every report also names the **repository and its version** (e.g. `Repository: my-app@1.4.0`) at the top, so a report is identifiable on its own without needing to know where it came from.

**Working in a monorepo?** No extra setup needed — the scanner automatically figures out whether you're in a single-package project or a workspace/monorepo. If it's a monorepo, the markdown and HTML reports group findings by project (each labeled with that project's own version), so you can tell at a glance which team needs to look at what. In the HTML report, each project's section is collapsible, so scanning a dozen projects doesn't mean scrolling through a dozen tables. If a malicious package is shared across several projects, each one gets called out separately.

## Using it in CI

The scanner exits with a non-zero status code whenever it finds something, so it plugs straight into any CI pipeline as a pass/fail check:

```bash
malicious-package-scanner --format json --output ./scan-report
```

If this step fails your build, that's the point — something in your dependency tree matched a known-malicious package advisory and is worth a look before shipping.

A minimal GitHub Actions step:

```yaml
- name: Check for malicious dependencies
  run: npx malicious-package-scanner --format json --output ./scan-report
- name: Upload scan report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: malicious-package-scan-report
    path: scan-report.json
```

## Keeping the malicious-package data fresh

The scanner keeps a local, offline-friendly copy of the OSV.dev advisory data and refreshes it automatically once it gets old (by default, once a day). You don't need to do anything for this — it just happens the next time you run a scan.

If you're on a machine without internet access, or want to guarantee no network calls happen, add `--offline` and it'll use whatever data it already has cached. This also skips the optional lookup of a flagged package's author/repository/contact info from the npm registry — with `--offline`, nothing touches the network, full stop.

```bash
malicious-package-scanner --offline
```

Want to control how often the advisory data refreshes? Use `--cache-ttl-hours` (default: 24):

```bash
malicious-package-scanner --cache-ttl-hours 6
```

## Already reviewed something and it's fine?

Sometimes a flagged package is a false positive, or your team has already reviewed it and decided the risk is acceptable. You can tell the scanner to stop flagging it by adding a small config file named `malicious-package-scanner.config.json` in your project root, listing the package name and your reason for accepting it. The scanner will still show that it was suppressed in the report (so nothing gets silently swept under the rug) — it just won't count against your scan.

```json
{
  "overrides": [
    {
      "name": "some-flagged-package",
      "version": "1.2.3",
      "reason": "Reviewed by security team, confirmed false positive",
      "expiresAt": "2026-12-31"
    }
  ]
}
```

Leave out `"version"` to suppress every version of that package, and leave out `"expiresAt"` to suppress it indefinitely (not recommended — a date forces someone to revisit it later).

## A few things worth knowing

- Works with **npm**, **yarn**, and **pnpm** projects — it detects which one you're using automatically.
- Works just as well on a single package or a full workspace/monorepo — it tells the two apart on its own, no config needed.
- Doesn't need your project to be built or running — it only reads your lockfile.
- Won't ever break your `npm install` — if something about your environment prevents a background setup step from completing, it just quietly falls back and tells you what to do instead.

## Need help?

Run the built-in help at any time:

```bash
malicious-package-scanner --help
```
