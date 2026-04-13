import type { PageContext } from "./api.js";

/**
 * Collect a page context from the active tab. Runs a content-script function
 * via `chrome.scripting.executeScript` so it works on any tab regardless of
 * the static content_scripts matches.
 */

export async function collectPageContext(): Promise<PageContext> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    return { url: tab?.url, title: tab?.title };
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractInPage,
    });
    return {
      url: tab.url,
      title: tab.title,
      selection: result?.selection,
      text_snapshot: result?.text,
    };
  } catch {
    return { url: tab.url, title: tab.title };
  }
}

/** Runs inside the target page — keep self-contained (no imports). */
function extractInPage(): { selection: string; text: string } {
  const sel = (window.getSelection()?.toString() ?? "").trim();
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style, noscript, iframe, svg, canvas, video, audio").forEach((n) => n.remove());
  const text = (clone.innerText || clone.textContent || "")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 20_000);
  return { selection: sel, text };
}
