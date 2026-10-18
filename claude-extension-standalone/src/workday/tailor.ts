/**
 * Built-in JD tailoring (optional — external tailoring tools plug in through
 * external.ts). Runs in extension pages. Two modes:
 *  - "llm": the model rewrites bullets/summary/skills/cover letter as JSON,
 *    then a deterministic no-fabrication check rejects anything not backed by
 *    the master profile.
 *  - "keyword": no model — reorder bullets and skills by JD keyword overlap.
 */
import { complete, parseJsonReply } from "../lib/api.js";
import type { JobPosting, Profile, TailoredContent } from "./types.js";
import { LANGUAGE_NAMES, STOPWORDS as STOP } from "./i18n.js";

function tokens(s: string): string[] {
  return s
    .replace(/[^\p{L}\p{N}_+#./ -]+/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[./-]+|[./-]+$/g, ""))
    .filter((t) => t.length > 1);
}

/** Top JD keywords: technical-looking terms and repeated 1–3 word phrases. */
export function extractKeywords(jd: string, limit = 40): string[] {
  const toks = tokens(jd);
  const counts = new Map<string, number>();
  const bump = (k: string, w: number) => counts.set(k, (counts.get(k) ?? 0) + w);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const lower = t.toLowerCase();
    if (STOP.has(lower)) continue;
    // Acronyms / CamelCase / C++ / Node.js look technical; German capitalises every noun, so don't count a lone capital.
    const technical = /\p{Lu}.*\p{Lu}|[+#.]|\d/u.test(t) || /^\p{Lu}\p{Ll}+\p{Lu}/u.test(t);
    bump(lower, technical ? 2 : 1);
    const t2 = toks[i + 1];
    if (t2 && !STOP.has(t2.toLowerCase())) bump(`${lower} ${t2.toLowerCase()}`, 1.5);
  }
  return [...counts.entries()]
    .filter(([k, v]) => v >= 2 && k.length > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

/** Language-independent terms (acronyms, CamelCase, C++, Node.js, versions) — safe to check across translation. */
export function technicalTerms(jd: string): string[] {
  const out = new Set<string>();
  for (const t of tokens(jd)) {
    if (/\p{Lu}.*\p{Lu}|[+#]|\.\p{L}|\d/u.test(t) || /^\p{Lu}\p{Ll}+\p{Lu}/u.test(t)) out.add(t.toLowerCase());
  }
  return [...out];
}

function profileText(p: Profile): string {
  return [
    p.summary,
    p.skills.join(" "),
    ...p.work.flatMap((w) => [w.title, w.company, ...w.bullets]),
    ...p.education.flatMap((e) => [e.degree, e.field, e.school]),
    ...p.certifications.map((c) => c.name),
  ]
    .join(" \n ")
    .toLowerCase();
}

function score(text: string, kws: string[]): number {
  const t = text.toLowerCase();
  return kws.reduce((s, k, i) => (t.includes(k) ? s + (kws.length - i) : s), 0);
}

export function keywordTailor(p: Profile, job: JobPosting, baseLetter = "", _lang = "en"): TailoredContent {
  const kws = extractKeywords(`${job.title}\n${job.description}`);
  const roles: Record<string, string[]> = {};
  for (const w of p.work) roles[w.id] = [...w.bullets].sort((a, b) => score(b, kws) - score(a, kws));
  const skills = [...p.skills].sort((a, b) => score(b, kws) - score(a, kws));
  const name = `${p.personal.firstName} ${p.personal.lastName}`.trim();
  const coverLetter =
    baseLetter.trim() ||
    `Dear Hiring Team,\n\nI am applying for the ${job.title} role (${job.reqId}). ${p.summary}\n\nIn my recent work as ${p.work[0]?.title ?? "a professional"} at ${p.work[0]?.company ?? "my current company"}, ${(roles[p.work[0]?.id ?? ""] ?? [])[0] ?? ""}\n\nI would welcome the chance to discuss how I can contribute.\n\nSincerely,\n${name}`;
  return { summary: p.summary, skills, roles, coverLetter, keywords: kws, warnings: [], method: "keyword" };
}

const SYSTEM = `You tailor a candidate's CV and cover letter to a job description for a Workday ATS application.
HARD RULES:
- The MASTER PROFILE is the only source of facts. Never add employers, titles, dates, degrees, certifications, tools, skills, metrics or numbers that are not in it.
- You may reorder, shorten and reword bullets, and use the job description's exact wording for things the profile already shows.
- Skills must be a subset of the profile's skills, ordered by relevance to the job.
- Keep every role; 3–6 bullets per role, each one line or two, starting with a strong verb, outcome first.
- Summary: 2–3 sentences around the job title and the top must-haves the candidate genuinely meets.
- Cover letter: 250–350 words, 3–4 paragraphs, plain text, no placeholders, signed with the candidate's name. If a BASE COVER LETTER is given, keep its voice and structure and adapt it to this job.
- LANGUAGE: write the summary, bullets and cover letter in the OUTPUT LANGUAGE given in the request (translate faithfully from the profile; keep product, tool and company names as they are). Skills keep the profile's exact wording.
Return ONLY JSON: {"summary": string, "skills": string[], "roles": {"<work id>": string[]}, "coverLetter": string}`;

interface LlmTailor {
  summary: string;
  skills: string[];
  roles: Record<string, string[]>;
  coverLetter: string;
}

/** Reject output that introduces facts absent from the profile. */
export function verifyNoFabrication(p: Profile, kws: string[], out: LlmTailor, jd = "", translating = false): TailoredContent {
  const src = profileText(p);
  const warnings: string[] = [];
  // When translating, ordinary JD words legitimately appear in the output, so only check language-independent terms.
  const unbacked = (translating ? technicalTerms(jd) : kws).filter((k) => !src.includes(k));
  const profileSkills = new Map(p.skills.map((s) => [s.toLowerCase(), s]));

  const skills = (out.skills ?? []).filter((s) => {
    const ok = profileSkills.has(String(s).toLowerCase());
    if (!ok) warnings.push(`Dropped skill not in your profile: ${s}`);
    return ok;
  });
  for (const s of p.skills) if (!skills.some((x) => x.toLowerCase() === s.toLowerCase())) skills.push(s);

  const roles: Record<string, string[]> = {};
  for (const w of p.work) {
    // Compare digits only, so "2,000" / "2.000" / "2 000" all match across locales.
    const digits = (t: string) => (t.match(/\d[\d,.\s]*%?/g) ?? []).map((n) => n.replace(/[^\d%]/g, "")).filter(Boolean);
    const origNums = new Set(digits(w.bullets.join(" ")));
    const proposed = Array.isArray(out.roles?.[w.id]) ? out.roles[w.id] : [];
    const kept = proposed.filter((b) => {
      const lower = String(b).toLowerCase();
      const badKw = unbacked.find((k) => lower.includes(k));
      const badNum = digits(String(b)).find((n) => !origNums.has(n));
      if (badKw || badNum) {
        warnings.push(`${w.company}: dropped a bullet that added "${badKw ?? badNum}" (not in your profile)`);
        return false;
      }
      return true;
    });
    roles[w.id] = kept.length >= Math.min(2, w.bullets.length) ? kept : w.bullets;
  }

  let summary = String(out.summary ?? "");
  const badSummary = unbacked.find((k) => summary.toLowerCase().includes(k));
  if (badSummary || !summary) {
    if (badSummary) warnings.push(`Summary mentioned "${badSummary}" (not in your profile); kept your original summary`);
    summary = p.summary;
  }
  let coverLetter = String(out.coverLetter ?? "");
  const badLetter = unbacked.filter((k) => coverLetter.toLowerCase().includes(k));
  if (badLetter.length) warnings.push(`Cover letter mentions ${badLetter.map((k) => `"${k}"`).join(", ")}, which your profile doesn't show — edit before approving`);
  if (/\[[A-Z][^\]]*\]/.test(coverLetter)) warnings.push("Cover letter still contains a [placeholder]");
  return { summary, skills, roles, coverLetter, keywords: kws, warnings, method: "llm" };
}

/** Output language for docs: the setting, or the job description's language when "auto". */
export function docLanguageFor(job: JobPosting, setting = "auto"): string {
  return setting && setting !== "auto" ? setting : job.language || "en";
}

export async function tailor(p: Profile, job: JobPosting, baseLetter = "", lang = docLanguageFor(job)): Promise<TailoredContent> {
  const kws = extractKeywords(`${job.title}\n${job.description}`);
  const prompt = `OUTPUT LANGUAGE: ${LANGUAGE_NAMES[lang] ?? lang}
JOB: ${job.title} (${job.reqId}) — ${job.location}
JOB DESCRIPTION:
"""${job.description.slice(0, 12000)}"""

MASTER PROFILE (JSON):
${JSON.stringify({ summary: p.summary, skills: p.skills, work: p.work, education: p.education, certifications: p.certifications, name: `${p.personal.firstName} ${p.personal.lastName}` })}
${baseLetter.trim() ? `\nBASE COVER LETTER:\n"""${baseLetter.slice(0, 6000)}"""\n` : ""}
Return the JSON now.`;
  try {
    const reply = await complete(prompt, { system: SYSTEM, json: true, maxTokens: 4000 });
    return verifyNoFabrication(p, kws, parseJsonReply<LlmTailor>(reply), job.description, lang !== "en");
  } catch (err) {
    const t = keywordTailor(p, job, baseLetter, lang);
    if (lang !== "en") t.warnings.push(`Without the AI, your CV content stays in its original language (job is in ${LANGUAGE_NAMES[lang] ?? lang}).`);
    t.warnings.push(`AI tailoring unavailable (${(err as Error).message}); used keyword ordering instead.`);
    return t;
  }
}

/* ---------------- CV text → structured profile ---------------- */

const PARSE_SYSTEM = `Convert the CV text into this exact JSON shape. Copy facts verbatim; never invent. Unknown fields = "" or [].
Dates as "YYYY-MM" (or "YYYY" if only the year is known). Most recent role first.
{"personal":{"firstName":"","lastName":"","email":"","phone":{"countryName":"","countryCode":"","number":"","deviceType":"Mobile"},"address":{"line1":"","line2":"","city":"","region":"","postalCode":"","country":""},"linkedin":"","website":"","github":""},
"summary":"","skills":[],"work":[{"id":"w1","title":"","company":"","location":"","start":"","end":"","current":false,"bullets":[]}],
"education":[{"id":"e1","school":"","degree":"","field":"","gpa":"","start":"","end":""}],
"certifications":[{"name":"","issuer":"","issued":""}],"languages":[{"language":"","proficiency":"","native":false}]}
Return ONLY the JSON.`;

export async function parseCvToProfile(cvText: string): Promise<Partial<Profile>> {
  const reply = await complete(`CV TEXT:\n"""${cvText.slice(0, 16000)}"""`, { system: PARSE_SYSTEM, json: true, maxTokens: 4000 });
  return parseJsonReply<Partial<Profile>>(reply);
}
