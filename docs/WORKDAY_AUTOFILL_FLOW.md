# Workday ATS — Page Flow for Multi-Page Autofill + JD-Tailored CV / Cover Letter

> **Implemented** in `claude-extension-standalone/src/workday/` (see that package's README → *Workday autopilot*).
> End-to-end tested against a mock tenant in English and German: `npm run test:e2e`.

A reference spec for driving a Workday application (`*.myworkdayjobs.com`,
`*.wd{1..12}.myworkdayjobs.com`, `*.myworkdaysite.com`) from the browser
extension: detect the current step, fill it, advance, recover from errors, and
stop at Review for a human to submit.

> **Reality check.** Workday is a single-page React app configured per tenant.
> Every employer can add, remove, rename or reorder steps and questions, and
> Workday ships UI updates several times a year. Nothing fills every tenant
> "perfectly always". What *does* hold up is the design below: detect each step
> by what's on screen (never by step number), select on `data-automation-id`
> with a label-text fallback, check every write, and hand anything unknown to the
> user instead of guessing. Selectors listed here are the commonly seen ones;
> check them against a live tenant before you rely on them.

---

## 1. The whole flow at a glance

```
Job posting page
   │  scrape JD (title, req ID, location, description)  ──► TAILOR (CV + cover letter)
   ▼
[Apply] ─► Apply-method modal
   │        ├─ "Autofill with Resume"   ◄── preferred (upload TAILORED CV)
   │        ├─ "Apply Manually"
   │        └─ "Use My Last Application"
   ▼
Auth: Sign In / Create Account (one account per tenant, + email verification)
   ▼
┌──────────────── Application wizard (progress bar at top) ────────────────┐
│ 1 My Information        → name, address, phone, email, "how did you hear" │
│ 2 My Experience         → work history, education, skills, CV, links      │
│ 3 Application Questions → tenant-specific screening Qs (1–3 pages)        │
│ 4 Voluntary Disclosures → EEO: gender, ethnicity, veteran, T&C checkbox    │
│ 5 Self Identify         → disability form (US, CC-305)                     │
│ 6 Review                → read-only summary ─► STOP, human clicks Submit   │
└──────────────────────────────────────────────────────────────────────────┘
```

Steps 3–5 may be missing, merged, renamed or repeated. Always run the
**generic page loop** (section 4) rather than a fixed sequence.

---

## 2. Phase 0 — before touching the form: capture the JD and tailor

Run this on the job posting page, **before** clicking Apply, so the tailored CV
is ready for the upload that pre-fills step 2.

### 2.1 Scrape the JD

| Field          | Selector (primary → fallback)                                          |
|----------------|-------------------------------------------------------------------------|
| Job title      | `[data-automation-id="jobPostingHeader"]` → `h2`, `h1`                   |
| Description    | `[data-automation-id="jobPostingDescription"]` → longest text block      |
| Location       | `[data-automation-id="locations"]`                                      |
| Req ID         | `[data-automation-id="requisitionId"]`                                  |
| Time type      | `[data-automation-id="time"]`                                           |
| Posted date    | `[data-automation-id="postedOn"]`                                       |

Store it as `{ tenant, reqId, title, location, descriptionText, url }`, keyed by
`tenant + reqId`, so later pages (and a resumed session) can find it.

### 2.2 Tailor: what helps with Workday specifically

Workday parses the uploaded CV into structured fields, and recruiters search
and filter on those fields (and, where the employer enables it, on Workday's
skills matching). So tailoring works on two levels: a CV that **parses
cleanly**, and **wording that matches** the JD.

**Parse-safe CV format (do this every time):**
- Upload a `.docx` or a text-based PDF. No scanned images, text boxes, tables,
  multi-column layouts, or headers and footers that hold contact details.
- Standard section headings: `Experience`, `Education`, `Skills`,
  `Certifications`.
- One role per block, laid out as: **Job Title — Company — City, Country —
  MM/YYYY – MM/YYYY**. Workday's date parser handles `MM/YYYY` best.
- Contact line at the top as plain text: name, email, phone with country code,
  city, LinkedIn URL.
- File name like `Firstname-Lastname-<Role>-CV.pdf`. Recruiters see it.

**Matching the JD (an LLM step with hard rules):**
1. Pull out of the JD: must-have skills, nice-to-haves, tools, certifications,
   seniority signals, and the 5–10 phrases that repeat most.
2. Score each existing bullet in the master CV against them, then reorder the
   bullets and pick the top N per role.
3. Rewrite bullets to use the JD's **exact terms where they're true** (for
   example "Kubernetes", not "container orchestration", if that's the JD's word),
   and lead with outcomes and numbers.
4. Rewrite the summary (2–3 lines) around the job title and the top 3 must-haves.
5. Rebuild `Skills` in JD order, using only skills the master profile has.
6. **Never invent** employers, titles, dates, degrees, certifications or skills.
   The tailoring prompt must name the master profile as the only source of
   facts and reject any output that adds an entity not in it. Fabrication is
   dishonest, and it fails background checks and interviews.
7. Cover letter: 250–350 words. Paragraph 1 names the role, req ID and the
   hook. Paragraph 2 gives 2–3 proof points mapped to the JD's must-haves.
   Paragraph 3 says why this company and closes. Plain text, so it survives a
   paste into a textarea.

Output: `tailored-cv.pdf` (or `.docx`), `cover-letter.pdf`, and
`cover-letter.txt` for textarea questions. Show them to the user to approve
**before** the application starts.

---

## 3. Phase 1 — entry and authentication

### 3.1 Apply button and method modal

| Action                  | Selector                                                         |
|-------------------------|------------------------------------------------------------------|
| Apply                   | `[data-automation-id="adventureButton"]` → button with text `Apply` |
| Autofill with Resume    | `[data-automation-id="autofillWithResume"]`                      |
| Apply Manually          | `[data-automation-id="applyManually"]`                           |
| Use My Last Application | `[data-automation-id="useMyLastApplication"]`                    |

**Choose "Autofill with Resume"** and upload the *tailored* CV. Workday then
pre-fills My Experience from it. The page loop still **checks every parsed
field against the canonical profile and overwrites it**, because the parser
regularly mangles dates, splits roles, and drops descriptions.

Avoid "Use My Last Application" when you're tailoring: it reuses the previous
CV and answers.

### 3.2 Sign in / create account

Every tenant has its own account store, so the same email needs a separate
account at each employer.

| Element             | Selector                                              |
|---------------------|-------------------------------------------------------|
| Email               | `[data-automation-id="email"]`                        |
| Password            | `[data-automation-id="password"]`                     |
| Verify password     | `[data-automation-id="verifyPassword"]`               |
| Create-account box  | `[data-automation-id="createAccountCheckbox"]`        |
| Create account btn  | `[data-automation-id="createAccountSubmitButton"]`    |
| Sign-in btn         | `[data-automation-id="signInSubmitButton"]`           |
| Switch to sign-in   | `[data-automation-id="signInLink"]`                   |
| Switch to create    | `[data-automation-id="createAccountLink"]`            |

Flow:
1. Try sign-in first with the tenant's stored credentials.
2. If there's no account, create one with a password generated for that tenant,
   kept in extension storage (`chrome.storage.local`, encrypted).
3. If Workday asks for email verification, **pause** and show "Verify your
   email, then click Continue". Don't scrape the user's inbox without explicit
   opt-in.
4. If a CAPTCHA appears, **pause for the human**. Never try to bypass it.

Note: the submit "button" is sometimes a `div[role=button]` covered by a
click-filter overlay. Dispatch the click on the element that
`document.elementFromPoint` returns at the button's center.

---

## 4. The generic page loop (the core engine)

Every wizard page goes through the same state machine:

```
          ┌──────────────────────────────────────────────────────┐
          ▼                                                      │
  WAIT_STABLE ─► DETECT_STEP ─► FILL ─► VERIFY ─► NEXT ─► WAIT_TRANSITION
                    │                     │          │            │
                    │ Review              │ invalid  │ errors     │ same step
                    ▼                     ▼          ▼            ▼
                 STOP (human)        RETRY ≤2   FIX_ERRORS   (validation failed:
                                     else ASK   then VERIFY   back to FIX_ERRORS)
```

### 4.1 WAIT_STABLE
Workday renders asynchronously. A page counts as ready when:
- no `[data-automation-id="loadingSpinner"]` / `[role="progressbar"]` is
  visible, **and**
- a `MutationObserver` on `main` (or `body`) has seen no mutations for
  **600 ms**, **and**
- the footer Next/Submit button exists.

Hard timeout: 20 s, then ask the user.

### 4.2 DETECT_STEP (by content, never by index)
Read, in order:
1. The active progress step: `[data-automation-id="progressBarActiveStep"]`
   (its text is the step name).
2. The page heading: `h2` / `[data-automation-id="pageHeader"]`.
3. Fingerprints, when the tenant has renamed the step:

| Step                   | Fingerprint selectors (any match)                                              |
|------------------------|---------------------------------------------------------------------------------|
| My Information         | `legalNameSection_firstName`, `addressSection_city`, `phone-number`              |
| My Experience          | `workExperienceSection`, `educationSection`, `file-upload-input-ref`             |
| Application Questions  | `primaryQuestionnaire`, `secondaryQuestionnaire`, many `formField-*` with long labels |
| Voluntary Disclosures  | `gender`, `ethnicityDropdown`, `veteranStatus`, `agreementCheckbox`               |
| Self Identify          | `selfIdentifiedDisabilityData`, `disabilityStatus`, `dateSignedOn`               |
| Review                 | no editable inputs + footer button text is `Submit`                              |

Unknown step → use the **generic question filler** (4.6).

### 4.3 NEXT
- Primary: `[data-automation-id="pageFooterNextButton"]`
- Older tenants: `[data-automation-id="bottom-navigation-next-button"]`
- Fallback: a footer button whose text is `Save and Continue` / `Next` /
  `Continue`.
- **Never** click a button whose text is `Submit`. That means Review: stop.

### 4.4 WAIT_TRANSITION
After the click, wait for one of:
- the active progress step text changes → success, back to WAIT_STABLE.
- `[data-automation-id="errorBanner"]` or any `[data-automation-id="errorMessage"]`
  appears → FIX_ERRORS.
- 15 s with no change → re-detect; if still the same step, ask the user.

### 4.5 FIX_ERRORS
The error banner lists the failing fields as links. Click each one, which
scrolls to and focuses the field. Resolve the field's label, re-run the
matching filler, and VERIFY again. After 2 failed attempts on the same field,
highlight it and ask the user.

### 4.6 Generic question filler
For each `[data-automation-id^="formField-"]` container:
1. Resolve the label: `label[for]`, `legend`, or `aria-labelledby`. Strip the
   trailing `*`.
2. Classify the control (see section 6): text, textarea, dropdown button,
   multiselect search, radio group, checkbox, date, or file.
3. Find an answer in this order: **saved answer bank** (normalized label →
   answer, built from earlier applications) → **profile mapping** →
   **LLM with the JD, profile and allowed options as context** (it must pick
   one of the listed options and never write free text into a select).
4. Low confidence, or a legal or attestation question → leave it blank and
   flag it for the user.
5. Save every answer the user confirms to the answer bank.

---

## 5. Step-by-step field maps

All selectors are `[data-automation-id="…"]` unless noted.

### Step 1 — My Information

| Profile field          | automation-id                                       | Control  |
|------------------------|-----------------------------------------------------|----------|
| How did you hear       | `sourceDropdown` / `formField-sourceDropdown`         | multiselect search (`searchBox`) |
| Previously worked here | `previousWorker` (radio: Yes/No)                     | radio    |
| Country                | `countryDropdown`                                   | dropdown (**fill first**: it re-renders the address and phone fields) |
| First name             | `legalNameSection_firstName`                        | text     |
| Last name              | `legalNameSection_lastName`                         | text     |
| Preferred name toggle  | `preferredNameCheckbox`                              | checkbox |
| Address line 1         | `addressSection_addressLine1`                       | text     |
| City                   | `addressSection_city`                               | text     |
| State / Region         | `addressSection_countryRegion`                      | dropdown |
| Postal code            | `addressSection_postalCode`                         | text     |
| Phone device type      | `phone-device-type`                                 | dropdown |
| Country phone code     | `countryPhoneCode`                                  | multiselect search |
| Phone number           | `phone-number`                                      | text (national number only, no `+44`) |
| Extension              | `phone-extension`                                   | text     |
| Email                  | `email` (often pre-filled and locked)                | text     |

**Order matters:** Country → wait for the re-render (WAIT_STABLE) → name →
address → phone code → phone.

### Step 2 — My Experience

| Section             | Add button                                      | Fields inside each repeated block |
|---------------------|-------------------------------------------------|-----------------------------------|
| Work Experience     | `Add` inside `workExperienceSection` (`add-button`) | `jobTitle`, `company`, `location`, `currentlyWorkHere` (checkbox), `dateSectionMonth-input` / `dateSectionYear-input` (from and to), `description` |
| Education           | `Add` inside `educationSection`                 | `school` (search), `degree` (dropdown), `fieldOfStudy` (search), `gradeAverage`, dates |
| Certifications      | `Add` inside `certificationsSection`            | `certification`, `issuedDate`, `expirationDate` |
| Languages           | `Add` inside `languageSection`                  | `language`, `nativeLanguage`, proficiency dropdowns |
| Skills              | —                                               | `formField-skills` multiselect: type → wait → pick `promptOption` → repeat |
| Resume / CV         | —                                               | `file-upload-input-ref` (`input[type=file]`); confirm with `file-upload-successful` |
| Websites            | `Add` inside `websiteSection`                   | `url` |
| LinkedIn            | —                                               | `linkedinQuestion` |

**Reconcile the parsed data, then fill:**
1. If the CV was uploaded in 3.1, read the existing blocks first.
2. Match each block to a canonical profile entry by fuzzy matching
   `company + jobTitle + start year`.
3. Overwrite wrong fields, delete blocks the parser invented
   (`[data-automation-id="panel-set-delete-button"]`), and add missing ones.
4. Fill blocks **in order, most recent first**. After each `Add`, wait for the
   new block, then scope every selector to **that block's container**, because
   ids repeat across blocks.
5. Use the **tailored** bullets in `description` for each role.
6. If the CV upload widget is empty (Apply Manually path), upload
   `tailored-cv.pdf` here. If there's a separate cover-letter slot, upload
   `cover-letter.pdf`.

### Step 3 — Application Questions
Fully tenant-specific. Common patterns and how to handle them:

| Question pattern                                   | Strategy |
|----------------------------------------------------|----------|
| Authorized to work in {country}? / Need sponsorship? | Profile booleans, exact answers, never the LLM |
| Salary expectation                                 | Profile value or range; if required and numeric, digits only |
| Notice period / start date                         | Profile |
| Willing to relocate / hybrid / on-site             | Profile preferences |
| Years of experience with X                         | Computed from the profile's dated skills; pick the matching bucket |
| "Why do you want to work here?" (textarea)         | LLM, from the cover letter, ≤ the field's `maxlength` |
| Non-compete, criminal record, relatives employed   | **Always ask the user** |
| Attestation / "I certify…" checkbox                | **Always ask the user** |

### Step 4 — Voluntary Disclosures
`gender`, `ethnicityDropdown` (or `hispanicOrLatino` radio plus an ethnicity
multiselect), `veteranStatus`, `agreementCheckbox` (T&C).
Fill **only** from the user's saved EEO preferences. Default to *"I do not wish
to answer / Decline to self-identify"*. The T&C checkbox needs explicit consent
the user has given once per tenant.

### Step 5 — Self Identify (US disability, CC-305)
`name` (full legal name), `dateSignedOn` (today, entered as segmented date
input), one disability checkbox from `selfIdentifiedDisabilityData`. Same rule:
saved preference only, default *"I do not want to answer"*.

### Step 6 — Review
- No more filling. Scrape the summary and diff it against the intended values;
  show mismatches to the user.
- Highlight the `Submit` button and **stop**. The human clicks Submit.
- After submission, detect the confirmation (`Application Submitted` text, or a
  redirect to `/userHome`). Log `{tenant, reqId, title, date, cvVersion,
  coverLetterVersion}` to the tracker.

---

## 6. Control-level recipes (why naïve autofill fails on Workday)

Workday inputs are React-controlled. Setting `el.value = "x"` looks right and
is **thrown away on Next**. Use these recipes:

```ts
// Text / textarea: native setter + events React listens for, then blur.
function setReactValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  el.focus();
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

// Single-select dropdown: a <button aria-haspopup="listbox">, not a <select>.
async function selectDropdown(button: HTMLElement, optionText: string) {
  button.click();
  const list = await waitFor(() =>
    document.querySelector<HTMLElement>('[role="listbox"]:not([aria-hidden="true"])'));
  const opts = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
  const match = bestMatch(opts, optionText); // exact > startsWith > fuzzy ≥ 0.85
  if (!match) throw new NeedsHuman(`No option like "${optionText}"`);
  match.click();
  await waitFor(() => button.textContent?.includes(match.textContent!.trim()));
}

// Multiselect search (source, skills, phone code, school, field of study):
async function multiselectPick(container: HTMLElement, query: string) {
  const input = container.querySelector<HTMLInputElement>('[data-automation-id="searchBox"]')!;
  setReactValue(input, query);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  const opt = await waitFor(() => bestMatch(
    [...document.querySelectorAll<HTMLElement>('[data-automation-id="promptOption"]')], query));
  opt.click();
  await waitFor(() => container.querySelector('[data-automation-id="selectedItem"]'));
}

// Segmented date (MM / YYYY spinbuttons): type digits as keystrokes.
async function typeDate(section: HTMLElement, mm: string, yyyy: string) {
  for (const [id, v] of [["dateSectionMonth-input", mm], ["dateSectionYear-input", yyyy]]) {
    const seg = section.querySelector<HTMLInputElement>(`[data-automation-id="${id}"]`);
    if (!seg) continue;
    seg.focus();
    for (const ch of v) {
      seg.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
      seg.dispatchEvent(new InputEvent("beforeinput", { data: ch, inputType: "insertText", bubbles: true }));
    }
  }
}

// File upload: build a File and assign it through DataTransfer.
function uploadFile(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
```

Synthetic keyboard events don't always move Workday's date spinbuttons. When
the segment's value doesn't change, fall back to `chrome.debugger`
`Input.insertText` (trusted input), or ask the user to type the date.

**VERIFY after every write:** re-read the control (input `value`, the dropdown
button's text, `selectedItem` chips, `file-upload-successful`). Don't move on
until it matches.

**Pacing:** 80–200 ms between fields and a WAIT_STABLE after every control
that re-renders (country, the "currently work here" toggle, Add buttons). This
is about correctness, since Workday drops input during re-renders. It is not
about evading detection.

---

## 7. Resilience and state

- **Persist progress** per `tenant+reqId`: the current step, the fields done,
  the block-to-profile mapping. Workday sessions time out (about 20–30 minutes
  idle) and redirect to sign-in. On resume, sign in, reopen the application from
  `/userHome` → *My Applications* (draft), and continue the page loop.
- **Iframes:** some tenants embed the flow in an iframe. Inject with
  `allFrames: true` and run the engine in the frame that holds
  `pageFooterNextButton`.
- **Locale:** labels may be localized. Prefer `data-automation-id`, and keep a
  small dictionary of label synonyms for the fallback.
- **Selector drift:** keep all selectors in one versioned map
  (`workday.selectors.ts`). Log every selector miss with tenant and step, so
  drift shows up quickly.
- **Kill switch:** an Esc or side-panel button stops the engine immediately.

---

## 8. Guardrails (non-negotiable)

1. Never auto-click **Submit**. The human reviews and submits.
2. Never invent facts in the CV, cover letter or answers. The master profile is
   the only source of truth.
3. Legal, attestation, criminal-history, EEO and disability answers come only
   from what the user explicitly chose, never from an LLM guess.
4. Never bypass CAPTCHAs or email verification. Pause for the human.
5. Store credentials and PII locally and encrypted. Send the LLM only the JD and
   the fields needed for the current question.
6. Respect each employer's terms. One honest, tailored application per role
   beats volume.

---

## 9. Suggested module layout (when this is implemented in the extension)

```
claude-extension-standalone/src/workday/
  selectors.ts        # versioned data-automation-id map + label fallbacks
  detect.ts           # tenant detection, DETECT_STEP fingerprints
  controls.ts         # setReactValue, selectDropdown, multiselectPick, typeDate, uploadFile
  engine.ts           # page loop state machine (WAIT_STABLE → … → STOP)
  steps/
    myInformation.ts
    myExperience.ts   # parsed-data reconciliation + repeatable blocks
    questions.ts      # generic question filler + answer bank
    disclosures.ts
    selfIdentify.ts
    review.ts         # diff + stop
  tailor/
    jd.ts             # JD scrape + keyword extraction
    cv.ts             # bullet scoring/rewrite with a no-fabrication check
    coverLetter.ts
  state.ts            # per tenant+reqId persistence
```
