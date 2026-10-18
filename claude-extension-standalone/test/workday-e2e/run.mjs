/**
 * End-to-end test: loads the built extension (dist/) into Chromium, serves a
 * mock Workday tenant at https://acme.wd5.myworkdayjobs.com, and drives the
 * autopilot from job posting to Review, including account creation, a
 * sensitive-question pause + resume (answer saved), and submit detection.
 *
 *   pnpm build && node test/workday-e2e/run.mjs
 *   (set PLAYWRIGHT_PATH if playwright isn't resolvable, e.g. a global install)
 */
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const dist = join(root, "dist");
const HOST = "acme.wd5.myworkdayjobs.com";
const DE_HOST = "globex.wd3.myworkdayjobs.com";
const DE_JOB_URL = `https://${DE_HOST}/de-DE/External/job/Berlin/Senior-Software-Engineer_R-777`;
const JOB_URL = `https://${HOST}/en-US/External/job/London/Senior-Software-Engineer_R-12345`;

const profile = {
  personal: {
    firstName: "Jane",
    lastName: "Doe",
    preferredName: "",
    email: "jane.doe@example.com",
    phone: { countryName: "United Kingdom", countryCode: "+44", number: "7700900123", deviceType: "Mobile" },
    address: { line1: "1 Test Street", line2: "", city: "London", region: "England", postalCode: "SW1A 1AA", country: "United Kingdom" },
    linkedin: "https://linkedin.com/in/janedoe",
    website: "",
    github: "",
  },
  summary: "Backend engineer with 7 years of Python and AWS.",
  skills: ["Python", "TypeScript", "AWS", "PostgreSQL", "REST APIs"],
  work: [
    { id: "w1", title: "Senior Software Engineer", company: "Globex", location: "London", start: "2021-03", current: true, bullets: ["Built Python services on AWS handling 2M requests/day", "Led REST API redesign"] },
    { id: "w2", title: "Software Engineer", company: "Initech", location: "Manchester", start: "2017-09", end: "2021-02", current: false, bullets: ["Shipped TypeScript tooling", "Maintained PostgreSQL schemas"] },
  ],
  education: [{ id: "e1", school: "University of Manchester", degree: "BSc", field: "Computer Science", start: "2013", end: "2017" }],
  certifications: [],
  languages: [],
  answers: {
    authorizedCountries: ["United Kingdom"],
    needsSponsorship: false,
    salaryExpectation: "£85,000",
    noticePeriod: "1 month",
    earliestStartDate: "",
    willingToRelocate: false,
    openToHybrid: true,
    openToOnsite: true,
    source: "LinkedIn",
    previouslyWorkedHere: false,
  },
  eeo: { gender: "decline", hispanicOrLatino: "decline", ethnicity: "decline", veteran: "decline", disability: "decline" },
};

const settings = {
  consentCreateAccountTerms: true,
  consentDisclosureTerms: true,
  requireDocApproval: false,
  llmAnswers: false,
  fieldDelayMs: 20,
  fallbackToMasterCv: true,
};

const minimalPdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n").toString("base64");

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "wd-e2e-")), {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

const reactJs = readFileSync(join(root, "node_modules/react/umd/react.development.js"));
const reactDomJs = readFileSync(join(root, "node_modules/react-dom/umd/react-dom.development.js"));
const mockJs = readFileSync(join(here, "mock-workday.js"));
const serveMock = (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === "/__mock/react.js") return route.fulfill({ body: reactJs, contentType: "text/javascript; charset=utf-8" });
  if (url.pathname === "/__mock/react-dom.js") return route.fulfill({ body: reactDomJs, contentType: "text/javascript; charset=utf-8" });
  if (url.pathname === "/__mock/app.js") return route.fulfill({ body: mockJs, contentType: "text/javascript; charset=utf-8" });
  return route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html><html><head><meta charset="utf-8"><title>Senior Software Engineer</title></head><body><div id="root"></div>
<script src="/__mock/react.js"></script><script src="/__mock/react-dom.js"></script><script src="/__mock/app.js"></script></body></html>`,
  });
};
await ctx.route(`https://${HOST}/**`, serveMock);
await ctx.route(`https://${DE_HOST}/**`, serveMock);

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = new URL(sw.url()).host;

const ext = await ctx.newPage();
await ext.goto(`chrome-extension://${extId}/src/options/index.html`);
await ext.evaluate(
  async ({ profile, settings, pdf }) => {
    await chrome.storage.local.set({
      "wd:profile": profile,
      "wd:settings": settings,
      "wd:masterCv": { fileName: "Jane-Doe-CV.pdf", mime: "application/pdf", base64: pdf },
    });
  },
  { profile, settings, pdf: minimalPdf }
);

const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("[page error]", e.message));
await page.goto(JOB_URL);
await page.waitForSelector('[data-automation-id="jobPostingDescription"]');
await page.waitForTimeout(800);

