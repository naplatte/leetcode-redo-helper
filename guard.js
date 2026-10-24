(() => {
  "use strict";
  // Independent of the controller/core: a failed module must never leave the
  // editor permanently invisible. The CSS lease is a second, timer-free escape.
  let lastBeat = Date.now();
  let configured = false;
  let stopped = false;
  let showPageStatus = true;
  let reason = "自动处理脚本未能正常启动";

  function showRecovery() {
    const root = document.documentElement;
    if (root) {
      root.setAttribute("data-lcr-recovered", "true");
      root.setAttribute("data-lcr-visibility", "shown");
      root.removeAttribute("data-lcr-auto-reset");
    }
    if (!showPageStatus) { document.getElementById("lcr-recovery")?.remove(); return; }
    if (!document.body || document.getElementById("lcr-recovery")) return;
    const notice = document.createElement("aside");
    notice.id = "lcr-recovery";
    notice.setAttribute("role", "status");
    notice.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;max-width:340px;padding:14px 16px;border:1px solid #d9a45d;border-radius:10px;background:#fff8ed;color:#573b17;font:14px/1.6 system-ui,sans-serif;box-shadow:0 5px 25px #0002;";
    notice.textContent = `leetcode重做助手：${reason}，已解除遮挡。自动重置未生效，可能显示旧代码。请重新加载扩展后刷新本页。`;
    document.body.appendChild(notice);
  }

  function recover(message) {
    if (stopped) return;
    reason = message || reason;
    stopped = true;
    document.dispatchEvent(new CustomEvent("lcr:abort"));
    showRecovery();
    clearInterval(timer);
    if (!document.body) document.addEventListener("DOMContentLoaded", showRecovery, { once: true });
  }

  document.addEventListener("lcr:controller-alive", (event) => {
    if (stopped) return;
    lastBeat = Date.now();
    if (event.detail === "configured") configured = true;
  });
  document.addEventListener("lcr:controller-error", (event) => recover(event.detail));
  // The display preference never disables recovery itself.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.showPageStatus) return;
      showPageStatus = changes.showPageStatus.newValue !== false;
      if (stopped) showRecovery();
    });
    chrome.storage.local.get({ showPageStatus: true }).then((settings) => {
      showPageStatus = settings.showPageStatus !== false;
      if (stopped) showRecovery();
    }).catch(() => {});
  } catch { /* Recovery must work even when extension settings are unavailable. */ }
  const started = Date.now();
  const timer = setInterval(() => {
    try {
      if (typeof chrome.runtime.getManifest === "function") chrome.runtime.getManifest();
    } catch { recover("扩展已关闭或重新加载"); return; }
    if ((!configured && Date.now() - started > 1800) || Date.now() - lastBeat > 1800) recover();
  }, 400);
})();
