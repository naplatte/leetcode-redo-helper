"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

test("popup defaults, saved notice preference, icon assets and layout", { timeout: 20000 }, async () => {
  const { chromium } = require(process.env.LCR_PLAYWRIGHT_PATH || "playwright");
  const browser = await chromium.launch({
    executablePath: process.env.LCR_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true
  });
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
    const context = await browser.newContext({ viewport: { width: 380, height: 600 } });
    context.setDefaultTimeout(5000);
    const settings = {};
    const commands = [];
    await context.exposeBinding("testGetSettings", (_source, defaults) => ({ ...defaults, ...settings }));
    await context.exposeBinding("testSaveSettings", (_source, value) => Object.assign(settings, value));
    await context.exposeBinding("testPageMessage", (_source, request) => {
      commands.push(request.type);
      return { phase: "ready", message: "当前代码就是初始模板，无需重置。", problem: "two-sum" };
    });
    await context.addInitScript((extensionVersion) => {
      const listeners = [];
      window.chrome = {
        runtime: { getManifest: () => ({version:extensionVersion}) },
        storage: {
          local: { get: defaults => window.testGetSettings(defaults), async set(value) {
            await window.testSaveSettings(value);
            const changes = Object.fromEntries(Object.entries(value).map(([key,newValue]) => [key,{newValue}]));
            listeners.forEach(listener => listener(changes,"local"));
          } }, onChanged: { addListener: listener => listeners.push(listener) }
        },
        tabs: { query: async () => [{id:7}], sendMessage: (_tab, request) => window.testPageMessage(request) }
      };
    }, manifest.version);
    await context.route("**/*", route => {
      const relative = new URL(route.request().url()).pathname.slice(1);
      if (!["popup.html","popup.css","popup.js","icons/logo.svg"].includes(relative)) return route.abort();
      const types = { ".html":"text/html", ".css":"text/css", ".js":"application/javascript", ".svg":"image/svg+xml" };
      return route.fulfill({ contentType: types[path.extname(relative)] + ";charset=utf-8", body: fs.readFileSync(path.join(root,relative)) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("https://local-extension.test/popup.html");
    await page.waitForFunction(() => document.querySelector('#status-card').dataset.phase === 'ready');
    assert.equal(await page.title(), "leetcode重做助手");
    assert.equal(await page.locator('#version').textContent(), `v${manifest.version}`);
    assert.equal(await page.locator('#enabled').isChecked(), true);
    assert.equal(await page.locator('#show-page-status').isChecked(), true);
    assert.equal(await page.locator('.brand-mark').evaluate(el=>el.complete && el.naturalWidth>0), true);
    const dimensions = await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.body.scrollHeight}));
    assert.ok(dimensions.width <= 380, JSON.stringify(dimensions));
    assert.ok(dimensions.height <= 600, JSON.stringify(dimensions));
    fs.mkdirSync(path.join(root,"docs"),{recursive:true});
    await page.screenshot({path:path.join(root,"docs/popup-preview.png"),fullPage:true});
    await page.locator('#show-page-status').uncheck();
    await page.waitForFunction(()=>!document.querySelector('#show-page-status').disabled);
    assert.equal(settings.showPageStatus, false);
    assert.equal(await page.locator('#enabled').isChecked(), true);
    assert.equal(commands.some(type=>type === 'LCR_RETRY' || type === 'LCR_PAUSE_TAB'), false);
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#status-card').dataset.phase === 'ready');
    assert.equal(await page.locator('#show-page-status').isChecked(), false);
    await page.locator('#show-page-status').check();
    await page.waitForFunction(()=>!document.querySelector('#show-page-status').disabled);
    assert.equal(settings.showPageStatus, true);
    for (const [size,file] of Object.entries(manifest.icons)) {
      const png=fs.readFileSync(path.join(root,file));
      assert.equal(png.readUInt32BE(16), Number(size));
      assert.equal(png.readUInt32BE(20), Number(size));
    }
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});
