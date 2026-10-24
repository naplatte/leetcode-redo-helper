"use strict";
// Development only: the ready-to-load extension already includes the PNG files.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.LCR_PLAYWRIGHT_PATH || "playwright");
(async () => {
  const directory = path.resolve(__dirname, "../icons");
  const svg = fs.readFileSync(path.join(directory, "logo.svg"), "utf8");
  const browser = await chromium.launch({
    executablePath: process.env.LCR_CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true
  });
  try {
    const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    for (const size of [16, 32, 48, 128]) {
      await page.setViewportSize({ width: size, height: size });
      await page.screenshot({ path: path.join(directory, `icon-${size}.png`), omitBackground: true });
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
