/**
 * Workday compatibility check for any CV / cover letter — generated here or by
 * an external tailoring tool — run before the autopilot uploads it.
 */
import { docxToText, unzipEntry } from "./import.js";
import { base64ToBytes } from "./store.js";
import { extractKeywords } from "./tailor.js";
import type { JobPosting, StoredDoc } from "./types.js";

export interface CheckItem {
  level: "ok" | "warn" | "error";
  msg: string;
}

export interface CheckResult {
  items: CheckItem[];
  keywordCoverage: number | null; // 0..1
  missingKeywords: string[];
  passed: boolean;
}

const MAX_BYTES = 5 * 1024 * 1024; // the most common Workday per-file limit
const ALLOWED = /\.(pdf|docx?|rtf|txt)$/i;

function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

/** Rough text pull from an uncompressed PDF (our own PDFs, and many simple exports). */
function pdfVisibleText(raw: string): string {
  const out: string[] = [];
  for (const m of raw.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) out.push(m[0].replace(/\)\s*Tj$/, "").slice(1));
  return out.join(" ").replace(/\\\d{3}/g, " ").replace(/\\(.)/g, "$1");
}

export async function checkDoc(doc: StoredDoc, kind: "cv" | "coverLetter", job?: JobPosting | null): Promise<CheckResult> {
  const items: CheckItem[] = [];
  const bytes = base64ToBytes(doc.base64);
  let text = "";

  if (!ALLOWED.test(doc.fileName)) items.push({ level: "error", msg: `File type of "${doc.fileName}" isn't accepted by most Workday tenants (use PDF or DOCX).` });
  if (bytes.length > MAX_BYTES) items.push({ level: "error", msg: `File is ${(bytes.length / 1048576).toFixed(1)} MB; Workday usually rejects files over 5 MB.` });
  else items.push({ level: "ok", msg: `Size ${(bytes.length / 1024).toFixed(0)} KB` });
  if (/[^\w .()-]/.test(doc.fileName)) items.push({ level: "warn", msg: "File name has special characters; some tenants reject them." });

  if (/\.pdf$/i.test(doc.fileName) || doc.mime === "application/pdf") {
    const raw = latin1(bytes);
    if (/\/Encrypt\b/.test(raw)) items.push({ level: "error", msg: "PDF is encrypted/password-protected — Workday can't parse it." });
    const hasFont = /\/Font\b/.test(raw);
    const hasImage = /\/Subtype\s*\/Image/.test(raw);
    if (!hasFont && hasImage) items.push({ level: "error", msg: "PDF looks image-only (scanned). Workday will extract no text." });
    else if (hasFont) items.push({ level: "ok", msg: "PDF contains real text" });
    text = pdfVisibleText(raw);
  } else if (/\.docx$/i.test(doc.fileName)) {
    try {
      const xml = new TextDecoder().decode((await unzipEntry(bytes, "word/document.xml")) ?? new Uint8Array());
      if (/<w:tbl\b/.test(xml)) items.push({ level: "warn", msg: "Uses tables — Workday may scramble the order of table cells." });
      if (/<w:txbxContent\b/.test(xml)) items.push({ level: "error", msg: "Uses text boxes — Workday usually skips their content." });
      if (/<w:cols\b[^>]*w:num="[2-9]"/.test(xml)) items.push({ level: "warn", msg: "Multi-column layout — parse order may break." });
      for (const h of ["word/header1.xml", "word/header2.xml", "word/header3.xml"]) {
        const hx = await unzipEntry(bytes, h);
        if (hx && /@|\+\d|\(\d{3}\)/.test(new TextDecoder().decode(hx)))
          items.push({ level: "warn", msg: "Contact details sit in the page header — Workday often ignores headers. Move them into the body." });
      }
      text = await docxToText(bytes);
    } catch (err) {
      items.push({ level: "warn", msg: `Couldn't inspect the .docx (${(err as Error).message}).` });
    }
  }

  if (text && kind === "cv") {
    if (!/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) items.push({ level: "warn", msg: "No email address found in the CV body." });
    if (!/\+?\d[\d\s().-]{7,}\d/.test(text)) items.push({ level: "warn", msg: "No phone number found in the CV body." });
    const H = [
      ["Experience", /experience|erfahrung|expérience|experiencia|experiência|esperienza|ervaring|doświadczenie|職歴|经历/iu],
      ["Education", /education|ausbildung|bildung|formation|formación|formação|istruzione|opleiding|wykształcenie|学歴|教育/iu],
      ["Skills", /skills|kenntnisse|fähigkeiten|compétences|habilidades|competencias|competências|competenze|vaardigheden|umiejętności|スキル|技能/iu],
    ] as const;
    for (const [name, re] of H) if (!re.test(text)) items.push({ level: "warn", msg: `No standard "${name}" heading (or its translation).` });
    const dates = text.match(/\b(0?[1-9]|1[0-2])[/.](19|20)\d{2}\b|\p{L}{3,}\.? (19|20)\d{2}\b/giu) ?? [];
    if (!dates.length) items.push({ level: "warn", msg: "No MM/YYYY or 'Mon YYYY' dates found — Workday's date parsing may fail." });
  }

  let keywordCoverage: number | null = null;
  let missingKeywords: string[] = [];
  if (text && job) {
    const kws = extractKeywords(`${job.title}\n${job.description}`, 25);
    const lower = text.toLowerCase();
    const hit = kws.filter((k) => lower.includes(k));
    missingKeywords = kws.filter((k) => !lower.includes(k));
    keywordCoverage = kws.length ? hit.length / kws.length : null;
    if (keywordCoverage !== null)
      items.push({
        level: keywordCoverage >= 0.5 ? "ok" : "warn",
        msg: `JD keyword coverage ${(keywordCoverage * 100).toFixed(0)}% (${hit.length}/${kws.length})`,
      });
  } else if (!text) {
    items.push({ level: "warn", msg: "Couldn't read the text inside this file (compressed PDF), so keyword coverage wasn't checked." });
  }

  return { items, keywordCoverage, missingKeywords, passed: !items.some((i) => i.level === "error") };
}
