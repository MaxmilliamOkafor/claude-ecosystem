/**
 * Unit tests for the Workday modules that run without a browser page.
 * Bundled by test/run-unit.mjs (Vite SSR build) and executed in Node.
 */
import { checkDoc } from "../src/workday/atsCheck.js";
import { bucketFor, yearsOfExperience } from "../src/workday/answers.js";
import { norm, similarity } from "../src/workday/dom.js";
import { DECLINE_RX, SENSITIVE_RX, SUBMIT_RX, detectLanguage } from "../src/workday/i18n.js";
import { docxToText, unzipEntry } from "../src/workday/import.js";
import { textWidth, wrap } from "../src/workday/pdf.js";
import { renderCoverLetter, renderCv } from "../src/workday/render.js";
import { base64ToBytes, emptyProfile, normalizeProfile } from "../src/workday/store.js";
import { extractKeywords, keywordTailor, verifyNoFabrication } from "../src/workday/tailor.js";
import type { JobPosting, Profile } from "../src/workday/types.js";
import { generatePassword } from "../src/workday/vault.js";
import { detectPage } from "../src/workday/detect.js";
void detectPage; // imported to make sure the content-side module graph bundles for Node too

let failed = 0;
let passed = 0;
async function t(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    const r = await fn();
    if (r === false) throw new Error("returned false");
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name} — ${(e as Error).message}`);
  }
}
const eq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

const profile: Profile = normalizeProfile({
  ...emptyProfile(),
  personal: { ...emptyProfile().personal, firstName: "Jane", lastName: "Doe", email: "jane@example.com", phone: { countryName: "United Kingdom", countryCode: "+44", number: "7700900123", deviceType: "Mobile" } },
  summary: "Backend engineer.",
  skills: ["Python", "AWS", "PostgreSQL", "Leadership"],
  work: [
    { id: "w1", title: "Senior Engineer", company: "Globex", location: "London", start: "2020-01", current: true, bullets: ["Mentored 4 engineers", "Built Python services on AWS serving 2,000 rps", "Ran PostgreSQL upgrades"] },
    { id: "w2", title: "Engineer", company: "Initech", location: "Leeds", start: "2016-01", end: "2019-12", current: false, bullets: ["Wrote Java tooling"] },
  ],
});

const job: JobPosting = {
  key: "acme|R-1",
  tenantHost: "acme.wd5.myworkdayjobs.com",
  site: "External",
  reqId: "R-1",
  title: "Senior Python Engineer",
  location: "London",
  description: "We need Python and AWS. Python services, AWS infrastructure, PostgreSQL. Kubernetes and Kubernetes operators are a plus. Python Python.",
  language: "en",
  url: "https://acme.wd5.myworkdayjobs.com/job/x_R-1",
  capturedAt: 0,
};

await t("keywords rank JD terms", () => {
  const k = extractKeywords(job.description);
  return k[0] === "python" && k.includes("aws") && k.includes("kubernetes");
});

await t("keyword tailoring reorders bullets and skills by JD relevance", () => {
  const r = keywordTailor(profile, job);
  eq(r.roles.w1[0], "Built Python services on AWS serving 2,000 rps");
  eq(r.skills.slice(0, 2), ["Python", "AWS"]);
});

await t("no-fabrication check drops invented skills, tools and numbers", () => {
  const kws = extractKeywords(job.description);
  const out = verifyNoFabrication(profile, kws, {
    summary: "Python engineer with Kubernetes expertise.",
    skills: ["Python", "Kubernetes", "AWS"],
    roles: {
      w1: ["Built Python services on AWS serving 2,000 rps", "Ran Kubernetes clusters", "Mentored 12 engineers", "Ran PostgreSQL upgrades"],
      w2: ["Wrote Java tooling"],
    },
    coverLetter: "Dear team, I love Kubernetes.",
  });
  if (out.skills.includes("Kubernetes")) throw new Error("kept invented skill");
  if (out.roles.w1.some((b) => /Kubernetes|12 engineers/.test(b))) throw new Error("kept invented bullet");
  if (out.summary !== profile.summary) throw new Error("kept summary with invented tool");
  if (!out.warnings.some((w) => /Cover letter mentions/.test(w))) throw new Error("no cover letter warning");
  return out.roles.w1.length === 2;
});

await t("number check is locale-agnostic (2,000 ≡ 2.000)", () => {
  const out = verifyNoFabrication(profile, [], { summary: "", skills: [], roles: { w1: ["Python-Services auf AWS mit 2.000 rps", "4 Ingenieure betreut"], w2: [] }, coverLetter: "" }, "", true);
  return out.roles.w1.length === 2;
});

await t("CV PDF renders, is Workday-safe and covers JD keywords", async () => {
  const t1 = keywordTailor(profile, job);
  const cv = renderCv(profile, t1, job);
  const head = new TextDecoder().decode(base64ToBytes(cv.base64).slice(0, 8));
  if (!head.startsWith("%PDF-1.4")) throw new Error("not a PDF");
  const res = await checkDoc(cv, "cv", job);
  if (!res.passed) throw new Error(res.items.map((i) => i.msg).join("; "));
  if ((res.keywordCoverage ?? 0) < 0.4) throw new Error(`coverage ${res.keywordCoverage}`);
  return cv.fileName === "Jane-Doe-Senior-Python-Engineer-CV.pdf";
});

await t("localised CV headings (German)", () => {
  const cv = renderCv(profile, keywordTailor(profile, job), job, "de");
  const raw = new TextDecoder("latin1").decode(base64ToBytes(cv.base64));
  return raw.includes("(BERUFSERFAHRUNG)") && raw.includes("heute)");
});

await t("PDF writer escapes and wraps, transliterates non-WinAnsi letters", () => {
  const lines = wrap("Zażółć gęślą jaźń (test) \\ " + "word ".repeat(40), 10, 200);
  return lines.length > 3 && textWidth("abc", 10) > 0;
});

await t("cover letter PDF renders", () => renderCoverLetter(profile, "Dear Hiring Team,\n\nHello.\n\nSincerely,\nJane", job).base64.length > 200);

await t("ATS check flags image-only and encrypted PDFs", async () => {
  const enc = btoa("%PDF-1.4\n/Encrypt 5 0 R\n%%EOF");
  const r = await checkDoc({ fileName: "x.pdf", mime: "application/pdf", base64: enc }, "cv", null);
  return !r.passed;
});

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  return new Uint8Array(await new Response(new Blob([data.slice()]).stream().pipeThrough(cs)).arrayBuffer());
}

/** Build a minimal .docx (zip) with one deflated word/document.xml. */
async function makeDocx(xml: string): Promise<Uint8Array> {
  const name = new TextEncoder().encode("word/document.xml");
  const raw = new TextEncoder().encode(xml);
  const comp = await deflateRaw(raw);
  const local = new Uint8Array(30 + name.length + comp.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(8, 8, true);
  lv.setUint32(18, comp.length, true);
  lv.setUint32(22, raw.length, true);
  lv.setUint16(26, name.length, true);
  local.set(name, 30);
  local.set(comp, 30 + name.length);
  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, 8, true);
  cv.setUint32(20, comp.length, true);
  cv.setUint32(24, raw.length, true);
  cv.setUint16(28, name.length, true);
  cv.setUint32(42, 0, true);
  central.set(name, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);
  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return out;
}

await t(".docx import: zip reader inflates word/document.xml (+ text flattening where DOMParser exists)", async () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const xml = `<w:document ${W}><w:body><w:p><w:r><w:t>Jane Doe</w:t></w:r></w:p><w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Built things</w:t></w:r></w:p></w:body></w:document>`;
  const docx = await makeDocx(xml);
  const entry = await unzipEntry(docx, "word/document.xml");
  eq(new TextDecoder().decode(entry ?? new Uint8Array()), xml);
  if (typeof DOMParser !== "undefined") eq(await docxToText(docx), "Jane Doe\n• Built things");
});

await t("multilingual normalisation (countries, yes/no, phone type)", () => {
  return (
    similarity("United Kingdom", "Vereinigtes Königreich") === 1 &&
    similarity("United States", "États-Unis") === 1 &&
    norm("Sí") === "yes" &&
    norm("Nein") === "no" &&
    similarity("Mobile", "Móvil") === 1 &&
    similarity("BSc", "Licenciatura") === 1
  );
});

await t("decline / sensitive / submit patterns in many languages", () => {
  const declines = ["I do not wish to answer", "Keine Angabe", "Je ne souhaite pas répondre", "Prefiero no responder", "Prefiro não responder", "Preferisco non rispondere", "Zeg ik liever niet", "Wolę nie odpowiadać"];
  const sensitive = ["Have you ever been convicted?", "Wurden Sie wegen einer Straftat verurteilt?", "Avez-vous un casier judiciaire ?", "¿Tiene antecedentes penales?"];
  const submits = ["Submit", "Absenden", "Soumettre", "Enviar", "Invia", "Verzenden", "Wyślij", "送信"];
  const notSubmit = ["Save and Continue", "Speichern und fortfahren", "Weiter", "Suivant", "Siguiente"];
  if (!declines.every((d) => DECLINE_RX.test(d))) throw new Error(declines.filter((d) => !DECLINE_RX.test(d)).join(", "));
  if (!sensitive.every((d) => SENSITIVE_RX.test(d))) throw new Error(sensitive.filter((d) => !SENSITIVE_RX.test(d)).join(", "));
  if (!submits.every((d) => SUBMIT_RX.test(d))) throw new Error(submits.filter((d) => !SUBMIT_RX.test(d)).join(", "));
  if (notSubmit.some((d) => SUBMIT_RX.test(d))) throw new Error("Next button matched as Submit: " + notSubmit.filter((d) => SUBMIT_RX.test(d)).join(", "));
  return !SENSITIVE_RX.test("Name der Firma");
});

await t("job-description language detection", () => {
  eq(
    ["We are looking for an engineer with experience in Python and the team will support you.", "Wir suchen eine Person mit Erfahrung und Kenntnisse in Python für unser Team und die Kunden.", "Nous recherchons une personne avec une expérience pour notre équipe et les clients.", "Buscamos una persona con experiencia para nuestro equipo y los clientes.", "経験のあるエンジニアを募集しています"].map(detectLanguage),
    ["en", "de", "fr", "es", "ja"]
  );
});

await t("experience buckets in several languages", () => {
  eq(bucketFor(4, ["0-2 years", "3-5 years", "6+ years"]), "3-5 years");
  eq(bucketFor(7, ["0 bis 2 Jahre", "3 bis 5 Jahre", "6 Jahre oder mehr"]), "6 Jahre oder mehr");
  eq(bucketFor(1, ["Moins de 2 ans", "2 à 5 ans", "Plus de 5 ans"]), "Moins de 2 ans");
  eq(bucketFor(8, ["Moins de 2 ans", "2 à 5 ans", "Plus de 5 ans"]), "Plus de 5 ans");
});

await t("years of experience with a named skill", () => yearsOfExperience(profile, "Years of experience with Python?") >= 6);

await t("generated passwords satisfy Workday policy", () => {
  for (let i = 0; i < 50; i++) {
    const p = generatePassword();
    if (!(p.length >= 16 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p))) throw new Error(p);
  }
});

console.log(`\n${passed}/${passed + failed} unit checks passed`);
if (failed) process.exit(1);
