import React, { useCallback, useEffect, useState } from "react";
import { checkDoc, type CheckResult } from "../workday/atsCheck.js";
import { attachDocs, requestExternalTailoring } from "../workday/external.js";
import { fileToStoredDoc } from "../workday/import.js";
import { renderCoverLetter, renderCv } from "../workday/render.js";
import {
  docToFile,
  getApplications,
  getDocs,
  getMasterCoverLetter,
  getProfile,
  getWdSettings,
  saveDocs,
} from "../workday/store.js";
import { docLanguageFor, tailor } from "../workday/tailor.js";
import { LANGUAGE_NAMES } from "../workday/i18n.js";
import { needsUnicodeFont } from "../workday/pdf.js";
import type { Application, JobDocs, JobPosting, RunState, StoredDoc, WdStatusReply, WorkdaySettings } from "../workday/types.js";

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function toTab<T>(msg: object): Promise<T | undefined> {
  const id = await activeTabId();
  if (!id) return undefined;
  try {
    const r = (await chrome.tabs.sendMessage(id, msg)) as T & { error?: string };
    if (r && (r as { error?: string }).error) throw new Error((r as { error?: string }).error);
    return r;
  } catch (err) {
    if (/Receiving end does not exist/i.test((err as Error).message)) return undefined;
    throw err;
  }
}

function preview(doc: StoredDoc) {
  const url = URL.createObjectURL(docToFile(doc));
  void chrome.tabs.create({ url });
}

const PAGE_NAMES: Record<string, string> = {
  jobPosting: "Job posting",
  applyMethod: "Apply method",
  signIn: "Sign in",
  createAccount: "Create account",
  verifyEmail: "Verify email",
  resumeUpload: "Resume upload",
  myInformation: "My Information",
  myExperience: "My Experience",
  questions: "Application Questions",
  voluntaryDisclosures: "Voluntary Disclosures",
  selfIdentify: "Self Identify",
  review: "Review",
  submitted: "Submitted",
  candidateHome: "Candidate home",
  unknown: "Unknown",
};

function Checks({ title, result }: { title: string; result: CheckResult | null }) {
  if (!result) return null;
  return (
    <div className="small" style={{ marginTop: 6 }}>
      <b>{title}: {result.passed ? "✅ Workday-safe" : "❌ Fix before upload"}</b>
      {result.items.map((i, n) => (
        <div key={n} className={i.level === "ok" ? "muted" : ""} style={{ color: i.level === "error" ? "var(--danger)" : undefined }}>
          {i.level === "ok" ? "✓" : i.level === "warn" ? "⚠" : "✗"} {i.msg}
        </div>
      ))}
      {result.missingKeywords.length > 0 && (
        <div className="muted">Missing JD terms (only add if true): {result.missingKeywords.slice(0, 12).join(", ")}</div>
      )}
    </div>
  );
}

