"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const trie = `class Trie {
public:
    Trie() {

    }

    void insert(string word) {

    }

    bool search(string word) {

    }

    bool startsWith(string prefix) {

    }
};

/**
 * Your Trie object will be instantiated and called as such:
 * Trie* obj = new Trie();
 * obj->insert(word);
 * bool param_2 = obj->search(word);
 * bool param_3 = obj->startsWith(prefix);
 */`;
const previous = "class Trie { /* PREVIOUS_SOLUTION */ };";
let browser;
before(async () => {
  execFileSync(process.execPath,[path.join(root,"scripts/build.cjs")]);
  const { chromium } = require(process.env.LCR_PLAYWRIGHT_PATH || "playwright");
  browser = await chromium.launch({executablePath:process.env.LCR_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
});
after(async () => browser?.close());

async function open(options = {}) {
  const context = await browser.newContext();
  const bootstrap = `(() => {
    const messages=[],timers=[];const interval=window.setInterval.bind(window);
    window.setInterval=(fn,delay,...args)=>{const id=interval(fn,delay,...args);timers.push({id,fn,delay});return id;};
    window.chrome={runtime:{getManifest:()=>({version:'test'}),onMessage:{addListener:fn=>messages.push(fn)}},
      storage:{local:{get:async()=>({enabled:true,showPageStatus:false})},onChanged:{addListener(){}}}};
    window.harness={status(){let result;messages.forEach(fn=>fn({type:'LCR_GET_STATUS'},{},v=>result=v));return result;},
      command(type){messages.forEach(fn=>fn({type},{},()=>{}));},
      stopPeriodic(){timers.forEach(item=>clearInterval(item.id));},
      guardTick(){timers.find(item=>item.delay===400)?.fn();}};
  })();`;
  await context.addInitScript({content:bootstrap+"\n"+["dist/page-bridge.js","guard.js","dist/content.js"].map(file=>fs.readFileSync(path.join(root,file),"utf8")).join("\n;\n")});
  const template = options.long ? trie + "\n" + Array.from({length:70},(_,i)=>`// Public starter note ${i}`).join("\n") : trie;
  const data={props:{pageProps:{question:{titleSlug:"implement-trie-prefix-tree",codeSnippets:[{langSlug:"cpp",code:template}]}}}};
  const html=`<!doctype html><html><head><meta charset="utf-8"><style>
    .monaco-editor{position:relative;width:800px;height:580px;overflow:hidden}
    .view-lines{position:relative;height:2200px}.view-line{position:absolute;height:18px;line-height:18px;white-space:pre}
    ${fs.readFileSync(path.join(root,"shield.css"),"utf8")}
    </style><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></head><body>
    <h1><a href="/problems/implement-trie-prefix-tree/">实现 Trie</a></h1><div id="editor">
    <button data-e2e-locator="lang-selector-button" data-e2e-lang="cpp">C++</button>
    <button id="restore"><svg class="fa-arrow-rotate-left"></svg>重置</button>
    <div class="monaco-editor" data-uri="inmemory://trie"><div class="view-lines"></div></div></div>
    <script>
    const options=${JSON.stringify(options)},starter=${JSON.stringify(template)},oldCode=${JSON.stringify(previous)};
    window.fixture={confirms:0,resets:0,model:oldCode,nativeReady:!options.nativeReadyDelay,answerFlashed:false};
    if(options.nativeReadyDelay)setTimeout(()=>fixture.nativeReady=true,options.nativeReadyDelay);
    fixture.render=code=>{fixture.model=code;const lines=document.querySelector('.view-lines');lines.replaceChildren();
      const rows=code.split('\\n').slice(0,options.long?20:100);
      const order=options.recycle?rows.map((_,i)=>i).reverse():rows.map((_,i)=>i);
      order.forEach(i=>{const line=document.createElement('div');line.className='view-line';line.style.top=(i*18)+'px';line.textContent=rows[i]||' ';lines.appendChild(line);});};
    const editor={getDomNode:()=>document.querySelector('.monaco-editor'),getValue:()=>fixture.model};
    const installRef=()=>{document.querySelector('#editor').__reactFiber$fixture={return:{memoizedState:{memoizedState:{current:editor},next:null},return:null}};};
    if(options.componentRef){if(options.refDelay)setTimeout(installRef,options.refDelay);else installRef();}
    fixture.render(options.clean?starter:oldCode);
    document.querySelector('#restore').onclick=()=>{fixture.resets++;const dialog=document.createElement('div');dialog.setAttribute('role','alertdialog');
      dialog.innerHTML='<p>您将放弃所有更改并初始化代码！</p><button>确认</button>';document.body.appendChild(dialog);
      dialog.querySelector('button').onclick=()=>{fixture.confirms++;dialog.remove();
        if(fixture.nativeReady&&!options.failAlways&&!(options.failFirst&&fixture.confirms===1))fixture.render(starter);
        if(options.lateDraft&&fixture.confirms===1)setTimeout(()=>fixture.render(oldCode),100);
      };};
    function frame(){if(fixture.model.includes('PREVIOUS_SOLUTION')&&Number(getComputedStyle(document.querySelector('.monaco-editor')).opacity)>0)fixture.answerFlashed=true;requestAnimationFrame(frame);}requestAnimationFrame(frame);
    </script></body></html>`;
  const page=await context.newPage();
  await page.route("**/*",route=>route.fulfill({contentType:"text/html",body:html}));
  await page.goto("https://leetcode.cn/problems/implement-trie-prefix-tree/description/");
  return {page,context,template};
}
async function ready(page) {
  await page.waitForFunction(()=>harness.status()?.phase==='ready',null,{timeout:6000});
}

