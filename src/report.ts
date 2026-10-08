import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Result } from "axe-core";
import type { ScanReport } from "./index.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return replacements[character] ?? character;
  });
}

function safeTerminal(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
}

export function formatTerminal(report: ScanReport): string {
  const { violations, incomplete, passes, inapplicable } = report.results;
  const lines = [
    `Accessibility scan: ${report.finalUrl}`,
    `Title: ${report.title}`,
    `Violations: ${violations.length} rules, ${violations.reduce((count, rule) => count + rule.nodes.length, 0)} affected node instances`,
    `Passed: ${passes.length} | Incomplete (manual review): ${incomplete.length} | Inapplicable: ${inapplicable.length}`,
  ];
  for (const rule of violations) {
    lines.push(`\n[${rule.impact ?? "unclassified"}] ${rule.id}: ${rule.help}`);
    for (const node of rule.nodes) {
      lines.push(
        `  Target: ${JSON.stringify(node.target)}`,
        `  HTML: ${node.html}`,
        `  Fix guidance: ${node.failureSummary ?? "See the rule documentation."}`,
      );
    }
    lines.push(`  Reference: ${rule.helpUrl}`);
  }
  if (incomplete.length) {
    lines.push("\nManual review required:");
    for (const rule of incomplete) {
      lines.push(`  ${rule.id}: ${rule.help} (${rule.nodes.length} node instances)`);
    }
  }
  lines.push("\nAutomated checks do not prove WCAG conformance.");
  return safeTerminal(lines.join("\n"));
}

function renderRules(rules: Result[]): string {
  if (!rules.length) return "<p>None detected in this category.</p>";
  return rules.map((rule) => {
    // Only axe's HTTPS documentation links become clickable.
    const reference = rule.helpUrl.startsWith("https://")
      ? `<a href="${escapeHtml(rule.helpUrl)}" rel="noreferrer">Rule documentation</a>`
      : escapeHtml(rule.helpUrl);
    return `<article>
      <h3>${escapeHtml(rule.id)}: ${escapeHtml(rule.help)}</h3>
      <p>Impact: ${escapeHtml(rule.impact ?? "unclassified")}</p>
      <p>${escapeHtml(rule.description)}</p>
      <p>Tags: ${escapeHtml(rule.tags.join(", "))}</p>
      ${rule.nodes.map((node) => `<details open>
        <summary>Target: ${escapeHtml(JSON.stringify(node.target))}</summary>
        <pre>${escapeHtml(node.html)}</pre>
        <pre>${escapeHtml(node.failureSummary ?? JSON.stringify({
          any: node.any, all: node.all, none: node.none,
        }, null, 2))}</pre>
      </details>`).join("")}
      <p>${reference}</p>
    </article>`;
  }).join("");
}

export function renderHtml(report: ScanReport): string {
  const results = report.results;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Accessibility report</title>
<style>
body{font:16px/1.6 system-ui,sans-serif;margin:0;color:#172033;background:#f4f6fa}
main{max-width:1000px;margin:auto;padding:32px}
article{background:#fff;padding:20px;margin:20px 0;border:1px solid #68778d;border-radius:8px}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef1f5;padding:12px}
a{color:#174e9e}summary{cursor:pointer;overflow-wrap:anywhere}
dt{font-weight:bold}dd{margin:0 0 12px;overflow-wrap:anywhere}
</style></head><body><main>
<h1>Accessibility scan report</h1>
<p>Automated checks do not prove WCAG conformance. Review incomplete checks and test keyboard, focus, screen-reader, and complete user flows manually.</p>
<dl><dt>Requested URL</dt><dd>${escapeHtml(report.requestedUrl)}</dd>
<dt>Final URL</dt><dd>${escapeHtml(report.finalUrl)}</dd>
<dt>Page title</dt><dd>${escapeHtml(report.title)}</dd>
<dt>Scanned at</dt><dd>${escapeHtml(report.scannedAt)}</dd>
<dt>Engine</dt><dd>axe-core ${escapeHtml(results.testEngine.version)}</dd>
<dt>Viewport</dt><dd>${report.viewport.width} x ${report.viewport.height}</dd></dl>
<p>Violation rules: ${results.violations.length} | Passed rules: ${results.passes.length} |
Manual-review rules: ${results.incomplete.length} | Inapplicable rules: ${results.inapplicable.length}</p>
<h2>Violations</h2>${renderRules(results.violations)}
<h2>Incomplete checks: manual review required</h2>${renderRules(results.incomplete)}
<h2>Passed rule IDs</h2><p>${escapeHtml(results.passes.map((rule) => rule.id).join(", ") || "None")}</p>
<h2>Inapplicable rule IDs</h2><p>${escapeHtml(results.inapplicable.map((rule) => rule.id).join(", ") || "None")}</p>
</main></body></html>`;
}

export async function writeReports(
  report: ScanReport,
  directory: string,
): Promise<{ json: string; html: string }> {
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const paths = {
    json: resolve(root, "report.json"),
    html: resolve(root, "report.html"),
  };
  await Promise.all([
    writeFile(paths.json, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(paths.html, renderHtml(report), "utf8"),
  ]);
  return paths;
}
