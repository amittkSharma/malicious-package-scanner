#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { renderHtml, renderJson, renderMarkdown } from "./reporters.js";
import { runScan } from "./scan.js";
const FORMAT_EXTENSIONS = {
    json: "json",
    markdown: "md",
    html: "html",
};
const ALL_FORMATS = Object.keys(FORMAT_EXTENSIONS);
const USAGE = `Usage: malicious-package-scanner [options]

Options:
  --root <dir>          Directory to scan (default: current directory)
  --config <path>       Config file path (default: <root>/malicious-package-scanner.config.json)
  --format <list>       Comma-separated: json,markdown,html, or "all" (default: json)
  --output <basePath>   Write "<basePath>.<ext>" per format instead of printing to stdout
  --offline             Never attempt a network refresh of the OSV database
  --cache-ttl-hours <n> Override the configured cache TTL
  -h, --help            Show this help
`;
/** Every flag that takes a value shares this one failure mode — argv[++i] running off the end of
 * the array (or into the next flag) — so it's validated once here rather than at each call site. */
function requireValue(argv, i, flag) {
    const value = argv[i];
    if (value === undefined || value.startsWith("--")) {
        throw new Error(`Missing value for ${flag}\n\n${USAGE}`);
    }
    return value;
}
function parseArgs(argv) {
    let rootDir = process.cwd();
    let formats = ["json"];
    let outputBasePath;
    let offline;
    let cacheTtlHours;
    let configPath;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case "-h":
            case "--help":
                process.stdout.write(USAGE);
                process.exit(0);
                break;
            case "--root":
                rootDir = path.resolve(requireValue(argv, ++i, arg));
                break;
            case "--config":
                configPath = requireValue(argv, ++i, arg);
                break;
            case "--format":
                formats = parseFormats(requireValue(argv, ++i, arg));
                break;
            case "--output":
                outputBasePath = requireValue(argv, ++i, arg);
                break;
            case "--offline":
                offline = true;
                break;
            case "--cache-ttl-hours": {
                const raw = requireValue(argv, ++i, arg);
                cacheTtlHours = Number(raw);
                if (Number.isNaN(cacheTtlHours)) {
                    throw new Error(`Invalid --cache-ttl-hours value: "${raw}" is not a number\n\n${USAGE}`);
                }
                break;
            }
            default:
                throw new Error(`Unknown option: ${arg}\n\n${USAGE}`);
        }
    }
    return {
        rootDir,
        configPath: configPath ?? path.join(rootDir, "malicious-package-scanner.config.json"),
        formats,
        outputBasePath,
        offline,
        cacheTtlHours,
    };
}
function parseFormats(value) {
    if (value === "all") {
        return ALL_FORMATS;
    }
    return value.split(",").map((token) => {
        const format = token.trim();
        if (!ALL_FORMATS.includes(format)) {
            throw new Error(`Unknown format: "${token}". Expected one of ${ALL_FORMATS.join(", ")}, or "all".`);
        }
        return format;
    });
}
const RENDERERS = {
    json: renderJson,
    markdown: renderMarkdown,
    html: renderHtml,
};
async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!options.outputBasePath && options.formats.length > 1) {
        throw new Error("--format with multiple formats requires --output (stdout can only carry one format).");
    }
    const fileConfig = loadConfig(options.configPath);
    const config = {
        ...fileConfig,
        offline: options.offline ?? fileConfig.offline,
        cacheTtlHours: options.cacheTtlHours ?? fileConfig.cacheTtlHours,
    };
    const report = await runScan({ rootDir: options.rootDir, config });
    for (const format of options.formats) {
        const rendered = RENDERERS[format](report);
        if (options.outputBasePath) {
            const filePath = `${options.outputBasePath}.${FORMAT_EXTENSIONS[format]}`;
            writeFileSync(filePath, rendered);
            process.stderr.write(`Wrote ${filePath}\n`);
        }
        else {
            process.stdout.write(rendered);
            process.stdout.write("\n");
        }
    }
    process.stderr.write(`${report.findings.length} known-malicious package(s) found, ${report.suppressed.length} suppressed by override.\n`);
    process.exitCode = report.findings.length > 0 ? 1 : 0;
}
main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
});
