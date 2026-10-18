import React, { useEffect, useState } from "react";
import { docxToText, fileToStoredDoc, importGoogleDocPdf, importGoogleDocText } from "../workday/import.js";
import { parseCvToProfile } from "../workday/tailor.js";
import {
  emptyProfile,
  forgetAnswer,
  getAnswerBank,
  getApplications,
  getMasterCoverLetter,
  getMasterCv,
  getMasterCvText,
  getProfile,
  getWdSettings,
  normalizeProfile,
  setMasterCoverLetter,
  setMasterCv,
  setMasterCvText,
  setProfile,
  setWdSettings,
} from "../workday/store.js";
import { LANGUAGE_NAMES } from "../workday/i18n.js";
import { MASTER, deleteCredential, listCredentialHosts, loadCredential, saveCredential } from "../workday/vault.js";
import { DEFAULT_WD_SETTINGS, type AnswerBankEntry, type Application, type Profile, type StoredDoc, type WorkdaySettings } from "../workday/types.js";

function validate(p: Profile): string[] {
  const out: string[] = [];
  const me = p.personal;
  if (!me.firstName || !me.lastName) out.push("First and last name are required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(me.email)) out.push("A valid email is required (used to create Workday accounts).");
  if (!me.phone.number) out.push("Phone number is missing.");
  if (!me.address.country) out.push("Country is missing (Workday's address form depends on it).");
  p.work.forEach((w, i) => {
    if (!/^\d{4}(-\d{2})?$/.test(w.start)) out.push(`Work #${i + 1} (${w.company}): start must be YYYY-MM.`);
    if (!w.current && w.end && !/^\d{4}(-\d{2})?$/.test(w.end)) out.push(`Work #${i + 1} (${w.company}): end must be YYYY-MM.`);
    if (!w.current && !w.end) out.push(`Work #${i + 1} (${w.company}): set an end date or "current": true.`);
  });
  if (!p.answers.authorizedCountries.length) out.push("List the countries you're authorised to work in (answers.authorizedCountries).");
  return out;
}

const EEO_OPTIONS = {
  gender: ["decline", "Male", "Female", "Non-binary"],
  hispanicOrLatino: ["decline", "yes", "no"],
  ethnicity: ["decline", "White", "Black or African American", "Asian", "Hispanic or Latino", "Two or More Races", "American Indian or Alaska Native", "Native Hawaiian or Other Pacific Islander"],
  veteran: ["decline", "I am not a protected veteran", "I identify as one or more of the classifications of protected veteran"],
  disability: ["decline", "yes", "no"],
} as const;

export function WorkdaySettings() {
  const [s, setS] = useState<WorkdaySettings>(DEFAULT_WD_SETTINGS);
  const [profile, setProfileState] = useState<Profile>(emptyProfile());
  const [json, setJson] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [cvText, setCvText] = useState("");
  const [letter, setLetter] = useState("");
  const [masterCv, setMasterCvState] = useState<StoredDoc | undefined>();
  const [cvLink, setCvLink] = useState("");
  const [clLink, setClLink] = useState("");
  const [masterEmail, setMasterEmail] = useState("");
  const [masterPw, setMasterPw] = useState("");
  const [hosts, setHosts] = useState<string[]>([]);
  const [bank, setBank] = useState<Record<string, AnswerBankEntry>>({});
  const [apps, setApps] = useState<Application[]>([]);

  async function load() {
    const p = await getProfile();
    setS(await getWdSettings());
    setProfileState(p);
    setJson(JSON.stringify(p, null, 2));
    setCvText(await getMasterCvText());
    setLetter(await getMasterCoverLetter());
    setMasterCvState(await getMasterCv());
    setHosts(await listCredentialHosts());
    setBank(await getAnswerBank());
    setApps(await getApplications());
    const m = await loadCredential(MASTER);
    setMasterEmail(m?.email ?? p.personal.email);
  }
  useEffect(() => {
    void load();
  }, []);

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg(`⚠ ${(err as Error).message}`);
    }
    setBusy("");
  }

  function updateProfile(next: Profile) {
    setProfileState(next);
    setJson(JSON.stringify(next, null, 2));
  }

  const saveProfile = () =>
    act("Saving", async () => {
      const parsed = normalizeProfile(JSON.parse(json) as Profile);
      setErrors(validate(parsed));
      await setProfile(parsed);
      setProfileState(parsed);
      setMsg("Profile saved ✓");
    });

  const saveSettings = (patch: Partial<WorkdaySettings>) =>
    act("Saving", async () => {
      if (patch.trustedInputFallback) {
        const ok = await chrome.permissions.request({ permissions: ["debugger"] });
        if (!ok) throw new Error("Trusted input needs the debugger permission (Chrome shows a 'debugging this browser' bar while it types).");
      }
      setS(await setWdSettings(patch));
    });

  const importCv = (mode: "gdoc" | "file", file?: File) =>
    act("Importing CV", async () => {
      let text = "";
      if (mode === "gdoc") {
        text = await importGoogleDocText(cvLink);
        const pdf = await importGoogleDocPdf(cvLink, `${profile.personal.firstName || "My"}-${profile.personal.lastName || "CV"}-CV.pdf`);
        await setMasterCv(pdf);
        setMasterCvState(pdf);
      } else if (file) {
        const stored = await fileToStoredDoc(file);
        await setMasterCv(stored);
        setMasterCvState(stored);
        if (/\.docx$/i.test(file.name)) text = await docxToText(file);
      }
      if (text) {
        await setMasterCvText(text);
        setCvText(text);
      }
      setMsg(text ? "CV imported ✓ — now click 'Build profile from my CV'." : "CV file saved as your master upload ✓ (PDF text isn't extracted; paste the text below to build your profile).");
    });

  const importLetter = (mode: "gdoc" | "file", file?: File) =>
    act("Importing cover letter", async () => {
      const text = mode === "gdoc" ? await importGoogleDocText(clLink) : file ? (/\.docx$/i.test(file.name) ? await docxToText(file) : await file.text()) : "";
      await setMasterCoverLetter(text);
      setLetter(text);
      setMsg("Cover letter imported ✓ — used as the base voice for every tailored letter.");
    });

  const buildProfile = () =>
    act("Reading your CV with the AI", async () => {
      if (!cvText.trim()) throw new Error("Import or paste your CV text first.");
      await setMasterCvText(cvText);
      const parsed = await parseCvToProfile(cvText);
      const cur = profile;
      const merged = normalizeProfile({
        ...parsed,
        personal: { ...cur.personal, ...parsed.personal, phone: { ...cur.personal.phone, ...parsed.personal?.phone }, address: { ...cur.personal.address, ...parsed.personal?.address } },
        answers: cur.answers,
        eeo: cur.eeo,
      } as Profile);
      updateProfile(merged);
      setErrors(validate(merged));
      setMsg("Profile drafted from your CV — check it below (especially dates), then Save profile.");
    });

  const ans = profile.answers;
  // Screening answers and EEO choices save immediately.
  const persist = (next: Profile) => {
    updateProfile(next);
    void setProfile(next);
  };
  const setAns = (patch: Partial<Profile["answers"]>) => persist({ ...profile, answers: { ...ans, ...patch } });
  const setEeo = (patch: Partial<Profile["eeo"]>) => persist({ ...profile, eeo: { ...profile.eeo, ...patch } });

  const exportCsv = () => {
    const rows = [["submitted", "title", "reqId", "employer", "cv", "coverLetter", "url"], ...apps.map((a) => [new Date(a.submittedAt).toISOString(), a.title, a.reqId, a.tenantHost, a.cvFile ?? "", a.coverLetterFile ?? "", a.url])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    void chrome.tabs.create({ url });
  };

  return (
    <div className="grid" id="workday">
      <div className="brand" style={{ fontSize: 20 }}>
        Workday<span className="dot">·</span>Autopilot
      </div>
      {msg && <div className="reply small">{msg}</div>}
      {busy && <div className="small muted">{busy}…</div>}

      <section className="grid">
        <div className="label">1 · Your documents (Google Docs or Word)</div>
        <div className="row">
          <input placeholder="Master CV — Google Docs link" value={cvLink} onChange={(e) => setCvLink(e.target.value)} />
          <button onClick={() => importCv("gdoc")} disabled={!!busy || !cvLink}>Import</button>
        </div>
        <label className="small">
          …or a file (.docx / .pdf): <input type="file" accept=".docx,.pdf" onChange={(e) => e.target.files?.[0] && importCv("file", e.target.files[0])} />
        </label>
        <div className="small muted">
          Master upload: {masterCv ? <b>{masterCv.fileName}</b> : "none"} — used when a job has no tailored docs (toggle below).
        </div>
        <div className="row">
          <input placeholder="Master cover letter — Google Docs link" value={clLink} onChange={(e) => setClLink(e.target.value)} />
          <button onClick={() => importLetter("gdoc")} disabled={!!busy || !clLink}>Import</button>
        </div>
        <label className="small">
          …or a file (.docx / .txt): <input type="file" accept=".docx,.txt" onChange={(e) => e.target.files?.[0] && importLetter("file", e.target.files[0])} />
        </label>
        <div className="label">CV text</div>
        <textarea value={cvText} onChange={(e) => setCvText(e.target.value)} style={{ minHeight: 120 }} placeholder="Imported CV text appears here (or paste it)." />
        <button onClick={buildProfile} disabled={!!busy}>Build profile from my CV (AI)</button>
        <div className="label">Base cover letter</div>
        <textarea value={letter} onChange={(e) => setLetter(e.target.value)} onBlur={() => setMasterCoverLetter(letter)} style={{ minHeight: 100 }} />
      </section>

      <hr />
      <section className="grid">
        <div className="label">2 · Screening answers (used on every application)</div>
        <div className="row">
          <input placeholder="Authorised to work in (comma-separated countries)" value={ans.authorizedCountries.join(", ")} onChange={(e) => setAns({ authorizedCountries: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
        </div>
        <div className="row">
          <label className="small row"><input type="checkbox" style={{ width: "auto" }} checked={ans.needsSponsorship} onChange={(e) => setAns({ needsSponsorship: e.target.checked })} /> Needs visa sponsorship</label>
          <label className="small row"><input type="checkbox" style={{ width: "auto" }} checked={ans.willingToRelocate} onChange={(e) => setAns({ willingToRelocate: e.target.checked })} /> Willing to relocate</label>
        </div>
        <div className="row">
          <label className="small row"><input type="checkbox" style={{ width: "auto" }} checked={ans.openToHybrid} onChange={(e) => setAns({ openToHybrid: e.target.checked })} /> Open to hybrid</label>
          <label className="small row"><input type="checkbox" style={{ width: "auto" }} checked={ans.openToOnsite} onChange={(e) => setAns({ openToOnsite: e.target.checked })} /> Open to on-site</label>
          <label className="small row"><input type="checkbox" style={{ width: "auto" }} checked={ans.previouslyWorkedHere} onChange={(e) => setAns({ previouslyWorkedHere: e.target.checked })} /> Default "worked here before" = Yes</label>
        </div>
        <div className="row">
          <input placeholder="Salary expectation" value={ans.salaryExpectation} onChange={(e) => setAns({ salaryExpectation: e.target.value })} />
          <input placeholder="Notice period" value={ans.noticePeriod} onChange={(e) => setAns({ noticePeriod: e.target.value })} />
        </div>
        <div className="row">
          <input placeholder="Earliest start date (YYYY-MM-DD)" value={ans.earliestStartDate} onChange={(e) => setAns({ earliestStartDate: e.target.value })} />
          <input placeholder="How did you hear about us (e.g. LinkedIn)" value={ans.source} onChange={(e) => setAns({ source: e.target.value })} />
        </div>
        <div className="label">Voluntary self-identification (default: decline to answer)</div>
        <div className="row wrap">
          {(Object.keys(EEO_OPTIONS) as (keyof typeof EEO_OPTIONS)[]).map((k) => (
            <label key={k} className="small" style={{ flex: "1 1 45%" }}>
              {k}
              <select value={profile.eeo[k]} onChange={(e) => setEeo({ [k]: e.target.value } as Partial<Profile["eeo"]>)}>
                {EEO_OPTIONS[k].map((o) => (
                  <option key={o} value={o}>{o === "decline" ? "Decline to answer" : o}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <hr />
      <section className="grid">
        <div className="label">3 · Full profile (JSON — everything the autopilot fills)</div>
        <textarea value={json} onChange={(e) => setJson(e.target.value)} style={{ minHeight: 300 }} spellCheck={false} />
        {errors.map((e, i) => (
          <div key={i} className="small" style={{ color: "#e0a86a" }}>⚠ {e}</div>
        ))}
        <div className="row">
          <button className="primary" onClick={saveProfile} disabled={!!busy}>Save profile</button>
          <button onClick={() => { try { setErrors(validate(normalizeProfile(JSON.parse(json)))); setMsg("Checked."); } catch (e) { setMsg(`⚠ Invalid JSON: ${(e as Error).message}`); } }}>Validate</button>
        </div>
      </section>

      <hr />
      <section className="grid">
        <div className="label">4 · Workday accounts</div>
        <div className="small muted">
          Every employer's Workday has its own account. The autopilot signs in with the saved password, or creates the account and
          saves a strong generated password (encrypted on this device). Optionally use one password everywhere:
        </div>
        <div className="row">
          <input placeholder="Email" value={masterEmail} onChange={(e) => setMasterEmail(e.target.value)} />
          <input type="password" placeholder="One password for all tenants" value={masterPw} onChange={(e) => setMasterPw(e.target.value)} />
          <button
            onClick={() =>
              act("Saving password", async () => {
                if (!masterEmail || !masterPw) throw new Error("Enter email and password.");
                await saveCredential(MASTER, { email: masterEmail, password: masterPw });
                setMasterPw("");
                setS(await setWdSettings({ useMasterPassword: true }));
                setMsg("Master password saved (encrypted) ✓");
              })
            }
          >
            Save
          </button>
        </div>
        <label className="small row"><input type="checkbox" style={{ width: "auto" }} checked={s.useMasterPassword} onChange={(e) => saveSettings({ useMasterPassword: e.target.checked })} /> Use the one password for every new Workday account</label>
        {hosts.length > 0 && (
          <details>
            <summary className="small">Saved employer accounts ({hosts.length})</summary>
            {hosts.map((h) => (
              <div key={h} className="row small" style={{ marginTop: 4 }}>
                <span style={{ flex: 1 }}>{h}</span>
                <button onClick={() => act("Removing", async () => { await deleteCredential(h); setHosts(await listCredentialHosts()); })}>Forget</button>
              </div>
            ))}
          </details>
        )}
      </section>

      <hr />
      <section className="grid">
        <div className="label">5 · Your tailoring tool</div>
        <input placeholder="https://your-tailoring-service/api/workday (POST)" value={s.externalTailorUrl} onChange={(e) => setS({ ...s, externalTailorUrl: e.target.value })} onBlur={() => saveSettings({ externalTailorUrl: s.externalTailorUrl })} />
        <input type="password" placeholder="Bearer token (optional)" value={s.externalTailorToken} onChange={(e) => setS({ ...s, externalTailorToken: e.target.value })} onBlur={() => saveSettings({ externalTailorToken: s.externalTailorToken })} />
        <label className="small row"><input type="checkbox" style={{ width: "auto" }} checked={s.externalAutoRequest} onChange={(e) => saveSettings({ externalAutoRequest: e.target.checked })} /> Request docs automatically when a JD is captured</label>
        <details>
          <summary className="small">Integration contract</summary>
          <pre className="reply small">{`POST <your URL>
{ "job": { "key","tenantHost","reqId","title","location","description","url" },
  "candidate": { "name", "email" } }

→ 200 { "cv": DocRef, "coverLetter"?: DocRef, "coverLetterText"?: string }
DocRef = { "fileName", "base64", "mime"? }
       | { "url", "fileName"? }
       | { "googleDocUrl", "fileName"? }   ← exported to PDF

Local app (http://localhost / 127.0.0.1):
chrome.runtime.sendMessage("${chrome.runtime.id}",
  { type: "wd:getCurrentJob" })                          → JobPosting
chrome.runtime.sendMessage("${chrome.runtime.id}",
  { type: "wd:attachDocs", jobKey: "current", cv, coverLetter?, coverLetterText? })`}</pre>
        </details>
      </section>

      <hr />
      <section className="grid">
        <div className="label">6 · Automation</div>
        {(
          [
            ["requireDocApproval", "Require my approval of each job's CV/cover letter before upload"],
            ["fallbackToMasterCv", "Upload my master CV when a job has no tailored docs"],
            ["llmAnswers", "Let the AI answer unknown screening questions (listed for checking on Review)"],
            ["consentCreateAccountTerms", "I agree: tick Workday's account-creation terms box for me"],
            ["consentDisclosureTerms", "I agree: tick the Voluntary Disclosures terms box for me"],
            ["trustedInputFallback", "Trusted typing fallback for stubborn fields (uses Chrome's debugger permission)"],
          ] as [keyof WorkdaySettings, string][]
        ).map(([k, label]) => (
          <label key={k} className="small row">
            <input type="checkbox" style={{ width: "auto" }} checked={!!s[k]} onChange={(e) => saveSettings({ [k]: e.target.checked } as Partial<WorkdaySettings>)} /> {label}
          </label>
        ))}
        <label className="small">
          Language of tailored CV / cover letter
          <select value={s.docLanguage} onChange={(e) => saveSettings({ docLanguage: e.target.value })}>
            <option value="auto">Same as the job description (auto-detect)</option>
            {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </label>
        <div className="row">
          <label className="small" style={{ flex: 1 }}>
            Max skills to add
            <input type="number" value={s.maxSkills} onChange={(e) => setS({ ...s, maxSkills: Number(e.target.value) || 15 })} onBlur={() => saveSettings({ maxSkills: s.maxSkills })} />
          </label>
          <label className="small" style={{ flex: 1 }}>
            Delay between fields (ms)
            <input type="number" value={s.fieldDelayMs} onChange={(e) => setS({ ...s, fieldDelayMs: Number(e.target.value) || 120 })} onBlur={() => saveSettings({ fieldDelayMs: s.fieldDelayMs })} />
          </label>
        </div>
      </section>

      <hr />
      <section className="grid">
        <details>
          <summary className="label">Saved answers ({Object.keys(bank).length})</summary>
          {Object.entries(bank).map(([k, v]) => (
            <div key={k} className="row small" style={{ marginTop: 4 }}>
              <span style={{ flex: 1 }}>
                {v.label} → <b>{v.answer}</b>
              </span>
              <button onClick={() => act("Removing", async () => { await forgetAnswer(k); setBank(await getAnswerBank()); })}>Forget</button>
            </div>
          ))}
        </details>
        <div className="row">
          <div className="small muted" style={{ flex: 1 }}>{apps.length} application(s) tracked</div>
          <button onClick={exportCsv} disabled={!apps.length}>Export CSV</button>
        </div>
      </section>
    </div>
  );
}
