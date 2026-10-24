(function (root) {
  "use strict";

  function problemFromUrl(value) {
    try {
      const url = new URL(value, "https://leetcode.cn");
      if (url.origin !== "https://leetcode.cn") return null;
      const match = url.pathname.match(/^\/problems\/([^/]+)(?:\/(?:description)?)?\/?$/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
  }

  function normalizeCode(value) {
    return String(value || "").replace(/[\s\u00a0\u200b\u200c\u200d\ufeff]/g, "");
  }

  function validSnippets(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item.code === "string" && item.code.length <= 150000
      && typeof item.langSlug === "string").map(({ code, lang, langSlug }) => ({ code, lang, langSlug }));
  }

  // Only public starter templates are retained; submissions and draft contents are not cached.
  function collectTemplates(data, fallbackSlug) {
    const found = [];
    const visited = new WeakSet();
    let budget = 18000;
    function visit(node, hint) {
      if (!node || typeof node !== "object" || visited.has(node) || --budget <= 0) return;
      visited.add(node);
      let slug = typeof node.titleSlug === "string" ? node.titleSlug : hint;
      if (Array.isArray(node.queryKey)) {
        const variables = node.queryKey.find((entry) => entry && typeof entry === "object"
          && typeof entry.titleSlug === "string");
        if (variables) slug = variables.titleSlug;
      }
      const snippets = validSnippets(node.codeSnippets);
      if (slug && snippets.length) found.push({ slug, snippets });
      if (Array.isArray(node)) node.forEach((item) => visit(item, slug));
      else Object.values(node).forEach((item) => visit(item, slug));
    }
    visit(data, fallbackSlug);
    return found;
  }

  const api = { problemFromUrl, normalizeCode, validSnippets, collectTemplates };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LeetcodeClearCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
