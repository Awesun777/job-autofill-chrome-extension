# Smart Job Autofill

A Chrome extension that eliminates repetitive form-filling on job applications. Upload your resume once, then fill any application field in two clicks — with full control over which experience and which specific fields get filled.

---

## What it does

Most job applications ask the same questions: name, email, work history, education, skills. This extension parses your resume with AI, stores the data as a reusable profile, and injects smart fill buttons (⚡) next to every compatible field on job application pages.

It works on Workday, Greenhouse, Lever, iCIMS, Taleo, SmartRecruiters, LinkedIn Easy Apply, Indeed, and most standard HTML forms.

---

## Features

**Resume parsing**
- Upload a PDF or Word (.docx) resume
- GPT-4o-mini extracts all structured data automatically: personal info, work experience, education, skills, certifications
- Name your profile (e.g. "Finance Role", "Tech Role") to maintain multiple tailored versions

**Smart autofill**
- Click ⚡ next to any field to see your stored data
- For work experience fields: choose which job entry to pull from, then choose exactly which piece of info to fill (title, company, dates, location, or description) — one click per field
- For personal fields (name, email, phone, address, LinkedIn, etc.): pick from any of your saved profiles
- Fields already filled are skipped automatically; Workday-specific fields use targeted selectors

**Experience management**
- Edit any parsed experience entry directly from the ⚡ dropdown — no need to open the extension popup
- Set a "Default Experience" per profile so the experience selection step is skipped automatically
- All six fields editable inline: title, company, start date, end date, location, description

**Profile backup**
- Export all profiles to a named JSON snapshot (e.g. "Summer 2026 Applications")
- Import a snapshot to restore or transfer profiles across browsers or devices

---

## Setup

### Prerequisites
- Google Chrome (or any Chromium-based browser)
- An [OpenAI API key](https://platform.openai.com/api-keys) (used only for resume parsing; stored locally, never sent anywhere except OpenAI)

### Install the extension
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the project folder
5. The extension icon appears in your toolbar

### Add your API key
1. Click the extension icon → **Settings** tab
2. Paste your OpenAI API key and click **Save & Verify Key**

---

## Usage

### 1. Upload your resume
Go to the **Profiles** tab, optionally name the profile, then drag and drop (or click to select) your PDF or Word resume. The AI parses it in a few seconds and creates a profile.

Review the parsed data by clicking **Edit** — fix any inaccuracies, especially in work experience descriptions.

### 2. Fill a job application
Navigate to any job application page. The ⚡ buttons appear automatically next to compatible fields.

**For personal fields** (name, email, phone, address, LinkedIn):
- Click ⚡ → click your profile name → field is filled

**For work experience fields** (title, company, dates, location, description):
- Click ⚡ → pick the relevant job entry → click the specific piece of info to fill → that field is filled
- The dropdown stays open so you can fill multiple fields in one session
- Already-filled rows show a ✓ indicator

**Bulk autofill**: Use the **Fill** tab in the extension popup to autofill the entire page at once using your active profile. Best for straightforward forms; use the per-field ⚡ approach on complex forms like Workday where bulk fill can mix up entries.

### 3. Set a default experience (optional)
In the **Fill** tab, use the "⚡ Default Experience" dropdown to pin one job entry. When set, clicking ⚡ on any experience field skips directly to the field selector — one fewer step per click.

---

## Privacy

- Your resume data is stored locally in `chrome.storage.local` — it never leaves your browser except when parsing
- Resume text is sent to OpenAI's API for parsing (subject to [OpenAI's privacy policy](https://openai.com/policies/privacy-policy))
- Your OpenAI API key is stored locally and sent only to OpenAI
- No data is sent to any other server

---

## Tech stack

| Component | Detail |
|---|---|
| Extension | Chrome MV3 |
| Popup UI | React 18 (bundled) |
| Resume parsing | OpenAI GPT-4o-mini |
| PDF extraction | PDF.js |
| Word extraction | Native ZIP + DOMParser (no library) |
| Storage | `chrome.storage.local` |

---

## Known limitations

- PDF parsing quality depends on how the PDF was generated. Text-based PDFs (exported from Word, Google Docs, etc.) work best. Scanned/image PDFs are not supported.
- Workday's date picker fields use custom components — date autofill on work history sections may require manual entry after using the description/title fill.
- The extension runs on all HTTPS pages. For maximum privacy, you can restrict host permissions in `manifest.json` to only the job boards you use.

---

## License

MIT
