(() => {
  "use strict";
  // Observe navigation without replacing it. Only public starter templates are
  // forwarded from the site's existing data requests; no extra request is made.
  let enabled = true;
  const routeEvent = "lcr:navigation";
  const templateCache = new Map();

  function problem(url) {
    try {
      const value = new URL(url, location.href);
      return value.origin === "https://leetcode.cn"
        && /^\/problems\/[^/]+(?:\/(?:description)?)?\/?$/.test(value.pathname)
        ? value.pathname.split("/")[2] : null;
    } catch { return null; }
  }

  function announce(url, phase = "before") {
    document.dispatchEvent(new CustomEvent(routeEvent, {
      detail: JSON.stringify({ url: new URL(url, location.href).href, phase })
    }));
  }

  document.addEventListener("lcr:configuration", (event) => {
    if (event.detail === "enabled") enabled = true;
    if (event.detail === "disabled") enabled = false;
  });

  // Read-only verification where an editor exposes its own model. Only a boolean
  // result crosses the bridge; solution text is never included in an event.
  document.addEventListener("lcr:verify", (event) => {
    let request;
    try { request = JSON.parse(event.detail); } catch { return; }
    if (!request || typeof request.id !== "string" || typeof request.code !== "string"
      || request.code.length > 150000) return;
    const clean = (value) => String(value || "").replace(/[\s\u00a0\u200b\u200c\u200d\ufeff]/g, "");
    const panel = document.getElementById("editor");
    let value;
    let source;
    try {
      const editors = window.monaco?.editor?.getEditors?.() || [];
      const editor = editors.find((item) => panel?.contains(item.getDomNode?.()));
      if (editor) { value = editor.getValue(); source = "monaco-model"; }
      if (value === undefined) {
        const uri = panel?.querySelector(".monaco-editor[data-uri]")?.getAttribute("data-uri");
        const model = uri && window.monaco?.editor?.getModels?.().find(item => item.uri?.toString() === uri);
        if (model) { value = model.getValue(); source = "monaco-model"; }
      }
      if (value === undefined && panel) {
        for (const node of panel.querySelectorAll(".cm-content, .cm-editor, .cm-line")) {
          const view = node.cmView?.view || node.cmView?.rootView?.view;
          if (view?.state?.doc) { value = view.state.doc.toString(); source = "codemirror-model"; break; }
        }
      }
    } catch { /* Fall back to DOM verification in the isolated content script. */ }
    document.dispatchEvent(new CustomEvent("lcr:verified", { detail: JSON.stringify({
      id: request.id, available: value !== undefined,
      match: value !== undefined && clean(value) === clean(request.code), source
    }) }));
  });

  function publishTemplates(data, slug) {
    for (const item of LeetcodeClearCore.collectTemplates(data, slug)) {
      if (!problem(`https://leetcode.cn/problems/${encodeURIComponent(item.slug)}/`)) continue;
      templateCache.delete(item.slug);
      templateCache.set(item.slug, item);
      if (templateCache.size > 80) templateCache.delete(templateCache.keys().next().value);
      document.dispatchEvent(new CustomEvent("lcr:templates", { detail: JSON.stringify([item]) }));
    }
  }

  document.addEventListener("lcr:request-templates", () => {
    document.dispatchEvent(new CustomEvent("lcr:templates", {
      detail: JSON.stringify(Array.from(templateCache.values()))
    }));
  });

  // Next.js SPA transitions fetch JSON containing questionDetail/codeSnippets.
  // Clone only those responses, preserving the original fetch promise and body.
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const response = Reflect.apply(originalFetch, this, args);
    try {
      const input = args[0];
      const url = new URL(typeof input === "string" ? input : input?.url || String(input), location.href);
      if (url.origin !== "https://leetcode.cn") return response;
      const match = url.pathname.match(/^\/_next\/data\/[^/]+\/problems\/([^/]+)(?:\/description)?\.json$/);
      let slug = match ? decodeURIComponent(match[1]) : null;
      if (!slug && /^\/graphql\/?$/.test(url.pathname) && typeof args[1]?.body === "string") {
        const body = JSON.parse(args[1].body);
        if (/codeSnippets/.test(body.query || "") || /^(questionEditorData|questionDetail)$/.test(body.operationName || "")) {
          slug = body.variables?.titleSlug;
        }
      }
      if (typeof slug === "string" && slug.length < 250) {
        Promise.resolve(response).then((value) => value.ok ? value.clone().json() : null)
          .then((data) => { if (data) publishTemplates(data, slug); }).catch(() => {});
      }
    } catch { /* Unknown requests are left untouched. */ }
    return response;
  };

  // Capture ordinary link navigation before the site can replace the editor.
  // Do not preventDefault, stop propagation, assign location, or reload.
  document.addEventListener("click", (event) => {
    if (!enabled || event.defaultPrevented || event.button !== 0 || event.metaKey
      || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
    if (problem(anchor.href) && problem(anchor.href) !== problem(location.href)) announce(anchor.href);
  }, true);

  for (const name of ["pushState", "replaceState"]) {
    const original = history[name];
    history[name] = function (...args) {
      const next = args[2] == null ? location.href : new URL(args[2], location.href).href;
      if (enabled) announce(next);
      const result = Reflect.apply(original, this, args);
      if (enabled) announce(location.href, "commit");
      return result;
    };
  }

  window.addEventListener("popstate", () => {
    if (enabled) {
      announce(location.href);
      queueMicrotask(() => { if (enabled) announce(location.href, "commit"); });
    }
  }, true);

  // Route completion is an additional signal; editor identity is independently
  // checked by content.js before touching a different question's editor.
  let hooked = false;
  function attachRouter() {
    const events = window.next?.router?.events;
    if (hooked || typeof events?.on !== "function") return;
    hooked = true;
    for (const [name, phase] of [["routeChangeStart", "before"], ["routeChangeComplete", "complete"]]) {
      events.on(name, (url) => { if (enabled) announce(url, phase); });
    }
    events.on("routeChangeError", (_error, url) => { if (enabled) announce(url, "cancel"); });
  }
  const routerTimer = setInterval(() => { attachRouter(); if (hooked) clearInterval(routerTimer); }, 100);
  setTimeout(() => clearInterval(routerTimer), 30000);
  attachRouter();
})();
