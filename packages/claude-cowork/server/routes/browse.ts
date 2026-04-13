import { Router } from "express";

/**
 * Tiny browse API. The Cowork agent can hit this to fetch a page or search.
 * Kept server-side to avoid CORS pain in the React client.
 */

export const browseRouter = Router();

browseRouter.get("/fetch", async (req, res) => {
  const url = String(req.query.url ?? "");
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: "bad_url" });
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "claude-cowork/1.0" },
    });
    const text = await r.text();
    res.json({ status: r.status, contentType: r.headers.get("content-type"), body: text.slice(0, 200_000) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

browseRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "");
  if (!q) return res.status(400).json({ error: "q required" });
  try {
    const r = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { "user-agent": "Mozilla/5.0 claude-cowork" },
    });
    const html = await r.text();
    const results: Array<{ title: string; url: string }> = [];
    const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && results.length < 12) {
      const url = decodeURIComponent(m[1].replace(/^\/l\/\?.*?uddg=/, "").split("&")[0]);
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      if (title && url.startsWith("http")) results.push({ title, url });
    }
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
