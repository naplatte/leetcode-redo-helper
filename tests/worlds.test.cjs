"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

test("production bundles run in distinct Chrome MAIN and ISOLATED worlds without shared globals", { timeout: 20000 }, async () => {
  const { chromium } = require(process.env.LCR_PLAYWRIGHT_PATH || "playwright");
  execFileSync(process.execPath, [path.join(root, "scripts/build.cjs")]);
  const browser = await chromium.launch({
    executablePath: process.env.LCR_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true
  });
  try {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    const executionContexts = [];
    cdp.on("Runtime.executionContextCreated", ({ context }) => executionContexts.push(context));
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    const starter = "class Solution { public: int answer() { } };";
    const previous = "class Solution { public: int answer() { return 123; } };";
    const data = { props: { pageProps: { dehydratedState: { queries: [{
      queryKey: ["questionDetail", { titleSlug: "two-sum" }],
      state: { data: { question: { titleSlug: "two-sum", codeSnippets: [{ langSlug: "cpp", code: starter }] } } }
    }] } } } };
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fs.readFileSync(path.join(root, "shield.css"), "utf8")}</style>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></head><body>
      <h1><a href="/problems/two-sum/">Two Sum</a></h1><div id="editor">
      <button data-e2e-locator="lang-selector-button" data-e2e-lang="cpp">C++</button>
      <button id="restore"><svg class="fa-arrow-rotate-left"></svg></button>
      <div class="monaco-editor" data-uri="inmemory://1"><div class="view-lines"><div class="view-line">${previous}</div></div></div></div>
      <script>window.fixture={resets:0,confirmations:0,noReset:false,render(code){document.querySelector('.view-line').textContent=code;}};
      document.querySelector('#restore').onclick=()=>{fixture.resets++;const dialog=document.createElement('div');dialog.setAttribute('role','alertdialog');
      dialog.innerHTML='<p>您将放弃所有更改并初始化代码！</p><button>确认</button>';document.body.appendChild(dialog);
      dialog.querySelector('button').onclick=()=>{fixture.confirmations++;if(!fixture.noReset)fixture.render(${JSON.stringify(starter)});dialog.remove();};};</script>
      </body></html>`;
    const shim = `(() => {
      const handlers=[],changes=[],timers=[];
      const interval=window.setInterval;window.setInterval=(fn,...args)=>{const id=interval(fn,...args);timers.push({id,fn});return id;};
      window.chrome={runtime:{getManifest(){return {};},onMessage:{addListener(fn){handlers.push(fn);}}},
        storage:{local:{get(){return Promise.resolve({enabled:true});}},onChanged:{addListener(fn){changes.push(fn);}}}};
      window.harness={status(){let result;for(const fn of handlers)fn({type:'LCR_GET_STATUS'},{},v=>result=v);return result;},
        configure(enabled){changes.forEach(fn=>fn({enabled:{newValue:enabled}},'local'));},
        stopControllerTimer(){timers.filter(item=>item.fn.name==='schedule').forEach(item=>clearInterval(item.id));}};
    })();`;
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.module={exports:{}};\n" + fs.readFileSync(path.join(root, "dist/page-bridge.js"), "utf8") });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { worldName: "lcr-regression-isolated",
      source: shim + "\n" + fs.readFileSync(path.join(root, "guard.js"), "utf8") + "\n" + fs.readFileSync(path.join(root, "dist/content.js"), "utf8") });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
    await page.goto("https://leetcode.cn/problems/two-sum/");
    const { frameTree } = await cdp.send("Page.getFrameTree");
    const context = executionContexts.findLast(item=>item.name === "lcr-regression-isolated" && item.auxData?.frameId === frameTree.frame.id);
    assert.ok(context, `Missing isolated world: ${JSON.stringify(executionContexts.map(item=>({name:item.name,id:item.id})))}`);
    const executionContextId = context.id;
    async function isolated(expression) {
      const response = await cdp.send("Runtime.evaluate", { expression, contextId: executionContextId, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    }
    const deadline = Date.now() + 6000;
    while ((await isolated("harness.status()?.phase")) !== "ready" && Date.now() < deadline) await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(await isolated("harness.status()?.phase"), "ready", JSON.stringify({
      status: await isolated("harness.status()"),
      fixture: await page.evaluate(() => ({resets:fixture.resets,confirmations:fixture.confirmations,
        dialog:document.querySelector('[role="alertdialog"]')?.textContent,
        code:document.querySelector('.view-line')?.textContent, recovery:document.querySelector('#lcr-recovery')?.textContent}))
    }));
    assert.equal(await page.evaluate(() => typeof window.harness), "undefined", "MAIN cannot see ISOLATED globals");
    assert.equal(await isolated("typeof LeetcodeClearCore"), "undefined", "Core is private to each bundle");
    assert.equal(await page.locator(".view-line").textContent(), starter);
    assert.equal(await page.evaluate(() => fixture.resets), 1);

    await isolated("harness.configure(false)");
    await page.evaluate((value) => fixture.render(value), previous);
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".monaco-editor").evaluate(el=>getComputedStyle(el).opacity), "1");
    assert.equal(await page.evaluate(() => fixture.resets), 1);

    // A stalled controller is released by the independent guard, never by a
    // compositor timer that could accidentally reveal an unverified answer.
    await page.evaluate(() => { fixture.noReset=true; });
    await isolated("harness.configure(true)");
    await page.waitForFunction(() => fixture.confirmations===2);
    await isolated("harness.stopControllerTimer()");
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.monaco-editor')).opacity==='1', null, {timeout:5000});
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
