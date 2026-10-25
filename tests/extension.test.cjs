"use strict";
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const core = require("../core.js");
execFileSync(process.execPath, [path.join(__dirname, "../scripts/build.cjs")]);

test("only ordinary China-site problem URLs are accepted", () => {
  for (const url of ["https://leetcode.cn/problems/two-sum/", "/problems/two-sum/description/?envId=hot-100", "/problems/two-sum"]) {
    assert.equal(core.problemFromUrl(url), "two-sum");
  }
  for (const url of ["https://leetcode.com/problems/two-sum/", "/problems/two-sum/solutions/", "/problems/two-sum/submissions/", "/contest/weekly-contest-1/problems/two-sum/", "/problemset/"]) {
    assert.equal(core.problemFromUrl(url), null);
  }
});

test("question identity is stable across description, solutions and submission views", () => {
  for (const path of ["/problems/two-sum/", "/problems/two-sum/description/", "/problems/two-sum/submissions/123/", "/problems/two-sum/solutions/"]) {
    assert.equal(core.questionFromUrl(path), "two-sum");
  }
  assert.equal(core.questionFromUrl("https://leetcode.com/problems/two-sum/"), null);
  assert.equal(core.questionFromUrl("/contest/weekly/problems/two-sum/"), null);
});

test("starter templates retain their own question identity", () => {
  const data = { queries: ["alpha", "beta"].map((slug) => ({
    queryKey: ["questionDetail", { titleSlug: slug }],
    state: { data: { question: { codeSnippets: [{ langSlug: "cpp", code: `class ${slug} {};` }] } } }
  })) };
  const results = core.collectTemplates(data);
  assert.deepEqual(results.map((item) => item.slug), ["alpha", "beta"]);
  assert.equal(results[1].snippets[0].code, "class beta {};");
  assert.deepEqual(core.validSnippets([{ langSlug: "cpp" }, null, { langSlug: "cpp", code: "" }]), [{ langSlug: "cpp", lang: undefined, code: "" }]);
});

test("rendered whitespace and invisible editor characters normalize", () => {
  assert.equal(core.normalizeCode("class\u00a0Solution {\n\u200b}\r\n"), "classSolution{}");
});

const root = path.join(__dirname, "..");
const cpp = "class Solution {\npublic:\n    int answer() {\n    }\n};";
const java = "class Solution {\n    public int answer() {\n    }\n}";
const otherCpp = "class Solution {\npublic:\n    int otherAnswer() {\n    }\n};";
const old = "class Solution { int answer() { return SECRET_OLD_ANSWER; } };";

function questionData(slug) {
  return { pageProps: { dehydratedState: { queries: [{
    queryKey: ["questionDetail", { titleSlug: slug }],
    state: { data: { question: { titleSlug: slug, codeSnippets: [
      { langSlug: "cpp", lang: "C++", code: slug === "two-sum" ? cpp : otherCpp },
      { langSlug: "java", lang: "Java", code: java }
    ] } } }
  }] } } };
}

