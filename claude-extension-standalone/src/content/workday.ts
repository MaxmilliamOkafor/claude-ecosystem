/// <reference types="chrome" />
/**
 * Workday content script — injected into every frame on Workday hosts. Only
 * the frame that actually renders the Workday candidate app answers messages.
 */
import { autoResume, resumeRun, startRun, stopRun } from "../workday/engine.js";
import { detectPage, hasWorkdayApp, isWorkdayHost, scrapeJob, tenantHost } from "../workday/detect.js";
import { getJob, getLastJobKey, getRun, saveJob } from "../workday/store.js";
import type { WdMessage, WdStatusReply } from "../workday/types.js";

async function status(): Promise<WdStatusReply> {
  const host = tenantHost();
  let job = scrapeJob();
  if (!job) {
    const k = await getLastJobKey(host);
    job = k ? (await getJob(k)) ?? null : null;
  }
  return { isWorkday: true, tenantHost: host, page: detectPage(), job, run: (await getRun(host)) ?? null };
}

chrome.runtime.onMessage.addListener((msg: WdMessage, _sender, sendResponse) => {
  if (!msg?.type?.startsWith("wd:") || !hasWorkdayApp()) return false;
  const reply = (p: Promise<unknown>) => {
    p.then(sendResponse, (e) => sendResponse({ error: (e as Error).message }));
    return true;
  };
  switch (msg.type) {
    case "wd:status":
      return reply(status());
    case "wd:captureJD":
      return reply(
        (async () => {
          const job = scrapeJob();
          if (!job) throw new Error("No job description on this page. Open the job posting (before clicking Apply).");
          await saveJob(job);
          chrome.runtime.sendMessage({ type: "wd:jobCaptured", job }).catch(() => {});
          return job;
        })()
      );
    case "wd:start":
      return reply(startRun(msg.jobKey));
    case "wd:resume":
      return reply(resumeRun());
    case "wd:stop":
      return reply(stopRun().then(() => ({ ok: true })));
    default:
      return false;
  }
});

if (isWorkdayHost()) {
  // The SPA may render after document_idle; wait for it before resuming.
  const boot = () => {
    if (hasWorkdayApp()) void autoResume();
    else setTimeout(boot, 500);
  };
  boot();
}
