# react-a11y-scan

Scan a running React application from your terminal using a real Chromium
browser and axe-core. Also works with other web frameworks: it scans the rendered
page, not React source code.

**Automated results do not prove accessibility or WCAG conformance.** Test
keyboard navigation, focus, screen readers, and complete workflows manually.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run build
npx playwright install chromium
node dist/cli.js http://localhost:3000 --output ./a11y-reports
```

Start your React application separately. No application dependency or source
changes are required. Scan only applications you own or are authorized to test.

This package is not yet published to npm. To install a local built tarball into
a React project:

```bash
# In this package:
npm pack

# In your React project, use the actual tarball path:
npm install --save-dev /absolute/path/react-a11y-scan-0.1.0.tgz
npx playwright install chromium
npx react-a11y-scan http://localhost:3000 --wait-for "main"
```

## CLI

```bash
react-a11y-scan https://your-authorized-site.example \
  --wait-for '[data-testid="accounts-loaded"]' \
  --timeout 45000 \
  --output ./a11y-reports/accounts
```

| Option | Purpose |
| --- | --- |
| `--output` | Directory for `report.json` and `report.html`; default `a11y-reports` |
| `--wait-for` | CSS/Playwright selector that must become visible before scanning |
| `--timeout` | Positive milliseconds for navigation, selector readiness, and scan; default 30000 |
| `--storage-state` | Path to a private Playwright authentication-state file |
| `--fail-on-incomplete` | Also return findings exit code for review-needed checks |
| `--help` | Show usage |

Exit codes:

- **0:** No violations detected under the configured scan.
- **1:** Violations detected, or incomplete checks when explicitly configured.
- **2:** Operational failure: bad arguments, navigation, missing browser,
  authentication-state file, readiness, scan, or report-writing error.

An operational error is never converted into a passing result.
Output files are overwritten on subsequent scans in the same directory.
Use separate output directories per route or run if you need historical reports.

## Reports

Terminal output includes severity, rule ID, element target, HTML snippet,
failure guidance, and documentation links. The HTML report also includes
incomplete checks, metadata, rule tags, and passed/inapplicable rule IDs.

JSON preserves the full axe results:

```text
schemaVersion
requestedUrl / finalUrl / title / scannedAt / viewport
results
  violations
  incomplete
  passes
  inapplicable
```

Counts refer to rules and affected node instances, not necessarily unique DOM
elements: one element can violate multiple rules.

HTML content from the scanned page is escaped, and the report runs no scripts
or external resources. Reports can still contain private DOM content and URLs:
protect them, avoid public CI artifacts, and apply retention policies.

## React readiness and scope

The scanner waits for page load, then optionally for your readiness selector.
It does not assume `networkidle` means a React application is ready.

Use a selector that appears only after relevant data and rendering are complete.
Portals are included because the document is scanned.

Version 0.1 scans **one URL, one desktop viewport, and one current page state**.
It does not crawl routes, click menus, open dialogs, exercise keyboard flows, or
automatically confirm that an authenticated page is not a login page.
Use a protected-page readiness selector to detect unexpected login redirects.

Chromium is headless at 1280 x 800. Service workers are blocked for reproducible
scans. Cross-origin frames and closed shadow roots may limit what axe can inspect.
Use broader manual/device coverage alongside this scan.

## Authentication

Supply an existing Playwright storage-state file created through your authorized
login workflow:

```bash
react-a11y-scan http://localhost:3000/accounts \
  --storage-state /private/location/storage-state.json \
  --wait-for '[data-testid="accounts-loaded"]'
```

The file may contain session cookies or tokens. Never commit it, print it, or
publish it. Session-storage-only authentication may need additional integration;
this version does not record login credentials or automate sign-in.

## Programmatic API

```ts
import { scanPage, writeReports } from "react-a11y-scan";

const report = await scanPage({
  url: "http://localhost:3000/accounts",
  waitFor: "main",
  runOptions: {
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
    },
  },
});

await writeReports(report, "./a11y-reports/accounts");
```

Default tags cover axe's applicable WCAG A/AA checks through 2.2; they do not
represent every criterion. Best-practice rules outside those tags are not
included by default. API consumers can explicitly configure axe's `runOnly`
and rule options. Do not disable rules merely to get a passing result.

## CI

Start the application and verify it is ready using your existing CI server
orchestration. Then:

```bash
npm ci
npx playwright install --with-deps chromium
npm test
node dist/cli.js http://localhost:3000 --wait-for "main" --output ./a11y-reports
```

`--with-deps` may require administrative permission on Linux runners. Upload
reports even when exit code 1 blocks the build, but restrict artifact access.
Performance, keyboard behavior, and WCAG conformance need additional checks.

## Validation and publishing

```bash
npm run typecheck
npm test
npm pack --dry-run
```

Tests use real Chromium and local fixtures to verify exact rule findings, clean
pages, error exit codes, redirect handling, readiness failures, and safe reports.

Before publishing, confirm package-name availability, test the generated tarball
in a consumer project, and use secure npm publishing/account settings.
The package is ESM-only; CommonJS consumers need dynamic import.

## License and dependencies

MIT for this package. Dependencies retain their own licenses; axe-core is
MPL-2.0 and Playwright is Apache-2.0. Review applicable obligations when
redistributing or modifying dependency code.

## References

- [axe-core](https://github.com/dequelabs/axe-core)
- [Playwright](https://playwright.dev/docs/intro)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
