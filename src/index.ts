import axe, { type AxeResults, type RunOptions } from "axe-core";
import { chromium } from "playwright";

export interface ScanOptions {
  url: string;
  timeout?: number;
  waitFor?: string;
  storageState?: string;
  runOptions?: RunOptions;
}

export interface ScanReport {
  schemaVersion: 1;
  requestedUrl: string;
  finalUrl: string;
  title: string;
  scannedAt: string;
  viewport: { width: number; height: number };
  results: AxeResults;
}

export function validateUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  if (url.username || url.password) {
    throw new Error("URL credentials are not supported. Use --storage-state.");
  }
  return url;
}

export async function scanPage(options: ScanOptions): Promise<ScanReport> {
  validateUrl(options.url);
  const timeout = options.timeout ?? 30_000;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new Error("Timeout must be a positive integer in milliseconds.");
  }

  const browser = await chromium.launch();
  try {
    const viewport = { width: 1280, height: 800 };
    const context = await browser.newContext({
      viewport,
      serviceWorkers: "block",
      storageState: options.storageState,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    const response = await page.goto(options.url, { waitUntil: "load" });
    if (!response || !response.ok()) {
      throw new Error(
        `Page navigation failed: HTTP ${response?.status() ?? "unknown"}.`,
      );
    }
    if (options.waitFor) {
      await page.locator(options.waitFor).waitFor({ state: "visible" });
    }
    await page.addScriptTag({ content: axe.source });
    const runOptions: RunOptions = {
      ...options.runOptions,
      runOnly: options.runOptions?.runOnly ?? {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    };
    const results = await page.evaluate(async ({ runOptions, timeout }) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          axe.run(document, runOptions),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("Accessibility scan timed out.")),
              timeout,
            );
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }, { runOptions, timeout });
    return {
      schemaVersion: 1,
      requestedUrl: options.url,
      finalUrl: page.url(),
      title: await page.title(),
      scannedAt: new Date().toISOString(),
      viewport,
      results,
    };
  } finally {
    await browser.close();
  }
}

export { formatTerminal, renderHtml, writeReports } from "./report.js";
