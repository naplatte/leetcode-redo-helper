(() => {
  "use strict";
  const { problemFromUrl, questionFromUrl, normalizeCode, collectTemplates, validSnippets } = LeetcodeClearCore;
  const templates = new Map();
  let enabled = true;
  let showPageStatus = true;
  let configured = false;
  let paused = false;
  let serial = 0;
  let session = null;
  let notice = null;
  let scheduled = false;
  let checkTimer = null;
  let pendingNavigation = null;
  let wantsVisible = false;
  let aborted = false;
  let lastLease = 0;
  let lease = "a";
  let inactiveQuestion = problemFromUrl(location.href) ? null : questionFromUrl(location.href);
  let suspendedAt = null;
  let status = { enabled: true, phase: "loading", message: "正在准备编辑器…", problem: null };
  const WAIT_MS = 20000;
  const QUIET_MS = 300;
  const CLEAN_QUIET_MS = 80;
  const NOTICE_DELAY_MS = 450;
  const DIALOG_SETTLE_MS = 150;
  const INITIAL_DRAFT_WATCH_MS = 2500;

  function syncVisibility() {
    const root = document.documentElement;
    if (!root) return;
    if (document.hidden) {
      suspendedAt ??= Date.now();
      root.setAttribute("data-lcr-sleeping", "true");
    }
    if (aborted || root.hasAttribute("data-lcr-recovered")) {
      aborted = true;
      root.setAttribute("data-lcr-visibility", "shown");
      root.removeAttribute("data-lcr-auto-reset");
      return;
    }
    document.dispatchEvent(new CustomEvent("lcr:controller-alive", { detail: configured ? "configured" : "starting" }));
    if (wantsVisible && root.getAttribute("data-lcr-visibility") !== "shown") root.setAttribute("data-lcr-visibility", "shown");
    if (!wantsVisible && root.hasAttribute("data-lcr-visibility")) root.removeAttribute("data-lcr-visibility");
    if (!wantsVisible && Date.now() - lastLease > 450) {
      lease = lease === "a" ? "b" : "a";
      root.setAttribute("data-lcr-lease", lease);
      lastLease = Date.now();
    }
  }
  function cover() { wantsVisible = false; syncVisibility(); }
  function reveal() { wantsVisible = true; syncVisibility(); }
  function suspendLease() {
    const root = document.documentElement;
    if (!root) return;
    // Freeze the CSS fail-open clock while Chrome throttles background scripts.
    suspendedAt ??= Date.now();
    lastLease = 0;
    syncVisibility();
    root.setAttribute("data-lcr-sleeping", "true");
    if (session?.step === "ready") session.edited = true;
  }
  function resumeLease() {
    if (document.hidden) { suspendLease(); return; }
    if (suspendedAt !== null) {
      const now = Date.now();
      for (const job of [session, pendingNavigation]) {
        if (typeof job?.started === "number") job.started += Math.max(0, now - Math.max(job.started, suspendedAt));
      }
      if (session && session.step !== "ready") session.matchedSince = 0;
      suspendedAt = null;
    }
    // Renew while still paused, before the first foreground frame can paint.
    lastLease = 0;
    syncVisibility();
    document.documentElement?.removeAttribute("data-lcr-sleeping");
    schedule();
  }
  function markAutoReset(value) {
    if (value) document.documentElement?.setAttribute("data-lcr-auto-reset", "true");
    else document.documentElement?.removeAttribute("data-lcr-auto-reset");
  }

  function notify(phase, message, problem = session?.slug || null) {
    status = { enabled, phase, message, problem };
    paintNotice();
  }

  function paintNotice() {
    if (!document.body) return;
    const elapsed = Date.now() - (pendingNavigation?.started || session?.started || 0);
    const shouldShow = showPageStatus && enabled && !paused && ["loading", "resetting", "error"].includes(status.phase)
      && (status.phase === "error" || elapsed >= NOTICE_DELAY_MS);
    if (!shouldShow) { notice?.remove(); notice = null; return; }
    if (!notice) {
      notice = document.createElement("aside");
      notice.id = "lcr-notice";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      const title = document.createElement("strong");
      title.textContent = "leetcode重做助手";
      const message = document.createElement("p");
      message.dataset.lcrMessage = "true";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "重试";
      retry.dataset.lcrRetry = "true";
      retry.addEventListener("click", retryPage);
      const stop = document.createElement("button");
      stop.type = "button";
      stop.textContent = "显示现有代码，暂停此页";
      stop.addEventListener("click", pauseTab);
      notice.append(title, message, retry, stop);
      document.body.appendChild(notice);
    }
    const text = notice.querySelector("[data-lcr-message]");
    if (text.textContent !== status.message) text.textContent = status.message;
    notice.querySelector("[data-lcr-retry]").hidden = status.phase !== "error";
  }

  function pauseTab() {
    cancelOwnedDialog();
    markAutoReset(false);
    paused = true;
    inactiveQuestion = questionFromUrl(location.href);
    serial += 1;
    session = null;
    pendingNavigation = null;
    reveal();
    notify("paused", "当前页面已暂停，现有代码已显示。");
  }

  function preserveWork(slug, message = "已保留当前题目的代码，不再自动重置。") {
    if (!slug) return;
    cancelOwnedDialog();
    markAutoReset(false);
    pendingNavigation = null;
    if (session?.slug !== slug) session = { id: ++serial, slug, language: currentLanguage() };
    Object.assign(session, { step: "ready", edited: true, failed: false,
      lastSnapshot: editorSnapshot() });
    reveal();
    notify(paused ? "paused" : "ready", message, slug);
  }

  function retryPage() {
    paused = false;
    if (pendingNavigation) { pendingNavigation.failed = false; pendingNavigation.started = Date.now(); schedule(); return; }
    start(true);
  }

  function visibleDialog(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function currentLanguage() {
    return document.querySelector('#editor [data-e2e-locator="lang-selector-button"]')
      ?.getAttribute("data-e2e-lang") || null;
  }

  function rememberTemplates(items) {
    for (const item of items) {
      if (typeof item?.slug !== "string" || item.slug.length > 250) continue;
      const snippets = validSnippets(item.snippets);
      if (!snippets.length) continue;
      templates.delete(item.slug);
      templates.set(item.slug, snippets);
      if (templates.size > 80) templates.delete(templates.keys().next().value);
    }
  }

  function readTemplates() {
    const node = document.getElementById("__NEXT_DATA__");
    if (!node || node === readTemplates.lastNode) return;
    try {
      const parsed = JSON.parse(node.textContent);
      // SSR data belongs to its own query keys. SPA data arrives through the
      // bridge from the site's existing requests, with its own question slug.
      rememberTemplates(collectTemplates(parsed));
      readTemplates.lastNode = node;
    } catch { /* The parser may still be receiving this script tag. Try again. */ }
  }

  function resetButton() {
    const panel = document.getElementById("editor");
    if (!panel) return null;
    // An aria-label="重置" elsewhere belongs to the debugger, not this action.
    return Array.from(panel.querySelectorAll("button")).find((button) =>
      button.querySelector('svg.fa-arrow-rotate-left, svg[data-icon="arrow-rotate-left"]')
      && !button.disabled && button.getAttribute("aria-disabled") !== "true");
  }

  function resetDialog() {
    return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog, [aria-modal="true"]'))
      .find((element) => visibleDialog(element)
        && /放弃所有更改/.test(element.textContent) && /初始化代码/.test(element.textContent));
  }

  function cancelOwnedDialog() {
    if (!session?.clicked || session.confirmed) return;
    const cancel = Array.from(resetDialog()?.querySelectorAll("button") || [])
      .find((button) => button.textContent.trim() === "取消" && !button.disabled);
    cancel?.click();
  }

  function pageInteractionBlocked() {
    // Observe locks; do not remove styles/inert owned by the site's other dialogs.
    if (document.body && getComputedStyle(document.body).pointerEvents === "none") return true;
    const editor = document.getElementById("editor");
    return !!editor?.closest("[inert]");
  }

  function editorSnapshot() {
    const node = document.querySelector("#editor .monaco-editor, #editor .cm-editor, #editor .CodeMirror");
    return { node, uri: node?.getAttribute("data-uri"), language: currentLanguage(), code: normalizeCode(renderedCode()) };
  }

  function questionHeadingSlug() {
    const links = document.querySelectorAll('.text-title-large a[href], h1 a[href], [role="heading"] a[href]');
    for (const link of links) {
      const slug = problemFromUrl(link.href);
      if (slug) return slug;
    }
    return null;
  }

  function beginNavigation(url, baseline) {
    const slug = problemFromUrl(url);
    if (!slug || pendingNavigation?.slug === slug || (!pendingNavigation && session?.slug === slug)) return;
    const previous = pendingNavigation?.previous || session;
    const previousStatus = pendingNavigation?.previousStatus || status;
    cancelOwnedDialog();
    markAutoReset(false);
    pendingNavigation = { slug, baseline: baseline || editorSnapshot(), previous, previousStatus,
      started: Date.now(), failed: false };
    session = null;
    paused = false;
    ++serial;
    cover();
    notify("loading", "代码区已遮住，正在等待新题目的编辑器…", slug);
    document.dispatchEvent(new CustomEvent("lcr:request-templates"));
  }

  function arriveIfReady() {
    const pending = pendingNavigation;
    if (!pending || pending.failed) return;
    readTemplates();
    const current = editorSnapshot();
    const snippet = templates.get(pending.slug)?.find((item) => item.langSlug === current.language);
    const atTarget = pending.committed && problemFromUrl(location.href) === pending.slug
      && questionHeadingSlug() === pending.slug;
    const changedEditor = current.node && (current.node !== pending.baseline.node
      || (current.uri && current.uri !== pending.baseline.uri)
      || current.language !== pending.baseline.language || current.code !== pending.baseline.code);
    const alreadyClean = current.node && snippet
      && matchesTemplate({ id: `arrival-${serial}`, language: current.language, snippet });
    // A new URL alone is insufficient: the previous question's editor may still
    // be mounted while the new title/data loads. Never reset that old editor.
    if (atTarget && current.node && snippet && (changedEditor || alreadyClean)) {
      pendingNavigation = null;
      start(true);
      return;
    }
    if (Date.now() - pending.started > WAIT_MS) {
      pending.failed = true;
      const reason = !snippet ? "未读取到新题目的初始模板"
        : questionHeadingSlug() !== pending.slug ? "新题目的标题仍未就绪" : "新题编辑器尚未完成切换";
      notify("error", `${reason}，已保持遮挡。请重试或暂停此页。`, pending.slug);
    }
  }

  function renderedCode() {
    const panel = document.getElementById("editor");
    if (!panel) return null;
    const monaco = panel.querySelector(".monaco-editor .view-lines");
    if (monaco) {
      const lines = monaco.querySelectorAll(".view-line");
      return lines.length ? Array.from(lines, (line) => line.textContent).join("\n") : null;
    }
    const cm = panel.querySelector(".cm-editor .cm-content");
    if (cm && !cm.querySelector(".cm-gap")) {
      const lines = cm.querySelectorAll(".cm-line");
      return lines.length ? Array.from(lines, (line) => line.textContent).join("\n") : null;
    }
    const legacy = panel.querySelector(".CodeMirror-code");
    return legacy ? Array.from(legacy.querySelectorAll("pre"), (line) => line.textContent).join("\n") : null;
  }

  function matchesTemplate(active) {
    if (!active?.snippet || currentLanguage() !== active.language) return false;
    active.modelAvailable = false;
    let result;
    const id = `lcr-${active.id}`;
    const receive = (event) => {
      try {
        const data = JSON.parse(event.detail);
        if (data.id === id && data.available) {
          active.modelAvailable = true;
          result = data.match;
        }
      } catch { /* Ignore unrelated page events. */ }
    };
    document.addEventListener("lcr:verified", receive);
    document.dispatchEvent(new CustomEvent("lcr:verify", { detail: JSON.stringify({ id, code: active.snippet.code }) }));
    document.removeEventListener("lcr:verified", receive);
    if (result !== undefined) return result;
    const rendered = renderedCode();
    return rendered !== null && normalizeCode(rendered) === normalizeCode(active.snippet.code);
  }

  function fail(message) {
    if (!session) return;
    session.failed = true;
    session.step = "failed";
    cancelOwnedDialog();
    markAutoReset(false);
    cover();
    notify("error", message);
  }

  function waitingFor(active, reason) {
    active.waitReason = reason;
    const message = `代码区已遮住，${reason}…`;
    if (status.message !== message) notify("loading", message);
  }

  function start(force = false, language = null) {
    if (aborted) return;
    if (pendingNavigation) return;
    const slug = problemFromUrl(location.href);
    if (!configured || !enabled || paused || !slug) {
      if (configured) {
        session = null;
        reveal();
        notify(paused ? "paused" : "idle", paused ? "当前页面已暂停。" : enabled ? "此页面无需处理。" : "复习模式已关闭。", slug);
      }
      return;
    }
    if (!force && session?.slug === slug) return;
    cancelOwnedDialog();
    markAutoReset(false);
    cover();
    session = { id: ++serial, slug, language, started: Date.now(), step: "waiting",
      clicked: false, confirmed: false, matchedSince: 0, attempts: 0, edited: false, failed: false };
    notify("loading", "代码区已遮住，正在等待初始模板…", slug);
    schedule();
  }

  function schedule() {
    if (aborted || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      try { advance(); }
      catch (error) {
        console.error("[leetcode重做助手] 自动处理出错", error);
        document.dispatchEvent(new CustomEvent("lcr:controller-error", { detail: "自动处理脚本运行出错" }));
      }
    });
  }

  function advance() {
    if (aborted) return;
    syncVisibility();
    if (aborted) return;
    paintNotice();
    if (!configured || !enabled || paused) return;
    if (document.hidden) return;
    if (pendingNavigation) { arriveIfReady(); return; }
    const slug = problemFromUrl(location.href);
    if (!slug) {
      const identity = questionFromUrl(location.href);
      if (session?.slug === identity) {
        preserveWork(identity);
      } else if (session) {
        cancelOwnedDialog();
        markAutoReset(false);
        session = null;
        reveal();
        notify("idle", "此页面无需处理。", null);
      }
      inactiveQuestion = identity;
      return;
    }
    if (!session && inactiveQuestion === slug) {
      inactiveQuestion = null;
      preserveWork(slug);
      return;
    }
    if (!session) { start(); return; }
    const active = session;
    if (active.slug !== slug) { beginNavigation(location.href, active.lastSnapshot); return; }
    if (active.failed) return;
    const language = currentLanguage();
    if (active.step === "ready") {
      if (language && language !== active.language) { start(true, language); return; }
      active.lastSnapshot = editorSnapshot();
      // The site can finish loading a cloud draft after the first reset. While
      // the user has not edited anything, hide and reset again before painting.
      if (!active.edited && Date.now() < active.watchUntil && renderedCode() !== null && !matchesTemplate(active)) {
        if (!document.querySelector("#editor .monaco-editor, #editor .cm-editor, #editor .CodeMirror")) return;
        cover();
        if (active.attempts >= 3) { fail("网站反复恢复了旧代码，已保持遮挡。请重试或暂停此页。"); return; }
        active.attempts += 1;
        active.step = "waiting";
        active.clicked = false;
        active.confirmed = false;
        active.matchedSince = 0;
        active.started = Date.now();
        notify("resetting", "检测到网站重新载入代码，正在重新准备…");
      } else return;
    }
    if (Date.now() - active.started > WAIT_MS) {
      fail(`${active.waitReason || "未能确认已恢复初始模板"}，等待超时。代码区仍被遮住，请重试或暂停此页。`);
      return;
    }
    if (!language || (active.language && language !== active.language)) {
      waitingFor(active, "正在等待当前编程语言");
      return;
    }
    active.language = language;
    readTemplates();
    active.snippet = templates.get(slug)?.find((item) => item.langSlug === language);
    if (!active.snippet) { waitingFor(active, "未读取到当前题目的初始模板"); return; }

    if (active.step === "waiting") {
      // No reset dialog, editor update, or cloud-draft save is necessary when the
      // editor already contains the starter template (ignoring layout spaces).
      if (matchesTemplate(active)) {
        active.step = "verifying";
        active.skippedReset = true;
        active.waitReason = "正在确认当前代码为初始模板";
        schedule();
        return;
      }
      if (document.readyState === "loading") {
        waitingFor(active, "正在等待网站完成初始化");
        return;
      }
      const button = resetButton();
      // SSR controls may exist before hydration has attached their handlers.
      // Wait for the actual editor to render before invoking the site's action.
      if (!button) { waitingFor(active, "未找到恢复模板按钮"); return; }
      if (renderedCode() === null && !active.modelAvailable) { waitingFor(active, "正在等待编辑器完成初始化"); return; }
      // Never interact with an unrelated confirmation dialog.
      if (Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]'))
        .some(visibleDialog)) { waitingFor(active, "请先关闭页面上其他弹窗"); return; }
      active.step = "dialog";
      active.waitReason = "已点击恢复按钮，未出现预期的确认框";
      active.clicked = true;
      active.skippedReset = false;
      notify("resetting", "正在恢复当前语言的初始模板…");
      markAutoReset(true);
      button.click();
      schedule();
      return;
    }
    if (active.step === "dialog") {
      const dialog = resetDialog();
      if (!dialog) return;
      // Do not close a newly mounted React modal in the same mutation microtask.
      // Its effects must finish installing focus/pointer locks before cleanup.
      if (active.dialogNode !== dialog) {
        active.dialogNode = dialog;
        active.confirmAfter = Date.now() + DIALOG_SETTLE_MS;
        window.setTimeout(schedule, DIALOG_SETTLE_MS);
        return;
      }
      if (Date.now() < active.confirmAfter) return;
      const confirm = Array.from(dialog.querySelectorAll("button"))
        .find((button) => button.textContent.trim() === "确认" && !button.disabled);
      if (!confirm) { active.waitReason = "未找到恢复模板确认按钮"; return; }
      active.step = "verifying";
      active.confirmed = true;
      active.waitReason = "已确认恢复，但编辑器内容尚未与初始模板一致";
      confirm.click();
      schedule();
      return;
    }
    if (active.step === "verifying") {
      if (resetDialog() || !matchesTemplate(active)) { active.matchedSince = 0; return; }
      if (pageInteractionBlocked()) {
        active.matchedSince = 0;
        active.waitReason = "模板已恢复，正在等待网站解除弹窗交互锁";
        return;
      }
      if (!active.matchedSince) active.matchedSince = Date.now();
      if (Date.now() - active.matchedSince >= (active.skippedReset ? CLEAN_QUIET_MS : QUIET_MS)) {
        active.step = "ready";
        active.watchUntil ??= Date.now() + INITIAL_DRAFT_WATCH_MS;
        active.lastSnapshot = editorSnapshot();
        markAutoReset(false);
        reveal();
        notify("ready", active.skippedReset ? "当前代码就是初始模板，无需重置。" : "已恢复初始模板，可以开始重做。");
      }
    }
  }

  document.addEventListener("lcr:navigation", (event) => {
    let data;
    try { data = JSON.parse(event.detail); } catch { return; }
    if (!enabled || !configured) return;
    const target = problemFromUrl(data.url);
    const identity = questionFromUrl(data.url);
    if (data.phase === "cancel" && pendingNavigation?.slug === target) {
      const previous = pendingNavigation.previous;
      if (problemFromUrl(location.href) !== target) {
        const previousStatus = pendingNavigation.previousStatus;
        pendingNavigation = null;
        session = previous;
        if (previous?.step === "ready" || previousStatus.phase === "paused") reveal();
        else cover();
        status = previousStatus;
        paused = previousStatus.phase === "paused";
        paintNotice();
      }
      return;
    }
    // A result/solution/submissions view is still the same question. Keeping
    // this session also keeps the trusted user-edit flag across temporary URLs.
    if (!pendingNavigation && identity && identity === session?.slug) {
      if (!target) preserveWork(identity);
      return;
    }
    if (!pendingNavigation && target && inactiveQuestion === target) {
      if (["commit", "complete"].includes(data.phase)) {
        inactiveQuestion = null;
        preserveWork(target);
      }
      return;
    }
    if (target) {
      beginNavigation(data.url);
      if (pendingNavigation?.slug === target && ["commit", "complete"].includes(data.phase)) {
        pendingNavigation.committed = true;
      }
      schedule();
    } else if (data.phase === "commit" || data.phase === "complete") {
      cancelOwnedDialog();
      markAutoReset(false);
      pendingNavigation = null;
      session = null;
      inactiveQuestion = identity;
      reveal();
      notify("idle", "此页面无需处理。", null);
    }
  });

  document.addEventListener("lcr:templates", (event) => {
    try {
      const items = JSON.parse(event.detail);
      if (Array.isArray(items)) { rememberTemplates(items); schedule(); }
    } catch { /* Ignore unrelated or malformed page events. */ }
  });

  // Cover before a language selection can replace the code in the same task.
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (enabled && event.isTrusted && button?.matches('[data-e2e-locator="console-submit-button"], [data-e2e-locator="console-run-button"]')) {
      preserveWork(questionFromUrl(location.href));
      return;
    }
    const option = event.target instanceof Element
      ? event.target.closest('[data-e2e-locator="lang-option"][data-e2e-lang]') : null;
    if (enabled && !paused && option && session) {
      const language = option.getAttribute("data-e2e-lang");
      if (language !== session.language) start(true, language);
    }
  }, true);

  function userEdited(event) {
    if (!enabled || !event.isTrusted) return;
    if (event.target instanceof Element
      && event.target.closest("#editor .monaco-editor, #editor .cm-editor, #editor .CodeMirror")) {
      const slug = questionFromUrl(location.href);
      if (session?.step === "ready" && session.slug === slug) session.edited = true;
      else if (["beforeinput", "input", "paste", "cut", "keydown"].includes(event.type)) preserveWork(slug);
    }
  }
  for (const name of ["beforeinput", "input", "paste", "cut", "keydown", "pointerdown", "wheel"]) {
    document.addEventListener(name, userEdited, true);
  }

  document.addEventListener("keydown", (event) => {
    if (enabled && event.isTrusted && event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      preserveWork(questionFromUrl(location.href));
    }
  }, true);
  window.addEventListener("blur", suspendLease);
  window.addEventListener("focus", resumeLease);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) suspendLease();
    else resumeLease();
  });
  window.addEventListener("pagehide", suspendLease);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) resumeLease();
  });
  document.addEventListener("DOMContentLoaded", () => { paintNotice(); schedule(); });

  const observer = new MutationObserver((mutations) => {
    if (mutations.every((item) => item.target instanceof Node && notice?.contains(item.target))) return;
    schedule();
  });
  observer.observe(document, { childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["data-e2e-lang", "data-uri"] });
  checkTimer = window.setInterval(schedule, 180);

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.type === "LCR_GET_STATUS") { sendResponse(status); return; }
    if (request?.type === "LCR_RETRY") { retryPage(); sendResponse(status); return; }
    if (request?.type === "LCR_PAUSE_TAB") { pauseTab(); sendResponse(status); }
  });

  document.addEventListener("lcr:abort", () => {
    aborted = true;
    cancelOwnedDialog();
    enabled = false;
    paused = true;
    session = null;
    pendingNavigation = null;
    wantsVisible = true;
    syncVisibility();
    clearInterval(checkTimer);
    observer.disconnect();
    notice?.remove();
    notice = null;
    document.dispatchEvent(new CustomEvent("lcr:configuration", { detail: "disabled" }));
    status = { enabled: false, phase: "error", message: "自动处理已停止，遮挡已解除。请重新加载扩展并刷新本页。", problem: null };
  });

  function configure(value) {
    if (aborted) return;
    enabled = value !== false;
    configured = true;
    document.dispatchEvent(new CustomEvent("lcr:configuration", { detail: enabled ? "enabled" : "disabled" }));
    if (!enabled) {
      cancelOwnedDialog();
      markAutoReset(false);
      serial += 1;
      session = null;
      pendingNavigation = null;
      reveal();
      notify("idle", "复习模式已关闭。");
    }
    else { paused = false; start(true); }
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.showPageStatus) {
      showPageStatus = changes.showPageStatus.newValue !== false;
      paintNotice();
    }
    if (changes.enabled) configure(changes.enabled.newValue);
  });
  chrome.storage.local.get({ enabled: true, showPageStatus: true }).then((settings) => {
    showPageStatus = settings.showPageStatus !== false;
    configure(settings.enabled);
  })
    .catch(() => {
      configured = true;
      enabled = true;
      cover();
      notify("error", "无法读取扩展设置。请重新加载扩展和本页面。");
      clearInterval(checkTimer);
      observer.disconnect();
      document.dispatchEvent(new CustomEvent("lcr:controller-error", { detail: "无法读取扩展设置" }));
    });
})();
