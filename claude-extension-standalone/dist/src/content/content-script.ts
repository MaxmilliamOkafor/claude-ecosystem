/// <reference types="chrome" />

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "snapshot") {
    const sel = (window.getSelection()?.toString() ?? "").trim();
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("script, style, noscript, iframe, svg, canvas, video, audio")
      .forEach((n) => n.remove());
    const text = (clone.innerText || clone.textContent || "").slice(0, 20_000);
    sendResponse({ url: location.href, title: document.title, selection: sel, text });
    return true;
  }
  if (msg?.type === "replace-selection") {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(String(msg.text ?? "")));
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, reason: "no_selection" });
    }
    return true;
  }
  return false;
});
