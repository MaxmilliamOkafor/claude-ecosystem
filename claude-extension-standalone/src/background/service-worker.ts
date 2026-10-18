/// <reference types="chrome" />
import { complete } from "../lib/api.js";
import { MASTER, generatePassword, loadCredential, saveCredential } from "../workday/vault.js";
import { attachDocs, requestExternalTailoring, type ExternalDocs } from "../workday/external.js";
import { getJob, getLastJobKey, getWdSettings } from "../workday/store.js";
import type { JobPosting, WdMessage } from "../workday/types.js";

chrome.runtime.onInstalled.addListener(async () => {
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

/* -------------------- Workday autopilot -------------------- */

/** Trusted typing via the DevTools protocol (needs the optional "debugger" permission). */
async function trustedType(tabId: number, text: string): Promise<boolean> {
  if (!(await chrome.permissions.contains({ permissions: ["debugger"] }))) return false;
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, "1.3");
  } catch {
    /* already attached */
  }
  try {
    await chrome.debugger.sendCommand(target, "Input.insertText", { text });
    return true;
  } catch {
    return false;
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

const externalInFlight = new Set<string>();

async function onJobCaptured(job: JobPosting) {
  const s = await getWdSettings();
  if (!s.externalAutoRequest || !s.externalTailorUrl || externalInFlight.has(job.key)) return;
  externalInFlight.add(job.key);
  try {
    await requestExternalTailoring(job);
  } catch (err) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "Tailoring service failed",
      message: (err as Error).message.slice(0, 200),
    });
  } finally {
    externalInFlight.delete(job.key);
  }
}

chrome.runtime.onMessage.addListener((msg: WdMessage, sender, sendResponse) => {
  if (!msg?.type?.startsWith("wd:")) return false;
  const reply = (p: Promise<unknown>) => {
    p.then(sendResponse, (e) => sendResponse({ ok: false, error: (e as Error).message }));
    return true;
  };
  switch (msg.type) {
    case "wd:llm":
      return reply(
        complete(msg.prompt, { system: msg.system, json: msg.json, maxTokens: msg.maxTokens }).then((text) => ({ ok: true, text }))
      );
    case "wd:cred:get":
      return reply(
        Promise.all([loadCredential(msg.tenantHost), loadCredential(MASTER)]).then(([cred, master]) => ({ cred, master }))
      );
    case "wd:cred:set":
      return reply(saveCredential(msg.tenantHost, { email: msg.email, password: msg.password }).then(() => ({ ok: true })));
    case "wd:cred:generate":
      return reply(
        (async () => {
          const password = generatePassword();
          await saveCredential(msg.tenantHost, { email: msg.email, password });
          return { password };
        })()
      );
    case "wd:trustedType":
      return reply(sender.tab?.id ? trustedType(sender.tab.id, msg.text).then((ok) => ({ ok })) : Promise.resolve({ ok: false }));
    case "wd:notify":
      chrome.notifications.create({ type: "basic", iconUrl: "icons/icon-128.png", title: msg.title, message: msg.message.slice(0, 250) });
      return false;
    case "wd:jobCaptured":
      void onJobCaptured(msg.job);
      return false;
    default:
      return false;
  }
});

/**
 * Hook for your own tailoring app running on localhost (see manifest
 * `externally_connectable`). Messages:
 *   { type: "wd:getCurrentJob", tenantHost? }            → JobPosting | null
 *   { type: "wd:attachDocs", jobKey: string | "current", tenantHost?, cv, coverLetter?, coverLetterText? }
 */
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  const resolveKey = async (jobKey: string | undefined, host: string | undefined): Promise<string | null> => {
    if (jobKey && jobKey !== "current") return jobKey;
    if (host) return (await getLastJobKey(host)) ?? null;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const h = tab?.url ? new URL(tab.url).hostname : "";
    return h ? (await getLastJobKey(h)) ?? null : null;
  };
  (async () => {
    if (msg?.type === "wd:getCurrentJob") {
      const k = await resolveKey("current", msg.tenantHost);
      return k ? (await getJob(k)) ?? null : null;
    }
    if (msg?.type === "wd:attachDocs") {
      const k = await resolveKey(msg.jobKey, msg.tenantHost);
      if (!k) throw new Error("No captured Workday job to attach to. Capture the JD first.");
      const job = (await getJob(k)) ?? { key: k };
      const docs = await attachDocs(job, msg as ExternalDocs, "external");
      return { ok: true, jobKey: k, cv: docs.cv.fileName, coverLetter: docs.coverLetter?.fileName ?? null, approved: docs.approved };
    }
    throw new Error(`Unknown message type: ${msg?.type}`);
  })().then(sendResponse, (e) => sendResponse({ ok: false, error: (e as Error).message }));
  return true;
});
