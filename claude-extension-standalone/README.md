# Claude Extension — Standalone

A **fully standalone** Chrome/Edge extension. It does **not** depend on the
Claude Cowork server or the Claude Code CLI — you can drop this folder into
its own repo, build it, and load it in the browser.

## About "no API key, no limits"

Full transparency, because this is the #1 question:

Anthropic does **not** offer a free, anonymous Claude API. To use the actual
Claude models from an extension you need **one** of:

| Mode | Needs an API key? | Limits? | Quality |
|------|-------------------|---------|---------|
| **Local model via Ollama** ← default | ❌ No | ❌ **None**, runs on your own machine | Open-source models (Llama 3.2, Qwen 2.5, Mistral, etc.) |
| **Claude.ai tab** | ❌ No (uses your existing Claude.ai login) | Yes — bound by your Claude.ai plan (Free / Pro / Max) | Real Claude, but the conversation happens on claude.ai |
| **Anthropic API** | ✅ Yes (your own key) | Your account's rate limits / quota | Real Claude, in-panel |

So: **the only mode that is genuinely "no key, zero limits" is Ollama running
a local model**, which is not a Claude model. That's a hardware reality, not a
choice. The extension ships with Ollama as the default because it's the only
setup that truly matches "never runs out, no key". The other two modes are
there for when you want real Claude.

## Install the extension

**Fast path — no build needed.** This repo ships a pre-built `dist/` folder.

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select `claude-extension-standalone/dist`.
4. Pin the extension to the toolbar.

> Select the `dist` folder, **not** `claude-extension-standalone` itself.
> The top-level folder contains TypeScript source that Chrome cannot load directly —
> that's the cause of "Could not load icon 'icons/icon-16.png'" errors.

### Rebuild from source (optional)

If you edit the code, rebuild with:

```bash
cd claude-extension-standalone
pnpm install --ignore-workspace   # or: npm install
pnpm build                        # or: npm run build
```

Then click the reload button on `chrome://extensions`.

Icons live in `icons/` (`icon-16.png`, `icon-32.png`, `icon-48.png`,
`icon-128.png`). Replace them with your own before building if you want a
different glyph.

## First run — pick your backend

Click the extension icon → **Settings** (or go to options), then pick a backend:

### A. Local model (Ollama) — default, truly unlimited

```bash
# install Ollama once:
# macOS/Linux:   curl -fsSL https://ollama.com/install.sh | sh
# or download:   https://ollama.com/download

ollama serve                    # starts the local API on 127.0.0.1:11434
ollama pull llama3.2            # one-time model download (~2 GB)
```

That's it. The extension talks to `http://127.0.0.1:11434` and runs the model
on your hardware. Everything stays on your machine. No key. No quota.

Other good Ollama models already listed in the dropdown:
- `llama3.1:8b`
- `qwen2.5:7b`
- `qwen2.5-coder:7b` (for coding tasks)
- `mistral:latest`
- `phi3:mini` (tiny, very fast)

Or add any model you've pulled via the "Add a custom Ollama model" field.

### B. Claude.ai tab — no key, uses your Claude.ai plan

Set backend to **Claude.ai tab**. When you ask something, the extension
opens `https://claude.ai/new?q=...` in a new tab with your prompt + page
context pre-filled. The conversation continues inside Claude.ai, tied to
whatever plan you're logged in with. This doesn't require an API key, but
usage is whatever your Claude.ai plan allows.

### C. Anthropic API — BYO key

Set backend to **Anthropic API**, paste your key, pick a model (Opus 4.6,
Sonnet 4.6, Haiku 4.5, etc.). Replies stream into the side panel.

## Features

- **Side panel** with presets: Summarize, Explain, Rewrite, Extract, Translate, Q&A.
- **Popup** for quick asks.
- **Options page** — backend + model picker, Ollama health check, history (200 entries), per-host disable list, system-prompt addendum.
- **Context menu** (right-click) — Summarize page, Explain selection, Rewrite selection, Extract structured data.
- **Keyboard commands** — `Ctrl/Cmd+E` toggles the side panel; `Ctrl/Cmd+Shift+S` summarizes the page.
- **Page reader** — URL + title + selection + 20k-char cleaned text snapshot injected into the system prompt.
- **Replace selection in place** — Claude's reply can overwrite the page's selected text (content script).
- **Zero-install path** — with Ollama running, everything works without signing up for anything.
- **Workday autopilot** — signs in or creates the employer account, fills every application page, uploads your
  tailored CV / cover letter, answers screening questions, and stops on Review. See below.

## Workday autopilot

Works on any employer's Workday careers site (`*.myworkdayjobs.com`, `*.myworkdaysite.com`, `*.myworkday.com`).

**Flow:** job posting → capture JD → get tailored CV + cover letter → Apply → *Autofill with Resume* →
sign in / create account → resume upload → My Information → My Experience → Application Questions →
Voluntary Disclosures → Self Identify → **Review (stops — you click Submit)** → submission logged to your tracker.

### Set up once (Settings → Workday · Autopilot)

