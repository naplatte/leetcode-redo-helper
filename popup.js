"use strict";

const enabledInput = document.getElementById("enabled");
const pageStatusInput = document.getElementById("show-page-status");
const statusCard = document.getElementById("status-card");
const statusTitle = document.getElementById("status-title");
const statusMessage = document.getElementById("status-message");
const problemLabel = document.getElementById("problem");
const retryButton = document.getElementById("retry");
const pauseButton = document.getElementById("pause");

const phaseTitles = {
  idle: "等待打开题目",
  loading: "正在准备题目",
  resetting: "正在恢复初始模板",
  ready: "模板已就绪，可以开始了",
  error: "暂时未能恢复模板",
  paused: "当前页已暂停",
};

let currentTabId = null;
let connected = false;
let busy = false;
let refreshing = false;
let globalEnabled = true;
let showPageStatus = true;

function setStatus(phase, message, problem) {
  const safePhase = Object.hasOwn(phaseTitles, phase) ? phase : "idle";
  statusCard.dataset.phase = safePhase;
  statusTitle.textContent = phaseTitles[safePhase];
  statusMessage.textContent = message || "请打开力扣中国站的普通题目页。";

  const problemText = typeof problem === "string"
    ? problem
    : problem && typeof problem === "object"
      ? problem.title || problem.slug || ""
      : "";
  problemLabel.textContent = problemText ? `当前题目 · ${problemText}` : "";
  problemLabel.hidden = !problemText;
}

function updateActions() {
  retryButton.disabled = busy || !connected || !globalEnabled;
  pauseButton.disabled = busy || !connected || !globalEnabled;
}

function showUnavailable() {
  connected = false;
  if (!globalEnabled) {
    setStatus("paused", "自动恢复已关闭。开启后，题目页会按设置自动处理。");
  } else {
    setStatus("idle", "请打开力扣中国站的普通题目页。若该页在安装插件前已打开，请先刷新一次。");
  }
  updateActions();
}

async function sendToPage(type) {
  if (currentTabId === null) {
    throw new Error("没有可用的题目页");
  }
  return chrome.tabs.sendMessage(currentTabId, { type });
}

async function refreshStatus() {
  if (refreshing || busy) return;
  refreshing = true;
  try {
    const status = await sendToPage("LCR_GET_STATUS");
    if (!status || typeof status.phase !== "string") {
      showUnavailable();
      return;
    }
    connected = true;
    setStatus(status.phase, status.message, status.problem);
    updateActions();
  } catch {
    showUnavailable();
  } finally {
    refreshing = false;
  }
}

async function runAction(type) {
  if (busy || !connected) return;
  busy = true;
  updateActions();
  try {
    await sendToPage(type);
  } catch {
    showUnavailable();
  } finally {
    busy = false;
    await refreshStatus();
    updateActions();
  }
}

enabledInput.addEventListener("change", async () => {
  const requestedEnabled = enabledInput.checked;
  enabledInput.disabled = true;
  try {
    await chrome.storage.local.set({ enabled: requestedEnabled });
    globalEnabled = requestedEnabled;
    updateActions();
    await refreshStatus();
  } catch {
    enabledInput.checked = globalEnabled;
    setStatus("error", "设置未能保存，请重新打开插件后再试。");
  } finally {
    enabledInput.disabled = false;
  }
});

retryButton.addEventListener("click", () => runAction("LCR_RETRY"));
pauseButton.addEventListener("click", () => runAction("LCR_PAUSE_TAB"));

pageStatusInput.addEventListener("change", async () => {
  pageStatusInput.disabled = true;
  try {
    await chrome.storage.local.set({ showPageStatus: pageStatusInput.checked });
    showPageStatus = pageStatusInput.checked;
  } catch {
    pageStatusInput.checked = showPageStatus;
    setStatus("error", "运行提示设置未能保存，请重新打开插件后再试。");
  } finally {
    pageStatusInput.disabled = false;
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.showPageStatus) {
    showPageStatus = changes.showPageStatus.newValue !== false;
    pageStatusInput.checked = showPageStatus;
  }
  if (changes.enabled) {
    globalEnabled = changes.enabled.newValue !== false;
    enabledInput.checked = globalEnabled;
    updateActions();
    void refreshStatus();
  }
});

async function initialize() {
  try {
    const version = chrome.runtime?.getManifest?.().version;
    if (version) document.getElementById("version").textContent = `v${version}`;
    const settings = await chrome.storage.local.get({ enabled: true, showPageStatus: true });
    globalEnabled = settings.enabled !== false;
    enabledInput.checked = globalEnabled;
    showPageStatus = settings.showPageStatus !== false;
    pageStatusInput.checked = showPageStatus;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = Number.isInteger(tab?.id) ? tab.id : null;
    await refreshStatus();
  } catch {
    showUnavailable();
  }
}

void initialize();
const pollTimer = setInterval(() => void refreshStatus(), 1000);
window.addEventListener("pagehide", () => clearInterval(pollTimer), { once: true });
