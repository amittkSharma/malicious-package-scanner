import type { ScanReport } from "./types.js";
/** JSON is the source of truth other tooling (CI gates, dashboards) consumes — render the
 * report as-is, no reshaping. */
export declare function renderJson(report: ScanReport): string;
export declare function renderMarkdown(report: ScanReport): string;
export declare function renderHtml(report: ScanReport): string;