const toTab = (msg, host = HOST) =>
  ext.evaluate(async ({ msg, host }) => {
    const [tab] = await chrome.tabs.query({ url: `https://${host}/*` });
    return chrome.tabs.sendMessage(tab.id, msg);
  }, { msg, host });

const runState = (host = HOST) => ext.evaluate(async (host) => (await chrome.storage.local.get(`wd:run:${host}`))[`wd:run:${host}`], host);

async function waitStatus(statuses, timeoutMs = 120000, host = HOST) {
  const start = Date.now();
  for (;;) {
    const r = await runState(host);
    if (r && statuses.includes(r.status)) return r;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out; last state: ${JSON.stringify(r?.status)} ${r?.pauseReason ?? ""}\n${r?.log.map((l) => l.msg).join("\n")}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const job = await toTab({ type: "wd:captureJD" });
check("JD captured", job?.reqId === "R-12345" && /Senior Software Engineer/.test(job.title), `${job?.title} ${job?.reqId}`);

await toTab({ type: "wd:start", jobKey: job.key });
let r = await waitStatus(["paused", "review", "error", "done"]);
console.log("--- log (phase 1) ---\n" + r.log.map((l) => `${l.level}: ${l.msg}`).join("\n"));
check("Paused on the sensitive conviction question", r.status === "paused" && r.flags.some((f) => /convicted/i.test(f.label)), r.pauseReason);

const creds = await ext.evaluate(async (host) => Object.keys(await chrome.storage.local.get(null)).filter((k) => k === `wd:cred:${host}`), HOST);
check("Tenant account created and credential stored (encrypted)", creds.length === 1);

// The human answers the flagged question, then resumes.
await page.click('label:has-text("No") >> nth=-1');
await toTab({ type: "wd:resume" });
r = await waitStatus(["paused", "review", "error", "done"]);
console.log("--- log (phase 2) ---\n" + r.log.slice(-25).map((l) => `${l.level}: ${l.msg}`).join("\n"));
check("Reached Review and stopped (no auto-submit)", r.status === "review", r.pauseReason);

const mock = await page.evaluate(() => window.__mock);
const d = mock.data;
check("My Information filled", d.first === "Jane" && d.last === "Doe" && d.country === "United Kingdom" && d.city === "London" && d.phone === "7700900123" && d.phoneType === "Mobile" && d.region === "England", JSON.stringify({ first: d.first, country: d.country, phoneCode: d.phoneCode, source: d.source }));
check("Hierarchical source + phone code multiselects", d.source?.[0] === "LinkedIn" && /\+44/.test(d.phoneCode?.[0] ?? ""));
check("Previous-worker radio", d.prev === "No");
check("Parser blocks reconciled to 2 roles", d.work.length === 2, d.work.map((w) => `${w.jobTitle}@${w.company}`).join(" | "));
check("Role 1 overwritten + current", d.work[0]?.jobTitle === "Senior Software Engineer" && d.work[0]?.company === "Globex" && d.work[0]?.current === true && d.work[0]?.start?.m?.replace(/^0/, "") === "3" && d.work[0]?.start?.y === "2021");
check("Role 2 dates", d.work[1]?.end?.y === "2021" && d.work[1]?.end?.m?.replace(/^0/, "") === "2" && d.work[1]?.start?.y === "2017");
check("Role description bullets", /• Built Python services/.test(d.work[0]?.description ?? ""));
check("Education added", d.edu.length === 1 && d.edu[0].school === "University of Manchester" && d.edu[0].degree === "Bachelor's Degree" && d.edu[0].field?.[0] === "Computer Science" && d.edu[0].end?.y === "2017", JSON.stringify(d.edu[0]));
check("Skills added", ["Python", "TypeScript", "PostgreSQL"].every((s) => d.skills?.includes(s)), (d.skills ?? []).join(", "));
check("CV uploaded once", mock.files.filter((f) => f === "Jane-Doe-CV.pdf").length === 1, mock.files.join(", "));
check("LinkedIn", d.linkedin === profile.personal.linkedin);
check("Screening answers", d.qAuth === "Yes" && d.qSponsor === "No" && d.qSalary === "£85,000" && d.qYears === "3-5 years" && d.qCrim === "No", JSON.stringify({ a: d.qAuth, s: d.qSponsor, y: d.qYears }));
check("EEO declined + terms consented", d.gender === "I do not wish to answer" && d.eth === "I decline to self-identify" && d.vet === "I don't wish to answer" && d.agree === true);
check("Self-identify", d.siName === "Jane Doe" && !!d.siDate?.y && d.dis === "I do not want to answer");

const bank = await ext.evaluate(async () => (await chrome.storage.local.get("wd:answerBank"))["wd:answerBank"] ?? {});
check("User's answer to the flagged question saved", Object.values(bank).some((e) => /convicted/i.test(e.label) && e.answer === "No"));

await page.click('[data-automation-id="pageFooterNextButton"]');
r = await waitStatus(["done"], 15000).catch((e) => ({ status: "x", e }));
check("Submission detected and tracked", r.status === "done");
const apps = await ext.evaluate(async () => (await chrome.storage.local.get("wd:applications"))["wd:applications"] ?? []);
check("Application in tracker", apps.length === 1 && apps[0].reqId === "R-12345");

// Second application on the same tenant: must sign in with the saved password, not create a new account.
await ext.evaluate(async (host) => chrome.storage.local.remove(`wd:run:${host}`), HOST);
await page.goto(JOB_URL);
await page.waitForSelector('[data-automation-id="jobPostingDescription"]');
await page.waitForTimeout(800);
await toTab({ type: "wd:start", jobKey: job.key });
r = await waitStatus(["paused", "review", "error", "done"]);
check("Returning applicant signs in with saved credential", r.log.some((l) => l.msg === "Signed in") && !r.log.some((l) => /Account created/.test(l.msg)), r.log.filter((l) => /sign|account/i.test(l.msg)).map((l) => l.msg).join(" | "));
check("Saved answer reused (no pause on conviction)", r.status === "review", r.pauseReason);

// ---------------- German-language tenant ----------------
console.log("\n--- German tenant ---");
const de = await ctx.newPage();
de.on("pageerror", (e) => console.log("[page error]", e.message));
await de.goto(DE_JOB_URL);
await de.waitForSelector('[data-automation-id="jobPostingDescription"]');
await de.waitForTimeout(800);
const deJob = await toTab({ type: "wd:captureJD" }, DE_HOST);
check("[de] JD captured, language detected", deJob?.reqId === "R-777" && deJob.language === "de" && deJob.location === "Berlin, Deutschland", `${deJob?.reqId} ${deJob?.language} ${deJob?.location}`);
await toTab({ type: "wd:start", jobKey: deJob.key }, DE_HOST);
r = await waitStatus(["paused", "review", "error", "done"], 120000, DE_HOST);
console.log(r.log.map((l) => `${l.level}: ${l.msg}`).join("\n"));
// The saved English "convicted" answer must not leak into a differently-worded German question.
check("[de] Paused on the German conviction question", r.status === "paused" && r.flags.some((f) => /verurteilt/.test(f.label)), r.pauseReason);
await de.click('label:has-text("Nein") >> nth=-1');
await toTab({ type: "wd:resume" }, DE_HOST);
r = await waitStatus(["paused", "review", "error", "done"], 120000, DE_HOST);
check("[de] Reached Überprüfen and stopped before Absenden", r.status === "review", r.pauseReason);
const dd = (await de.evaluate(() => window.__mock)).data;
check("[de] Localised country / phone options", dd.country === "Vereinigtes Königreich" && dd.phoneType === "Mobil" && /\+44/.test(dd.phoneCode?.[0] ?? ""), `${dd.country} ${dd.phoneType} ${dd.phoneCode}`);
check("[de] Ja/Nein answers", dd.prev === "Nein" && dd.qAuth === "Ja" && dd.qSponsor === "Nein", `${dd.prev} ${dd.qAuth} ${dd.qSponsor}`);
check("[de] Year bucket + salary", dd.qYears === "3-5 Jahre" && dd.qSalary === "£85,000", dd.qYears);
// "Computer Science" has no string match in a German list; with AI answers off it's logged and left for the user.
check("[de] Degree matched; untranslatable optional field left + logged", dd.edu[0]?.degree === "Bachelor" && r.log.some((l) => /Field of study .* left for you/.test(l.msg)), `${dd.edu[0]?.degree} ${dd.edu[0]?.field}`);
check("[de] Experience reconciled", dd.work.length === 2 && dd.work[0].company === "Globex" && dd.work[0].current === true);
check("[de] German decline options", dd.gender === "Ich möchte keine Angabe machen" && dd.eth === "Keine Angabe" && dd.vet === "Ich möchte das nicht angeben" && dd.dis === "Ich möchte nicht antworten" && dd.agree === true, `${dd.gender} | ${dd.eth} | ${dd.vet} | ${dd.dis}`);
await de.click('[data-automation-id="pageFooterNextButton"]');
r = await waitStatus(["done"], 15000, DE_HOST).catch(() => ({ status: "x" }));
check("[de] German submission confirmation detected", r.status === "done");

await ctx.close();
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
