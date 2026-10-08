import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  scanPage, validateUrl, renderHtml, formatTerminal,
} from "../dist/index.js";

let server;
let origin;
let temporary;

const good = `<!doctype html><html lang="en"><head><title>Accounts</title></head>
<body><main><h1>Accounts</h1><label for="search">Search accounts</label>
<input id="search"><button type="button">Search</button></main></body></html>`;
const bad = `<!doctype html><html><head><title>Broken page</title></head>
<body><main><h1>Accounts</h1><input id="unlabelled">
<button type="button"></button></main></body></html>`;

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), "react-a11y-scan-"));
  server = createServer((request, response) => {
    if (request.url === "/missing") {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/good" });
      response.end();
      return;
    }
    response.setHeader("Content-Type", "text/html");
    response.end(request.url === "/bad" ? bad : good);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
  await rm(temporary, { recursive: true, force: true });
});

function cli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/cli.js", ...args]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("rejects unsupported URLs, embedded credentials, and invalid timeout", async () => {
  assert.throws(() => validateUrl("file:///tmp/page.html"), /Only http/);
  assert.throws(() => validateUrl("https://user:secret@example.com"), /credentials/);
  await assert.rejects(scanPage({ url: origin, timeout: 0 }), /positive integer/);
});

test("accessible fixture succeeds and preserves full axe results", async () => {
  const report = await scanPage({ url: `${origin}/good`, waitFor: "h1" });
  assert.equal(report.results.violations.length, 0);
  for (const category of ["passes", "incomplete", "inapplicable"]) {
    assert.ok(Array.isArray(report.results[category]));
  }
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.title, "Accounts");
});

test("reports exact inaccessible rules, targets, and guidance", async () => {
  const report = await scanPage({ url: `${origin}/bad` });
  const ids = report.results.violations.map((rule) => rule.id);
  for (const id of ["html-has-lang", "label", "button-name"]) {
    assert.ok(ids.includes(id), `Expected ${id}`);
  }
  const label = report.results.violations.find((rule) => rule.id === "label");
  assert.ok(label.nodes.some((node) => node.target.includes("#unlabelled")));
  assert.match(formatTerminal(report), /Fix guidance:/);
  report.title = '<script>alert("x")</script>\u001b[31m';
  const html = renderHtml(report);
  assert.ok(!html.includes('<script>alert("x")</script>'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!formatTerminal(report).includes("\u001b"));
});

test("records redirects and rejects HTTP errors and readiness timeouts", async () => {
  const report = await scanPage({ url: `${origin}/redirect` });
  assert.equal(report.finalUrl, `${origin}/good`);
  await assert.rejects(scanPage({ url: `${origin}/missing` }), /HTTP 404/);
  await assert.rejects(
    scanPage({ url: `${origin}/good`, waitFor: "#absent", timeout: 300 }),
    /Timeout/,
  );
});

test("CLI produces both reports and returns 0 or 1 based on findings", async () => {
  const goodOutput = join(temporary, "good");
  const success = await cli([`${origin}/good`, "--output", goodOutput]);
  assert.equal(success.code, 0, success.stderr);
  const json = JSON.parse(await readFile(join(goodOutput, "report.json"), "utf8"));
  assert.equal(json.results.violations.length, 0);
  assert.match(await readFile(join(goodOutput, "report.html"), "utf8"), /Accessibility scan report/);
  const failure = await cli([`${origin}/bad`, "--output", join(temporary, "bad")]);
  assert.equal(failure.code, 1, failure.stderr);
  assert.match(failure.stdout, /button-name/);
});

test("CLI operational errors return 2 and help returns 0", async () => {
  for (const args of [[], ["file:///tmp/a"], [origin, "--timeout", "no"], [origin, "--unknown"]]) {
    const result = await cli(args);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Accessibility scan failed/);
  }
  assert.equal((await cli(["--help"])).code, 0);
});
