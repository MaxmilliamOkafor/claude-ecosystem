import type { ToolHandler } from "./index.js";

/**
 * Minimal "live web" tool. Fetches a URL server-side and returns a text-only
 * extract of the body. Not a full headless browser, but enough for reading
 * docs, changelogs, and API references during a coding session.
 */

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>(?=\s*)/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const webFetch: ToolHandler = {
  definition: {
    name: "web_fetch",
    description:
      "Fetch a web page and return its text content. Use for documentation, changelogs, and public APIs.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        max_chars: { type: "number", description: "Trim output to this many characters (default 20000)." },
      },
      required: ["url"],
    },
    local: true,
  },
  async run(input) {
    const url = String(input.url);
    if (!/^https?:\/\//i.test(url)) return { ok: false, content: "URL must start with http(s)://" };
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "claude-code/1.0 (+https://github.com/MaxmilliamOkafor/claude-ecosystem)" },
      });
      const ct = res.headers.get("content-type") ?? "";
      const body = await res.text();
      const content = ct.includes("text/html") ? stripHtml(body) : body;
      const max = Number(input.max_chars) || 20_000;
      return {
        ok: res.ok,
        content: content.slice(0, max) + (content.length > max ? "\n…[truncated]" : ""),
        meta: { status: res.status, contentType: ct, url: res.url },
      };
    } catch (err) {
      return { ok: false, content: `fetch failed: ${(err as Error).message}` };
    }
  },
};

export const webSearch: ToolHandler = {
  definition: {
    name: "web_search",
    description:
      "Search the web via DuckDuckGo's HTML endpoint and return the top result URLs + titles. Follow up with web_fetch.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: { type: "number" },
      },
      required: ["query"],
    },
    local: true,
  },
  async run(input) {
    const q = encodeURIComponent(String(input.query));
    const limit = Math.min(Number(input.max_results) || 8, 20);
    const res = await fetch(`https://duckduckgo.com/html/?q=${q}`, {
      headers: { "user-agent": "Mozilla/5.0 claude-code" },
    });
    const html = await res.text();
    const results: Array<{ title: string; url: string }> = [];
    const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && results.length < limit) {
      const url = decodeURIComponent(m[1].replace(/^\/l\/\?.*?uddg=/, "").split("&")[0]);
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      if (title && url.startsWith("http")) results.push({ title, url });
    }
    const content = results.length
      ? results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n")
      : "(no results)";
    return { ok: true, content, meta: { count: results.length } };
  },
};
