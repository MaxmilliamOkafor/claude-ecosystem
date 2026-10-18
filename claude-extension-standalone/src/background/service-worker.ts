/// <reference types="chrome" />
import { getSettings } from "../lib/storage.js";

const LEAVE_GUARD_ID = "no-leave-prompt";

const LEAVE_GUARD_SCRIPT: chrome.scripting.RegisteredContentScript = {
  id: LEAVE_GUARD_ID,
  js: ["no-leave-prompt.js"],
  matches: ["<all_urls>"],
  runAt: "document_start",
  allFrames: true,
  world: "MAIN",
  persistAcrossSessions: true,
};

/**
 * Register (or, if turned off in Options, unregister) the MAIN-world script
 * that blocks "Leave site?" prompts. Re-registers from scratch every time so
 * an extension update or a lost registration can never leave it stale.
 */
async function syncLeaveGuard(): Promise<void> {
  const { blockLeavePrompts } = await getSettings();
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [LEAVE_GUARD_ID] });
  if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [LEAVE_GUARD_ID] });
  if (!blockLeavePrompts) return;
  try {
    // matchOriginAsFallback (Chrome 119+) also covers about:blank / blob: frames.
    await chrome.scripting.registerContentScripts([
      { ...LEAVE_GUARD_SCRIPT, matchOriginAsFallback: true } as chrome.scripting.RegisteredContentScript,
    ]);
  } catch {
    await chrome.scripting.registerContentScripts([LEAVE_GUARD_SCRIPT]);
  }
}

/** Apply the guard to tabs that were already open before it was registered. */
async function guardOpenTabs(): Promise<void> {
  if (!(await getSettings()).blockLeavePrompts) return;
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((t) =>
      t.id === undefined
        ? undefined
        : chrome.scripting
            .executeScript({
              target: { tabId: t.id, allFrames: true },
              files: ["no-leave-prompt.js"],
              world: "MAIN",
              injectImmediately: true,
            })
            .catch(() => {}), // chrome:// pages, Web Store, etc.
    ),
  );
}

// Runs every time the service worker wakes, not only on install/startup.
void syncLeaveGuard().catch(() => {});
chrome.runtime.onStartup.addListener(() => void syncLeaveGuard().catch(() => {}));
chrome.storage.onChanged.addListener((changes) => {
  if ("claude-ext-settings" in changes) void syncLeaveGuard().then(guardOpenTabs).catch(() => {});
});

chrome.runtime.onInstalled.addListener(async () => {
  await syncLeaveGuard().catch(() => {});
  await guardOpenTabs().catch(() => {});
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    /* older Chrome */
  }

  chrome.contextMenus.create({ id: "claude-summarize-page", title: "Claude: Summarize page", contexts: ["page", "frame"] });
  chrome.contextMenus.create({ id: "claude-explain-selection", title: "Claude: Explain selection", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "claude-rewrite-selection", title: "Claude: Rewrite selection", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "claude-extract-data", title: "Claude: Extract structured data", contexts: ["page", "selection"] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  await chrome.storage.session.set({
    "pending-action": {
      action: info.menuItemId,
      selection: info.selectionText ?? "",
      at: Date.now(),
      tabId: tab.id,
      url: info.pageUrl,
    },
  });
  try {
    // @ts-ignore
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
