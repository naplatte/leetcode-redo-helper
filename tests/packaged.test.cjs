"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

test("real MV3 package starts in separate Chrome worlds and recovers when disabled", {
  timeout: 45000,
  skip: !process.env.LCR_EXTENSION_CHROME_PATH && "Requires an extension-capable Chrome for Testing build; normal Chrome rejects command-line extension loading."
}, async () => {
  const { chromium } = require(process.env.LCR_PLAYWRIGHT_PATH || "playwright");
  execFileSync(process.execPath, [path.join(root, "scripts/build.cjs")]);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lcr-package-"));
  const extension = path.join(temp, "extension");
  fs.mkdirSync(extension);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  // Test-only worker/permissions allow inspection and disabling of this test copy
  // inside its own disposable profile. They are never added to the shipped app.
  manifest.background = { service_worker: "test-worker.js" };
  manifest.permissions.push("tabs", "management");
  fs.writeFileSync(path.join(extension, "manifest.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(extension, "test-worker.js"), "chrome.runtime.onInstalled.addListener(() => {});");
  for (const file of ["guard.js", "shield.css", "popup.html", "popup.js", "popup.css", "dist/content.js", "dist/page-bridge.js", "icons/logo.svg", ...Object.values(manifest.icons)]) {
    fs.mkdirSync(path.dirname(path.join(extension, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(extension, file));
  }
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(temp, "profile"), {
      executablePath: process.env.LCR_EXTENSION_CHROME_PATH,
      headless: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: ["--disable-features=DisableLoadExtensionCommandLineSwitch", `--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker", { timeout: 10000 });
    const starter = "class Solution { public: int answer() { } };";
    const previous = "class Solution { public: int answer() { return 123; } };";
    const data = { props: { pageProps: { dehydratedState: { queries: [{
      queryKey: ["questionDetail", { titleSlug: "two-sum" }],
      state: { data: { question: { titleSlug: "two-sum", codeSnippets: [{ langSlug: "cpp", code: starter }] } } }
    }] } } } };
    const html = `<!doctype html><html><head><meta charset="utf-8"><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></head><body>
      <h1><a href="/problems/two-sum/">Two Sum</a></h1><div id="editor">
      <button data-e2e-locator="lang-selector-button" data-e2e-lang="cpp">C++</button>
      <button id="restore"><svg class="fa-arrow-rotate-left"></svg></button>
      <div class="monaco-editor" data-uri="inmemory://1"><div class="view-lines"><div class="view-line">${previous}</div></div></div></div>
      <script>window.fixture={resets:0,confirmations:0,noReset:false,render(code){document.querySelector('.view-line').textContent=code;}};
      document.querySelector('#restore').onclick=()=>{fixture.resets++;const dialog=document.createElement('div');dialog.setAttribute('role','alertdialog');
      dialog.innerHTML='<p>您将放弃所有更改并初始化代码！</p><button>确认</button>';document.body.appendChild(dialog);
      dialog.querySelector('button').onclick=()=>{fixture.confirmations++;if(!fixture.noReset)fixture.render(${JSON.stringify(starter)});dialog.remove();};};</script>
      </body></html>`;
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.goto("https://leetcode.cn/problems/two-sum/");
    const status = () => worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: "https://leetcode.cn/*" });
      return chrome.tabs.sendMessage(tabs[0].id, { type: "LCR_GET_STATUS" });
    });
    async function phase(name) {
      const deadline = Date.now() + 7000;
      let last;
      while (Date.now() < deadline) {
        try { last = await status(); if (last.phase === name) return; } catch {}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Expected ${name}; last status: ${JSON.stringify(last)}`);
    }
    await phase("ready");
    assert.equal(await page.locator(".view-line").textContent(), starter);
    assert.equal(await page.evaluate(() => typeof window.LeetcodeClearCore), "undefined");
    assert.equal(await page.evaluate(() => fixture.resets), 1);

    await worker.evaluate(() => chrome.storage.local.set({ enabled: false }));
    await phase("idle");
    await page.evaluate((value) => fixture.render(value), previous);
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".monaco-editor").evaluate(el=>getComputedStyle(el).opacity), "1");
    assert.equal(await page.evaluate(() => fixture.resets), 1);

    // Start a reset that cannot complete, then disable the actual extension.
    await page.evaluate(() => { fixture.noReset=true; });
    await worker.evaluate(() => chrome.storage.local.set({ enabled: true }));
    await page.waitForFunction(() => fixture.confirmations===2);
    assert.equal(await page.locator(".monaco-editor").evaluate(el=>getComputedStyle(el).opacity), "0");
    const disabling = worker.evaluate(() => chrome.management.setEnabled(chrome.runtime.id, false)).catch(() => {});
    await Promise.race([disabling, new Promise((resolve) => setTimeout(resolve, 500))]);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.monaco-editor')).opacity === '1', null, { timeout: 5000 });
    assert.deepEqual(errors, []);
  } finally {
    await context?.close();
    // Only remove this test's freshly created, verified temporary directory.
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(temp));
    if (!relative.startsWith("..") && !path.isAbsolute(relative) && /^lcr-package-[^\\/]+$/.test(relative)) fs.rmSync(temp, { recursive: true, force: true });
  }
});
