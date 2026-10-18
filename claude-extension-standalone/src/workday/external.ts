/**
 * Bring-your-own tailoring. Three ways for an existing tailoring tool to feed
 * the Workday autopilot:
 *
 * 1. HTTP: set `externalTailorUrl`. The extension POSTs
 *      { job: JobPosting, candidate: { name, email } }
 *    and expects
 *      { cv: DocRef, coverLetter?: DocRef, coverLetterText?: string }
 *    where DocRef is one of
 *      { fileName, base64, mime? }  |  { url, fileName? }  |  { googleDocUrl, fileName? }
 *
 * 2. Local app → extension: an app on http://localhost / 127.0.0.1 calls
 *      chrome.runtime.sendMessage(EXTENSION_ID, { type: "wd:attachDocs", jobKey?: "current", cv, coverLetter?, coverLetterText? })
 *    and can read the captured JD with { type: "wd:getCurrentJob" }.
 *
 * 3. Manual: attach a Google Doc link or a .pdf/.docx file per job in the side panel.
 *
 * Every attached document goes through the Workday compatibility check before use.
 */
import { importGoogleDocPdf, importGoogleDocText, docxToText } from "./import.js";
import { base64ToBytes, bytesToBase64, getDocs, getProfile, getWdSettings, saveDocs } from "./store.js";
import type { JobDocs, JobPosting, StoredDoc } from "./types.js";

export type DocRef =
  | { fileName: string; base64: string; mime?: string }
  | { url: string; fileName?: string }
  | { googleDocUrl: string; fileName?: string };

export interface ExternalDocs {
  cv: DocRef;
  coverLetter?: DocRef;
  coverLetterText?: string;
}

function mimeFor(name: string): string {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.docx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (/\.doc$/i.test(name)) return "application/msword";
  if (/\.rtf$/i.test(name)) return "application/rtf";
  if (/\.txt$/i.test(name)) return "text/plain";
  return "application/octet-stream";
}

export async function resolveDocRef(ref: DocRef, defaultName: string): Promise<StoredDoc> {
  if ("base64" in ref) {
    const fileName = ref.fileName || defaultName;
    return { fileName, base64: ref.base64, mime: ref.mime || mimeFor(fileName) };
  }
  if ("googleDocUrl" in ref) {
    return importGoogleDocPdf(ref.googleDocUrl, ref.fileName || defaultName.replace(/\.\w+$/, ".pdf"));
  }
  const res = await fetch(ref.url, { credentials: "include" });
  if (!res.ok) throw new Error(`Couldn't download ${ref.url} (${res.status})`);
  const fromHeader = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(res.headers.get("content-disposition") ?? "")?.[1];
  const fileName = ref.fileName || (fromHeader ? decodeURIComponent(fromHeader) : defaultName);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { fileName, base64: bytesToBase64(bytes), mime: res.headers.get("content-type")?.split(";")[0] || mimeFor(fileName) };
}

/** Best-effort plain text of a stored doc (for keyword checks and textarea answers). */
export async function docText(doc: StoredDoc): Promise<string> {
  if (/wordprocessingml/.test(doc.mime) || /\.docx$/i.test(doc.fileName)) return docxToText(base64ToBytes(doc.base64));
  if (/^text\//.test(doc.mime)) return new TextDecoder().decode(base64ToBytes(doc.base64));
  return "";
}

export async function attachDocs(job: JobPosting | { key: string; title?: string }, ext: ExternalDocs, source: JobDocs["source"]): Promise<JobDocs> {
  const p = await getProfile();
  const who = `${p.personal.firstName}-${p.personal.lastName}`.replace(/[^A-Za-z0-9-]+/g, "") || "Candidate";
  const role = (job.title ?? "Role").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40);
  const cv = await resolveDocRef(ext.cv, `${who}-${role}-CV.pdf`);
  const coverLetter = ext.coverLetter ? await resolveDocRef(ext.coverLetter, `${who}-${role}-Cover-Letter.pdf`) : undefined;
  let coverLetterText = ext.coverLetterText ?? "";
  if (!coverLetterText && ext.coverLetter && "googleDocUrl" in ext.coverLetter) {
    coverLetterText = await importGoogleDocText(ext.coverLetter.googleDocUrl).catch(() => "");
  }
  if (!coverLetterText && coverLetter) coverLetterText = await docText(coverLetter).catch(() => "");
  const prev = await getDocs(job.key);
  const docs: JobDocs = {
    jobKey: job.key,
    tailored: prev?.tailored ?? null,
    cv,
    coverLetter,
    coverLetterText,
    source,
    // Docs from your own tool are pre-approved only if approval isn't required.
    approved: !(await getWdSettings()).requireDocApproval,
    createdAt: Date.now(),
  };
  await saveDocs(docs);
  return docs;
}

/** Ask the user's tailoring service for docs for this job. */
export async function requestExternalTailoring(job: JobPosting): Promise<JobDocs> {
  const s = await getWdSettings();
  if (!s.externalTailorUrl) throw new Error("Set your tailoring service URL in Workday settings first.");
  const p = await getProfile();
  const res = await fetch(s.externalTailorUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(s.externalTailorToken ? { authorization: `Bearer ${s.externalTailorToken}` } : {}),
    },
    body: JSON.stringify({
      job,
      candidate: { name: `${p.personal.firstName} ${p.personal.lastName}`.trim(), email: p.personal.email },
    }),
  });
  if (!res.ok) throw new Error(`Tailoring service ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as ExternalDocs;
  if (!body?.cv) throw new Error("Tailoring service response has no `cv` field.");
  return attachDocs(job, body, "external");
}