export function WorkdayPanel() {
  const [status, setStatus] = useState<WdStatusReply | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [job, setJob] = useState<JobPosting | null>(null);
  const [docs, setDocs] = useState<JobDocs | null>(null);
  const [settings, setSettings] = useState<WorkdaySettings | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cvCheck, setCvCheck] = useState<CheckResult | null>(null);
  const [clCheck, setClCheck] = useState<CheckResult | null>(null);
  const [gdocCv, setGdocCv] = useState("");
  const [gdocCl, setGdocCl] = useState("");
  const [letterDraft, setLetterDraft] = useState("");

  const refresh = useCallback(async () => {
    setSettings(await getWdSettings());
    setApps(await getApplications());
    try {
      const s = await toTab<WdStatusReply>({ type: "wd:status" });
      setStatus(s ?? null);
      setRun(s?.run ?? null);
      if (s?.job) {
        setJob(s.job);
        const d = (await getDocs(s.job.key)) ?? null;
        setDocs(d);
        setLetterDraft(d?.coverLetterText ?? "");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onMsg = (m: { type?: string; state?: RunState }) => {
      if (m?.type === "wd:progress" && m.state) setRun(m.state);
    };
    const onTab = () => void refresh();
    chrome.runtime.onMessage.addListener(onMsg);
    chrome.tabs.onActivated.addListener(onTab);
    chrome.tabs.onUpdated.addListener(onTab);
    const onStore = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (Object.keys(changes).some((k) => k.startsWith("wd:docs:"))) void refresh();
    };
    chrome.storage.onChanged.addListener(onStore);
    return () => {
      chrome.runtime.onMessage.removeListener(onMsg);
      chrome.tabs.onActivated.removeListener(onTab);
      chrome.tabs.onUpdated.removeListener(onTab);
      chrome.storage.onChanged.removeListener(onStore);
    };
  }, [refresh]);

  useEffect(() => {
    (async () => {
      setCvCheck(docs ? await checkDoc(docs.cv, "cv", job) : null);
      setClCheck(docs?.coverLetter ? await checkDoc(docs.coverLetter, "coverLetter", job) : null);
    })();
  }, [docs, job]);

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy("");
  }

  const capture = () =>
    act("Capturing", async () => {
      const j = await toTab<JobPosting>({ type: "wd:captureJD" });
      if (!j) throw new Error("Open a Workday job posting first.");
      setJob(j);
      setDocs((await getDocs(j.key)) ?? null);
    });

  const builtinTailor = () =>
    act("Tailoring", async () => {
      if (!job) throw new Error("Capture the job description first.");
      const p = await getProfile();
      if (!p.work.length) throw new Error("Your Workday profile has no work history yet — set it up in Settings → Workday.");
      const lang = docLanguageFor(job, (await getWdSettings()).docLanguage);
      const t = await tailor(p, job, await getMasterCoverLetter(), lang);
      if (needsUnicodeFont(JSON.stringify(t)))
        t.warnings.push("This language needs fonts the built-in PDF can't embed — attach docs from your own tool / Google Docs for this job instead.");
      const d: JobDocs = {
        jobKey: job.key,
        tailored: t,
        cv: renderCv(p, t, job, lang),
        coverLetter: renderCoverLetter(p, t.coverLetter, job, lang),
        coverLetterText: t.coverLetter,
        source: "builtin",
        approved: false,
        createdAt: Date.now(),
      };
      await saveDocs(d);
      setDocs(d);
      setLetterDraft(t.coverLetter);
    });

  const external = () =>
    act("Asking your tailoring tool", async () => {
      if (!job) throw new Error("Capture the job description first.");
      setDocs(await requestExternalTailoring(job));
    });

  const attachGoogleDocs = () =>
    act("Importing from Google Docs", async () => {
      if (!job) throw new Error("Capture the job description first.");
      if (!gdocCv.trim()) throw new Error("Paste the Google Docs link of the tailored CV.");
      setDocs(
        await attachDocs(
          job,
          { cv: { googleDocUrl: gdocCv.trim() }, coverLetter: gdocCl.trim() ? { googleDocUrl: gdocCl.trim() } : undefined },
          "manual"
        )
      );
    });

  const attachFile = (kind: "cv" | "coverLetter") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !job) return;
    await act("Attaching", async () => {
      const stored = await fileToStoredDoc(f);
      const cur = docs;
      if (kind === "cv") {
        setDocs(await attachDocs(job, { cv: stored, coverLetter: cur?.coverLetter, coverLetterText: cur?.coverLetterText }, "manual"));
      } else {
        if (!cur) throw new Error("Attach the CV first.");
        setDocs(await attachDocs(job, { cv: cur.cv, coverLetter: stored }, cur.source));
      }
    });
  };

  const saveLetterEdits = () =>
    act("Rebuilding cover letter", async () => {
      if (!docs || !job) return;
      const p = await getProfile();
      const next: JobDocs = { ...docs, coverLetterText: letterDraft, approved: false };
      if (docs.source === "builtin") next.coverLetter = renderCoverLetter(p, letterDraft, job, docLanguageFor(job, settings?.docLanguage));
      await saveDocs(next);
      setDocs(next);
    });

  const approve = (v: boolean) =>
    act("Saving", async () => {
      if (!docs) return;
      if (v && cvCheck && !cvCheck.passed) throw new Error("The CV failed the Workday check — fix the errors first.");
      const next = { ...docs, approved: v };
      await saveDocs(next);
      setDocs(next);
    });

  const send = (type: "wd:start" | "wd:resume" | "wd:stop") =>
    act(type === "wd:start" ? "Starting" : type === "wd:resume" ? "Resuming" : "Stopping", async () => {
      const r = await toTab<RunState>({ type, jobKey: job?.key ?? null });
      if (r === undefined && type !== "wd:stop") throw new Error("No Workday application in this tab.");
      if (r && "status" in r) setRun(r);
    });

  if (!status?.isWorkday) {
    return (
      <div className="grid">
        <div className="reply small">
          Open a Workday job posting (…<code>myworkdayjobs.com</code> / <code>myworkdaysite.com</code>) in this tab. If the
          page was already open before the extension was installed or updated, reload it.
        </div>
        <button onClick={() => void refresh()}>Re-check this tab</button>
        <button onClick={() => chrome.runtime.openOptionsPage()}>Workday profile & settings</button>
        <Tracker apps={apps} />
        {error && <div className="reply" style={{ color: "#ffb4b4" }}>⚠ {error}</div>}
      </div>
    );
  }

  const docReady = docs && (docs.approved || !settings?.requireDocApproval);

  return (
    <div className="grid">
      <div className="small muted">
        {status.tenantHost} · page: <b>{PAGE_NAMES[status.page] ?? status.page}</b>
      </div>

      <div>
        <div className="label">1 · Job</div>
        {job ? (
          <div className="reply small">
            <b>{job.title}</b>
            <div className="muted">
              {job.reqId} · {job.location} · {LANGUAGE_NAMES[job.language] ?? job.language ?? "en"}
            </div>
          </div>
        ) : (
          <div className="small muted">No job description captured yet.</div>
        )}
        <div className="row" style={{ marginTop: 6 }}>
          <button onClick={capture} disabled={!!busy || status.page !== "jobPosting"}>
            {job ? "Re-capture JD" : "Capture JD"}
          </button>
        </div>
      </div>

      <div>
        <div className="label">2 · CV & cover letter for this job</div>
        <div className="row wrap">
          {settings?.externalTailorUrl && (
            <button className="primary" onClick={external} disabled={!!busy || !job}>
              Get from my tailoring tool
            </button>
          )}
          <button onClick={builtinTailor} disabled={!!busy || !job}>
            Built-in tailoring
          </button>
        </div>
        <details style={{ marginTop: 6 }}>
          <summary className="small">Attach your own (Google Docs / file)</summary>
          <div className="grid" style={{ marginTop: 6 }}>
            <input placeholder="Tailored CV — Google Docs link" value={gdocCv} onChange={(e) => setGdocCv(e.target.value)} />
            <input placeholder="Cover letter — Google Docs link (optional)" value={gdocCl} onChange={(e) => setGdocCl(e.target.value)} />
            <button onClick={attachGoogleDocs} disabled={!!busy || !job}>
              Attach Google Docs (exported as PDF)
            </button>
            <label className="small">
              CV file (.pdf / .docx): <input type="file" accept=".pdf,.docx,.doc" onChange={attachFile("cv")} disabled={!job} />
            </label>
            <label className="small">
              Cover letter file: <input type="file" accept=".pdf,.docx,.doc,.txt" onChange={attachFile("coverLetter")} disabled={!job || !docs} />
            </label>
          </div>
        </details>

        {docs && (
          <div className="reply small" style={{ marginTop: 8 }}>
            <div>
              Source: <b>{docs.source}</b> · {docs.approved ? "✅ approved" : "⏳ not approved"}
            </div>
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button onClick={() => preview(docs.cv)}>Preview CV</button>
              {docs.coverLetter && <button onClick={() => preview(docs.coverLetter!)}>Preview cover letter</button>}
            </div>
            <Checks title={`CV (${docs.cv.fileName})`} result={cvCheck} />
            {docs.coverLetter && <Checks title={`Cover letter (${docs.coverLetter.fileName})`} result={clCheck} />}
            {docs.tailored && (
              <div style={{ marginTop: 6 }}>
                <div>
                  Tailoring: {docs.tailored.method}. Top skills: {docs.tailored.skills.slice(0, 8).join(", ")}
                </div>
                {docs.tailored.warnings.map((w, i) => (
                  <div key={i} style={{ color: "#e0a86a" }}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
            <div className="label" style={{ marginTop: 8 }}>
              Cover letter text (pasted into "why us" / cover-letter text boxes)
            </div>
            <textarea value={letterDraft} onChange={(e) => setLetterDraft(e.target.value)} style={{ minHeight: 140 }} />
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button onClick={saveLetterEdits} disabled={!!busy || letterDraft === docs.coverLetterText}>
                Save letter edits
              </button>
              {docs.approved ? (
                <button onClick={() => approve(false)}>Un-approve</button>
              ) : (
                <button className="primary" onClick={() => approve(true)} disabled={!!busy}>
                  Approve for upload
                </button>
              )}
            </div>
          </div>
        )}
        {!docs && <div className="small muted" style={{ marginTop: 4 }}>No job docs yet — the autopilot will fall back to your master CV if set.</div>}
      </div>

      <div>
        <div className="label">3 · Autopilot</div>
        <div className="row wrap">
          {(!run || run.status === "idle" || run.status === "done" || run.status === "error") && (
            <button className="primary" onClick={() => send("wd:start")} disabled={!!busy}>
              {docReady || !docs ? "Start autopilot" : "Start (docs not approved)"}
            </button>
          )}
          {(run?.status === "paused" || run?.status === "error") && (
            <button className="primary" onClick={() => send("wd:resume")} disabled={!!busy}>
              Resume
            </button>
          )}
          {run?.status === "running" && <button onClick={() => send("wd:stop")}>Stop</button>}
        </div>
        {run && (
          <div className="reply small" style={{ marginTop: 6 }}>
            <div>
              Status: <b>{run.status}</b> · page: {PAGE_NAMES[run.page] ?? run.page}
              {run.done.length > 0 && <span className="muted"> · done: {run.done.map((d) => PAGE_NAMES[d] ?? d).join(" → ")}</span>}
            </div>
            {run.pauseReason && <div style={{ color: "#e0a86a", marginTop: 4 }}>{run.pauseReason}</div>}
            {run.flags.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <b>Needs you:</b>
                {run.flags.map((f, i) => (
                  <div key={i}>
                    • {f.label} — <span className="muted">{f.reason}</span>
                  </div>
                ))}
                <div className="muted">Fill these on the page, then Resume — your answers are saved for next time.</div>
              </div>
            )}
            {run.llmFilled.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <b>AI-answered (check on Review):</b>
                {run.llmFilled.map((f, i) => (
                  <div key={i}>
                    • {f.label}: <span className="muted">{f.answer.slice(0, 80)}</span>
                  </div>
                ))}
              </div>
            )}
            <details style={{ marginTop: 4 }}>
              <summary>Log ({run.log.length})</summary>
              {run.log.slice(-40).map((l, i) => (
                <div key={i} style={{ color: l.level === "error" ? "var(--danger)" : l.level === "warn" ? "#e0a86a" : undefined }}>
                  {new Date(l.at).toLocaleTimeString()} {l.msg}
                </div>
              ))}
            </details>
          </div>
        )}
        <div className="small muted" style={{ marginTop: 6 }}>
          The autopilot signs in or creates the account, fills every page, and stops on Review. You always click Submit.
        </div>
      </div>

      {busy && <div className="small muted">{busy}…</div>}
      {error && <div className="reply" style={{ color: "#ffb4b4" }}>⚠ {error}</div>}

      <Tracker apps={apps} />
      <button onClick={() => chrome.runtime.openOptionsPage()}>Workday profile & settings</button>
    </div>
  );
}

function Tracker({ apps }: { apps: Application[] }) {
  if (!apps.length) return null;
  return (
    <details>
      <summary className="small">Applications submitted ({apps.length})</summary>
      {apps.slice(0, 20).map((a) => (
        <div key={a.jobKey} className="small" style={{ marginTop: 4 }}>
          {new Date(a.submittedAt).toLocaleDateString()} · <a href={a.url} target="_blank" rel="noreferrer">{a.title}</a>{" "}
          <span className="muted">({a.tenantHost.split(".")[0]})</span>
        </div>
      ))}
    </details>
  );
}
