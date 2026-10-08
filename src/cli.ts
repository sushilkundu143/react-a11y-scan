#!/usr/bin/env node
import { parseArgs } from "node:util";
import { scanPage, formatTerminal, writeReports } from "./index.js";

const help = `Usage: react-a11y-scan <url> [options]

Scan a running React or web page in headless Chromium.

Options:
  --output <directory>    Write report.json and report.html (default: a11y-reports)
  --wait-for <selector>   Wait for a visible element before scanning
  --timeout <ms>          Navigation/readiness/scan timeout (default: 30000)
  --storage-state <file>  Playwright authentication state; keep this file private
  --fail-on-incomplete   Also fail when axe needs manual review
  --help                 Show this help

Exit codes: 0 = no detected violations, 1 = findings, 2 = operational error.
Install Chromium first: npx playwright install chromium
Only scan pages you own or are authorized to test.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: "string", default: "a11y-reports" },
      "wait-for": { type: "string" },
      timeout: { type: "string", default: "30000" },
      "storage-state": { type: "string" },
      "fail-on-incomplete": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(help);
    return;
  }
  const url = positionals[0];
  if (!url || positionals.length !== 1) {
    throw new Error("Provide exactly one page URL. Use --help for usage.");
  }
  const report = await scanPage({
    url,
    timeout: Number(values.timeout),
    waitFor: values["wait-for"],
    storageState: values["storage-state"],
  });
  const paths = await writeReports(report, values.output);
  console.log(formatTerminal(report));
  console.log(`\nJSON report: ${paths.json}\nHTML report: ${paths.html}`);
  if (
    report.results.violations.length ||
    (values["fail-on-incomplete"] && report.results.incomplete.length)
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Accessibility scan failed: ${message}`);
  process.exitCode = 2;
});
