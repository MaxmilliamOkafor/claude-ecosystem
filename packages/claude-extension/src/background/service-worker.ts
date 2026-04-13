/// <reference types="chrome" />

/**
 * Background service worker:
 *   - Opens the side panel from the toolbar icon
 *   - Registers context-menu entries (summarize / explain / rewrite selection)
 *   - Handles keyboard commands
 *   - Proxies messages from popup/sidepanel to the API when needed
 */

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    // Older Chrome
  }

  chrome.contextMenus.create({
    id: "claude-summarize-page",
    title: "Claude: Summarize page",
    contexts: ["page", "frame"],
  });
  chrome.contextMenus.create({
    id: "claude-explain-selection",
    title: "Claude: Explain selection",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "claude-rewrite-selection",
    title: "Claude: Rewrite selection",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "claude-extract-data",
    title: "Claude: Extract structured data",
    contexts: ["page", "selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const action = info.menuItemId as string;
  const selection = info.selectionText ?? "";
  await chrome.storage.session.set({
    "pending-action": { action, selection, at: Date.now(), tabId: tab.id, url: info.pageUrl },
  });
  try {
    // @ts-ignore — available in MV3
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {
    await chrome.action.openPopup().catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === "toggle-side-panel") {
    try {
      // @ts-ignore
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch {
      /* noop */
    }
  } else if (command === "summarize-page") {
    await chrome.storage.session.set({
      "pending-action": { action: "claude-summarize-page", at: Date.now(), tabId: tab.id, url: tab.url },
    });
    try {
      // @ts-ignore
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch {
      /* noop */
    }
  }
});