function fixture(mode = "normal") {
  const data = { props: { pageProps: { dehydratedState: { queries: [{
    queryKey: ["questionDetail", { titleSlug: "two-sum" }],
    state: { data: { question: { titleSlug: "two-sum", codeSnippets: [
      { langSlug: "cpp", lang: "C++", code: cpp }, { langSlug: "java", lang: "Java", code: java }
    ] } } }
  }] } } } };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @keyframes fixture-dialog-enter { from { transform:translateY(3px); } to { transform:translateY(0); } }
  @keyframes fixture-dialog-exit { from { transform:translateY(0); } to { transform:translateY(3px); } }
  .fixture-modal[data-state="open"] { animation:fixture-dialog-enter 100ms; }
  .fixture-modal[data-state="closed"] { animation:fixture-dialog-exit 700ms; }
  ${fs.readFileSync(path.join(root, "shield.css"), "utf8")}</style>
  <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></head>
  <body><h1><a href="/problems/two-sum/">两数之和</a></h1><button id="debug-reset" aria-label="重置">调试器重置</button>
  <a id="next" href="/problems/add-two-numbers/">下一题</a>
  <button id="interactive-check">交互检查</button>
  <button id="submit" data-e2e-locator="console-submit-button">提交</button>
  <button data-e2e-locator="lang-option" data-e2e-lang="java" id="java">Java</button>
  <div class="flexlayout__tabset"><div id="code_tab">代码</div><div id="editor">
  <button data-e2e-locator="lang-selector-button" data-e2e-lang="cpp">C++</button>
  ${mode === "missing" ? "" : `<button id="restore"><svg ${mode === "data-icon" ? 'data-icon="arrow-rotate-left"' : 'class="svg-inline--fa fa-arrow-rotate-left absolute"'}></svg>恢复代码</button>`}
  <div data-track-load="code_editor"><div class="monaco-editor" data-uri="inmemory://model/1" contenteditable="true"><div class="view-lines"></div></div></div>
  </div></div><script>
  window.fixture = { resets:0, confirms:0, debuggerClicks:0, interactiveClicks:0, prematureConfirm:false, oldVisible:false, modalVisible:false,
    mode:${JSON.stringify(mode)}, cpp:${JSON.stringify(cpp)}, otherCpp:${JSON.stringify(otherCpp)}, java:${JSON.stringify(java)},
    slug:'two-sum', modelId:1, navigationDelay:0, cleanTarget:false, documentMarker:Math.random() };
  fixture.setCode = (code) => {
    fixture.modelCode=code;
    if(fixture.mode==='render-sensitive' && fixture.confirms>0 && getComputedStyle(document.querySelector('.monaco-editor')).visibility==='hidden')return;
    const lines=document.querySelector('.view-lines'); lines.replaceChildren();
    const visibleLines=fixture.mode==='virtual-model'?code.split('\\n').slice(1,3):code.split('\\n');
    visibleLines.forEach(text=>{const line=document.createElement('div');line.className='view-line';line.textContent=text||'\\u00a0';lines.appendChild(line);});
  };
  if(fixture.mode==='virtual-model')window.monaco={editor:{getModels:()=>[{uri:{toString:()=>document.querySelector('.monaco-editor').getAttribute('data-uri')},getValue:()=>fixture.modelCode}]}};
  fixture.setCode(${["clean", "clean-format"].includes(mode) ? JSON.stringify(mode === "clean-format" ? cpp.replace(/    /g, "\t") : cpp) : JSON.stringify(old)});
  fixture.template = () => document.querySelector('[data-e2e-locator="lang-selector-button"]').getAttribute('data-e2e-lang')==='java'?fixture.java:fixture.slug==='two-sum'?fixture.cpp:fixture.otherCpp;
  document.querySelector('#debug-reset').onclick=()=>fixture.debuggerClicks++;
  document.querySelector('#interactive-check').onclick=()=>fixture.interactiveClicks++;
  document.querySelector('#java').onclick=()=>{
    document.querySelector('[data-e2e-locator="lang-selector-button"]').setAttribute('data-e2e-lang','java');
    fixture.setCode(${JSON.stringify(old)});
  };
  document.querySelector('#restore')?.addEventListener('click',()=>{
    fixture.resets++;
    const dialog=document.createElement('div'); dialog.setAttribute('role','alertdialog');
    const backdrop=document.createElement('div');backdrop.className='fixed inset-0';backdrop.dataset.state='open';document.body.appendChild(backdrop);
    dialog.innerHTML='<h2>操作确认</h2><p>您将放弃所有更改并初始化代码！</p><button id="cancel">取消</button><button id="confirm">确认</button>';
    document.body.appendChild(dialog);
    const animated=['animated-dialog','stuck-lock'].includes(fixture.mode);
    let effectsReady=false;
    if(animated){
      dialog.className='fixture-modal'; dialog.dataset.state='open';
      document.body.style.pointerEvents='none'; document.querySelector('#editor').inert=true;
      // Model a native modal's deferred effect installation and exit animation.
      setTimeout(()=>{effectsReady=true;},100);
    }
    const closeDialog=()=>{
      if(!animated){dialog.remove();backdrop.remove();return;}
      fixture.prematureConfirm=!effectsReady;
      dialog.dataset.state='closed';backdrop.dataset.state='closed';
      dialog.addEventListener('animationend',()=>{
        dialog.remove();backdrop.remove();
        if(fixture.mode!=='stuck-lock')setTimeout(()=>{
          document.body.style.pointerEvents='';document.querySelector('#editor').inert=false;
        },400);
      },{once:true});
    };
    dialog.querySelector('#cancel').onclick=closeDialog;
    dialog.querySelector('#confirm').onclick=()=>{
      fixture.confirms++; closeDialog();
      if(fixture.mode!=='no-reset')fixture.setCode(fixture.template());
    };
    if(fixture.mode==='delayed-confirm'){
      dialog.querySelector('#confirm').disabled=true;
      setTimeout(()=>dialog.querySelector('#confirm').disabled=false,250);
    }
  });
  fixture.arrive=async(slug)=>{
    const data=await fetch('/_next/data/fixture/problems/'+slug+'/description.json').then(r=>r.json());
    fixture.lastDataSlug=data.pageProps.dehydratedState.queries[0].state.data.question.titleSlug;
    let heading=document.querySelector('h1 a');if(!heading){heading=document.createElement('a');document.querySelector('h1').appendChild(heading);}
    heading.href='/problems/'+slug+'/';heading.textContent=slug;
    await new Promise(resolve=>setTimeout(resolve,fixture.navigationDelay));
    fixture.slug=slug;
    document.querySelector('.monaco-editor').setAttribute('data-uri','inmemory://model/'+(++fixture.modelId));
    fixture.setCode(fixture.cleanTarget?fixture.template():${JSON.stringify(old)});
  };
  document.querySelector('#next').onclick=(event)=>{
    event.preventDefault();history.pushState({},'',event.currentTarget.href);
    fixture.arrive('add-two-numbers');
  };
  window.addEventListener('popstate',()=>fixture.arrive(location.pathname.split('/')[2]));
  document.querySelector('#submit').onclick=()=>{
    fixture.submits=(fixture.submits||0)+1;
    const slug=fixture.slug;
    history.pushState({},'','/problems/'+slug+'/submissions/123/');
    document.querySelector('h1 a')?.remove();
    setTimeout(()=>history.replaceState({},'','/problems/'+slug+'/'),40);
  };
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey&&event.key==='Enter')document.querySelector('#submit').click();
  });
  function track(){const editor=document.querySelector('.monaco-editor');if(editor&&getComputedStyle(editor).opacity!=='0'&&editor.textContent.includes('SECRET_OLD_ANSWER'))fixture.oldVisible=true;
    if(Array.from(document.querySelectorAll('[role="alertdialog"],.fixed.inset-0')).some(el=>getComputedStyle(el).opacity!=='0'))fixture.modalVisible=true;
    requestAnimationFrame(track);}requestAnimationFrame(track);
  </script></body></html>`;
}

function init(enabled = true, variant = "normal", showPageStatus = true) {
  return `(() => {
    const handlers=[]; const changes=[];const intervals=[];let setting=${enabled};let notices=${showPageStatus};let invalidated=false;
    const setNativeInterval=window.setInterval.bind(window);
    window.setInterval=(fn,...args)=>{const id=setNativeInterval(fn,...args);intervals.push({id,fn});return id;};
    window.module={exports:{}};
    window.chrome={runtime:{getManifest(){if(invalidated)throw Error('Extension context invalidated');return {version:'test'};},onMessage:{addListener(fn){${variant === "partial-startup" ? "throw Error('listener registration failed');" : "handlers.push(fn);"}}}},storage:{
      local:{get(){return ${variant === "storage-error" ? "Promise.reject(Error('storage unavailable'))" : "Promise.resolve({enabled:setting,showPageStatus:notices})"};}},onChanged:{addListener(fn){changes.push(fn);}}
    }};
    window.harness={command(type){return new Promise(resolve=>{for(const fn of handlers)fn({type},{},resolve);});},
      status(){let result;for(const fn of handlers)fn({type:'LCR_GET_STATUS'},{},value=>result=value);return result;},
      invalidate(){invalidated=true;},
      stopControllerTimer(){intervals.filter(item=>item.fn.name==='schedule').forEach(item=>clearInterval(item.id));},
      pageStatus(value){notices=value;changes.forEach(fn=>fn({showPageStatus:{newValue:value}},'local'));},
      configure(value){const oldValue=setting;setting=value;changes.forEach(fn=>fn({enabled:{oldValue,newValue:value}},'local'));}};
  })();\n` + (variant === "css-only" ? [] : variant === "no-controller"
    ? ["dist/page-bridge.js", "guard.js"] : ["dist/page-bridge.js", "guard.js", "dist/content.js"])
    .map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n;\n");
}

test("browser behavior with an offline LeetCode-shaped fixture", { timeout: 120000 }, async (t) => {
  const { chromium } = require(process.env.LCR_PLAYWRIGHT_PATH || "playwright");
  const browser = await chromium.launch({ executablePath: process.env.LCR_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const errors = [];
  async function open(mode = "normal", enabled = true, url = "https://leetcode.cn/problems/two-sum/", variant = "normal", showPageStatus = true) {
    const context = await browser.newContext();
    await context.addInitScript({ content: init(enabled, variant, showPageStatus) });
    const page = await context.newPage();
    page.on("pageerror", (error) => { errors.push(error.message); console.error("fixture page error:", error.message); });
    await page.route("**/*", (route) => {
      const match = new URL(route.request().url()).pathname.match(/\/problems\/([^/]+)(?:\/description)?\.json$/);
      return route.fulfill({ status: 200, contentType: match ? "application/json" : "text/html",
        body: match ? JSON.stringify(questionData(match[1])) : fixture(mode) });
    });
    await page.goto(url);
    return { page, context };
  }
  const phase = (page) => page.evaluate(() => harness.command("LCR_GET_STATUS"));
  const ready = async (page) => {
    try { await page.waitForFunction(() => harness.status()?.phase === "ready", null, { timeout: 7000 }); }
    catch (error) {
      console.error("fixture state:", await page.evaluate(() => ({ status: harness.status(), resets: fixture.resets,
        confirms: fixture.confirms, rendered: document.querySelector('.view-lines')?.textContent,
        language: document.querySelector('[data-e2e-locator="lang-selector-button"]')?.getAttribute('data-e2e-lang'),
        dialogs: Array.from(document.querySelectorAll('[role="alertdialog"]'), el=>el.textContent) })));
      throw error;
    }
  };
  try {
    await t.test("first display is the template; debugger is untouched; user edits survive", async () => {
      const { page, context } = await open();
      await ready(page);
      assert.equal(await page.evaluate(() => typeof window.LeetcodeClearCore), "undefined", "Production bundles need no browser-global core");
      assert.deepEqual(await page.evaluate(() => [fixture.resets, fixture.confirms, fixture.debuggerClicks, fixture.oldVisible]), [1, 1, 0, false]);
      assert.equal(await page.evaluate(() => fixture.modalVisible), false);
      await page.locator(".monaco-editor").click();
      await page.evaluate(() => fixture.setCode("my new work"));
      await page.waitForTimeout(800);
      assert.equal(await page.locator(".view-lines").textContent(), "my new work");
      assert.equal(await page.evaluate(() => fixture.resets), 1);
      await context.close();
    });

    for (const mode of ["clean", "clean-format"]) {
      await t.test(`${mode}: pristine starter code does not open a reset dialog or update code`, async () => {
        const { page, context } = await open(mode);
        await ready(page);
        assert.deepEqual(await page.evaluate(() => [fixture.resets, fixture.confirms, fixture.oldVisible]), [0, 0, false]);
        assert.match((await phase(page)).message, /无需重置/);
        assert.equal(await page.locator("#lcr-notice").count(), 0);
        assert.equal(await page.locator(".view-lines").evaluate(el=>Array.from(el.children,line=>line.textContent).join('\n')),
          mode === "clean-format" ? cpp.replace(/    /g, "\t") : cpp);
        await context.close();
      });
    }

    await t.test("the native dialog and backdrop stay transparent even across paint frames", async () => {
      const { page, context } = await open("delayed-confirm");
      await page.locator('[role="alertdialog"]').waitFor({ state: "attached" });
      assert.equal(await page.locator('[role="alertdialog"]').evaluate(el=>getComputedStyle(el).opacity), "0");
      assert.equal(await page.locator('.fixed.inset-0').evaluate(el=>getComputedStyle(el).opacity), "0");
      await ready(page);
      assert.equal(await page.evaluate(() => fixture.modalVisible), false);
      await context.close();
    });

    await t.test("native modal effects and exit animation finish; buttons and real typing work after reset", async () => {
      const { page, context } = await open("animated-dialog");
      await page.waitForFunction(() => fixture.confirms===1);
      assert.equal(await page.locator('[role="alertdialog"]').evaluate(el=>getComputedStyle(el).animationName), "fixture-dialog-exit");
      assert.notEqual((await phase(page)).phase,"ready", "A template alone does not mean the modal released its locks");
      await ready(page);
      assert.equal(await page.evaluate(() => fixture.prematureConfirm), false);
      assert.equal(await page.locator('[role="alertdialog"]').count(), 0);
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).pointerEvents), "auto");
      assert.equal(await page.locator('#editor').evaluate(el=>el.inert), false);
      await page.locator('#interactive-check').click();
      assert.equal(await page.evaluate(() => fixture.interactiveClicks), 1);
      await page.locator('.monaco-editor').click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('// typing works');
      await page.waitForTimeout(500);
      assert.match(await page.locator('.monaco-editor').textContent(), /typing works/);
      assert.equal(await page.evaluate(() => fixture.resets), 1, "New work must not be reset");
      await page.locator('#java').click();
      await page.waitForFunction(() => fixture.confirms===2);
      await ready(page);
      await page.locator('#interactive-check').click();
      assert.equal(await page.evaluate(() => fixture.interactiveClicks), 2);
      await context.close();
    });

    await t.test("a leftover website pointer lock never reports ready or gets forcefully deleted", async () => {
      const { page, context } = await open("stuck-lock");
      await page.waitForFunction(() => fixture.confirms===1 && !document.querySelector('[role="alertdialog"]'));
      await page.waitForTimeout(700);
      assert.notEqual((await phase(page)).phase,"ready");
      assert.equal(await page.evaluate(() => document.body.style.pointerEvents), "none");
      await context.close();
    });

    await t.test("page notices default on; toggling them hides progress/errors without restarting a reset", async () => {
      const { page, context } = await open("no-reset");
      await page.locator('#lcr-notice').waitFor();
      await page.evaluate(()=>harness.pageStatus(false));
      assert.equal(await page.locator('#lcr-notice').count(),0);
      const resets=await page.evaluate(()=>fixture.resets);
      await page.evaluate(()=>harness.pageStatus(true));
      await page.locator('#lcr-notice').waitFor();
      assert.equal(await page.evaluate(()=>fixture.resets),resets);
      await context.close();
    });

    await t.test("saved notice-off preference also hides recovery while keeping the safety release active", async () => {
      const { page, context } = await open("normal",true,"https://leetcode.cn/problems/two-sum/","no-controller",false);
      await page.waitForFunction(()=>document.documentElement.hasAttribute('data-lcr-recovered'));
      assert.equal(await page.locator('#lcr-recovery').count(),0);
      assert.equal(await page.locator('.monaco-editor').evaluate(el=>getComputedStyle(el).opacity),'1');
      await page.evaluate(()=>harness.pageStatus(true));
      await page.locator('#lcr-recovery').waitFor();
      await page.evaluate(()=>harness.pageStatus(false));
      assert.equal(await page.locator('#lcr-recovery').count(),0);
      await context.close();
    });

    await t.test("switching language hides old code and resets exactly once", async () => {
      const { page, context } = await open();
      await ready(page);
      await page.locator("#java").click();
      await ready(page);
      assert.equal(await page.evaluate(() => fixture.resets), 2);
      assert.equal(await page.evaluate(() => fixture.oldVisible), false);
      assert.equal(core.normalizeCode(await page.locator(".view-lines").textContent()), core.normalizeCode(java));
      await context.close();
    });

    await t.test("older data-icon markup remains supported", async () => {
      const { page, context } = await open("data-icon");
      await ready(page);
      assert.equal(await page.evaluate(() => fixture.resets), 1);
      await context.close();
    });

    for (const mode of ["render-sensitive", "virtual-model"]) {
      await t.test(`${mode}: verify the real template without requiring all virtual DOM lines or hiding the renderer`, async () => {
        const { page, context } = await open(mode);
        await ready(page);
        assert.equal(await page.evaluate(()=>fixture.confirms),1);
        assert.equal(await page.evaluate(()=>fixture.modelCode),cpp);
        assert.equal(await page.locator('.monaco-editor').evaluate(el=>getComputedStyle(el).visibility),'visible');
        await context.close();
      });
    }

    for (const action of ["button", "keyboard"]) {
      await t.test(`submitting by ${action} preserves user work across temporary result URLs and absent headings`, async () => {
        const { page, context } = await open();
        await ready(page);
        await page.locator('.monaco-editor').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('// MY_NEW_SOLUTION');
        const code=await page.locator('.monaco-editor').textContent();
        if(action==='button')await page.locator('#submit').click();
        else await page.keyboard.press('Control+Enter');
        await page.waitForFunction(()=>fixture.submits===1&&location.pathname==='/problems/two-sum/');
        await page.evaluate(()=>{history.replaceState({submissionResult:true},'',location.href+'?envId=test');});
        await page.waitForTimeout(450);
        assert.equal((await phase(page)).phase,'ready');
        assert.equal(await page.evaluate(()=>fixture.resets),1);
        assert.equal(await page.locator('.monaco-editor').textContent(),code);
        assert.equal(await page.locator('.monaco-editor').evaluate(el=>getComputedStyle(el).opacity),'1');
        await page.locator('#next').click();
        await page.waitForFunction(()=>fixture.resets===2);
        await ready(page);
        await context.close();
      });
    }

    await t.test("returning from a directly opened result view does not reset the same question", async () => {
      const { page, context } = await open('normal',true,'https://leetcode.cn/problems/two-sum/submissions/123/');
      await page.waitForTimeout(100);
      await page.evaluate(()=>{
        document.querySelector('h1 a').remove();
        history.replaceState({},'', '/problems/two-sum/');
      });
      await ready(page);
      assert.equal(await page.evaluate(()=>fixture.resets),0);
      assert.equal(await page.locator('.monaco-editor').evaluate(el=>getComputedStyle(el).opacity),'1');
      await context.close();
    });

    await t.test("same-question URL updates do not restart an explicitly paused page", async () => {
      const { page, context } = await open('no-reset');
      await page.waitForFunction(()=>fixture.confirms===1);
      await page.evaluate(()=>harness.command('LCR_PAUSE_TAB'));
      await page.evaluate(()=>history.replaceState({result:true},'',location.href+'?result=accepted'));
      await page.waitForTimeout(350);
      assert.equal((await phase(page)).phase,'paused');
      assert.equal(await page.evaluate(()=>fixture.resets),1);
      assert.equal(await page.locator('.monaco-editor').evaluate(el=>getComputedStyle(el).opacity),'1');
      await context.close();
    });

    await t.test("initial late-draft checks stop once the initial loading window has passed", async () => {
      const { page, context } = await open();
      await ready(page);
      await page.waitForTimeout(2700);
      await page.evaluate(()=>fixture.setCode('CURRENT_CODE_AFTER_FOCUS_REVALIDATION'));
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(()=>fixture.resets),1);
      assert.equal(await page.locator('.view-lines').textContent(),'CURRENT_CODE_AFTER_FOCUS_REVALIDATION');
      await context.close();
    });

    await t.test("background timer throttling keeps the shield closed through the first foreground frame", async () => {
      const { page, context } = await open('no-reset');
      await page.waitForFunction(()=>fixture.confirms===1);
      await page.evaluate(()=>{window.dispatchEvent(new Event('blur'));harness.stopControllerTimer();});
      await page.waitForTimeout(2700);
      assert.equal(await page.locator('.monaco-editor').evaluate(el=>getComputedStyle(el).opacity),'0');
      assert.equal(await page.locator('#lcr-recovery').count(),0);
      const firstFrame=await page.evaluate(()=>{
        window.dispatchEvent(new Event('focus'));
        return new Promise(resolve=>requestAnimationFrame(()=>resolve(getComputedStyle(document.querySelector('.monaco-editor')).opacity)));
      });
      assert.equal(firstFrame,'0');
      assert.equal(await page.evaluate(()=>fixture.oldVisible),false);
      await context.close();
    });

    await t.test("back-forward cache restoration keeps newly typed code visible", async () => {
      const { page, context } = await open();
      await ready(page);
      await page.locator('.monaco-editor').click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('// KEEP_ON_RETURN');
      const code=await page.locator('.monaco-editor').textContent();
      await page.evaluate(()=>{
        window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
        window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
      });
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(()=>fixture.resets),1);
      assert.equal(await page.locator('.monaco-editor').textContent(),code);
      assert.equal(await page.locator('.monaco-editor').evaluate(el=>getComputedStyle(el).opacity),'1');
      await context.close();
    });

    await t.test("time spent away from the page does not consume the automatic-reset timeout", async () => {
      const { page, context } = await open('no-reset');
      await page.waitForFunction(()=>fixture.confirms===1);
      await page.evaluate(()=>{
        window.dispatchEvent(new Event('blur'));
        const originalNow=Date.now.bind(Date);
        Date.now=()=>originalNow()+30000;
        window.dispatchEvent(new Event('focus'));
      });
      await page.waitForTimeout(200);
      assert.equal((await phase(page)).phase,'resetting');
      assert.equal(await page.locator('#lcr-recovery').count(),0);
      assert.equal(await page.locator('.monaco-editor').evaluate(el=>getComputedStyle(el).opacity),'0');
      await context.close();
    });

    await t.test("the shield does not blank other read-only code panels", async () => {
      const { page, context } = await open('no-reset');
      await page.waitForFunction(()=>fixture.confirms===1);
      await page.evaluate(()=>{
        const preview=document.createElement('div');preview.className='monaco-editor';preview.id='submission-preview';preview.textContent='Accepted submission';document.body.appendChild(preview);
      });
      assert.equal(await page.locator('#submission-preview').evaluate(el=>getComputedStyle(el).opacity),'1');
      assert.equal(await page.locator('#editor .monaco-editor').evaluate(el=>getComputedStyle(el).opacity),'0');
      await context.close();
    });

    await t.test("a late cloud draft is hidden and reset again before a frame is painted", async () => {
      const { page, context } = await open();
      await ready(page);
      await page.evaluate((text) => fixture.setCode(text), old);
      await page.waitForFunction(() => fixture.resets === 2);
      await ready(page);
      assert.equal(await page.evaluate(() => fixture.oldVisible), false);
      await context.close();
    });

    await t.test("disabled at document start reveals code without resetting", async () => {
      const { page, context } = await open("normal", false);
      await page.waitForTimeout(300);
      assert.equal((await phase(page)).phase, "idle");
      assert.equal(await page.locator(".monaco-editor").evaluate((el) => getComputedStyle(el).opacity), "1");
      assert.equal(await page.evaluate(() => fixture.resets), 0);
      await context.close();
    });

    await t.test("a missing controller module releases the shield and reports recovery", async () => {
      const { page, context } = await open("normal", true, "https://leetcode.cn/problems/two-sum/", "no-controller");
      await page.locator("#lcr-recovery").waitFor({ timeout: 5000 });
      assert.equal(await page.locator(".monaco-editor").evaluate(el=>getComputedStyle(el).opacity), "1");
      assert.equal(await page.evaluate(() => fixture.resets), 0);
      await context.close();
    });

    await t.test("with no extension JavaScript at all, the CSS lease expires by itself", async () => {
      const { page, context } = await open("normal", true, "https://leetcode.cn/problems/two-sum/", "css-only");
      assert.equal(await page.locator(".monaco-editor").evaluate(el=>getComputedStyle(el).opacity), "0");
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.monaco-editor')).opacity === '1', null, {timeout:5000});
      assert.equal(await page.evaluate(() => fixture.resets), 0);
      await context.close();
    });

    await t.test("a native modal is not invisibly trapped if all extension scripts disappear", async () => {
      const { page, context } = await open("normal", true, "https://leetcode.cn/problems/two-sum/", "css-only");
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-lcr-auto-reset','true');
        document.querySelector('#restore').click();
      });
      assert.equal(await page.locator('[role="alertdialog"]').evaluate(el=>getComputedStyle(el).opacity),'0');
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('[role="alertdialog"]')).opacity==='1',null,{timeout:5000});
      await page.locator('#cancel').click();
      assert.equal(await page.locator('[role="alertdialog"]').count(),0);
      await context.close();
    });

    await t.test("storage failure recovers instead of permanently hiding the editor", async () => {
      const { page, context } = await open("normal", true, "https://leetcode.cn/problems/two-sum/", "storage-error");
      await page.locator("#lcr-recovery").waitFor({ timeout: 5000 });
      assert.equal(await page.locator(".monaco-editor").evaluate(el=>getComputedStyle(el).opacity), "1");
      assert.equal(await page.evaluate(() => fixture.resets), 0);
      await context.close();
    });

    await t.test("a partial startup cannot keep re-hiding code after emergency recovery", async () => {
      const { page, context } = await open("normal", true, "https://leetcode.cn/problems/two-sum/", "partial-startup");
      await page.locator("#lcr-recovery").waitFor({ timeout: 5000 });
      await page.waitForTimeout(1000);
      assert.equal(await page.locator(".monaco-editor").evaluate(el=>getComputedStyle(el).opacity), "1");
      assert.equal(await page.evaluate(() => fixture.resets), 0);
      await context.close();
    });

    await t.test("turning the switch off during a pending route immediately reveals code", async () => {
      const { page, context } = await open("clean");
      await ready(page);
      await page.evaluate(() => { fixture.navigationDelay=700; });
      await page.locator("#next").click();
      await page.evaluate(() => harness.configure(false));
      await page.waitForFunction(() => fixture.slug==='add-two-numbers');
      assert.equal(await page.locator(".monaco-editor").evaluate(el=>getComputedStyle(el).opacity), "1");
      assert.equal(await page.evaluate(() => fixture.resets), 0);
      await context.close();
    });

    await t.test("invalidated extension contexts release an active shield", async () => {
      const { page, context } = await open("no-reset");
      await page.waitForFunction(() => fixture.confirms===1);
      await page.evaluate(() => harness.invalidate());
      await page.locator("#lcr-recovery").waitFor({ timeout: 5000 });
      assert.equal(await page.locator(".monaco-editor").evaluate(el=>getComputedStyle(el).opacity), "1");
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(() => fixture.resets), 1, "An aborted controller must not restart");
      await context.close();
    });

    await t.test("solution pages are excluded", async () => {
      const { page, context } = await open("normal", true, "https://leetcode.cn/problems/two-sum/solutions/");
      await page.waitForTimeout(300);
      assert.equal((await phase(page)).phase, "idle");
      assert.equal(await page.evaluate(() => fixture.resets), 0);
      assert.equal(await page.locator(".monaco-editor").evaluate((el) => getComputedStyle(el).opacity), "1");
      await context.close();
    });

    await t.test("native SPA navigation waits for the new editor and does not reload the page", async () => {
      const { page, context } = await open("clean");
      await ready(page);
      const marker = await page.evaluate(() => { fixture.navigationDelay=700; return fixture.documentMarker; });
      await page.locator("#next").click();
      await page.waitForFunction(() => location.pathname.includes("add-two-numbers"));
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => fixture.resets), 0, "Do not reset the still-mounted previous editor");
      assert.equal(await page.locator(".monaco-editor").evaluate((el) => getComputedStyle(el).opacity), "0");
      await ready(page);
      assert.equal(await page.evaluate(() => fixture.documentMarker), marker, "The original document survives navigation");
      assert.equal(await page.evaluate(() => fixture.resets), 1);
      assert.equal(await page.evaluate(() => fixture.lastDataSlug), "add-two-numbers");
      assert.equal(await page.evaluate(() => fixture.oldVisible), false);
      assert.equal(core.normalizeCode(await page.locator(".view-lines").textContent()), core.normalizeCode(otherCpp));
      await context.close();
    });

    await t.test("a clean SPA target skips reset; browser Back also stays in the original document", async () => {
      const { page, context } = await open("clean");
      await ready(page);
      const marker = await page.evaluate(() => { fixture.cleanTarget=true; return fixture.documentMarker; });
      await page.locator("#next").click();
      await page.waitForFunction(() => fixture.slug === "add-two-numbers");
      await ready(page);
      assert.equal(await page.evaluate(() => fixture.resets), 0);
      await page.goBack();
      await page.waitForFunction(() => fixture.slug === "two-sum");
      await ready(page);
      assert.equal(await page.evaluate(() => fixture.resets), 0);
      assert.equal(await page.evaluate(() => fixture.documentMarker), marker);
      assert.equal(await page.evaluate(() => fixture.oldVisible), false);
      await context.close();
    });

    await t.test("failed reset stays covered, explicit pause reveals, retry can recover", async () => {
      const { page, context } = await open("no-reset");
      await page.waitForFunction(() => harness.status()?.phase === "error", null, { timeout: 25000 });
      assert.equal(await page.evaluate(() => fixture.oldVisible), false);
      assert.equal(await page.locator(".monaco-editor").evaluate((el) => getComputedStyle(el).opacity), "0");
      assert.equal(await page.evaluate(() => fixture.resets), 1);
      await page.evaluate(() => harness.command("LCR_PAUSE_TAB"));
      assert.equal((await phase(page)).phase, "paused");
      assert.equal(await page.locator(".monaco-editor").evaluate((el) => getComputedStyle(el).opacity), "1");
      await page.evaluate(() => { fixture.mode="normal"; return harness.command("LCR_RETRY"); });
      await ready(page);
      assert.equal(await page.evaluate(() => fixture.resets), 2);
      await context.close();
    });
    assert.deepEqual(errors, [], "No uncaught page errors");
  } finally { await browser.close(); }
});