1. **Your documents** — paste the Google Docs link of your CV and cover letter (or upload a `.docx` / `.pdf`).
   The CV is exported as PDF for uploads; its text feeds the profile and tailoring. The cover letter becomes the
   base voice for every tailored letter. Google Docs import uses the Google account signed in to this browser.
2. **Build profile from my CV** (AI) → check the JSON (dates as `YYYY-MM`) → **Save profile**.
3. **Screening answers** — work authorisation countries, sponsorship, salary, notice period, how-you-heard.
   **Voluntary self-ID** defaults to "decline to answer".
4. **Accounts** — optionally one password for every Workday tenant; otherwise a strong password is generated
   per employer and stored AES-GCM-encrypted (non-extractable key) on this device.
5. **Consents** — tick once if you want the autopilot to tick Workday's account-terms and disclosure-terms boxes.

### Use your own tailoring software

The autopilot doesn't care where documents come from. Per job, in the side panel's **Workday autopilot** tab:

- **Get from my tailoring tool** — set a URL in settings; the extension POSTs
  `{ job: { reqId, title, location, description, language, url, … }, candidate: { name, email } }` and accepts
  `{ cv: DocRef, coverLetter?: DocRef, coverLetterText?: string }`, where `DocRef` is
  `{ fileName, base64 }`, `{ url }`, or `{ googleDocUrl }`. Optional bearer token; optional auto-request on capture.
- **Local app hook** — an app on `http://localhost` / `127.0.0.1` can call
  `chrome.runtime.sendMessage(EXTENSION_ID, { type: "wd:getCurrentJob" })` and
  `{ type: "wd:attachDocs", jobKey: "current", cv, coverLetter?, coverLetterText? }`.
- **Attach manually** — a Google Docs link or a `.pdf` / `.docx` file.
- **Built-in tailoring** (fallback) — rewrites your bullets / summary / skills / cover letter to the JD with a
  deterministic no-fabrication check (drops invented skills, tools and numbers), rendered as ATS-safe PDFs.

Every document passes a **Workday compatibility check** before upload: file type and 5 MB limit, encrypted or
image-only PDFs, tables / text boxes / columns / contact details in headers (DOCX), standard headings, dates,
and JD keyword coverage. With approval required (default), nothing is uploaded until you click **Approve**.

### Languages

Job listings and forms in English, German, French, Spanish, Portuguese, Italian, Dutch and Polish (plus common
Japanese / Chinese strings): page detection, buttons, Yes/No options, country names, "decline to answer" options,
experience buckets, sensitive-question detection and submit detection are all localised. The JD language is
auto-detected, and tailored documents are written in it by default (setting: *Language of tailored CV / cover
letter*). Localised option lists that don't fuzzy-match (e.g. "Computer Science" vs "Informatik") are mapped by the
AI when AI answers are on — only to an option that exists — or left for you. The built-in PDF can't embed CJK
fonts, so for Japanese / Chinese jobs attach docs from your own tool.

### What it will never do

- Click **Submit** (in any language). You review and submit.
- Guess legal / attestation / criminal-history / conflict-of-interest questions, or EEO answers — those come only
  from your saved choices, or it pauses and asks. Answers you give when it pauses are saved for next time.
- Bypass CAPTCHAs or email verification — it pauses for you.
- Retry a failed sign-in more than twice (no account lockouts).

### Tests

```bash
npm run test:unit   # tailoring, no-fabrication, PDF, DOCX unzip, i18n, buckets, passwords
npm run test:e2e    # real extension in Chromium against a mock Workday tenant (English + German)
```

## Privacy

- **Ollama mode** — nothing leaves your machine.
- **Claude.ai mode** — your prompt is URL-encoded into a new claude.ai tab. Subject to Claude.ai's privacy policy.
- **Anthropic mode** — calls go directly from your browser to `api.anthropic.com`. Subject to Anthropic's privacy policy. The "dangerous direct browser access" header is set because the extension is an untrusted origin — if you're uncomfortable with that, use a small proxy or Ollama.

## Layout

```
claude-extension-standalone/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── icons/                    ← drop PNGs here before build
├── src/
│   ├── background/service-worker.ts   ← LLM relay, credential vault, external-tool hooks
│   ├── content/content-script.ts
│   ├── content/workday.ts            ← Workday content script (all frames on Workday hosts)
│   ├── workday/                      ← autopilot: detect, controls, auth, steps, engine, tailoring, PDF, i18n
│   ├── shared-ui/styles.css
│   ├── shared/
│   │   ├── models.ts         ← all Ollama / Claude.ai / Anthropic model entries
│   │   └── prompts.ts
│   ├── lib/
│   │   ├── api.ts            ← dispatcher for the three backends
│   │   ├── page-reader.ts
│   │   └── storage.ts
│   ├── popup/
│   ├── sidepanel/            ← Chat + Workday autopilot tabs
│   └── options/              ← settings incl. Workday profile, documents, accounts
├── test/                     ← unit + Workday end-to-end tests
└── README.md
```

## License

MIT.