test("recycled Monaco rows are verified in visual order, not DOM insertion order",async()=>{
  const {page,context,template}=await open({recycle:true});
  try {
    await ready(page);
    assert.equal(await page.evaluate(()=>fixture.model),template);
    assert.equal(await page.evaluate(()=>fixture.resets),1);
  } finally {await context.close();}
});

test("timer stalls cannot expose answers after the controller has taken ownership",async()=>{
  const {page,context}=await open({failAlways:true});
  try {
    await page.waitForFunction(()=>fixture.confirms===1);
    await page.evaluate(()=>harness.stopPeriodic());
    await page.waitForTimeout(2500);
    assert.equal(await page.locator('.monaco-editor').evaluate(el=>getComputedStyle(el).opacity),'0');
    assert.equal(await page.evaluate(()=>fixture.answerFlashed),false);
    await page.evaluate(()=>harness.command('LCR_PAUSE_TAB'));
    assert.equal(await page.locator('.monaco-editor').evaluate(el=>getComputedStyle(el).opacity),'1');
  } finally {await context.close();}
});

test("a long virtualized template can be verified through the mounted editor ref",async()=>{
  const {page,context,template}=await open({long:true,recycle:true,componentRef:true});
  try {
    await ready(page);
    assert.equal(await page.evaluate(()=>fixture.model),template);
    assert.equal(await page.locator('.view-line').count(),20);
    assert.equal(await page.evaluate(()=>fixture.resets),1);
  } finally {await context.close();}
});

test("a pristine long template waits for its delayed model without an unnecessary reset",async()=>{
  const {page,context}=await open({long:true,clean:true,recycle:true,componentRef:true,refDelay:1000});
  try{
    await ready(page);
    assert.equal(await page.evaluate(()=>fixture.resets),0);
  }finally{await context.close();}
});

for(const options of [{failFirst:true},{lateDraft:true}])test(`incomplete initial reset recovers after website initialization: ${JSON.stringify(options)}`,async()=>{
  const {page,context,template}=await open(options);
  try {
    await ready(page);
    assert.equal(await page.evaluate(()=>fixture.model),template);
    assert.equal(await page.evaluate(()=>fixture.resets),2);
  } finally {await context.close();}
});

test("a resumed timer gets a heartbeat grace period before emergency recovery",async()=>{
  const {page,context}=await open();
  try {
    await ready(page);
    await page.evaluate(()=>{
      const original=Date.now.bind(Date);Date.now=()=>original()+30000;
      harness.guardTick();Date.now=original;
    });
    assert.equal(await page.locator('#lcr-recovery').count(),0);
    assert.equal((await page.evaluate(()=>harness.status())).phase,'ready');
  } finally {await context.close();}
});

test("cold and warm startup timing matrix verifies templates without a frame of old code",{timeout:30000},async()=>{
  const profiles=[
    {recycle:true},
    {recycle:true,componentRef:true,nativeReadyDelay:650},
    {recycle:true,componentRef:true,long:true,refDelay:1200},
    {recycle:true,componentRef:true,long:true,refDelay:1800,nativeReadyDelay:950},
    {recycle:true,lateDraft:true}
  ];
  for(const profile of profiles){
    const {page,context,template}=await open(profile);
    try{
      await ready(page);
      assert.equal(await page.evaluate(()=>fixture.model),template,JSON.stringify(profile));
      assert.ok(await page.evaluate(()=>fixture.resets<=2),JSON.stringify(profile));
      assert.equal(await page.evaluate(()=>fixture.answerFlashed),false,JSON.stringify(profile));
    }finally{await context.close();}
  }
});
